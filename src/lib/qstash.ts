import { Client } from '@upstash/qstash';

/**
 * Returns an authenticated Upstash QStash client instance using QSTASH_TOKEN.
 * Returns null if QSTASH_TOKEN is not configured in the environment.
 */
export function getQStashClient(): Client | null {
  const token = process.env.QSTASH_TOKEN?.trim();
  if (!token) return null;
  return new Client({ token });
}
