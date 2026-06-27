import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { SessionService } from './session.service';
import { KeyProvider } from './key.provider';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    SessionService,
    KeyProvider,
    JwtAuthGuard,
  ],
  // Exported so later feature modules can guard their own routes.
  exports: [TokenService, SessionService, JwtAuthGuard],
})
export class AuthModule {}
