import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BanksService } from './banks.service';

@ApiTags('Reference')
@Controller('banks')
export class BanksController {
  constructor(private readonly banks: BanksService) {}

  @Get()
  @ApiOperation({ summary: 'List all supported banks (public, no auth required)' })
  @ApiOkResponse({
    schema: {
      example: [{ id: 'hdfc', code: 'HDFC', name: 'HDFC Bank', color: '#004C8F' }],
    },
  })
  findAll() {
    return this.banks.findAll();
  }
}
