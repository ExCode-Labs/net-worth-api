import { createHash } from 'crypto';

/**
 * Normalize a phone number to its last 10 digits so that the same person is
 * matched regardless of country-code / formatting differences. The mobile
 * client MUST use the identical normalization before hashing contacts, or
 * discovery won't match.
 */
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '').slice(-10);
}

/** SHA-256 hash of the normalized number — the discovery key. */
export function hashPhone(raw: string): string {
  return createHash('sha256').update(normalizePhone(raw)).digest('hex');
}
