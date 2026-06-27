import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const SHARE_CATEGORIES = [
  'balance',
  'cards',
  'assets',
  'liabilities',
] as const;
export type ShareCategory = (typeof SHARE_CATEGORIES)[number];

function publicUser(u: {
  id: string;
  fullName: string | null;
  firstName: string | null;
  avatarUrl: string | null;
}) {
  return {
    id: u.id,
    name: u.fullName || u.firstName || 'NetWorth user',
    avatarUrl: u.avatarUrl,
  };
}

@Injectable()
export class SharingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Match hashed contact numbers to registered users (excluding self). */
  async discover(userId: string, hashes: string[]) {
    if (!hashes?.length) return [];
    const users = await this.prisma.user.findMany({
      where: { phoneHash: { in: hashes }, id: { not: userId } },
      select: {
        id: true,
        fullName: true,
        firstName: true,
        avatarUrl: true,
        phoneHash: true,
      },
    });
    return users.map((u) => ({ ...publicUser(u), phoneHash: u.phoneHash }));
  }

  /** Outgoing shares — who I share with and which categories. */
  async listOutgoing(userId: string) {
    const shares = await this.prisma.share.findMany({
      where: { ownerId: userId },
      include: {
        recipient: {
          select: {
            id: true,
            fullName: true,
            firstName: true,
            avatarUrl: true,
          },
        },
      },
    });
    return shares.map((s) => ({
      id: s.id,
      recipient: publicUser(s.recipient),
      categories: s.categories,
    }));
  }

  /** Grant/update a share. Empty categories revokes it. */
  async upsertOutgoing(
    userId: string,
    recipientId: string,
    categories: string[],
  ) {
    if (recipientId === userId)
      throw new BadRequestException("Can't share with yourself");
    const clean = categories.filter((c) =>
      (SHARE_CATEGORIES as readonly string[]).includes(c),
    );

    if (clean.length === 0) {
      await this.prisma.share.deleteMany({
        where: { ownerId: userId, recipientId },
      });
      return { revoked: true };
    }
    const recipient = await this.prisma.user.findUnique({
      where: { id: recipientId },
    });
    if (!recipient) throw new BadRequestException('Recipient not found');

    const share = await this.prisma.share.upsert({
      where: { ownerId_recipientId: { ownerId: userId, recipientId } },
      create: { ownerId: userId, recipientId, categories: clean },
      update: { categories: clean },
    });
    return { id: share.id, recipientId, categories: share.categories };
  }

  async revokeOutgoing(userId: string, recipientId: string) {
    await this.prisma.share.deleteMany({
      where: { ownerId: userId, recipientId },
    });
    return { revoked: true };
  }

  /** People sharing their data with me. */
  async listIncoming(userId: string) {
    const shares = await this.prisma.share.findMany({
      where: { recipientId: userId },
      include: {
        owner: {
          select: {
            id: true,
            fullName: true,
            firstName: true,
            avatarUrl: true,
          },
        },
      },
    });
    return shares.map((s) => ({
      owner: publicUser(s.owner),
      categories: s.categories,
    }));
  }

  /** Live data an owner shares with me, limited to granted categories. */
  async incomingData(meId: string, ownerId: string) {
    const share = await this.prisma.share.findUnique({
      where: { ownerId_recipientId: { ownerId, recipientId: meId } },
    });
    if (!share) throw new ForbiddenException('Not shared with you');

    const cats = new Set(share.categories);
    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true, fullName: true, firstName: true, avatarUrl: true },
    });

    const out: Record<string, unknown> = {
      owner: owner ? publicUser(owner) : null,
      categories: share.categories,
    };

    if (cats.has('balance')) {
      const accounts = await this.prisma.account.findMany({
        where: { userId: ownerId },
      });
      out.balance = {
        total: accounts.reduce((s, a) => s + a.balance, 0),
        accounts: accounts.length,
      };
    }
    if (cats.has('cards')) {
      const cards = await this.prisma.card.findMany({
        where: { userId: ownerId },
      });
      out.cards = cards.map((c) => ({
        cardName: c.cardName,
        bank: c.bank,
        limit: c.limit,
        usage: c.usage,
      }));
    }
    if (cats.has('assets')) {
      const assets = await this.prisma.asset.findMany({
        where: { userId: ownerId },
      });
      out.assets = {
        total: assets.reduce((s, a) => s + a.value, 0),
        items: assets.map((a) => ({
          name: a.name,
          type: a.type,
          value: a.value,
        })),
      };
    }
    if (cats.has('liabilities')) {
      const liabilities = await this.prisma.liability.findMany({
        where: { userId: ownerId },
      });
      out.liabilities = {
        total: liabilities.reduce((s, l) => s + l.balance, 0),
        items: liabilities.map((l) => ({
          name: l.name,
          type: l.type,
          balance: l.balance,
        })),
      };
    }
    return out;
  }
}
