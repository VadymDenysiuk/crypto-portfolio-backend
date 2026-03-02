import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PortfolioProcessor } from './portfolio.processor';

@Module({
  imports: [BullModule.registerQueue({ name: 'portfolio' })],
  providers: [PortfolioProcessor],
})
export class PortfolioModule {}
