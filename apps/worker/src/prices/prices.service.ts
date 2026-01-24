import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

type CoinGeckoPriceResponse = Record<string, { usd?: number; eur?: number }>;

const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
};

@Injectable()
export class PricesService {
  private readonly logger = new Logger(PricesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  @Cron('*/5 * * * *') // every 5 minutes
  async syncLatestPrices() {
    const currency = 'USD';

    const assets = await this.prisma.client.asset.findMany({
      where: { symbol: { in: Object.keys(COINGECKO_IDS) } },
      select: { id: true, symbol: true },
    });

    if (!assets.length) return;

    const ids = assets.map((a) => COINGECKO_IDS[a.symbol]).join(',');
    const url = new URL('https://api.coingecko.com/api/v3/simple/price');
    url.searchParams.set('ids', ids);
    url.searchParams.set('vs_currencies', 'usd');

    const res = await fetch(url.toString(), {
      headers: { accept: 'application/json' },
    });

    if (!res.ok) {
      this.logger.error(`CoinGecko error: ${res.status}`);
      return;
    }

    const data = (await res.json()) as CoinGeckoPriceResponse;

    const now = new Date();
    const latest: Record<string, number> = {};

    for (const a of assets) {
      const cgId = COINGECKO_IDS[a.symbol];
      const price = data?.[cgId]?.usd;

      if (!price) continue;

      latest[a.symbol] = price;

      await this.prisma.client.priceSnapshot.create({
        data: {
          assetId: a.id,
          currency,
          price: price.toString(),
          source: 'coingecko',
          at: now,
        },
      });
    }

    if (Object.keys(latest).length) {
      await this.redisService.redis.set(
        `prices:latest:${currency}`,
        JSON.stringify({ at: now.toISOString(), prices: latest }),
        'EX',
        60 * 10, // 10 minutes
      );
    }

    this.logger.log(`Synced prices: ${Object.keys(latest).join(', ')}`);
  }
}
