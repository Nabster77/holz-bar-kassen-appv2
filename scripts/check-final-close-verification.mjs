import assert from 'node:assert/strict';
import { assertFinalizedCloseMatches } from '../src/lib/finalCloseVerification.ts';

const start = Date.parse('2026-11-12T08:00:00Z');
const txs = Array.from({length:1007},(_,i)=>({
  id:`bon-${i}`,cashSessionId:'session-1',timestamp:start+i*1000,
  paymentMethod:i%2?'card':'cash',location:'Friedrichshafen',total:9.99,
  taxByRate:{19:1.59},items:[{productId:'a',quantity:1,price:9.99}],
}));
const close={
  id:'session-1',location:'Friedrichshafen',date:'2026-11-12',openedAt:start,
  openingBalance:100,entries:[{id:'entry',type:'deposit',amount:20,reason:'Wechselgeld'}],
  corrections:[],closed:true,closedAt:start+2000000,closingBalance:200,
  dailyCloseReceiptNumber:15,dailyCloseReceiptLocation:'Friedrichshafen',
  dailyCloseReceiptYear:2026,dailyCloseFinalizedAt:start+2000000,
  dailyCloseSnapshot:{transactions:txs,finalizedAt:start+2000000,
    finalizedById:'staff-1',finalizedByName:'Tao'},
};
assert.doesNotThrow(()=>assertFinalizedCloseMatches(close,structuredClone(close)));
const reordered=JSON.parse(JSON.stringify(close));
const reverseKeys=(value)=>{
  if(Array.isArray(value))return value.map(reverseKeys);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).reverse().map(([k,v])=>[k,reverseKeys(v)]));
  return value;
};
assert.doesNotThrow(()=>assertFinalizedCloseMatches(close,reverseKeys(reordered)),
  'Postgres JSONB object-key order must not change the result');
for(const changed of [
  { ...close, closingBalance:199.99 },
  { ...close, entries:[{...close.entries[0],amount:21}] },
  { ...close, dailyCloseReceiptNumber:17 },
  { ...close, dailyCloseSnapshot:{...close.dailyCloseSnapshot,transactions:txs.slice(0,1006)} },
  { ...close, dailyCloseSnapshot:{...close.dailyCloseSnapshot,
    transactions:txs.map((tx,i)=>i===900?{...tx,total:4.99}:tx)} },
  { ...close, closed:false },
]) assert.throws(()=>assertFinalizedCloseMatches(close,changed),/abweicht|andere Belegnummer|nicht endgültig/);
assert.throws(()=>assertFinalizedCloseMatches(close,null),/fehlt/);
console.log('TAGESABSCHLUSS-CLOUD-ABGLEICH: 1007 Bons und sämtliche Beträge vollständig geprüft.');
