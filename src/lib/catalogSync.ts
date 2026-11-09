import type { Category, Product, PfandSettings, ShotOption } from '@/types';
import { SHOT_SETTING_ID } from '@/lib/shotCatalog';

export type CatalogKind = 'category' | 'product' | 'setting';

export interface CatalogRow {
  kind: CatalogKind;
  id: string;
  data: unknown;
  updated_at: number;
  deleted: boolean;
}

// json is the stable serialized record; null marks a deletion.
export interface CatalogEntry {
  kind: CatalogKind;
  id: string;
  json: string | null;
  updatedAt: number;
}

export interface CatalogSyncState {
  initialized: boolean;
  synced: Record<string, CatalogEntry>;
  pending: Record<string, CatalogEntry>;
}

export interface LocalCatalog {
  categories: Category[];
  products: Product[];
  pfandSettings: PfandSettings;
  shotOptions: ShotOption[];
}

export const PFAND_SETTING_ID = 'pfand';

export function keyOf(kind: CatalogKind, id: string): string {
  return `${kind}:${id}`;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((k) => [k, sortKeys(record[k])]));
  }
  return value;
}

// Postgres reorders JSON keys, so comparisons must not depend on key order.
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

export function buildLocalEntries(catalog: LocalCatalog, now: number): Map<string, CatalogEntry> {
  const entries = new Map<string, CatalogEntry>();
  const add = (kind: CatalogKind, id: string, value: unknown) => {
    entries.set(keyOf(kind, id), { kind, id, json: stableStringify(value), updatedAt: now });
  };
  for (const c of catalog.categories) add('category', c.id, c);
  for (const p of catalog.products) add('product', p.id, p);
  add('setting', PFAND_SETTING_ID, catalog.pfandSettings);
  add('setting', SHOT_SETTING_ID, catalog.shotOptions);
  return entries;
}

export function rowToEntry(row: CatalogRow): CatalogEntry {
  return {
    kind: row.kind,
    id: row.id,
    json: row.deleted ? null : stableStringify(row.data),
    updatedAt: row.updated_at,
  };
}

// Records local changes against the last known cloud state. A key whose local value
// returns to the cloud value drops its pending change.
export function computePending(local: Map<string, CatalogEntry>, state: CatalogSyncState, now: number): boolean {
  let changed = false;
  const keys = new Set([...local.keys(), ...Object.keys(state.synced), ...Object.keys(state.pending)]);
  for (const key of keys) {
    const current = local.get(key);
    const known = current ?? state.synced[key] ?? state.pending[key];
    if (!known) continue;
    const currentJson = current ? current.json : null;
    const targetJson = state.synced[key]?.json ?? null;
    if (currentJson === targetJson) {
      if (state.pending[key]) {
        delete state.pending[key];
        changed = true;
      }
      continue;
    }
    if (state.pending[key]?.json === currentJson) continue;
    state.pending[key] = { kind: known.kind, id: known.id, json: currentJson, updatedAt: now };
    changed = true;
  }
  return changed;
}

export function mergeById<T extends { id: string }>(
  local: T[],
  remote: Map<string, CatalogRow>,
  kind: CatalogKind,
  skipKeys: Set<string>,
): T[] {
  const result: T[] = [];
  const localIds = new Set<string>();
  for (const item of local) {
    localIds.add(item.id);
    const row = remote.get(item.id);
    if (!row || skipKeys.has(keyOf(kind, item.id))) {
      result.push(item);
    } else if (!row.deleted) {
      result.push(row.data as T);
    }
  }
  for (const [id, row] of remote) {
    if (!localIds.has(id) && !row.deleted) result.push(row.data as T);
  }
  return result;
}
