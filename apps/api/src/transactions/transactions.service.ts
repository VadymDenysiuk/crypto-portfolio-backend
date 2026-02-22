import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { RedisService } from 'src/redis/redis.service';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    @InjectQueue('portfolio') private readonly portfolioQueue: Queue,
  ) {}

  async create(dto: CreateTransactionDto) {
    const portfolioId = dto.portfolioId;

    const portfolio = await this.prisma.client.portfolio.findFirst({
      where: { id: portfolioId, userId: 'dev-user' },
      select: { id: true },
    });
    if (!portfolio) throw new NotFoundException('Portfolio not found');

    const asset = await this.prisma.client.asset.findUnique({
      where: { symbol: dto.assetSymbol.toUpperCase() },
      select: { id: true, symbol: true },
    });
    if (!asset) throw new NotFoundException('Asset not found');

    const tx = await this.prisma.client.transaction.create({
      data: {
        portfolioId: portfolioId,
        assetId: asset.id,
        type: dto.type,
        quantity: dto.quantity.toString(),
        price: dto.price != null ? dto.price.toString() : null,
        at: dto.at ? new Date(dto.at) : new Date(),
      },
      include: { asset: { select: { symbol: true } } },
    });

    await this.redisService.redis.del(`portfolio:summary:${portfolioId}`);
    await this.redisService.redis.del(`portfolio:positions:${portfolioId}`);

    try {
      await this.portfolioQueue.add(
        'recalc-summary',
        { portfolioId },
        {
          jobId: `recalc-summary-${portfolioId}`,
          removeOnComplete: 1000,
          removeOnFail: 100,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          delay: 1500,
        },
      );
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const msg = String(e?.message ?? '');
      if (msg.includes('Job') && msg.includes('already exists')) return;
      console.error(e);
    }

    return tx;
  }

  list(portfolioId?: string) {
    return this.prisma.client.transaction.findMany({
      where: portfolioId ? { portfolioId } : undefined,
      orderBy: { at: 'desc' },
      include: { asset: { select: { symbol: true } } },
    });
  }
}
