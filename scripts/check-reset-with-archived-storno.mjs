import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const original = readFileSync('supabase/migrations/20261113115500_woodmo_v3_protected_storno.sql', 'utf8');
const correction = readFileSync('supabase/migrations/20261114034000_allow_archived_booking_reset.sql', 'utf8');
const db = new PGlite();
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS 'SELECT ''6dfda066-31a0-4a40-8f1b-b82d886487c3''::uuid';
    CREATE TABLE public.pos_booking_resets(id bigint PRIMARY KEY, reset_at bigint);
    CREATE TABLE public.pos_transactions(id text PRIMARY KEY, location text,
      booking_generation bigint, timestamp bigint, data jsonb);
    CREATE TABLE public.pos_cash_sessions(id text PRIMARY KEY, location text,
      booking_generation bigint, date text, data jsonb);
    CREATE TABLE public.pos_staff_users(id uuid PRIMARY KEY, deleted boolean, data jsonb);
    INSERT INTO auth.users VALUES('6dfda066-31a0-4a40-8f1b-b82d886487c3', 'admin@kasse.local');
  `);
  await db.exec(original);
  const sale = { id: 'sale-1', location: 'Friedrichshafen', total: 15,
    paymentMethod: 'cash', cashSessionId: 'cash-1', timestamp: 1794623500000,
    items: [], subtotal: 12, totalPfand: 3, taxByRate: {19: 1.92} };
  await db.query(`INSERT INTO public.pos_transactions(id, location, booking_generation, timestamp, data)
    VALUES ($1,'Friedrichshafen',2,$2,$3::jsonb)`, [sale.id,sale.timestamp,JSON.stringify(sale)]);
  await db.query(`INSERT INTO public.pos_cash_sessions(id,location,booking_generation,date,data)
    VALUES ('cash-1','Friedrichshafen',2,'2026-11-14',$1::jsonb)`, [JSON.stringify({id:'cash-1',closed:false,openingBalance:500})]);
  // Two other site states: BR open; FN closed in an earlier session.
  await db.query(`INSERT INTO public.pos_cash_sessions(id,location,booking_generation,date,data)
    VALUES ('br-open','Bregenz',2,'2026-11-14',$1::jsonb)`, [JSON.stringify({id:'br-open',location:'Bregenz',closed:false,openingBalance:70})]);
  await db.query(`INSERT INTO public.pos_cash_sessions(id,location,booking_generation,date,data)
    VALUES ('fn-closed','Friedrichshafen',2,'2026-11-13',$1::jsonb)`, [JSON.stringify({id:'fn-closed',location:'Friedrichshafen',closed:true,openingBalance:200,closingBalance:180})]);
  await db.query(`INSERT INTO public.pos_stornos(id, original_transaction_id, cash_session_id,
    booking_generation, location, employee_id, employee_name, reason, payment_method,
    gross_amount_cents, cash_effect_cents, card_effect_cents, original_receipt_snapshot)
    VALUES ('7d11452e-856f-4a25-a860-1c7e0cf0c74a','sale-1','cash-1',2,'Friedrichshafen',
    '6dfda066-31a0-4a40-8f1b-b82d886487c3','SZ','Test-Storno','cash',1500,-1500,0,$1::jsonb)`, [JSON.stringify(sale)]);

  await assert.rejects(db.exec('INSERT INTO public.pos_booking_resets(id,reset_at) VALUES (3,1794624500000)'),
    /Buchungs-Reset gesperrt/, 'The old migration reproduces the reported bug');
  await db.exec(correction);
  await db.exec('INSERT INTO public.pos_booking_resets(id,reset_at) VALUES (3,1794624500000)');
  const intact = await db.query(`SELECT
    (SELECT count(*)::int FROM public.pos_booking_resets) resets,
    (SELECT count(*)::int FROM public.pos_transactions) originals,
    (SELECT count(*)::int FROM public.pos_cash_sessions) sessions,
    (SELECT count(*)::int FROM public.pos_stornos) stornos`);
  assert.deepEqual(intact.rows[0], {resets:1,originals:1,sessions:3,stornos:1},
    'Switching generation must preserve open and closed sessions at BOTH sites');
  const active = await db.query(`SELECT
    (SELECT count(*)::int FROM public.pos_transactions WHERE booking_generation=3) active_sales,
    (SELECT count(*)::int FROM public.pos_cash_sessions WHERE booking_generation=3) active_tills,
    (SELECT count(*)::int FROM public.pos_stornos WHERE booking_generation=3) active_stornos`);
  assert.deepEqual(active.rows[0],{active_sales:0,active_tills:0,active_stornos:0},
    'New generation must have no old opening cash, receipt, or storno at either location');
  // A second reset with an empty current generation must also work without
  // deleting history, despite the prior-generation immutable storno.
  await db.exec('INSERT INTO public.pos_booking_resets(id,reset_at) VALUES (4,1794624550000)');
  assert.deepEqual((await db.query(`SELECT
    (SELECT count(*)::int FROM public.pos_booking_resets) resets,
    (SELECT count(*)::int FROM public.pos_transactions) originals,
    (SELECT count(*)::int FROM public.pos_cash_sessions) sessions,
    (SELECT count(*)::int FROM public.pos_stornos) stornos`)).rows[0],
    {resets:2,originals:1,sessions:3,stornos:1});
  await assert.rejects(db.exec("DELETE FROM public.pos_transactions WHERE id='sale-1'"), /darf nicht gelöscht/);
  await assert.rejects(db.exec("DELETE FROM public.pos_cash_sessions WHERE id='cash-1'"), /darf nicht gelöscht/);
  await assert.rejects(db.exec('DELETE FROM public.pos_stornos'), /nicht geändert/);
  // Corrupt references are still protected: the new rule is not a blanket bypass.
  await db.query(`INSERT INTO public.pos_stornos(id, original_transaction_id, cash_session_id,
    booking_generation, location, employee_id, employee_name, reason, payment_method,
    gross_amount_cents, cash_effect_cents, card_effect_cents, original_receipt_snapshot)
    VALUES ('d629facf-80ba-4f09-b2b5-4048e896b37b','missing-bon','cash-1',2,
    'Friedrichshafen','6dfda066-31a0-4a40-8f1b-b82d886487c3',
    'SZ','Corrupt fixture','cash',1500,-1500,0,$1::jsonb)`, [JSON.stringify(sale)]);
  await assert.rejects(db.exec('INSERT INTO public.pos_booking_resets(id,reset_at) VALUES (5,1794624600000)'),
    /ohne unveränderten Originalbon oder Kassensitzung/);
  assert.equal((await db.query('SELECT count(*)::int as total FROM public.pos_booking_resets')).rows[0].total,2);
  console.log('V3 RESET MIT STORNO: zwei Standorte, offene und geschlossene Kassen, zweimal Reset, Archiv geschützt, verwaiste Belege gesperrt.');
} finally {
  await db.close();
}
