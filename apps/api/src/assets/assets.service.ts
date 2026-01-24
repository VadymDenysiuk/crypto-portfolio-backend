import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.client.asset.findMany({
      orderBy: { symbol: 'asc' },
    });
  }
}
