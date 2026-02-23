import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreatePortfolioDto } from './dto/create-portfolio.dto';
import { PortfoliosService } from './portfolios.service';

@Controller('portfolios')
export class PortfoliosController {
  constructor(private readonly portfolios: PortfoliosService) {}

  @Post()
  create(@Body() dto: CreatePortfolioDto) {
    return this.portfolios.create(dto);
  }

  @Get()
  list() {
    return this.portfolios.list();
  }

  @Get(':id/summary')
  summary(@Param('id') id: string) {
    return this.portfolios.summary(id);
  }

  @Get(':id/positions')
  positions(@Param('id') id: string) {
    return this.portfolios.positions(id);
  }
}
