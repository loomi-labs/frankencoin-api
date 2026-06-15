import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { PrismaService } from 'core/database/prisma.service';
import { AlertDto, AlertResponse, JwtPayload } from './auth.types';

@Injectable()
export class AuthService {
	private readonly logger = new Logger(AuthService.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly jwtService: JwtService
	) {}

	async createSession(): Promise<string> {
		const jti = randomUUID();
		const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

		const token = this.jwtService.sign({}, { expiresIn: '365d', jwtid: jti });

		await this.prisma.safeExecute(() =>
			this.prisma.telegramSession.create({
				data: { jti, status: 'unlinked', expiresAt },
			})
		);

		return token;
	}

	async getStatus(jti: string): Promise<boolean> {
		const session = await this.prisma.safeExecute(() => this.prisma.telegramSession.findUnique({ where: { jti } }));
		return session?.status === 'linked';
	}

	async linkSession(jti: string, telegramId: string): Promise<boolean> {
		const result = await this.prisma.safeExecute(() =>
			this.prisma.telegramSession.updateMany({
				where: { jti, status: 'unlinked' },
				data: { telegramId, status: 'linked', linkedAt: new Date() },
			})
		);
		const linked = (result?.count ?? 0) > 0;
		if (linked) this.logger.log(`Session linked: jti=${jti} telegramId=${telegramId}`);
		return linked;
	}

	async getLinkedTelegramId(jti: string): Promise<string | null> {
		const session = await this.prisma.safeExecute(() => this.prisma.telegramSession.findUnique({ where: { jti } }));
		if (session?.status !== 'linked') return null;
		return session.telegramId ?? null;
	}

	async getAlerts(telegramId: string): Promise<AlertResponse[]> {
		const alerts = await this.prisma.safeExecute(() => this.prisma.telegramUserAlert.findMany({ where: { telegramId } }));
		return alerts ?? [];
	}

	async addAlert(telegramId: string, dto: AlertDto): Promise<AlertResponse> {
		const address = dto.address.toLowerCase();
		const alert = await this.prisma.safeExecute(() =>
			this.prisma.telegramUserAlert.upsert({
				where: { telegramId_type_address: { telegramId, type: dto.type, address } },
				create: { telegramId, type: dto.type, address },
				update: {},
			})
		);
		return alert;
	}

	async removeAlert(telegramId: string, alertId: string): Promise<void> {
		await this.prisma.safeExecute(() =>
			this.prisma.telegramUserAlert.deleteMany({
				where: { id: alertId, telegramId },
			})
		);
	}

	async getSessionCount(telegramId: string): Promise<number> {
		const count = await this.prisma.safeExecute(() => this.prisma.telegramSession.count({ where: { telegramId } }));
		return count ?? 0;
	}

	async removeAllSessions(telegramId: string): Promise<void> {
		await this.prisma.safeExecute(() => this.prisma.telegramSession.deleteMany({ where: { telegramId } }));
		this.logger.log(`Removed all sessions for telegramId=${telegramId}`);
	}

	verifyToken(token: string): JwtPayload | null {
		try {
			return this.jwtService.verify<JwtPayload>(token);
		} catch {
			return null;
		}
	}
}
