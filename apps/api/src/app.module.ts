import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AssetsModule } from './assets/assets.module';
import { RedisModule } from './redis/redis.module';
import { PricesModule } from './prices/prices.module';
import { PortfoliosModule } from './portfolios/portfolios.module';
import { TransactionsModule } from './transactions/transactions.module';

@Module({
  imports: [
    PrismaModule,
    AssetsModule,
    RedisModule,
    PricesModule,
    PortfoliosModule,
    TransactionsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
