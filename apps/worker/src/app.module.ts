import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisModule } from './redis/redis.module';
import { PrismaModule } from './prisma/prisma.module';
import { ScheduleModule } from '@nestjs/schedule';
import { PricesModule } from './prices/prices.module';
import { BullModule } from '@nestjs/bullmq';
import { bullConnection } from './bullmq/bullmq.connection';
import { PortfolioModule } from './portfolio/portfolio.module';
import { HealthModule } from './health/health.module';
import { VersionController } from './version/version.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    PricesModule,
    BullModule.forRoot({
      connection: bullConnection(),
    }),
    BullModule.registerQueue({ name: 'portfolio' }),
    PortfolioModule,
    HealthModule,
  ],
  controllers: [AppController, VersionController],
  providers: [AppService],
})
export class AppModule {}
