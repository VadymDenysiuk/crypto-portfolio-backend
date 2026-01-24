import { Module } from '@nestjs/common';
import { PricesService } from './prices.service';

@Module({
  providers: [PricesService],
})
export class PricesModule {}
