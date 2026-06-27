import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SharingController } from './sharing.controller';
import { SharingService } from './sharing.service';

@Module({
  imports: [AuthModule],
  controllers: [SharingController],
  providers: [SharingService],
})
export class SharingModule {}
