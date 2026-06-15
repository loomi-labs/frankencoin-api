import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard, LinkedGuard } from './auth.guard';
import { AlertDto, AlertResponse, CreateTokenResponse, TokenStatusResponse } from './auth.types';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Post('token')
	@ApiOperation({ summary: 'Create an unlinked session token' })
	async createToken(): Promise<CreateTokenResponse> {
		const token = await this.authService.createSession();
		return { token };
	}

	@Get('token/status')
	@UseGuards(JwtAuthGuard)
	@ApiOperation({ summary: 'Check if the session is linked to a Telegram account' })
	async getStatus(@Req() req): Promise<TokenStatusResponse> {
		const linked = await this.authService.getStatus(req.jti);
		return { linked };
	}

	@Get('alerts')
	@UseGuards(LinkedGuard)
	@ApiOperation({ summary: 'List personalized alerts for this session' })
	async getAlerts(@Req() req): Promise<AlertResponse[]> {
		return this.authService.getAlerts(req.telegramId);
	}

	@Post('alerts')
	@UseGuards(LinkedGuard)
	@ApiOperation({ summary: 'Add a personalized alert' })
	async addAlert(@Req() req, @Body() dto: AlertDto): Promise<AlertResponse> {
		return this.authService.addAlert(req.telegramId, dto);
	}

	@Delete('alerts/:id')
	@UseGuards(LinkedGuard)
	@ApiOperation({ summary: 'Remove a personalized alert' })
	async removeAlert(@Req() req, @Param('id') id: string): Promise<void> {
		return this.authService.removeAlert(req.telegramId, id);
	}
}
