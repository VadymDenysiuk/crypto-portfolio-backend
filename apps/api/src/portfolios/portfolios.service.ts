import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePortfolioDto } from './dto/create-portfolio.dto';
import { RedisService } from 'src/redis/redis.service';
import { safeParseJson } from 'src/utils/json';

@Injectable()
export class PortfoliosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    @InjectQueue('portfolio') private readonly portfolioQueue: Queue,
  ) {}

  private dirtyKey(portfolioId: string) {
    return `portfolio:dirty:${portfolioId}`;
  }

  private async enqueueRecalc(portfolioId: string) {
    try {
      await this.portfolioQueue.add(
        'recalc-summary',
        { portfolioId },
        {
          jobId: `recalc-summary-${portfolioId}`,
          removeOnComplete: true,
          removeOnFail: 100,
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
          delay: 250,
        },
      );
    } catch (e: any) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const msg = String(e?.message ?? '');
      if (msg.includes('already exists') || msg.includes('Job')) return;
      console.error(e);
    }
  }

  async create(dto: CreatePortfolioDto) {
    const userId = 'dev-user';

    await this.prisma.client.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        email: 'dev@local',
        passwordHash: 'dev',
      },
    });

    return this.prisma.client.portfolio.create({
      data: {
        userId,
        name: dto.name,
        baseCurrency: (dto.baseCurrency ?? 'USD').toUpperCase(),
      },
    });
  }

  list() {
    return this.prisma.client.portfolio.findMany({
      where: { userId: 'dev-user' },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async ensurePortfolioOwned(portfolioId: string) {
    const portfolio = await this.prisma.client.portfolio.findFirst({
      where: { id: portfolioId, userId: 'dev-user' },
      select: { id: true },
    });
    if (!portfolio) throw new NotFoundException('Portfolio not found');
  }

  async summary(portfolioId: string) {
    const key = `portfolio:summary:${portfolioId}`;
    const dirtyKey = this.dirtyKey(portfolioId);

    const [cached, dirtyAt] = await Promise.all([
      this.redisService.redis.get(key),
      this.redisService.redis.get(dirtyKey),
    ]);

    if (cached) {
      const parsed = safeParseJson(cached);
      if (parsed) {
        return {
          status: 'ready' as const,
          source: 'redis' as const,
          stale: Boolean(dirtyAt),
          dirtyAt: dirtyAt ? Number(dirtyAt) : null,
          ...parsed,
        };
      }
    }

    await this.ensurePortfolioOwned(portfolioId);

    await this.redisService.redis.set(dirtyKey, String(Date.now()), 'EX', 300);
    await this.enqueueRecalc(portfolioId);

    return {
      status: 'pending' as const,
      source: 'queue' as const,
      retryAfterMs: 1500,
    };
  }

  async positions(portfolioId: string) {
    const key = `portfolio:positions:${portfolioId}`;
    const dirtyKey = this.dirtyKey(portfolioId);

    const [cached, dirtyAt] = await Promise.all([
      this.redisService.redis.get(key),
      this.redisService.redis.get(dirtyKey),
    ]);

    if (cached) {
      const parsed = safeParseJson(cached);
      if (parsed) {
        return {
          status: 'ready' as const,
          source: 'redis' as const,
          stale: Boolean(dirtyAt),
          dirtyAt: dirtyAt ? Number(dirtyAt) : null,
          ...parsed,
        };
      }
    }

    await this.ensurePortfolioOwned(portfolioId);

    await this.redisService.redis.set(dirtyKey, String(Date.now()), 'EX', 300);
    await this.enqueueRecalc(portfolioId);

    return {
      status: 'pending' as const,
      source: 'queue' as const,
      retryAfterMs: 1500,
    };
  }

  async snapshot(portfolioId: string) {
    const summaryKey = `portfolio:summary:${portfolioId}`;
    const positionsKey = `portfolio:positions:${portfolioId}`;
    const dirtyKey = this.dirtyKey(portfolioId);

    const [summaryStr, positionsStr, dirtyAt] = await Promise.all([
      this.redisService.redis.get(summaryKey),
      this.redisService.redis.get(positionsKey),
      this.redisService.redis.get(dirtyKey),
    ]);

    const summary = summaryStr ? safeParseJson(summaryStr) : null;
    const positions = positionsStr ? safeParseJson(positionsStr) : null;

    if (summary || positions) {
      return {
        status: 'ready' as const,
        source: 'redis' as const,
        stale: Boolean(dirtyAt),
        dirtyAt: dirtyAt ? Number(dirtyAt) : null,
        summary,
        positions,
      };
    }

    await this.ensurePortfolioOwned(portfolioId);

    await this.redisService.redis.set(dirtyKey, String(Date.now()), 'EX', 300);
    await this.enqueueRecalc(portfolioId);

    return {
      status: 'pending' as const,
      source: 'queue' as const,
      retryAfterMs: 1500,
      summary: null,
      positions: null,
    };
  }
}
