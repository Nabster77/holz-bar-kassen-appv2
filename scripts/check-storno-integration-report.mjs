import assert from 'node:assert/strict';
import { register } from 'tsx/esm/api';
import { fileURLToPath } from 'node:url';

const unregister = register({tsconfig: fileURLToPath(new URL('../tsconfig.app.json', import.meta.url))});
const { stornoAsNegativeTransaction, projectFinancialTransactions } = await import('../src/lib/stornoReportProjection.ts');
const { salesLedgerMovements, sumSalesLedger } = await import('../src/lib/stornoLedger.ts');
const { buildFinalizedCashSession } = await import('../src/lib/finalizedCashSession.ts');
const { calculateYearlyPfandOverview, buildJournalHTML } = await import('../src/lib/journalPdf.ts');
const { buildStornoDocumentHTML } = await import('../src/lib/stornoReceiptPdf.ts');

const start=Date.parse('2026-11-10T08:00:00Z');
const next=start+86_400_000;
const tx={
 id:'original-1', cashSessionId:'session-1',timestamp:start,location:'Friedrichshafen',
 paymentMethod:'cash',total:11.90,subtotal:9.90,totalNet:8.32,totalTax:1.58,totalPfand:2,
 taxByRate:{19:1.58},items:[{
  productId:'cola',name:'Cola 0,5',categoryId:'getraenke',price:9.90,quantity:1,taxRate:19,
  netPrice:8.32,taxAmount:1.58,pfand:2,
 }],
};
const cancel={
 id:'storno-1',originalTransactionId:tx.id,cashSessionId:'session-1',
 location:tx.location,timestamp:next,employeeId:'employee-1',employeeName:'Kassierer',
 reason:'Falscher Artikel',paymentMethod:'cash',grossAmount:11.90,
 cashEffect:-11.90,cardEffect:0,originalSnapshot:structuredClone(tx),
};
const proj=stornoAsNegativeTransaction(cancel);
assert.equal(proj.total,-11.90);
assert.equal(proj.subtotal,-9.90);
assert.equal(proj.totalPfand,-2);
assert.equal(proj.totalNet,-8.32);
assert.equal(proj.totalTax,-1.58);
assert.equal(proj.taxByRate[19],-1.58);
assert.equal(proj.items[0].quantity,-1);
assert.equal(proj.items[0].pfand,-2);
assert.equal(proj.timestamp,next);
assert.equal(proj.paymentMethod,'cash');
const day1=projectFinancialTransactions([tx],[cancel],start,next);
const day2=projectFinancialTransactions([tx],[cancel],next,next+86_400_000);
assert.equal(day1.length,1);
assert.equal(day2.length,1);
assert.equal(day2[0].total,-11.90);
assert.equal(projectFinancialTransactions([tx],[cancel]).reduce((sum,r)=>sum+r.total,0),0);
assert.equal(projectFinancialTransactions([tx],[cancel]).reduce((sum,r)=>sum+r.totalTax,0),0);
assert.equal(calculateYearlyPfandOverview(projectFinancialTransactions([tx],[cancel]),2026,'Friedrichshafen').pfandSaldo,0);
const ledger = sumSalesLedger(salesLedgerMovements([tx],[cancel]));
assert.equal(ledger.cashCents,0);
assert.equal(ledger.cardCents,0);
assert.equal(ledger.salesCents,0);
assert.equal(ledger.pfandCents,0);
assert.equal(ledger.taxCentsByRate['19'],0);
assert.equal(ledger.articleQuantities.cola,0);
const card={...tx,id:'original-card',paymentMethod:'card'};
const cardCancel={...cancel,id:'storno-card',originalTransactionId:card.id,paymentMethod:'card',
 cashEffect:0,cardEffect:-11.90,originalSnapshot:structuredClone(card)};
const cardTotals=sumSalesLedger(salesLedgerMovements([card],[cardCancel]));
assert.equal(cardTotals.cardCents,0);
assert.equal(cardTotals.cashCents,0);
assert.equal(stornoAsNegativeTransaction(cardCancel).paymentMethod,'card');
const session={id:'session-1',date:'2026-11-10',location:'Friedrichshafen',openingBalance:25,openedAt:start-10,
 closed:false,corrections:[],entries:[]};
const frozen={transactions:[tx],stornos:[{...cancel,timestamp:start+4000}],
 finalizedAt:start+10000,finalizedById:'employee-1',finalizedByName:'Kassierer'};
const close=buildFinalizedCashSession(session,[tx],25,{id:'employee-1',name:'Kassierer'},0,
 {closedAt:frozen.finalizedAt,receipt:{number:1,location:'Friedrichshafen',year:2026},snapshot:frozen});
assert.equal(close.closingBalance,25,'Barstorno removes original cash sale from final cash balance');
assert.equal(close.dailyCloseSnapshot.stornos.length,1,'Storno remains permanently in close snapshot');
assert.equal(close.dailyCloseSnapshot.transactions.length,1,'Original receipt remains permanently stored');
const html=buildStornoDocumentHTML(cancel);
for(const token of ['Stornobeleg','Falscher Artikel','original-1','Storno-ID','-11,90','-1,58','Kassen-App 3.0']) {
 assert(html.includes(token),`Storno receipt missing: ${token}`);
}
const journal=buildJournalHTML({
 headerLabel:'Testjournal',location:'Friedrichshafen',transactions:[tx,proj],stornos:[cancel],
 categories:[{id:'getraenke',name:'Getränke',icon:'cup',color:'from-blue-400 to-blue-800',sortOrder:1}],
 fileName:'test.pdf',
});
for(const token of ['Stornobelege (1)','Originalbon','Falscher Artikel','Storno-ID','-11,90']) {
 assert(journal.includes(token),`Journal missing ${token}`);
}
assert(journal.includes('Verkäufe / Stornos'));
console.log('STORNO-FINANZTEST: zeitbezogene Bar-/Karten-Gegenbuchung, MwSt, Netto, Pfand, Artikelstatistik, Abschluss und PDF bestanden.');

unregister();
