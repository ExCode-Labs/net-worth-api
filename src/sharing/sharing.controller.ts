import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { IdentityGuard } from '../auth/identity.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SharingService } from './sharing.service';
import { DiscoverDto, UpsertShareDto } from './dto';

@Controller('share')
@UseGuards(IdentityGuard)
export class SharingController {
  constructor(private readonly sharing: SharingService) {}

  /** Match hashed contact numbers → registered users. */
  @Post('discover')
  discover(@CurrentUser() user: User, @Body() dto: DiscoverDto) {
    return this.sharing.discover(user.id, dto.hashes);
  }

  /** Outgoing: who I share with. */
  @Get('out')
  listOutgoing(@CurrentUser() user: User) {
    return this.sharing.listOutgoing(user.id);
  }

  /** Grant / update (empty categories revokes). */
  @Put('out')
  upsertOutgoing(@CurrentUser() user: User, @Body() dto: UpsertShareDto) {
    return this.sharing.upsertOutgoing(
      user.id,
      dto.recipientId,
      dto.categories,
    );
  }

  @Delete('out/:recipientId')
  revoke(@CurrentUser() user: User, @Param('recipientId') recipientId: string) {
    return this.sharing.revokeOutgoing(user.id, recipientId);
  }

  /** Incoming: people sharing with me. */
  @Get('in')
  listIncoming(@CurrentUser() user: User) {
    return this.sharing.listIncoming(user.id);
  }

  /** Incoming: the live shared data for one owner. */
  @Get('in/:ownerId')
  incomingData(@CurrentUser() user: User, @Param('ownerId') ownerId: string) {
    return this.sharing.incomingData(user.id, ownerId);
  }
}
