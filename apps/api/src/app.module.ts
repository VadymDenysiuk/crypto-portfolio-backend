import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AssetsModule } from './assets/assets.module';
import { RedisModule } from './redis/redis.module';
import { PricesModule } from './prices/prices.module';
import { PortfoliosModule } from './portfolios/portfolios.module';
import { TransactionsModule } from './transactions/transactions.module';
import { BullModule } from '@nestjs/bullmq';
import { bullConnection } from './bullmq/bullmq.connection';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    PrismaModule,
    AssetsModule,
    RedisModule,
    PricesModule,
    PortfoliosModule,
    TransactionsModule,
    BullModule.forRoot({
      connection: bullConnection(),
    }),
    BullModule.registerQueue({ name: 'portfolio' }),
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
