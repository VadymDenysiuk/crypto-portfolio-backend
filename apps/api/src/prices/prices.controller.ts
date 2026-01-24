import { Controller, Get, Query } from '@nestjs/common';
import { PricesService } from './prices.service';

@Controller('prices')
export class PricesController {
  constructor(private readonly pricesService: PricesService) {}

  @Get('latest')
  latest(
    @Query('symbols') symbols = 'BTC,ETH,SOL',
    @Query('currency') currency = 'USD',
  ) {
    const list = symbols
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return this.pricesService.latest(list, currency.toUpperCase());
  }
}
