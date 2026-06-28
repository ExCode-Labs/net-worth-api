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
      { name: 'default', ttl: 60_000, limit: 200 },
      { name: 'auth', ttl: 300_000, limit: 10 },
      { name: 'otp', ttl: 900_000, limit: 5 },
      { name: 'refresh', ttl: 60_000, limit: 30 },
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
