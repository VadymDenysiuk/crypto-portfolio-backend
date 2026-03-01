import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type RequestUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  create(@Body() dto: CreateTransactionDto, @CurrentUser() user: RequestUser) {
    return this.transactionsService.create(dto, user.id);
  }

  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @Query('portfolioId') portfolioId?: string,
  ) {
    return this.transactionsService.list(user.id, portfolioId);
  }
}
