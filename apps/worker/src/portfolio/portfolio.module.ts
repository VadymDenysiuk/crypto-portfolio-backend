import { Module } from '@nestjs/common';
import { PortfolioProcessor } from './portfolio.processor';

@Module({
  providers: [PortfolioProcessor],
})
export class PortfolioModule {}
