import { Controller, Get } from '@nestjs/common';
import { CardProductsService } from './card-products.service';

/**
 * Public reference data — the card-product list isn't user-specific, so it needs
 * no identity guard. The app fetches it once and caches it locally.
 */
@Controller('card-products')
export class CardProductsController {
  constructor(private readonly cardProducts: CardProductsService) {}

  @Get()
  findAll() {
    return this.cardProducts.findAll();
  }
}
