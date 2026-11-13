import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const draft = readFileSync('docs/sql/WOODMO_V3_STORNO_SCHEMA_ENTWURF_NICHT_AUSFUEHREN.sql','utf8');
const executable = readdirSync('supabase/migrations').filter(name=>/storno/i.test(name));
assert.deepEqual(executable,['20261113115500_woodmo_v3_protected_storno.sql'],
  'Only the independently tested V3 storno migration is allowed.');
const migration = readFileSync('supabase/migrations/20261113115500_woodmo_v3_protected_storno.sql','utf8');
const signature = (text) => text.slice(text.indexOf('CREATE TABLE IF NOT EXISTS public.pos_stornos'));
assert.equal(signature(migration),signature(draft),
  'Staged SQL and deployable V3 SQL must have exactly identical executable content.');
for (const marker of ['pos_storno_closed_session_guard','pos_storno_protect_bookings',
 'pos_storno_booking_reset_guard','pos_stornos_immutable','LOCK TABLE public.pos_cash_sessions IN SHARE MODE']) {
  assert.ok(migration.includes(marker),`Missing mandatory protective SQL: ${marker}`);
}
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
console.log('STORNO-SQL-MIGRATION: nur V3, identisch zum isoliert geprüften Entwurf mit Abschluss- und Löschschutz.');
