import { supabase } from '@/lib/supabaseClient';
import type { CatalogRow } from '@/lib/catalogSync';

const TABLE = 'pos_catalog_items';

function isCatalogRow(value: unknown): value is CatalogRow {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    (row.kind === 'category' || row.kind === 'product' || row.kind === 'setting') &&
    typeof row.id === 'string' &&
    typeof row.updated_at === 'number' &&
    typeof row.deleted === 'boolean' &&
    typeof row.data === 'object' &&
    row.data !== null
  );
}

export async function fetchCatalogRows(): Promise<CatalogRow[]> {
  if (!supabase) throw new Error('Cloud ist nicht konfiguriert.');
  const { data, error } = await supabase.from(TABLE).select('kind,id,data,updated_at,deleted');
  if (error) throw error;
  const rows = data ?? [];
  if (!rows.every(isCatalogRow)) throw new Error('Unerwartetes Format der Artikeldaten in der Cloud.');
  return rows;
}

export async function pushCatalogRows(rows: CatalogRow[]): Promise<void> {
  if (!supabase) throw new Error('Cloud ist nicht konfiguriert.');
  const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: 'kind,id' });
  if (error) throw error;
}
