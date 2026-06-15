import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard, LinkedGuard } from './auth.guard';

@Module({
	imports: [
		JwtModule.register({
			secret: process.env.JWT_SECRET,
			signOptions: { issuer: 'frankencoin-api' },
		}),
	],
	controllers: [AuthController],
	providers: [AuthService, JwtAuthGuard, LinkedGuard],
	exports: [AuthService],
})
export class AuthModule {}
