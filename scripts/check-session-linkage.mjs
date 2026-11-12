import assert from 'node:assert/strict';
import { sessionTransactions } from '../src/lib/sessionTransactions.ts';
import { lastFiveCashReceipts, prepareFinalCloseStornoSnapshot } from '../src/lib/stornoRules.ts';

const t0=Date.parse('2026-11-12T09:00:00Z');
const session={id:'session-A',location:'Friedrichshafen',openedAt:t0,closed:false};
const own=Array.from({length:7},(_,i)=>({
  id:'A'+i,location:'Friedrichshafen',cashSessionId:session.id,
  timestamp:t0+i*1000,total:15,subtotal:15,totalNet:12.61,totalTax:2.39,
  taxByRate:{19:2.39},totalPfand:0,paymentMethod:'cash',
  items:[{productId:'test',quantity:1}],
}));
const other={...own[0],id:'foreign',cashSessionId:'session-B',timestamp:t0+9000};
const legacy={...own[0],id:'legacy',cashSessionId:undefined,timestamp:t0+8000};
const otherTown={...own[0],id:'bregenz',location:'Bregenz',timestamp:t0+10000};
const records=[...own,other,legacy,otherTown];

assert.deepEqual(sessionTransactions(records,session).map(x=>x.id),
  [...own.map(x=>x.id),'legacy'], 'Session-filter must retain legacy but reject tagged foreign sale');
assert.deepEqual(lastFiveCashReceipts(records,session).map(x=>x.id),
  ['legacy','A6','A5','A4','A3'], 'Five newest are taken only from current cash session');
const final=prepareFinalCloseStornoSnapshot(records,[],session,t0+20000);
assert.equal(final.transactions.length,8,'Seven own receipts and one legacy receipt must be preserved');
assert.equal(final.transactions.some(x=>x.id==='foreign'),false);
assert.equal(final.transactions.some(x=>x.id==='bregenz'),false);
assert.equal(records.length,10,'Original records never pruned by five-slot selection');
assert.equal(sessionTransactions(records,{...session,id:'session-B'}).some(x=>x.id==='foreign'),true);
assert.equal(sessionTransactions(records,{...session,id:'session-B'}).some(x=>x.id==='A0'),false);
console.log('SITZUNGSBINDUNG: Bon-Auswahl, Tagesabschluss und Altbestand erfolgreich geprüft.');
