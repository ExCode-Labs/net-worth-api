import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { IdentityGuard } from './identity.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, IdentityGuard],
  exports: [AuthService, IdentityGuard],
})
export class AuthModule {}
