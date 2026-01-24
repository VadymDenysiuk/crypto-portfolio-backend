import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisModule } from './redis/redis.module';
import { PrismaModule } from './prisma/prisma.module';
import { ScheduleModule } from '@nestjs/schedule';
import { PricesModule } from './prices/prices.module';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, RedisModule, PricesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
