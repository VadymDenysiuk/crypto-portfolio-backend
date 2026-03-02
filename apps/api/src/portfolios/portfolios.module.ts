import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PricesModule } from '../prices/prices.module';
import { PortfoliosController } from './portfolios.controller';
import { PortfoliosService } from './portfolios.service';

@Module({
  imports: [PricesModule, BullModule.registerQueue({ name: 'portfolio' })],
  controllers: [PortfoliosController],
  providers: [PortfoliosService],
})
export class PortfoliosModule {}
