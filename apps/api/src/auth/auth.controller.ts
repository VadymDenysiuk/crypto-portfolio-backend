import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser, type RequestUser } from './current-user.decorator';

function getRefreshCookie(req: Request): string | null {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const v = cookies?.['refresh_token'];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function cookieOpts() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd, // у проді тільки https
    sameSite: 'lax' as const,
    path: '/auth/refresh',
    maxAge: Number(process.env.REFRESH_TOKEN_DAYS || 14) * 24 * 60 * 60 * 1000,
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.auth.register(
      dto.email.toLowerCase(),
      dto.password,
    );
    const tokens = await this.auth.issueTokens(user);

    res.cookie('refresh_token', tokens.refreshToken, cookieOpts());

    return {
      user,
      accessToken: tokens.accessToken,
      refreshExpiresAt: tokens.refreshExpiresAt,
    };
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.auth.validateUser(
      dto.email.toLowerCase(),
      dto.password,
    );
    const tokens = await this.auth.issueTokens(user);

    res.cookie('refresh_token', tokens.refreshToken, cookieOpts());

    return {
      user,
      accessToken: tokens.accessToken,
      refreshExpiresAt: tokens.refreshExpiresAt,
    };
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = getRefreshCookie(req);
    if (!refreshToken) return { status: 'missing_refresh' as const };

    const tokens = await this.auth.refresh(refreshToken);
    res.cookie('refresh_token', tokens.refreshToken, cookieOpts());

    return {
      accessToken: tokens.accessToken,
      refreshExpiresAt: tokens.refreshExpiresAt,
    };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = getRefreshCookie(req);
    if (refreshToken) await this.auth.logout(refreshToken);

    res.clearCookie('refresh_token', { path: '/auth/refresh' });
    return { status: 'ok' as const };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: RequestUser) {
    return { user: await this.auth.me(user.id) };
  }
}
