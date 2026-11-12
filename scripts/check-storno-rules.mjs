import assert from 'node:assert/strict';
import { lastFiveStornoCandidates, prepareStorno, effectiveSales } from '../src/lib/stornoRules.ts';

const start = Date.parse('2026-11-12T08:00:00Z');
const session = { id:'s-1', location:'Friedrichshafen', openedAt:start, closed:false };
const receipts = Array.from({length:7},(_,i)=>({
  id:`r-${i}`,location:'Friedrichshafen',timestamp:start+1000+i,
  paymentMethod:i===6?'card':'cash',total:i===0?-2:10+i,
  subtotal:i===0?-2:10+i,totalPfand:0,totalNet:i===0?-2:10+i,totalTax:0,taxByRate:{},items:[{productId:'artikel-'+i,quantity:1}],
}));
function args(receipt=receipts[5],override={}) {
  return {receipt,session,previousStornos:[],allTransactions:receipts,reason:'Kunde hat Auftrag widerrufen',
    employeeId:'u-1',employeeName:'Tao',currentCashBalance:100,
    now:start+50000,stornoId:'v-1',...override};
}
assert.deepEqual(lastFiveStornoCandidates(receipts,[],session).map(x=>x.id),['r-6','r-5','r-4','r-3','r-2']);
assert.deepEqual(lastFiveStornoCandidates(receipts,[{originalTransactionId:'r-6'}],session).map(x=>x.id),['r-5','r-4','r-3','r-2','r-1']);
assert.deepEqual(lastFiveStornoCandidates(receipts,[],{...session,closed:true}),[]);
const cash=prepareStorno(args());assert.equal(cash.cashEffect,-15);assert.equal(cash.cardEffect,0);
const card=prepareStorno(args(receipts[6]));assert.equal(card.cashEffect,0);assert.equal(card.cardEffect,-16);
const depositReturn=prepareStorno(args(receipts[0],{allTransactions:[receipts[0]]}));assert.equal(depositReturn.cashEffect,2);
assert.equal(effectiveSales(receipts,[cash]).length,6);
assert.equal(effectiveSales(receipts,[cash]).some(x=>x.id==='r-5'),false);
assert.equal(receipts.length,7);
assert.equal(cash.originalSnapshot.id,'r-5');
receipts[5].items[0].quantity=3;
assert.equal(cash.originalSnapshot.items[0].quantity,1,'Storno-Snapshot muss die Originalpositionen einfrieren');
assert.throws(()=>prepareStorno(args({...receipts[5],items:undefined})),/Originalbeleg unvollständig/);
assert.throws(()=>prepareStorno(args(receipts[5],{previousStornos:[cash]})),/letzten fünf|bereits storniert/);
assert.throws(()=>prepareStorno(args(receipts[0])),/letzten fünf/);
assert.throws(()=>prepareStorno(args(receipts[5],{reason:'  '})),/Stornobegründung/);
assert.throws(()=>prepareStorno(args(receipts[5],{currentCashBalance:12})),/negativen Bargeldbestand/);
assert.throws(()=>prepareStorno(args(receipts[5],{session:{...session,closed:true}})),/geschlossen/);
assert.throws(()=>prepareStorno(args(receipts[5],{session:{...session,location:'Bregenz'}})),/nicht zusammen/);
assert.throws(()=>prepareStorno(args(receipts[5],{now:start-1})),/Stornozeitpunkt/);
console.log('STORNO-REGELTESTS BESTANDEN.');
