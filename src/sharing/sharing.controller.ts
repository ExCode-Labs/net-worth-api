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
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { IdentityGuard } from '../auth/identity.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SharingService } from './sharing.service';
import { DiscoverDto, UpsertShareDto } from './dto';

@ApiTags('Sharing')
@ApiBearerAuth('bearer')
@Controller('share')
@UseGuards(IdentityGuard)
@Throttle({ default: { limit: 200, ttl: 60_000 } })
export class SharingController {
  constructor(private readonly sharing: SharingService) {}

  @Post('discover')
  @ApiOperation({
    summary: 'Find registered NetWorth users from a contact list',
    description: 'Pass SHA-256 hashes of E.164 phone numbers. Numbers are never sent in plain text.',
  })
  @ApiOkResponse({
    schema: {
      example: [
        { id: 'clx...', name: 'Priya Sharma', contactName: 'Priya (contact book name)' },
      ],
    },
  })
  discover(@CurrentUser() user: User, @Body() dto: DiscoverDto) {
    return this.sharing.discover(user.id, dto.hashes);
  }

  @Get('out')
  @ApiOperation({ summary: 'List people I am sharing with (outgoing shares)' })
  @ApiOkResponse({
    schema: {
      example: [
        {
          recipient: { id: 'clx...', name: 'Priya Sharma' },
          categories: ['accounts', 'transactions'],
          createdAt: '2026-06-01T10:00:00Z',
        },
      ],
    },
  })
  listOutgoing(@CurrentUser() user: User) {
    return this.sharing.listOutgoing(user.id);
  }

  @Put('out')
  @ApiOperation({
    summary: 'Grant or update sharing with a user',
    description: 'Pass an empty `categories` array to revoke all access.',
  })
  @ApiOkResponse({ schema: { example: { recipientId: 'clx...', categories: ['accounts'] } } })
  upsertOutgoing(@CurrentUser() user: User, @Body() dto: UpsertShareDto) {
    return this.sharing.upsertOutgoing(user.id, dto.recipientId, dto.categories);
  }

  @Delete('out/:recipientId')
  @ApiParam({ name: 'recipientId', description: 'User ID to stop sharing with' })
  @ApiOperation({ summary: 'Revoke all sharing with a specific user' })
  @ApiNoContentResponse()
  revoke(@CurrentUser() user: User, @Param('recipientId') recipientId: string) {
    return this.sharing.revokeOutgoing(user.id, recipientId);
  }

  @Get('in')
  @ApiOperation({ summary: 'List people sharing their data with me (incoming shares)' })
  @ApiOkResponse({
    schema: {
      example: [
        {
          owner: { id: 'clx...', name: 'Amit Kumar' },
          categories: ['accounts'],
          createdAt: '2026-05-15T08:00:00Z',
        },
      ],
    },
  })
  listIncoming(@CurrentUser() user: User) {
    return this.sharing.listIncoming(user.id);
  }

  @Get('in/:ownerId')
  @ApiParam({ name: 'ownerId', description: 'User ID whose shared data to fetch' })
  @ApiOperation({ summary: "Fetch the live shared data for one owner's account" })
  @ApiOkResponse({
    schema: {
      example: {
        owner: { id: 'clx...', name: 'Amit Kumar' },
        accounts: [{ id: 'clx...', type: 'Savings', balance: 80000 }],
        transactions: [],
      },
    },
  })
  incomingData(@CurrentUser() user: User, @Param('ownerId') ownerId: string) {
    return this.sharing.incomingData(user.id, ownerId);
  }
}
