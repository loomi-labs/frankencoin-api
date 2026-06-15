import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
	constructor(protected readonly authService: AuthService) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest();
		const authHeader = request.headers['authorization'];
		if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedException();

		const token = authHeader.slice(7);
		const payload = this.authService.verifyToken(token);
		if (!payload) throw new UnauthorizedException('Invalid or expired token');

		request.jti = payload.jti;
		return true;
	}
}

@Injectable()
export class LinkedGuard extends JwtAuthGuard {
	constructor(
		authService: AuthService,
		private readonly auth: AuthService
	) {
		super(authService);
	}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		await super.canActivate(context);
		const request = context.switchToHttp().getRequest();
		const telegramId = await this.auth.getLinkedTelegramId(request.jti);
		if (!telegramId) throw new UnauthorizedException('Session not linked to Telegram');
		request.telegramId = telegramId;
		return true;
	}
}
