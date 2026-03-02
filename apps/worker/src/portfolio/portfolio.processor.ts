import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { calculatePositionsAverageCost } from '@cpt/db';

type CachedLatest = { at: string; prices: Record<string, number> };

@Processor('portfolio')
export class PortfolioProcessor extends WorkerHost {
  private readonly logger = new Logger(PortfolioProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    @InjectQueue('portfolio') private readonly portfolioQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<{ portfolioId: string }>) {
    if (job.name !== 'recalc-summary') return;

    const startedAt = Date.now();
    const { portfolioId } = job.data;

    const dirtyKey = `portfolio:dirty:${portfolioId}`;

    const portfolio = await this.prisma.client.portfolio.findUnique({
      where: { id: portfolioId },
      select: { id: true, name: true, baseCurrency: true },
    });
    if (!portfolio) {
      this.logger.warn(`portfolio not found: ${portfolioId}`);
      return;
    }

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

    const currency = (portfolio.baseCurrency || 'USD').toUpperCase();
    const symbols = [...new Set(buySellTxs.map((t) => t.symbol))];

    const assetIdBySymbol: Record<string, string> = {};
    for (const t of txs) assetIdBySymbol[t.asset.symbol] = t.asset.id;

    const { prices, pricesAt, pricesSource } = await this.getLatestPrices(
      symbols,
      currency,
      assetIdBySymbol,
    );

    const calc = calculatePositionsAverageCost(buySellTxs, prices);
    const computedAt = new Date().toISOString();

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
      computedAt,
    };

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
      computedAt,
    };

    const ttlSec = 60 * 10;
    const positionsKey = `portfolio:positions:${portfolioId}`;
    const summaryKey = `portfolio:summary:${portfolioId}`;

    await this.redisService.redis
      .multi()
      .set(positionsKey, JSON.stringify(positionsPayload), 'EX', ttlSec)
      .set(summaryKey, JSON.stringify(summary), 'EX', ttlSec)
      .exec();

    const dirtyAtAfter = Number(
      (await this.redisService.redis.get(dirtyKey)) || '0',
    );

    if (dirtyAtAfter > startedAt) {
      const followupJobId = `recalc-summary-${portfolioId}-${dirtyAtAfter}`;

      this.logger.warn(
        `dirty updated during recalc, scheduling follow-up: ${followupJobId}`,
      );

      try {
        await this.portfolioQueue.add(
          'recalc-summary',
          { portfolioId },
          {
            jobId: followupJobId,
            removeOnComplete: true,
            removeOnFail: 100,
            attempts: 5,
            backoff: { type: 'exponential', delay: 2000 },
            delay: 250,
          },
        );
      } catch (e) {
        this.logger.error(`failed to enqueue follow-up`, e);
      }

      return;
    }

    await this.redisService.redis.eval(
      `
      local v = redis.call("GET", KEYS[1])
      if not v then return 0 end
      if tonumber(v) <= tonumber(ARGV[1]) then
        return redis.call("DEL", KEYS[1])
      end
      return 0
      `,
      1,
      dirtyKey,
      String(startedAt),
    );

    this.logger.log(`recalc done for ${portfolioId} at ${computedAt}`);
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

    // 2) fallback: latest from DB
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
