import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get('/healthz')
  healthz() {
    return { status: 'ok' };
  }

  @Get('/readyz')
  async readyz() {
    await this.prisma.client.$queryRaw`SELECT 1`;
    await this.redis.redis.ping();
    return { status: 'ready' };
  }
}
