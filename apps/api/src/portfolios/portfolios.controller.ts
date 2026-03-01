import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PortfoliosService } from './portfolios.service';
import { CreatePortfolioDto } from './dto/create-portfolio.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type RequestUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('portfolios')
export class PortfoliosController {
  constructor(private readonly portfoliosService: PortfoliosService) {}

  @Post()
  create(@Body() dto: CreatePortfolioDto, @CurrentUser() user: RequestUser) {
    return this.portfoliosService.create(dto, user.id);
  }

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.portfoliosService.list(user.id);
  }

  @Get(':id/summary')
  summary(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.portfoliosService.summary(id, user.id);
  }

  @Get(':id/positions')
  positions(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.portfoliosService.positions(id, user.id);
  }

  @Get(':id/snapshot')
  snapshot(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.portfoliosService.snapshot(id, user.id);
  }
}
