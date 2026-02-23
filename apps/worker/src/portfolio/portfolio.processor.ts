import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { calculatePositionsAverageCost } from '@cpt/db';

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
        price: true,
        asset: { select: { id: true, symbol: true } },
      },
      orderBy: { at: 'asc' },
    });

    const buySellTxs = txs
      .filter(
        (t): t is typeof t & { type: 'BUY' | 'SELL' } =>
          t.type === 'BUY' || t.type === 'SELL',
      )
      .map((t) => ({
        type: t.type,
        symbol: t.asset.symbol,
        quantity: t.quantity,
        price: t.price, // Prisma.Decimal | null
      }));

    const currency = portfolio.baseCurrency.toUpperCase();

    const symbols = [...new Set(buySellTxs.map((t) => t.symbol))];

    const assetIdBySymbol: Record<string, string> = {};
    for (const t of txs) assetIdBySymbol[t.asset.symbol] = t.asset.id;

    const { prices, pricesAt, pricesSource } = await this.getLatestPrices(
      symbols,
      currency,
      assetIdBySymbol,
    );

    const calc = calculatePositionsAverageCost(buySellTxs, prices);

    const positionsPayload = {
      portfolio: { id: portfolio.id, name: portfolio.name, currency },
      pricesSource,
      pricesAt,
      totals: {
        totalValue: calc.totals.totalValue.toString(),
        totalCost: calc.totals.totalCost.toString(),
        unrealizedPnl: calc.totals.unrealizedPnl.toString(),
        realizedPnl: calc.totals.realizedPnl.toString(),
      },
      positions: calc.positions.map((p) => ({
        symbol: p.symbol,
        quantity: p.quantity.toString(),
        avgCost: p.avgCost?.toString() ?? null,
        costValue: p.costValue?.toString() ?? null,
        price: p.price,
        value: p.value.toString(),
        unrealizedPnl: p.unrealizedPnl?.toString() ?? null,
        realizedPnl: p.realizedPnl.toString(),
      })),
      warnings: calc.warnings,
    };

    await this.redisService.redis.set(
      `portfolio:positions:${portfolioId}`,
      JSON.stringify(positionsPayload),
      'EX',
      60 * 10,
    );

    const rows = calc.positions
      .filter((p) => p.quantity.gt(0))
      .map((p) => ({
        symbol: p.symbol,
        quantity: Number(p.quantity),
        price: p.price,
        value: Number(p.value),
      }));

    const totalValue = rows.reduce((acc, r) => acc + r.value, 0);

    const summary = {
      portfolio: { id: portfolio.id, name: portfolio.name, currency },
      pricesSource,
      pricesAt,
      totalValue,
      holdings: rows,
      totalCost: positionsPayload.totals.totalCost,
      unrealizedPnl: positionsPayload.totals.unrealizedPnl,
      realizedPnl: positionsPayload.totals.realizedPnl,
      updatedAt: new Date().toISOString(),
    };

    await this.redisService.redis.set(
      `portfolio:summary:${portfolioId}`,
      JSON.stringify(summary),
      'EX',
      60 * 10,
    );
  }

  private async getLatestPrices(
    symbols: string[],
    currency: string,
    assetIdBySymbol: Record<string, string>,
  ): Promise<{
    prices: Record<string, number>;
    pricesAt: string | null;
    pricesSource: 'redis' | 'db';
  }> {
    if (!symbols.length) {
      return { prices: {}, pricesAt: null, pricesSource: 'redis' };
    }

    // 1) prices from redis
    const latestStr = await this.redisService.redis.get(
      `prices:latest:${currency}`,
    );
    if (latestStr) {
      const latest = JSON.parse(latestStr) as CachedLatest;
      return {
        prices: latest.prices ?? {},
        pricesAt: latest.at ?? null,
        pricesSource: 'redis',
      };
    }

    // 2) fallback: latest from DB (по одному символу як у тебе було)
    const prices: Record<string, number> = {};
    let latestAtMs: number | null = null;

    for (const sym of symbols) {
      const assetId = assetIdBySymbol[sym];
      if (!assetId) continue;

      const last = await this.prisma.client.priceSnapshot.findFirst({
        where: { assetId, currency },
        orderBy: { at: 'desc' },
        select: { price: true, at: true },
      });

      if (!last) continue;

      prices[sym] = Number(last.price);

      const ms = last.at.getTime();
      latestAtMs = latestAtMs == null ? ms : Math.max(latestAtMs, ms);
    }

    return {
      prices,
      pricesAt: latestAtMs == null ? null : new Date(latestAtMs).toISOString(),
      pricesSource: 'db',
    };
  }
}
