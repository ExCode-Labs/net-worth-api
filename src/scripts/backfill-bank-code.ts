/**
 * One-off backfill: populate Account.bankCode / Card.bankCode for rows created
 * before the column existed, by resolving each row's bank *name* to a Bank.code.
 *
 * Mirrors the client's resolveBankCode (exact name, then fuzzy) so existing data
 * lines up with what new rows get. Idempotent — only touches rows where bankCode
 * is still null, and leaves custom/unknown banks null.
 *
 * Run AFTER `prisma db push`:
 *   DATABASE_URI=... npm run backfill:bank-code
 */
import { PrismaClient } from '@prisma/client';
import { BANK_SEED } from '../banks/banks.data';

const prisma = new PrismaClient();

// Same normalisation as the client (accountStore.normalizeBank): drop "bank",
// lowercase, strip non-letters — "Kotak Bank" ≈ "kotak".
const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/\bbank\b/g, '')
    .replace(/[^a-z]/g, '');

function resolveBankCode(name: string): string | undefined {
  const n = name.trim();
  if (!n) return undefined;
  const exact = BANK_SEED.find((b) => b.name.toLowerCase() === n.toLowerCase());
  if (exact) return exact.code;
  const na = normalize(n);
  if (!na) return undefined;
  const fuzzy = BANK_SEED.find((b) => {
    const nb = normalize(b.name);
    return !!nb && (na.includes(nb) || nb.includes(na));
  });
  return fuzzy?.code;
}

async function backfill(
  label: string,
  rows: { id: string; bank: string }[],
  update: (id: string, bankCode: string) => Promise<unknown>,
) {
  let matched = 0;
  let skipped = 0;
  for (const row of rows) {
    const code = resolveBankCode(row.bank);
    if (!code) {
      skipped++;
      continue;
    }
    await update(row.id, code);
    matched++;
  }
  console.log(
    `${label}: ${matched} matched, ${skipped} left null (custom/unknown).`,
  );
}

async function main() {
  const accounts = await prisma.account.findMany({
    where: { bankCode: null },
    select: { id: true, bank: true },
  });
  await backfill('Accounts', accounts, (id, bankCode) =>
    prisma.account.update({ where: { id }, data: { bankCode } }),
  );

  const cards = await prisma.card.findMany({
    where: { bankCode: null },
    select: { id: true, bank: true },
  });
  await backfill('Cards', cards, (id, bankCode) =>
    prisma.card.update({ where: { id }, data: { bankCode } }),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
