import { Module } from '@nestjs/common';
import { CardProductsController } from './card-products.controller';
import { CardProductsService } from './card-products.service';

@Module({
  controllers: [CardProductsController],
  providers: [CardProductsService],
})
export class CardProductsModule {}
