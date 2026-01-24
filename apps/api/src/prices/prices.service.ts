import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

type CachedLatest = { at: string; prices: Record<string, number> };

@Injectable()
export class PricesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async latest(symbols: string[], currency: string) {
    const key = `prices:latest:${currency}`;
    const cached = await this.redisService.redis.get(key);

    if (cached) {
      const parsed = JSON.parse(cached) as CachedLatest;
      const filtered: Record<string, number> = {};

      for (const s of symbols) {
        if (parsed.prices[s] != null) filtered[s] = parsed.prices[s];
      }

      return { source: 'redis', at: parsed.at, currency, prices: filtered };
    }

    // Fallback: read latest from DB (one-by-one for simplicity, optimize later)
    const assets = await this.prisma.client.asset.findMany({
      where: { symbol: { in: symbols } },
      select: { id: true, symbol: true },
    });

    const prices: Record<string, number> = {};
    let at: string | null = null;

    for (const a of assets) {
      const last = await this.prisma.client.priceSnapshot.findFirst({
        where: { assetId: a.id, currency },
        orderBy: { at: 'desc' },
        select: { price: true, at: true },
      });

      if (!last) continue;
      prices[a.symbol] = Number(last.price);
      at ||= last.at.toISOString();
    }

    return { source: 'db', at, currency, prices };
  }
}
