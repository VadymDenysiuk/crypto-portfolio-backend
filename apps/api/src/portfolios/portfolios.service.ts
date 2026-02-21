import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PricesService } from '../prices/prices.service';
import { CreatePortfolioDto } from './dto/create-portfolio.dto';
import { RedisService } from 'src/redis/redis.service';
import { safeParseJson } from 'src/utils/json';
import { PortfolioSummary } from './portfolio.types';
import { Prisma } from '@prisma/client';
import type { PortfolioPositions } from './portfolio.positions.types';

@Injectable()
export class PortfoliosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly prices: PricesService,
    private readonly redisService: RedisService,
  ) {}

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

  async summary(portfolioId: string) {
    const key = `portfolio:summary:${portfolioId}`;
    const cached = await this.redisService.redis.get(key);

    if (cached) {
      const parsed = safeParseJson<PortfolioSummary>(cached);
      if (parsed) return { source: 'redis' as const, ...parsed };
    }

    const portfolio = await this.prisma.client.portfolio.findFirst({
      where: { id: portfolioId, userId: 'dev-user' },
      select: { id: true, baseCurrency: true, name: true },
    });

    if (!portfolio) throw new NotFoundException('Portfolio not found');

    const txs = await this.prisma.client.transaction.findMany({
      where: { portfolioId },
      select: {
        type: true,
        quantity: true,
        asset: { select: { symbol: true } },
      },
      orderBy: { at: 'asc' },
    });

    const holdings: Record<string, number> = {};
    for (const t of txs) {
      const sym = t.asset.symbol;
      const qty = Number(t.quantity);
      holdings[sym] ??= 0;

      if (t.type === 'BUY') holdings[sym] += qty;
      else if (t.type === 'SELL') holdings[sym] -= qty;
    }

    const symbols = Object.entries(holdings)
      .filter(([, q]) => q > 0)
      .map(([s]) => s);

    const latest = await this.prices.latest(symbols, portfolio.baseCurrency);
    const prices = latest.prices;

    let totalValue = 0;
    const rows = symbols.map((s) => {
      const quantity = holdings[s];
      const price = prices[s] ?? 0;
      const value = quantity * price;
      totalValue += value;
      return { symbol: s, quantity, price, value };
    });

    const result = {
      portfolio: {
        id: portfolio.id,
        name: portfolio.name,
        currency: portfolio.baseCurrency,
      },
      pricesSource: latest.source,
      pricesAt: latest.at,
      totalValue,
      holdings: rows,
    };

    await this.redisService.redis.set(
      key,
      JSON.stringify(result),
      'EX',
      60 * 10,
    );

    return { source: 'computed', ...result };
  }

  async positions(portfolioId: string) {
    const key = `portfolio:positions:${portfolioId}`;

    const cached = await this.redisService.redis.get(key);
    if (cached) {
      const parsed = safeParseJson<PortfolioPositions>(cached);
      if (parsed) return { source: 'redis' as const, ...parsed };
    }

    const portfolio = await this.prisma.client.portfolio.findFirst({
      where: { id: portfolioId, userId: 'dev-user' },
      select: { id: true, baseCurrency: true, name: true },
    });
    if (!portfolio) throw new NotFoundException('Portfolio not found');

    const txs = await this.prisma.client.transaction.findMany({
      where: { portfolioId },
      select: {
        type: true,
        quantity: true,
        price: true,
        asset: { select: { symbol: true } },
      },
      orderBy: { at: 'asc' },
    });

    const D = Prisma.Decimal;
    const zero = new D(0);

    type State = {
      qty: Prisma.Decimal;
      cost: Prisma.Decimal;
      realized: Prisma.Decimal;
      missingPrice: boolean;
      oversold: boolean;
    };

    const stateBySymbol: Record<string, State> = {};

    for (const t of txs) {
      const sym = t.asset.symbol;
      const st =
        stateBySymbol[sym] ??
        (stateBySymbol[sym] = {
          qty: new D(0),
          cost: new D(0),
          realized: new D(0),
          missingPrice: false,
          oversold: false,
        });

      const qty = t.quantity ?? zero;
      const price = t.price;

      if (price == null) st.missingPrice = true;
      const priceD = price ?? zero;

      if (t.type === 'BUY') {
        st.qty = st.qty.add(qty);
        st.cost = st.cost.add(qty.mul(priceD));
        continue;
      }

      if (t.type === 'SELL') {
        const avg = st.qty.gt(0) ? st.cost.div(st.qty) : zero;

        let sellQty = qty;
        if (sellQty.gt(st.qty)) {
          st.oversold = true;
          sellQty = st.qty;
        }
        if (sellQty.lte(0)) continue;

        const costBasisSold = avg.mul(sellQty);
        const proceeds = priceD.mul(sellQty);

        st.realized = st.realized.add(proceeds.sub(costBasisSold));

        st.qty = st.qty.sub(sellQty);
        st.cost = st.cost.sub(costBasisSold);

        if (st.qty.lte(0)) {
          st.qty = new D(0);
          st.cost = new D(0);
        }
      }
    }

    const symbols = Object.entries(stateBySymbol)
      .filter(([, st]) => st.qty.gt(0) || !st.realized.equals(0))
      .map(([s]) => s);

    const currency = portfolio.baseCurrency.toUpperCase();
    const latest = await this.prices.latest(symbols, currency);
    const prices = latest.prices;

    let totalValue = new D(0);
    let totalCost = new D(0);
    let unrealizedPnl = new D(0);
    let realizedPnl = new D(0);

    const missingTxPrices: string[] = [];
    const oversold: string[] = [];

    const positions = symbols.map((sym) => {
      const st = stateBySymbol[sym];
      if (st.missingPrice) missingTxPrices.push(sym);
      if (st.oversold) oversold.push(sym);

      const priceNow = prices[sym] ?? 0;
      const priceNowD = new D(priceNow);

      const value = st.qty.mul(priceNowD);
      const costValue = st.cost;
      const avgCost = st.qty.gt(0) ? st.cost.div(st.qty) : null;
      const uPnl = st.qty.gt(0) ? value.sub(costValue) : null;

      totalValue = totalValue.add(value);
      totalCost = totalCost.add(costValue);
      realizedPnl = realizedPnl.add(st.realized);
      if (uPnl) unrealizedPnl = unrealizedPnl.add(uPnl);

      return {
        symbol: sym,
        quantity: st.qty.toString(),
        avgCost: avgCost?.toString() ?? null,
        costValue: st.qty.gt(0) ? costValue.toString() : null,

        price: priceNow,
        value: value.toString(),

        unrealizedPnl: uPnl?.toString() ?? null,
        realizedPnl: st.realized.toString(),
      };
    });

    const result: PortfolioPositions = {
      portfolio: { id: portfolio.id, name: portfolio.name, currency },

      pricesSource: latest.source,
      pricesAt: latest.at,

      totals: {
        totalValue: totalValue.toString(),
        totalCost: totalCost.toString(),
        unrealizedPnl: unrealizedPnl.toString(),
        realizedPnl: realizedPnl.toString(),
      },

      positions,

      warnings:
        missingTxPrices.length || oversold.length
          ? {
              missingTxPrices: missingTxPrices.length
                ? missingTxPrices
                : undefined,
              oversold: oversold.length ? oversold : undefined,
            }
          : undefined,
    };

    await this.redisService.redis.set(
      key,
      JSON.stringify(result),
      'EX',
      60 * 10,
    );
    return { source: 'computed' as const, ...result };
  }
}
