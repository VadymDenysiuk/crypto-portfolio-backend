import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTransactionDto) {
    const portfolio = await this.prisma.client.portfolio.findFirst({
      where: { id: dto.portfolioId, userId: 'dev-user' },
      select: { id: true },
    });
    if (!portfolio) throw new NotFoundException('Portfolio not found');

    const asset = await this.prisma.client.asset.findUnique({
      where: { symbol: dto.assetSymbol.toUpperCase() },
      select: { id: true, symbol: true },
    });
    if (!asset) throw new NotFoundException('Asset not found');

    return this.prisma.client.transaction.create({
      data: {
        portfolioId: dto.portfolioId,
        assetId: asset.id,
        type: dto.type,
        quantity: dto.quantity.toString(),
        price: dto.price != null ? dto.price.toString() : null,
        at: dto.at ? new Date(dto.at) : new Date(),
      },
      include: { asset: { select: { symbol: true } } },
    });
  }

  list(portfolioId?: string) {
    return this.prisma.client.transaction.findMany({
      where: portfolioId ? { portfolioId } : undefined,
      orderBy: { at: 'desc' },
      include: { asset: { select: { symbol: true } } },
    });
  }
}
