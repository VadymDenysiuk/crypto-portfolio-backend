import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'portfolio' })],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
