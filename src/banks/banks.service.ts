import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BANK_SEED } from './banks.data';

/**
 * Serves the canonical Indian-bank reference list (GET /banks) and keeps the
 * `Bank` table in sync with the in-code seed on every boot via idempotent
 * upserts — so deploying an updated list refreshes the DB automatically.
 */
@Injectable()
export class BanksService implements OnModuleInit {
  private readonly logger = new Logger(BanksService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.prisma.$transaction(
        BANK_SEED.map((b) =>
          this.prisma.bank.upsert({
            where: { code: b.code },
            create: { ...b, ifscLength: 11 },
            update: {
              name: b.name,
              ifscLength: 11,
              acctMin: b.acctMin,
              acctMax: b.acctMax,
              acctExample: b.acctExample ?? null,
              category: b.category,
            },
          }),
        ),
      );
      this.logger.log(`Seeded ${BANK_SEED.length} banks.`);
    } catch (err) {
      // Don't block startup if the DB is unreachable — the app ships a bundled
      // fallback list and just won't get server updates this boot.
      this.logger.warn(`Bank seed skipped: ${(err as Error).message}`);
    }
  }

  findAll() {
    return this.prisma.bank.findMany({ orderBy: { name: 'asc' } });
  }
}
