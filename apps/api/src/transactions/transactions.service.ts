import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { RedisService } from 'src/redis/redis.service';

function toDecimalString(v: string | number, field: string): string {
  if (v === null || v === undefined) {
    throw new BadRequestException(`${field} is required`);
  }

  const raw = typeof v === 'number' ? String(v) : String(v).trim();
  if (!raw) throw new BadRequestException(`${field} is required`);

  const normalized = raw.replace(',', '.');

  try {
    const d = new Prisma.Decimal(normalized as any);
    return d.toString();
  } catch {
    throw new BadRequestException(`${field} must be a valid decimal`);
  }
}

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

    const quantityStr = toDecimalString(dto.quantity, 'quantity');
    const quantityD = new Prisma.Decimal(quantityStr);
    if (quantityD.lte(0)) throw new BadRequestException('quantity must be > 0');

    const priceStr =
      dto.price !== null && dto.price !== undefined
        ? toDecimalString(dto.price, 'price')
        : null;

    if ((dto.type === 'BUY' || dto.type === 'SELL') && !priceStr) {
      throw new BadRequestException('price is required for BUY/SELL');
    }

    const tx = await this.prisma.client.transaction.create({
      data: {
        portfolioId,
        assetId: asset.id,
        type: dto.type,
        quantity: quantityStr, // ✅ string Decimal
        price: priceStr, // ✅ string Decimal | null
        at: dto.at ? new Date(dto.at) : new Date(),
      },
      include: { asset: { select: { symbol: true } } },
    });

    const dirtyKey = `portfolio:dirty:${portfolioId}`;
    await this.redisService.redis.set(dirtyKey, String(Date.now()), 'EX', 300);

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
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const msg = String(e?.message ?? '');
      if (msg.includes('already exists') || msg.includes('Job')) {
        // не return, бо треба повернути tx
      } else {
        console.error(e);
      }
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
