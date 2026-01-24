import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

type CachedLatest = { at: string; prices: Record<string, number> };

@Processor('portfolio')
export class PortfolioProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {
    super();
  }

  async process(job: Job<{ portfolioId: string }>) {
    if (job.name !== 'recalc-summary') return;

    const { portfolioId } = job.data;

    const portfolio = await this.prisma.client.portfolio.findUnique({
      where: { id: portfolioId },
      select: { id: true, name: true, baseCurrency: true },
    });

    if (!portfolio) return;

    const txs = await this.prisma.client.transaction.findMany({
      where: { portfolioId },
      select: {
        type: true,
        quantity: true,
        asset: { select: { id: true, symbol: true } },
      },
      orderBy: { at: 'asc' },
    });

    const holdings: Record<string, number> = {};
    const assetIdBySymbol: Record<string, string> = {};

    for (const t of txs) {
      const sym = t.asset.symbol;
      assetIdBySymbol[sym] = t.asset.id;

      const qty = Number(t.quantity);
      holdings[sym] ??= 0;

      if (t.type === 'BUY') holdings[sym] += qty;
      else if (t.type === 'SELL') holdings[sym] -= qty;
    }

    const symbols = Object.entries(holdings)
      .filter(([, q]) => q > 0)
      .map(([s]) => s);

    const currency = portfolio.baseCurrency.toUpperCase();

    // 1) prices from redis (latest)
    let prices: Record<string, number> = {};
    let pricesAt: string | null = null;
    const latestStr = await this.redisService.redis.get(
      `prices:latest:${currency}`,
    );

    if (latestStr) {
      const latest = JSON.parse(latestStr) as CachedLatest;
      pricesAt = latest.at;
      prices = latest.prices ?? {};
    } else {
      // 2) fallback: latest from DB
      for (const sym of symbols) {
        const assetId = assetIdBySymbol[sym];
        const last = await this.prisma.client.priceSnapshot.findFirst({
          where: { assetId, currency },
          orderBy: { at: 'desc' },
          select: { price: true, at: true },
        });

        if (!last) continue;
        prices[sym] = Number(last.price);
        pricesAt ??= last.at.toISOString();
      }
    }

    let totalValue = 0;
    const rows = symbols.map((s) => {
      const quantity = holdings[s];
      const price = prices[s] ?? 0;
      const value = quantity * price;
      totalValue += value;
      return { symbol: s, quantity, price, value };
    });

    const summary = {
      portfolio: { id: portfolio.id, name: portfolio.name, currency },
      pricesAt,
      totalValue,
      holdings: rows,
      updatedAt: new Date().toISOString(),
    };

    await this.redisService.redis.set(
      `portfolio:summary:${portfolioId}`,
      JSON.stringify(summary),
      'EX',
      60 * 10,
    );
  }
}
