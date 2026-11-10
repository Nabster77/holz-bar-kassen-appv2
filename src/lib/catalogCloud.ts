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
  const rows: CatalogRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from(TABLE).select('kind,id,data,updated_at,deleted')
      .order('kind').order('id').range(offset, offset + 499);
    if (error) throw error;
    const page = data ?? [];
    if (!page.every(isCatalogRow)) throw new Error('Unerwartetes Format der Artikeldaten in der Cloud.');
    rows.push(...page);
    if (page.length < 500) break;
  }
  return rows;
}

export async function pushCatalogRows(rows: CatalogRow[]): Promise<void> {
  if (!supabase) throw new Error('Cloud ist nicht konfiguriert.');
  const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: 'kind,id' });
  if (error) throw error;
}

/** All rows are committed in one transaction, only against the reviewed snapshot. */
export async function commitCatalogImport(expected: CatalogRow[], rows: CatalogRow[]): Promise<CatalogRow[]> {
  if (!supabase) throw new Error('Cloud ist nicht konfiguriert.');
  const { data, error } = await supabase.rpc('import_pos_catalog', { p_expected: expected, p_rows: rows });
  if (error) throw new Error(`Importstatus nicht bestätigt: ${error.message}. Vorschau neu erstellen. Ist die Import-Migration im Testprojekt eingerichtet?`);
  if (!Array.isArray(data) || !data.every(isCatalogRow)) throw new Error('Unerwartete Importantwort. Vor erneutem Versuch Cloud synchronisieren.');
  return data;
}
