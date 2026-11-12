import assert from 'node:assert/strict';
import { salesLedgerMovements, sumSalesLedger } from '../src/lib/stornoLedger.ts';

const day1 = Date.parse('2026-11-12T09:00:00Z');
const day2 = Date.parse('2026-11-13T09:00:00Z');
const sale = {
  id:'beleg-1',location:'Friedrichshafen',timestamp:day1,paymentMethod:'cash',
  total:17,subtotal:15,totalNet:12.6,totalPfand:2,taxByRate:{7:0.5,19:1.9},
  items:[{productId:'wasser',quantity:1},{productId:'cola',quantity:2}],
};
const card = {
  id:'beleg-2',location:'Bregenz',timestamp:day1+1000,paymentMethod:'card',
  total:8.5,subtotal:8.5,totalNet:7.08,totalPfand:0,taxByRate:{20:1.42},
  items:[{productId:'limo',quantity:1}],
};
const storno = {
  id:'storno-1',originalTransactionId:sale.id,location:sale.location,
  timestamp:day2,reason:'Falscher Verkauf',employeeId:'u1',employeeName:'SZ',
  paymentMethod:'cash',grossAmount:17,cashEffect:-17,cardEffect:0,
  originalSnapshot:structuredClone(sale),
};
const originals=[sale,card];
const all=salesLedgerMovements(originals,[storno]);
assert.equal(all.length,3);
assert.deepEqual(all.map(x=>x.kind),['sale','sale','storno']);
const allTotals=sumSalesLedger(all);
assert.equal(allTotals.cashCents,0,'Kumuliert muss die Barzahlung neutralisiert sein');
assert.equal(allTotals.cardCents,850,'Kartenumsatz bleibt stehen');
assert.equal(allTotals.salesCents,850,'Artikelumsatz nach Storno ist nur die Karte');
assert.equal(allTotals.pfandCents,0,'Pfand wird ebenfalls gegengebucht');
assert.deepEqual(allTotals.taxCentsByRate,{'7':0,'19':0,'20':142});
assert.equal(allTotals.articleQuantities['wasser'],0);
assert.equal(allTotals.articleQuantities['cola'],0);
assert.equal(allTotals.articleQuantities['limo'],1);
const firstDay=sumSalesLedger(salesLedgerMovements(originals,[storno],day1-1,day2));
assert.equal(firstDay.cashCents,1700,'Endgültiger Vortag bleibt rechnerisch unverändert');
const nextDay=sumSalesLedger(salesLedgerMovements(originals,[storno],day2,day2+86400000));
assert.equal(nextDay.cashCents,-1700,'Gegenbuchung gehört zum Folgetag');
assert.equal(nextDay.salesCents,-1500);
assert.equal(nextDay.pfandCents,-200);
assert.deepEqual(nextDay.taxCentsByRate,{'7':-50,'19':-190});
assert.equal(salesLedgerMovements([], [storno], day2,day2+86400000).length,1,
  'Eingefrorener Beleg kann die Storno-Auditansicht auch ohne aktuellen Originaldatensatz absichern');
assert.throws(()=>salesLedgerMovements(originals,[storno,storno]),/Doppelter Stornonachweis/);
assert.throws(()=>salesLedgerMovements([sale,sale],[storno]),/Doppelte Originalbeleg/);
assert.throws(()=>salesLedgerMovements(originals,[{...storno,grossAmount:18}]),/Originalbeleg/);
assert.throws(()=>salesLedgerMovements(originals,[{...storno,timestamp:day1-1}]),/Stornozeitpunkt/);
assert.throws(()=>salesLedgerMovements(originals,[storno],day2,day1),/Berichtszeitraum/);
console.log('STORNO-JOURNAL-ZEITRAUMTESTS BESTANDEN.');
