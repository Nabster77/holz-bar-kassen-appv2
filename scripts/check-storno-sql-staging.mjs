import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const draft = readFileSync('docs/sql/WOODMO_V3_STORNO_SCHEMA_ENTWURF_NICHT_AUSFUEHREN.sql','utf8');
const executable = readdirSync('supabase/migrations').filter(name=>/storno/i.test(name));
assert.deepEqual(executable,[],'Ein Storno-Schema darf vor SQL-/Race-Tests nicht automatisch migriert werden');
for(const requirement of [
 'CREATE TABLE IF NOT EXISTS public.pos_stornos',
 'ALTER TABLE public.pos_stornos ENABLE ROW LEVEL SECURITY',
 'REVOKE ALL ON TABLE public.pos_stornos',
 'original_transaction_id text NOT NULL UNIQUE',
 'BEFORE UPDATE OR DELETE',
 'LOCK TABLE public.pos_transactions IN SHARE MODE',
 'LOCK TABLE public.pos_cash_sessions IN SHARE MODE',
 'GRANT EXECUTE ON FUNCTION public.create_pos_storno_v3',
 'TO service_role',
 'cashSessionId',
 'LIMIT 5',
 'Bargeldbestand',
]) assert.ok(draft.includes(requirement),`Storno-SQL-Sicherheitsmerkmal fehlt: ${requirement}`);
assert.equal(/DELETE\s+FROM\s+public\.pos_transactions/i.test(draft),false,'Keine Ursprungsbelege physisch löschen');
assert.equal(/TRUNCATE/i.test(draft),false,'Keine Buchungstabellen leeren');
console.log('STORNO-SQL-ENTWURF: abgesichert, nicht automatisch migrierbar, 5er- und Archivregeln vorhanden.');
