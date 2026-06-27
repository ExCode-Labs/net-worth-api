import { Controller, Get } from '@nestjs/common';
import { BanksService } from './banks.service';

/**
 * Public reference data — the bank list is not user-specific, so it needs no
 * identity guard. The app fetches it once and caches it locally.
 */
@Controller('banks')
export class BanksController {
  constructor(private readonly banks: BanksService) {}

  @Get()
  findAll() {
    return this.banks.findAll();
  }
}
