import type { CatalogRow } from '@/lib/catalogSync';
import type { PfandSettings } from '@/types';

/** Returns exact euro cents; never silently coerces invalid input to zero. */
export function parsePfandAmount(raw: string): number | null {
  const value = raw.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const cents = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(cents) || cents < 0) return null;
  return cents / 100;
}

/** A successful request is not proof: compare the value actually read back. */
export function pfandCloudMatches(rows: CatalogRow[], expected: PfandSettings): boolean {
  const row = rows.find((r) => r.kind === 'setting' && r.id === 'pfand' && !r.deleted);
  if (!row || typeof row.data !== 'object' || !row.data) return false;
  const value = row.data as Partial<PfandSettings>;
  return typeof value.Friedrichshafen === 'number' &&
    typeof value.Bregenz === 'number' &&
    Number.isFinite(value.Friedrichshafen) &&
    Number.isFinite(value.Bregenz) &&
    value.Friedrichshafen === expected.Friedrichshafen &&
    value.Bregenz === expected.Bregenz;
}
