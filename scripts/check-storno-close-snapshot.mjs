import assert from 'node:assert/strict';
import { lastFiveCashReceipts, prepareFinalCloseStornoSnapshot } from '../src/lib/stornoRules.ts';

const start = Date.parse('2026-11-12T08:00:00Z');
const session = {id:'session-1', location:'Friedrichshafen', openedAt:start, closed:false};
const transactions = Array.from({length:1001},(_,i)=>({
  id:`bon-${i}`,location:'Friedrichshafen',timestamp:start+1000+i,
  paymentMethod:i % 2 ? 'card' : 'cash',total:10,subtotal:10,
  totalNet:8.4,totalTax:1.6,totalPfand:0,taxByRate:{19:1.6},
  items:[{productId:'wasser',quantity:1}],
}));
const storno = {
  id:'storno-1',originalTransactionId:'bon-0',cashSessionId:session.id,
  location:session.location,timestamp:start+4000,
  employeeId:'employee-1',employeeName:'Tao',reason:'Irrtum beim Bon',
  paymentMethod:'cash',grossAmount:10,cashEffect:-10,cardEffect:0,
  originalSnapshot: structuredClone(transactions[0]),
};

const latest = lastFiveCashReceipts(transactions,session);
assert.deepEqual(latest.map(x=>x.id), ['bon-1000','bon-999','bon-998','bon-997','bon-996']);
assert.equal(transactions.length,1001,'Alle bereits gespeicherten Bons bleiben vorhanden');

const otherLocation = {...transactions[0],id:'bregenz-1',location:'Bregenz'};
const afterClose = {...transactions[0],id:'after-close',timestamp:start+1000000};
const frozen = prepareFinalCloseStornoSnapshot([...transactions,otherLocation,afterClose],[storno],session,start+30000);
assert.equal(frozen.transactions.length,1001,'Nicht nur fünf, sondern ALLE 1001 Bons im Abschluss');
assert.equal(frozen.stornos.length,1,'Auch ältere Stornos bleiben im Abschluss dokumentiert');
assert.equal(frozen.stornos[0].reason,'Irrtum beim Bon');
assert.equal(frozen.transactions[0].id,'bon-0');
assert.equal(frozen.transactions.at(-1).id,'bon-1000');
assert.notStrictEqual(frozen.transactions[0],transactions[0]);
transactions[0].items[0].quantity=42;
assert.equal(frozen.transactions[0].items[0].quantity,1,'Gefrorener Abschluss darf sich nicht nachträglich ändern');
assert.deepEqual(lastFiveCashReceipts(transactions,{...session,closed:true}),[],'Nach Abschluss keine aktive Fünferauswahl mehr');
assert.throws(()=>prepareFinalCloseStornoSnapshot(transactions,[],{...session,closed:true},start+30000),/abgeschlossener/);
assert.throws(()=>prepareFinalCloseStornoSnapshot(transactions,[storno,{...storno,id:'storno-2'}],session,start+30000),/Stornonachweis/);
assert.throws(()=>prepareFinalCloseStornoSnapshot(transactions,[{...storno,originalTransactionId:'missing'}],session,start+30000),/Stornonachweis/);
assert.throws(()=>prepareFinalCloseStornoSnapshot(transactions,[{...storno,timestamp:start+40000}],session,start+30000),/Stornonachweis/);
console.log('STORNO-ABSCHLUSSSNAPSHOT: 1001 Bons und ältere Stornos vollständig geprüft.');
