import type { CashSession } from '../types';

/** PostgreSQL JSONB may reorder object keys; the financial content may not change. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(obj).sort()
      .filter((key) => obj[key] !== undefined)
      .map((key) => [key, canonical(obj[key])]));
  }
  return value;
}

/**
 * The Cloud must confirm ALL receipts, cash movements, taxes and audit data.
 * A matching receipt number or receipt count alone is not sufficient.
 */
export function assertFinalizedCloseMatches(
  expected: CashSession,
  stored: unknown,
): void {
  if (!expected.closed || !expected.dailyCloseSnapshot || !expected.dailyCloseReceiptNumber) {
    throw new Error('Kein vollständiger endgültiger Tagesabschluss.');
  }
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    throw new Error('Der Tagesabschluss fehlt in Supabase.');
  }
  const storedClose = stored as Partial<CashSession>;
  if (!storedClose.closed || !storedClose.dailyCloseSnapshot ||
      storedClose.id !== expected.id ||
      storedClose.dailyCloseReceiptNumber !== expected.dailyCloseReceiptNumber ||
      storedClose.dailyCloseFinalizedAt !== expected.dailyCloseFinalizedAt) {
    throw new Error('Der gespeicherte Tagesabschluss ist nicht endgültig oder hat eine andere Belegnummer.');
  }
  // Strip undefined properties the same way JSONB serialization does.
  if (JSON.stringify(canonical(expected)) !== JSON.stringify(canonical(stored))) {
    throw new Error('Der gespeicherte Tagesabschluss weicht bei Buchungen, Beträgen oder Nachweisen ab.');
  }
}
