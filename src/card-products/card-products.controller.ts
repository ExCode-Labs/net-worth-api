import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CardProductsService } from './card-products.service';

@ApiTags('Reference')
@Controller('card-products')
export class CardProductsController {
  constructor(private readonly cardProducts: CardProductsService) {}

  @Get()
  @ApiOperation({ summary: 'List all card products for the add-card picker (public, no auth required)' })
  @ApiOkResponse({
    schema: {
      example: [
        { id: 'hdfc-bank-millennia-credit-card', name: 'Millennia Credit Card', issuer: 'HDFC Bank', network: 'Visa', type: 'Cashback' },
      ],
    },
  })
  findAll() {
    return this.cardProducts.findAll();
  }
}
