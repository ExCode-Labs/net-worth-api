import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CARD_PRODUCT_SEED } from './card-products.data';

/**
 * Serves the card-product reference list (GET /card-products) and keeps the
 * `CardProduct` table in sync with the in-code seed on every boot via idempotent
 * upserts — so deploying an updated list refreshes the DB automatically. Mirrors
 * BanksService.
 */
@Injectable()
export class CardProductsService implements OnModuleInit {
  private readonly logger = new Logger(CardProductsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.prisma.$transaction([
        this.prisma.cardProduct.deleteMany({}),
        this.prisma.cardProduct.createMany({ data: CARD_PRODUCT_SEED }),
      ]);
      this.logger.log(`Seeded ${CARD_PRODUCT_SEED.length} card products.`);
    } catch (err) {
      // Don't block startup if the DB is unreachable — the app ships a bundled
      // fallback list and just won't get server updates this boot.
      this.logger.warn(`Card-product seed skipped: ${(err as Error).message}`);
    }
  }

  findAll() {
    return this.prisma.cardProduct.findMany({ orderBy: { name: 'asc' } });
  }
}
