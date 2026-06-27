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
import type { User } from '@prisma/client';
import { IdentityGuard } from '../auth/identity.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { DataService } from './data.service';
import { CreateEntityDto, UpdateEntityDto, UpdateMeDto } from './dto';

@Controller()
@UseGuards(IdentityGuard)
export class DataController {
  constructor(private readonly data: DataService) {}

  /** All of the caller's data in one round-trip (used at login). */
  @Get('bootstrap')
  bootstrap(@CurrentUser() user: User) {
    return this.data.bootstrap(user);
  }

  @Get('me')
  me(@CurrentUser() user: User) {
    return this.data.me(user);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: User, @Body() dto: UpdateMeDto) {
    return this.data.updateMe(user.id, dto);
  }

  // ── Generic per-resource CRUD ───────────────────────────────────────────────
  @Post(':resource')
  create(
    @CurrentUser() user: User,
    @Param('resource') resource: string,
    @Body() dto: CreateEntityDto,
  ) {
    return this.data.create(user.id, resource, dto.id, dto.data);
  }

  @Patch(':resource/:id')
  update(
    @CurrentUser() user: User,
    @Param('resource') resource: string,
    @Param('id') id: string,
    @Body() dto: UpdateEntityDto,
  ) {
    return this.data.update(user.id, resource, id, dto.data);
  }

  @Delete(':resource/:id')
  remove(
    @CurrentUser() user: User,
    @Param('resource') resource: string,
    @Param('id') id: string,
  ) {
    return this.data.remove(user.id, resource, id);
  }
}
