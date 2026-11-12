import assert from 'node:assert/strict';
import { lastFiveCashReceipts, lastFiveStornoCandidates, prepareStorno, prepareFinalCloseStornoSnapshot, effectiveSales } from '../src/lib/stornoRules.ts';

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
assert.deepEqual(lastFiveCashReceipts(receipts,session).map(x=>x.id),['r-6','r-5','r-4','r-3','r-2']);
assert.deepEqual(lastFiveStornoCandidates(receipts,[{originalTransactionId:'r-6'}],session).map(x=>x.id),
  ['r-5','r-4','r-3','r-2'], 'Ein stornierter Bon belegt weiterhin seinen Platz in der letzten Fünfergruppe');
assert.equal(lastFiveStornoCandidates(receipts,[{originalTransactionId:'r-6'}],session).some(x=>x.id==='r-1'),false,
  'Ein älterer Bon rückt nach Storno NICHT nach');
const newcomer={...receipts[6],id:'r-7',timestamp:start+99999};
assert.deepEqual(lastFiveCashReceipts([...receipts,newcomer],session).map(x=>x.id),
  ['r-7','r-6','r-5','r-4','r-3'], 'Neue Buchungen verdrängen den bisher fünftältesten Bon');
assert.equal(lastFiveCashReceipts([...receipts,newcomer],session).length,5,
  'Die Auswahl ist auf fünf begrenzt; die Buchungsliste bleibt vollständig');
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
// The five-bon selection is temporary; all original sales + storno records
// must survive the final daily-close snapshot even after hundreds of sales.
const many=[...receipts,...Array.from({length:1000},(_,i)=>({
  ...receipts[2],id:`many-${i}`,timestamp:start+2000+i,
  items:receipts[2].items.map(item=>({...item})),taxByRate:{...receipts[2].taxByRate},
}))];
assert.equal(many.length,1007);
assert.deepEqual(lastFiveCashReceipts(many,session).map(x=>x.id),
  ['many-999','many-998','many-997','many-996','many-995']);
const closing=prepareFinalCloseStornoSnapshot(many,[cash],session,start+1000000);
assert.equal(closing.transactions.length,1007,'Abschluss muss ALLE Belege enthalten, nicht nur die letzten fünf');
assert.equal(closing.stornos.length,1,'Stornobegründung und Originaldaten müssen mit in den Abschluss');
assert.equal(closing.stornos[0].reason,cash.reason);
assert.equal(closing.stornos[0].originalSnapshot.id,cash.originalTransactionId);
assert.notStrictEqual(closing.transactions[0],many[0],'Abschlusssnapshot darf keine live-Objektreferenz behalten');
const beforeCloseName=closing.transactions[0].items[0].productId;
many[0].items[0].productId='nachtraeglich-veraendert';
assert.equal(closing.transactions[0].items[0].productId,beforeCloseName);
assert.equal(many.length,1007,'Storno darf die Originalbelege nie entfernen');
assert.equal(lastFiveCashReceipts(many,{...session,closed:true}).length,0);
assert.throws(()=>prepareFinalCloseStornoSnapshot(many,[cash],{...session,closed:true},start+1000000),/bereits abgeschlossener/);
assert.throws(()=>prepareFinalCloseStornoSnapshot(many,[cash,{...cash,id:'storno-doppelt'}],session,start+1000000),/doppelter Stornonachweis/);
assert.throws(()=>prepareFinalCloseStornoSnapshot(many,[{...cash,originalTransactionId:'fremd'}],session,start+1000000),/Unvollständiger/);
assert.throws(()=>prepareFinalCloseStornoSnapshot(many,[{...cash,cashSessionId:session.id,timestamp:start+2000000}],session,start+1000000),/Unvollständiger/);
console.log('STORNO-REGEL- UND ABSCHLUSSSNAPSHOT-TESTS BESTANDEN.');
