// WOODMO V3: backup restore with SEVERAL cash sessions at the same location.
// Reproduces the live error of 14.11.2026 ("duplicate key value violates
// unique constraint pos_cash_sessions_one_active_per_location_generation_v3")
// and checks the fix in 20261114160000_restore_sessions_one_by_one.sql.
// Isolated PGlite only, synthetic data, no real Cloud is touched.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const memo = {};
function load(name) {
  if (memo[name]) return memo[name];
  const exports = memo[name] = {};
  const code = ts.transpileModule(readFileSync('src/lib/' + name + '.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'exports', code)((path) => load(path.replace('@/lib/', '').replace('./', '')), exports);
  return exports;
}
const { prepareCleanGenerationRestore } = load('cleanGenerationRestore');
const { inspectBackupIntegrity } = load('backupIntegrity');

const db = new PGlite();
const admin = '6dfda066-31a0-4a40-8f1b-b82d886487c3';
const staffSZ = '5bffe378-a2ec-4bf4-83aa-37d0145229f6';
const staffTao = '3f02ed12-a630-41d7-afe6-d894eb8436e8';
const now = 1794623500000;
let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log('BESTANDEN:', name);
}
async function counts(gen) {
  const { rows } = await db.query(`SELECT
    (SELECT count(*)::int FROM public.pos_transactions WHERE booking_generation=$1) t,
    (SELECT count(*)::int FROM public.pos_cash_sessions WHERE booking_generation=$1) s,
    (SELECT count(*)::int FROM public.pos_stornos WHERE booking_generation=$1) z`, [gen]);
  return rows[0];
}
let serial = 0;
const makeId = () => { serial++; return '22222222-3333-4444-8555-' + String(serial).padStart(12, '0'); };

const sale = (id, sid, total, method, time) => ({
  id, location: 'Friedrichshafen', cashSessionId: sid, total, paymentMethod: method, timestamp: time,
  items: [], taxByRate: { 19: Math.round(total * 19 / 119 * 100) / 100 },
  subtotal: total, totalNet: total / 1.19, totalTax: total - total / 1.19, totalPfand: 0,
  employeeId: staffSZ, employeeName: 'SZ',
});
// Same shape as a real WOODMO Pfand-Retoure receipt (cash, one item, total < 0).
const pfandReturn = (id, sid, qty, time) => ({
  id, location: 'Friedrichshafen', cashSessionId: sid, paymentMethod: 'cash', timestamp: time,
  items: [{ name: 'Pfand-Retoure', pfand: -3 * qty, price: -3, taxRate: 0, netPrice: -3, quantity: qty,
    productId: '__pfand_retoure__', taxAmount: 0, categoryId: '__pfand__', isPfandRetoure: true }],
  total: -3 * qty, subtotal: 0, totalNet: 0, totalTax: 0, taxByRate: {}, totalPfand: -3 * qty,
  employeeId: staffSZ, employeeName: 'SZ',
});
const storno = (id, original, sid, time, employeeId, employeeName) => ({
  id, originalTransactionId: original.id, cashSessionId: sid, location: 'Friedrichshafen',
  timestamp: time, reason: 'Kunde hat sich umentschieden', employeeId, employeeName,
  paymentMethod: original.paymentMethod, grossAmount: original.total,
  cashEffect: original.paymentMethod === 'cash' ? -original.total : 0,
  cardEffect: original.paymentMethod === 'card' ? -original.total : 0,
  originalSnapshot: original,
});
const closedSession = (id, location, openedAt, openingBalance, closedAt, sales, stornos) => ({
  id, location, date: '2026-11-14', openedAt, openingBalance, closed: true, closedAt,
  closingBalance: openingBalance, entries: [], corrections: [],
  dailyCloseFinalizedAt: closedAt,
  dailyCloseSnapshot: { transactions: sales, stornos, finalizedAt: closedAt },
});
const openSession = (id, location, openedAt, openingBalance) => ({
  id, location, date: '2026-11-14', openedAt, openingBalance, closed: false, entries: [], corrections: [],
});

// Like the real backup: 3 finally closed sessions in Friedrichshafen on one day,
// two of them with a storno, plus Pfand-Retoure receipts.
const t1 = sale('fn1-t1', 'fn-1', 28.5, 'cash', now + 1000);
const t2 = sale('fn1-t2', 'fn-1', 22.5, 'card', now + 2000);
const t3 = pfandReturn('fn1-t3', 'fn-1', 5, now + 3000);
const z1 = storno('a26f33c1-7698-4350-afb2-8ef0392a6b62', t1, 'fn-1', now + 4000, staffSZ, 'SZ');
const t4 = sale('fn3-t1', 'fn-3', 9.5, 'cash', now + 41000);
const t5 = sale('fn3-t2', 'fn-3', 12, 'card', now + 42000);
const t6 = pfandReturn('fn3-t3', 'fn-3', 1, now + 43000);
const z2 = storno('b8152c3d-c5c1-4a94-ae29-dbe1a78bab94', t4, 'fn-3', now + 44000, staffTao, 'Tao');
const fn1 = closedSession('fn-1', 'Friedrichshafen', now - 100000, 500, now + 20000, [t1, t2, t3], [z1]);
const fn2 = closedSession('fn-2', 'Friedrichshafen', now + 30000, 400, now + 35000, [], []);
const fn3 = closedSession('fn-3', 'Friedrichshafen', now + 40000, 364.5, now + 50000, [t4, t5, t6], [z2]);
const br1 = closedSession('br-1', 'Bregenz', now - 90000, 70, now + 10000, [], []);
const backup = { transactions: [t1, t2, t3, t4, t5, t6], cashSessions: [fn1, fn2, fn3, br1], stornos: [z1, z2] };

async function restore(data, gen) {
  return db.query('SELECT public.restore_pos_clean_backup_v3($1::jsonb,$2::bigint,$3::timestamptz) result',
    [JSON.stringify(data), gen, '2026-11-14T14:31:03Z']);
}

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS 'SELECT ''${admin}''::uuid';
    INSERT INTO auth.users VALUES ('${admin}','admin@kasse.local');
    CREATE TABLE public.pos_booking_resets(id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,reset_at bigint);
    CREATE TABLE public.pos_transactions(id text PRIMARY KEY,location text,
      booking_generation bigint,timestamp bigint,data jsonb);
    CREATE TABLE public.pos_cash_sessions(id text PRIMARY KEY,location text,
      booking_generation bigint,date text,data jsonb);
    CREATE TABLE public.pos_staff_users(id uuid PRIMARY KEY,deleted boolean,data jsonb);
    INSERT INTO public.pos_booking_resets(id,reset_at) VALUES(4,${now - 600000});
    SELECT setval(pg_get_serial_sequence('public.pos_booking_resets','id'),4,true);
  `);
  await db.exec(readFileSync('supabase/migrations/20261113115500_woodmo_v3_protected_storno.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261114034000_allow_archived_booking_reset.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261114050000_restore_clean_v3_backup.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261114080000_allow_valid_pfand_return_restore.sql', 'utf8'));
  // The live open-till index from 20261114071500 (index statement only; the
  // rest of that migration needs functions this isolated database lacks).
  const guards = readFileSync('supabase/migrations/20261114071500_complete_booking_generation_guards.sql', 'utf8');
  const index = guards.match(/CREATE UNIQUE INDEX IF NOT EXISTS pos_cash_sessions_one_active_per_location_generation_v3[\s\S]*?;/);
  assert.ok(index, 'Unique-Index aus 20261114071500 nicht gefunden');
  await db.exec(index[0]);

  await test('01 Testsicherung ist wie das echte Backup in sich stimmig', () => {
    assert.deepEqual(inspectBackupIntegrity(backup), []);
  });
  await test('02 Fehler reproduziert: alte Funktion scheitert an 3 Kassen in Friedrichshafen', async () => {
    const mapped = prepareCleanGenerationRestore(backup, makeId);
    await assert.rejects(restore(mapped, 4), /pos_cash_sessions_one_active_per_location_generation_v3/);
    assert.deepEqual(await counts(4), { t: 0, s: 0, z: 0 }, 'nichts darf halb uebernommen sein');
  });

  await db.exec(readFileSync('supabase/migrations/20261114160000_restore_sessions_one_by_one.sql', 'utf8'));

  await test('03 Neue Funktion stellt alle 4 Kassen, 6 Bons und 2 Stornos wieder her', async () => {
    const mapped = prepareCleanGenerationRestore(backup, makeId);
    const r = await restore(mapped, 4);
    assert.equal(r.rows[0].result.cash_sessions, 4);
    assert.deepEqual(await counts(4), { t: 6, s: 4, z: 2 });
  });
  await test('04 Alle Kassen sind danach wieder endgueltig abgeschlossen, keine offen', async () => {
    const { rows } = await db.query(`SELECT count(*)::int open FROM public.pos_cash_sessions
      WHERE booking_generation=4 AND coalesce(data->>'closed','false')='false'`);
    assert.equal(rows[0].open, 0);
    const { rows: fin } = await db.query(`SELECT count(*)::int n FROM public.pos_cash_sessions
      WHERE booking_generation=4 AND data->>'dailyCloseFinalizedAt' IS NOT NULL AND data->'dailyCloseSnapshot' IS NOT NULL`);
    assert.equal(fin[0].n, 4);
  });
  await test('05 Betraege exakt: Bar, Karte, Pfand-Retouren und Storno-Wirkung', async () => {
    const { rows } = await db.query(`SELECT
      (SELECT sum((data->>'total')::numeric) FROM public.pos_transactions
        WHERE booking_generation=4 AND data->>'paymentMethod'='cash') cash,
      (SELECT sum((data->>'total')::numeric) FROM public.pos_transactions
        WHERE booking_generation=4 AND data->>'paymentMethod'='card') card,
      (SELECT sum(cash_effect_cents) FROM public.pos_stornos WHERE booking_generation=4) storno_cash`);
    assert.equal(Number(rows[0].cash), 28.5 - 15 + 9.5 - 3);
    assert.equal(Number(rows[0].card), 22.5 + 12);
    assert.equal(Number(rows[0].storno_cash), -3800);
  });
  await test('06 Stornos haengen an der richtigen wiederhergestellten Kasse', async () => {
    const { rows } = await db.query(`SELECT count(*)::int ok FROM public.pos_stornos z
      JOIN public.pos_transactions t ON t.id=z.original_transaction_id
      WHERE z.booking_generation=4 AND t.data->>'cashSessionId'=z.cash_session_id`);
    assert.equal(rows[0].ok, 2);
  });
  await test('07 Zweiter Import in dieselbe Generation bleibt gesperrt', async () => {
    const again = prepareCleanGenerationRestore(backup, makeId);
    await assert.rejects(restore(again, 4), /enthält Buchungen oder Kassensitzungen/);
    assert.deepEqual(await counts(4), { t: 6, s: 4, z: 2 });
  });
  await test('08 Nach neuem Reset: Backup mit noch offener letzter Kasse wird korrekt eingespielt', async () => {
    await db.exec(`INSERT INTO public.pos_booking_resets(reset_at) VALUES(${now + 90000})`);
    const withOpen = { ...backup,
      transactions: [t1, t2, t3],
      cashSessions: [fn1, fn2, openSession('fn-4', 'Friedrichshafen', now + 60000, 403), br1],
      stornos: [z1] };
    assert.deepEqual(inspectBackupIntegrity(withOpen), []);
    await restore(prepareCleanGenerationRestore(withOpen, makeId), 5);
    assert.deepEqual(await counts(5), { t: 3, s: 4, z: 1 });
    const { rows } = await db.query(`SELECT count(*)::int open FROM public.pos_cash_sessions
      WHERE booking_generation=5 AND coalesce(data->>'closed','false')='false'`);
    assert.equal(rows[0].open, 1);
    assert.deepEqual(await counts(4), { t: 6, s: 4, z: 2 }, 'Archiv-Generation 4 unveraendert');
  });
  await test('09 Fehler mitten im Import rollt ALLES zurueck', async () => {
    await db.exec(`INSERT INTO public.pos_booking_resets(reset_at) VALUES(${now + 95000})`);
    const broken = prepareCleanGenerationRestore(backup, makeId);
    broken.stornos[1].employeeId = 'keine-uuid';
    await assert.rejects(restore(broken, 6), /invalid input syntax for type uuid|ungültige Eingabesyntax/i);
    assert.deepEqual(await counts(6), { t: 0, s: 0, z: 0 });
  });

  console.log(`WOODMO V3 RESTORE MEHRERE KASSEN: ${passed}/9 BESTANDEN - NUR ISOLIERTE PGLITE.`);
} finally {
  await db.close();
}
