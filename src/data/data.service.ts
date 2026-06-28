import { BadRequestException, Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { hashPhone } from '../common/phone';

/**
 * Retry a DB op a few times on P1001. Neon's free-tier compute auto-suspends
 * when idle; the first query after it sleeps can fail with "can't reach database"
 * while it cold-starts, then succeeds. Used for the login bootstrap (the request
 * most likely to hit a suspended DB).
 */
async function withDbRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'P1001' && attempt < tries) {
        await new Promise((r) => setTimeout(r, 600 * attempt));
        continue;
      }
      throw e;
    }
  }
}

/**
 * Generic per-resource CRUD over the user's financial entities, plus bootstrap
 * (all data in one call) and profile (/me). Ids are client-supplied so creates
 * are idempotent upserts — safe to retry an optimistic insert.
 */

/**
 * The subset of a Prisma model delegate this generic CRUD uses. Lets `delegate()`
 * be typed instead of `any`, so calls below aren't "unsafe any".
 */
interface ModelDelegate {
  upsert(args: {
    where: Record<string, unknown>;
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }): Promise<unknown>;
  updateMany(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
  deleteMany(args: {
    where: Record<string, unknown>;
  }): Promise<{ count: number }>;
}

interface ResourceSpec {
  model: 'account' | 'card' | 'asset' | 'liability' | 'transaction';
  fields: string[]; // writable fields accepted from the client
  dates: string[]; // fields to coerce into Date
}

const RESOURCES: Record<string, ResourceSpec> = {
  accounts: {
    model: 'account',
    fields: [
      'type',
      'bank',
      'bankCode',
      'nickname',
      'balance',
      'accountName',
      'accountNumber',
      'ifsc',
      'branch',
    ],
    dates: [],
  },
  cards: {
    model: 'card',
    fields: [
      'cardName',
      'bank',
      'bankCode',
      'billCycle',
      'number',
      'cardHolder',
      'network',
      'last4',
      'expiry',
      'limit',
      'usage',
    ],
    dates: [],
  },
  assets: {
    model: 'asset',
    fields: [
      'type',
      'name',
      'value',
      'details',
      'closed',
      'startDate',
      'periodMonths',
    ],
    dates: ['startDate'],
  },
  liabilities: {
    model: 'liability',
    fields: [
      'type',
      'name',
      'lender',
      'phone',
      'balance',
      'emi',
      'details',
      'closed',
      'startDate',
      'periodMonths',
    ],
    dates: ['startDate'],
  },
  transactions: {
    model: 'transaction',
    fields: [
      'type',
      'amount',
      'category',
      'merchant',
      'account',
      'bank',
      'date',
      'note',
      'source',
      'status',
      'rawText',
      'confidence',
    ],
    dates: ['date'],
  },
};

@Injectable()
export class DataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private spec(resource: string): ResourceSpec {
    const s = RESOURCES[resource];
    if (!s) throw new BadRequestException(`Unknown resource: ${resource}`);
    return s;
  }

  // Prisma delegates are accessed dynamically by model name; they share the
  // subset of methods this generic CRUD uses (typed via ModelDelegate).
  private delegate(model: string): ModelDelegate {
    return (this.prisma as unknown as Record<string, ModelDelegate>)[model];
  }

  private sanitize(spec: ResourceSpec, data: Record<string, unknown>) {
    const out: Record<string, unknown> = {};
    for (const f of spec.fields) {
      if (data[f] === undefined) continue;
      out[f] = spec.dates.includes(f) ? new Date(data[f] as string) : data[f];
    }
    return out;
  }

  create(
    userId: string,
    resource: string,
    id: string,
    data: Record<string, unknown>,
  ) {
    const spec = this.spec(resource);
    const clean = this.sanitize(spec, data);
    return this.delegate(spec.model).upsert({
      where: { id },
      create: { ...clean, id, userId },
      update: clean,
    });
  }

  async update(
    userId: string,
    resource: string,
    id: string,
    data: Record<string, unknown>,
  ) {
    const spec = this.spec(resource);
    const clean = this.sanitize(spec, data);
    const res = await this.delegate(spec.model).updateMany({
      where: { id, userId },
      data: clean,
    });
    return { count: res.count };
  }

  async remove(userId: string, resource: string, id: string) {
    const spec = this.spec(resource);
    const res = await this.delegate(spec.model).deleteMany({
      where: { id, userId },
    });
    return { count: res.count };
  }

  /** Everything the client needs at login, in one round-trip. */
  async bootstrap(user: User) {
    const [accounts, cards, assets, liabilities, transactions] =
      await withDbRetry(() =>
        Promise.all([
          this.prisma.account.findMany({ where: { userId: user.id } }),
          this.prisma.card.findMany({ where: { userId: user.id } }),
          this.prisma.asset.findMany({ where: { userId: user.id } }),
          this.prisma.liability.findMany({ where: { userId: user.id } }),
          this.prisma.transaction.findMany({
            where: { userId: user.id },
            orderBy: { date: 'desc' },
          }),
        ]),
      );
    return {
      me: this.me(user),
      accounts,
      cards,
      assets,
      liabilities,
      transactions,
    };
  }

  me(user: User) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      provider: user.provider,
      phone: user.phone,
      currency: user.currency,
      guestName: user.guestName,
      onboarded: user.onboarded,
    };
  }

  async updateMe(
    userId: string,
    patch: {
      onboarded?: boolean;
      currency?: string;
      guestName?: string;
      phone?: string;
      firstName?: string;
      lastName?: string;
      fullName?: string;
      avatarUrl?: string;
    },
  ) {
    const data: Record<string, unknown> = {};
    if (typeof patch.onboarded === 'boolean') data.onboarded = patch.onboarded;
    if (typeof patch.currency === 'string') data.currency = patch.currency;
    if (typeof patch.guestName === 'string') data.guestName = patch.guestName;
    if (typeof patch.firstName === 'string') data.firstName = patch.firstName;
    if (typeof patch.lastName === 'string') data.lastName = patch.lastName;
    if (typeof patch.fullName === 'string') data.fullName = patch.fullName;
    if (typeof patch.avatarUrl === 'string') data.avatarUrl = patch.avatarUrl;

    let phoneHash: string | undefined;
    if (typeof patch.phone === 'string') {
      data.phone = patch.phone;
      data.phoneHash = phoneHash = hashPhone(patch.phone);
    }

    // `phoneHash` is unique (it's the contact-discovery key). When this number is
    // already claimed by another account — e.g. a guest upgrading to a signed-in
    // user, or a re-onboard after reinstall — release it from the previous owner
    // so the current user can take it, instead of hitting a P2002. Done in one
    // transaction so the release + assign are atomic.
    const user = await this.prisma.$transaction(async (tx) => {
      if (phoneHash) {
        await tx.user.updateMany({
          where: { phoneHash, NOT: { id: userId } },
          data: { phone: null, phoneHash: null },
        });
      }
      return tx.user.update({ where: { id: userId }, data });
    });
    // Evict the cached user so the updated profile is served immediately
    // (resolve() caches the User for ~5 min).
    void this.redis.delUser(userId);
    return this.me(user);
  }
}
