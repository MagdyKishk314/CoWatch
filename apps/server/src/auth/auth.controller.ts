import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { DevicePlatform, type AuthResult, type SelfUser } from '@cowatch/types';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import type { DeviceInput } from './session.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  type AuthContext,
} from '../common/decorators/current-user.decorator';
import type { Env } from '../config/env.validation';

const REFRESH_COOKIE = 'cowatch_rt';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResult> {
    const result = await this.auth.register(dto, this.device(req));
    this.setRefreshCookie(res, result.tokens.refreshToken);
    return result;
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResult> {
    const result = await this.auth.login(dto, this.device(req));
    this.setRefreshCookie(res, result.tokens.refreshToken);
    return result;
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResult> {
    const token = this.readRefresh(req);
    if (token === null) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Missing refresh token.',
      });
    }
    const result = await this.auth.refresh(token);
    this.setRefreshCookie(res, result.tokens.refreshToken);
    return result;
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUser() ctx: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(ctx.sessionId);
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() ctx: AuthContext): Promise<SelfUser> {
    const self = await this.auth.getSelf(ctx.userId);
    if (self === null) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_UNAVAILABLE',
        message: 'Account unavailable.',
      });
    }
    return self;
  }

  private device(req: Request): DeviceInput {
    const platform =
      req.header('x-cowatch-platform') === 'desktop'
        ? DevicePlatform.Desktop
        : DevicePlatform.Web;
    return {
      platform,
      userAgent: req.header('user-agent'),
      ipRegion: undefined,
      label: undefined,
    };
  }

  private setRefreshCookie(res: Response, token: string): void {
    const domain = this.config.get('COOKIE_DOMAIN', { infer: true });
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      maxAge: this.config.get('AUTH_REFRESH_TTL', { infer: true }) * 1000,
      ...(domain ? { domain } : {}),
    });
  }

  private readRefresh(req: Request): string | null {
    const cookies = (req as Request & { cookies?: Record<string, string> })
      .cookies;
    const fromCookie = cookies?.[REFRESH_COOKIE];
    if (typeof fromCookie === 'string' && fromCookie.length > 0) {
      return fromCookie;
    }
    const body = req.body as { refreshToken?: unknown } | undefined;
    return typeof body?.refreshToken === 'string' ? body.refreshToken : null;
  }
}
