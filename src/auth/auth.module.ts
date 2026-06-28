import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { IdentityGuard } from './identity.guard';
import { RedisService } from '../redis/redis.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, IdentityGuard, RedisService],
  exports: [AuthService, IdentityGuard],
})
export class AuthModule {}
