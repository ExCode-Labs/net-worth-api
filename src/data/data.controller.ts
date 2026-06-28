import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
import { DataService } from './data.service';
import { CreateEntityDto, UpdateEntityDto, UpdateMeDto } from './dto';

const RESOURCE_PARAM = {
  name: 'resource',
  enum: ['accounts', 'cards', 'transactions', 'assets', 'liabilities'],
  description: 'Resource type',
} as const;

@ApiTags('Data')
@ApiBearerAuth('bearer')
@Controller()
@UseGuards(IdentityGuard)
export class DataController {
  constructor(private readonly data: DataService) {}

  @Get('bootstrap')
  @Throttle({ heavy: { limit: 15, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Fetch all user data in one call',
    description: 'Returns accounts, cards, transactions, assets, liabilities, and profile. ' +
      'Called once after sign-in. Sensitive fields (card PAN, account number) are stripped — ' +
      'use GET /vault after PIN verification to retrieve them.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        accounts: [{ id: 'clx...', type: 'Savings', bank: 'HDFC Bank', balance: 42000 }],
        cards: [{ id: 'clx...', cardName: 'Millennia', last4: '1234', limit: 100000, usage: 12000 }],
        transactions: [{ id: 'clx...', amount: 500, label: 'Coffee', type: 'Expense', date: '2026-06-01' }],
        assets: [],
        liabilities: [],
        user: { id: 'clx...', email: 'user@example.com', onboarded: true, currency: 'INR' },
      },
    },
  })
  bootstrap(@CurrentUser() user: User) {
    return this.data.bootstrap(user);
  }

  @Get('vault')
  @Throttle({ heavy: { limit: 15, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Fetch sensitive fields (PAN, account number) — requires vault PIN verified client-side',
    description: 'Returns only the sensitive fields stripped from bootstrap. ' +
      'Call after the user successfully enters the vault PIN (POST /auth/vault/verify).',
  })
  @ApiOkResponse({
    schema: {
      example: {
        cards: [{ id: 'clx...', number: '4111111111111234', cardHolder: 'RAHUL SHARMA' }],
        accounts: [{ id: 'clx...', accountNumber: '123456789012', ifsc: 'HDFC0001234', branch: 'MG Road' }],
      },
    },
  })
  vault(@CurrentUser() user: User) {
    return this.data.vaultData(user.id);
  }

  @Get('me')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiOkResponse({
    schema: {
      example: {
        id: 'clx...', email: 'user@example.com', firstName: 'Rahul', lastName: 'Sharma',
        fullName: 'Rahul Sharma', phone: '+919876543210', currency: 'INR', onboarded: true,
        hasVaultPin: true, avatarUrl: null,
      },
    },
  })
  me(@CurrentUser() user: User) {
    return this.data.me(user);
  }

  @Patch('me')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Update user profile' })
  @ApiOkResponse({ schema: { example: { id: 'clx...', firstName: 'Rahul', currency: 'INR' } } })
  updateMe(@CurrentUser() user: User, @Body() dto: UpdateMeDto) {
    return this.data.updateMe(user.id, dto);
  }

  // ── Generic per-resource CRUD ─────────────────────────────────────────────

  @Post(':resource')
  @Throttle({ sync: { limit: 500, ttl: 60_000 } })
  @ApiParam(RESOURCE_PARAM)
  @ApiOperation({
    summary: 'Create or upsert a resource record',
    description:
      'Idempotent upsert — safe to retry. Provide a client-generated `id` (uid()) ' +
      'to keep offline-created records stable across syncs.\n\n' +
      '**accounts** `data`: `{ type, bank, bankCode?, nickname?, balance, accountName?, accountNumber?, ifsc?, branch? }`\n\n' +
      '**cards** `data`: `{ cardName, bank, type("credit"|"debit"), last4, expiry?, limit, usage?, network?, billCycle?, dueDate?, number?, cardHolder?, linkedAccountId? }`\n\n' +
      '**transactions** `data`: `{ amount, label, type("Income"|"Expense"), date, category?, accountId?, cardId?, note? }`\n\n' +
      '**assets** `data`: `{ name, type, value, currency? }`\n\n' +
      '**liabilities** `data`: `{ name, type, principal, outstanding, emi?, interestRate?, startDate?, endDate? }`',
  })
  @ApiOkResponse({ schema: { example: { id: 'clx...' } } })
  create(
    @CurrentUser() user: User,
    @Param('resource') resource: string,
    @Body() dto: CreateEntityDto,
  ) {
    return this.data.create(user.id, resource, dto.data, dto.id);
  }

  @Patch(':resource/:id')
  @Throttle({ sync: { limit: 500, ttl: 60_000 } })
  @ApiParam(RESOURCE_PARAM)
  @ApiParam({ name: 'id', description: 'Record ID', example: 'clx...' })
  @ApiOperation({ summary: 'Update a resource record (partial fields)' })
  @ApiOkResponse({ schema: { example: { id: 'clx...', balance: 45000 } } })
  update(
    @CurrentUser() user: User,
    @Param('resource') resource: string,
    @Param('id') id: string,
    @Body() dto: UpdateEntityDto,
  ) {
    return this.data.update(user.id, resource, id, dto.data);
  }

  @Delete(':resource/:id')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiParam(RESOURCE_PARAM)
  @ApiParam({ name: 'id', description: 'Record ID', example: 'clx...' })
  @ApiOperation({ summary: 'Delete a resource record' })
  @ApiNoContentResponse()
  remove(
    @CurrentUser() user: User,
    @Param('resource') resource: string,
    @Param('id') id: string,
  ) {
    return this.data.remove(user.id, resource, id);
  }
}
