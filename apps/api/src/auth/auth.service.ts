import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';

const ACCESS_TTL = '15m';
const REFRESH_DAYS = Number(process.env.REFRESH_TOKEN_DAYS || 14);

function shaTokenHash(token: string) {
  return bcrypt.hash(token, 10);
}

type RefreshJwtPayload = {
  sub: string;
  email: string;
  jti?: string;
  iat?: number;
  exp?: number;
};

function isRefreshPayload(v: unknown): v is RefreshJwtPayload {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.sub === 'string' && typeof o.email === 'string';
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private signAccess(user: { id: string; email: string }) {
    return this.jwt.sign(
      { email: user.email },
      { subject: user.id, expiresIn: ACCESS_TTL },
    );
  }

  private signRefresh(user: { id: string; email: string }) {
    const jti = randomBytes(16).toString('hex');
    const token = this.jwt.sign(
      { email: user.email, jti },
      { subject: user.id, expiresIn: `${REFRESH_DAYS}d` },
    );
    return { token, jti };
  }

  async register(email: string, password: string) {
    const exists = await this.prisma.client.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (exists) throw new BadRequestException('Email already in use');

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.prisma.client.user.create({
      data: { email, passwordHash },
      select: { id: true, email: true },
    });

    return user;
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    return { id: user.id, email: user.email };
  }

  async issueTokens(user: { id: string; email: string }) {
    const accessToken = this.signAccess(user);
    const { token: refreshToken } = this.signRefresh(user);

    const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000);
    const tokenHash = await shaTokenHash(refreshToken);

    await this.prisma.client.refreshToken.deleteMany({
      where: { userId: user.id },
    });
    await this.prisma.client.refreshToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    return {
      accessToken,
      refreshToken,
      refreshExpiresAt: expiresAt.toISOString(),
    };
  }

  async refresh(refreshToken: string) {
    let payloadUnknown: unknown;

    try {
      payloadUnknown = this.jwt.verify(refreshToken, {
        secret: process.env.JWT_SECRET || 'dev-secret',
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!isRefreshPayload(payloadUnknown)) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const userId = payloadUnknown.sub;
    const email = payloadUnknown.email;

    const tokens = await this.prisma.client.refreshToken.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      select: { id: true, tokenHash: true },
      take: 5,
    });

    const match = await Promise.all(
      tokens.map(async (t) => ({
        id: t.id,
        ok: await bcrypt.compare(refreshToken, t.tokenHash),
      })),
    );

    const found = match.find((m) => m.ok);
    if (!found) throw new UnauthorizedException('Refresh token not recognized');

    await this.prisma.client.refreshToken.delete({ where: { id: found.id } });

    return this.issueTokens({ id: userId, email });
  }

  async logout(refreshToken: string) {
    let payloadUnknown: unknown;

    try {
      payloadUnknown = this.jwt.verify(refreshToken, {
        secret: process.env.JWT_SECRET || 'dev-secret',
      });
    } catch {
      return;
    }

    if (!isRefreshPayload(payloadUnknown)) return;

    await this.prisma.client.refreshToken.deleteMany({
      where: { userId: payloadUnknown.sub },
    });
  }

  async me(userId: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, createdAt: true },
    });
    if (!user) return null;
    return user;
  }
}
