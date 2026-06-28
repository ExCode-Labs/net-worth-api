import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LoggerMiddleware } from './common/logger.middleware';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { DataModule } from './data/data.module';
import { SharingModule } from './sharing/sharing.module';
import { BanksModule } from './banks/banks.module';
import { CardProductsModule } from './card-products/card-products.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      // Generic fallback — applies when no named throttler is specified.
      { name: 'default', ttl: 60_000, limit: 120 },
      // Auth flows — brute-force protection.
      { name: 'auth', ttl: 300_000, limit: 10 },
      { name: 'otp', ttl: 900_000, limit: 5 },
      { name: 'refresh', ttl: 60_000, limit: 30 },
      // Data sync — POST/PATCH per-entity; client queues these 30 ms apart,
      // but a large offline backlog can still send hundreds per minute.
      { name: 'sync', ttl: 60_000, limit: 2000 },
      // Expensive reads — bootstrap and vault are full-table queries; throttle tightly.
      { name: 'heavy', ttl: 60_000, limit: 15 },
    ]),
    PrismaModule,
    AuthModule,
    DataModule,
    SharingModule,
    BanksModule,
    CardProductsModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
