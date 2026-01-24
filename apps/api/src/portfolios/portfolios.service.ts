import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PricesService } from '../prices/prices.service';
import { CreatePortfolioDto } from './dto/create-portfolio.dto';

@Injectable()
export class PortfoliosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly prices: PricesService,
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

    const holdings: Record<string, number> = {};
    for (const t of txs) {
      const sym = t.asset.symbol;
      const qty = Number(t.quantity);
      if (!holdings[sym]) holdings[sym] = 0;

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
      const qty = holdings[s];
      const p = prices[s] ?? 0;
      const value = qty * p;
      totalValue += value;
      return { symbol: s, quantity: qty, price: p, value };
    });

    return {
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
  }
}
