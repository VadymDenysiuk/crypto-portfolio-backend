import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly tx: TransactionsService) {}

  @Post()
  create(@Body() dto: CreateTransactionDto) {
    return this.tx.create(dto);
  }

  @Get()
  list(@Query('portfolioId') portfolioId?: string) {
    return this.tx.list(portfolioId);
  }
}
