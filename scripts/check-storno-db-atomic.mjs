import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const schema = readFileSync('docs/sql/WOODMO_V3_STORNO_SCHEMA_ENTWURF_NICHT_AUSFUEHREN.sql','utf8');
const adminId='6dfda066-31a0-4a40-8f1b-b82d886487c3';
const employeeId='4c8ae922-fbae-47cf-b3ad-1b87d74527a0';
const sessionId='v3-storno-test-session';
const opening=Date.now()-90_000;
const now=Date.now();

const db = new PGlite();
await db.exec(`
  CREATE ROLE anon;
  CREATE ROLE authenticated;
  CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    'SELECT ''6dfda066-31a0-4a40-8f1b-b82d886487c3''::uuid';
  CREATE TABLE public.pos_booking_resets(id bigint PRIMARY KEY,reset_at bigint);
  CREATE TABLE public.pos_transactions(
    id text PRIMARY KEY, location text, booking_generation bigint,
    timestamp bigint, data jsonb
  );
  CREATE TABLE public.pos_cash_sessions(
    id text PRIMARY KEY, location text, booking_generation bigint,
    date text, data jsonb
  );
  CREATE TABLE public.pos_staff_users(id uuid PRIMARY KEY,deleted boolean,data jsonb);
  INSERT INTO auth.users(id,email)
    VALUES ('${adminId}','admin@kasse.local');
  INSERT INTO public.pos_staff_users(id,deleted,data)
    VALUES ('${employeeId}',false,'{"active":true,"role":"employee","name":"Testkraft"}');
`);
await db.exec(schema);
const cols = await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='pos_stornos'");
assert(cols.rows.some(x=>x.column_name==='original_transaction_id'));
const indexed=await db.query("SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='pos_stornos'");
assert(indexed.rows.length >= 3);
const pgPolicies=await db.query("SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='pos_stornos'");
assert(pgPolicies.rows.some(x=>x.policyname==='v3_admin_select_pos_stornos'));

const cashSession = {id:sessionId,location:'Friedrichshafen',date:'2026-11-13',
 openingBalance:20,openedAt:opening,closed:false,entries:[],corrections:[]};
const orig=(id,stamp,method='cash')=>({
 id,cashSessionId:sessionId,location:'Friedrichshafen',timestamp:stamp,
 paymentMethod:method,total:8.5,subtotal:8.5,totalNet:7.14,totalTax:1.36,
 totalPfand:0,taxByRate:{"19":1.36},items:[{productId:"wasser",name:"Wasser",
 price:8.5,quantity:1,pfand:0,netPrice:7.14,taxAmount:1.36,taxRate:19,categoryId:"drinks"}],
});
await db.query('INSERT INTO public.pos_cash_sessions(id,location,booking_generation,date,data) VALUES($1,$2,0,$3,$4::jsonb)',
  [sessionId,'Friedrichshafen','2026-11-13',JSON.stringify(cashSession)]);
const receipts=Array.from({length:6},(_,i)=>orig(`bon-${i}`,opening+1000*(i+1),i%2?'card':'cash'));
for(const sale of receipts){
  await db.query('INSERT INTO public.pos_transactions(id,location,booking_generation,timestamp,data) VALUES($1,$2,0,$3,$4::jsonb)',
    [sale.id,sale.location,sale.timestamp,JSON.stringify(sale)]);
}
const rpc=(args)=>{
 const [stornoId,originalId]=args;
 return db.query('SELECT (public.create_pos_storno_v3($1::uuid,$2::text,$3::text,$4::uuid,$5::text)).*',
    [stornoId,originalId,sessionId,employeeId,'Falsche Artikelwahl']);
};
const id1='7d11452e-856f-4a25-a860-1c7e0cf0c74a';
await assert.rejects(rpc([id1,'bon-0']),/letzten fünf/);
const res=await rpc([id1,'bon-1']);
assert.equal(res.rows.length,1);
assert.equal(res.rows[0].original_transaction_id,'bon-1');
assert.equal(Number(res.rows[0].cash_effect_cents),0,'Card storno cannot change physical cash');
assert.equal(Number(res.rows[0].card_effect_cents),-850);
assert.equal((await rpc([id1,'bon-1'])).rows[0].id,id1,'Stable retry must be idempotent');
await assert.rejects(rpc(['1e4e1e8d-bdc0-46a0-b2dd-29c31b9d9f7b','bon-1']),/bereits storniert/);
assert.equal((await db.query("SELECT count(*)::int as count FROM public.pos_stornos")).rows[0].count,1);
const id2='d629facf-80ba-4f09-b2b5-4048e896b37b';
const bar=await rpc([id2,'bon-2']);
assert.equal(Number(bar.rows[0].cash_effect_cents),-850);
assert.equal(Number(bar.rows[0].card_effect_cents),0);
await assert.rejects(db.exec("UPDATE public.pos_stornos SET reason='xyz'"),/nicht geändert/);
await assert.rejects(db.exec("DELETE FROM public.pos_stornos"),/nicht geändert/);
// Even an admin cannot close the day with missing storno evidence.
const closed={...cashSession,closed:true,closedAt:now,dailyCloseFinalizedAt:now,
 dailyCloseSnapshot:{transactions:receipts,stornos:[],finalizedAt:now}};
await assert.rejects(
  db.query('UPDATE public.pos_cash_sessions SET data=$2::jsonb WHERE id=$1',
    [sessionId,JSON.stringify(closed)]),
  /enthält nicht alle bestätigten Stornobelege/,
);
// Nor may a reset delete an original receipt or session with storno evidence.
await assert.rejects(db.query('DELETE FROM public.pos_transactions WHERE id=$1',['bon-1']),/darf nicht gelöscht/);
await assert.rejects(db.query('DELETE FROM public.pos_cash_sessions WHERE id=$1',[sessionId]),/darf nicht gelöscht/);
// SQL stores UTC timestamp while the finalized snapshot stores JS milliseconds.
// The close's audit guard verifies all booked fields, including the original.
const decodeRow = row=>({
  id:row.id,originalTransactionId:row.original_transaction_id,
  cashSessionId:row.cash_session_id,location:row.location,
  employeeId:row.employee_id,employeeName:row.employee_name,
  reason:row.reason,paymentMethod:row.payment_method,
  timestamp:new Date(row.recorded_at).getTime(),
  grossAmount:Number(row.gross_amount_cents)/100,
  cashEffect:Number(row.cash_effect_cents)/100,
  cardEffect:Number(row.card_effect_cents)/100,
  originalSnapshot:row.original_receipt_snapshot,
});
const storedStornos=(await db.query('SELECT * FROM public.pos_stornos ORDER BY recorded_at')).rows;
const verifiedClose={...closed,dailyCloseSnapshot:{
  ...closed.dailyCloseSnapshot,stornos:storedStornos.map(decodeRow),
}};
await db.query('UPDATE public.pos_cash_sessions SET data=$2::jsonb WHERE id=$1',
  [sessionId,JSON.stringify(verifiedClose)]);
await assert.rejects(rpc(['1675225c-eb5c-4d6a-ab1e-1166e17991d9','bon-3']),/abgeschlossen/);
assert.equal((await db.query("SELECT count(*)::int as count FROM public.pos_transactions")).rows[0].count,6);
assert.equal((await db.query("SELECT count(*)::int as count FROM public.pos_stornos")).rows[0].count,2);
await db.close();
console.log('STORNO-SQL: PGlite DDL/RLS, Fünferfenster, Bar/Karte, Doppelstorno, Idempotenz, Unveränderlichkeit, Reset-Sperre und vollständiger Abschluss-Snapshot geprüft.');
