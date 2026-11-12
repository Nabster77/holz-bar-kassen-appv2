import assert from 'node:assert/strict';
import { decodeStornoRow } from '../src/lib/stornoCodec.ts';

const original = {
  id:'beleg-10', location:'Friedrichshafen', paymentMethod:'cash',
  timestamp:Date.parse('2026-11-12T12:00:00Z'),
  total:12.5, subtotal:10, totalPfand:2.5,
  totalNet:8.4, totalTax:1.6, taxByRate:{19:1.6},
  items:[{productId:'wasser',quantity:1}],
};
const row = {
  id:'a32d94dc-8791-48df-ad71-18334b8fa21f', original_transaction_id:original.id,
  cash_session_id:'session-1',location:original.location,
  recorded_at:'2026-11-12T12:05:00Z', employee_id:'one',employee_name:'Tao',
  reason:'Kunde hat versehentlich doppelt bestellt',
  payment_method:'cash',gross_amount_cents:1250,cash_effect_cents:-1250,card_effect_cents:0,
  original_receipt_snapshot:original,
};
const decoded=decodeStornoRow(row);
assert.equal(decoded.originalTransactionId,original.id);
assert.equal(decoded.cashEffect,-12.5);
assert.equal(decoded.cardEffect,0);
assert.equal(decoded.reason,row.reason);
assert.equal(decoded.timestamp,Date.parse(row.recorded_at));
assert.equal(decodeStornoRow({...row,payment_method:'card',cash_effect_cents:0,card_effect_cents:-1250,original_receipt_snapshot:{...original,paymentMethod:'card'}}).cardEffect,-12.5);
const returned={...original,total:-2.5,subtotal:-2.5,totalPfand:0,location:'Bregenz'};
assert.equal(decodeStornoRow({...row,gross_amount_cents:-250,cash_effect_cents:250,
  location:'Bregenz',original_receipt_snapshot:returned}).cashEffect,2.5);
for (const variant of [
 {...row,gross_amount_cents:1251},
 {...row,cash_effect_cents:0},
 {...row,original_transaction_id:'other'},
 {...row,location:'Bregenz'},
 {...row,recorded_at:'not-a-time'},
 {...row,reason:'x'},
 {...row,original_receipt_snapshot:{...original,items:null}},
 {...row,original_receipt_snapshot:{...original,total:Infinity}},
]) assert.throws(()=>decodeStornoRow(variant),/unvollständig|widersprüchlich/);
console.log('STORNO-CLOUD-CODEC: Bar, Karte, Pfandretoure und fehlerhafte Daten geprüft.');
