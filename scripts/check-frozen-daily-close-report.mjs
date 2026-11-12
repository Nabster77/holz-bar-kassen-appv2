import assert from 'node:assert/strict';
import { closedSessionReport } from '../src/lib/dailyReport.ts';

const opened=Date.parse('2026-11-12T08:00:00Z');
const finalized=opened+3_600_000;
const item=(pfand)=>({
  productId:'water',name:'Wasser',price:10,quantity:1,taxRate:19,
  taxAmount:1.6,netPrice:8.4,categoryId:'drinks',pfand,
});
const tx=(id,timestamp,pfand)=>({
  id,cashSessionId:'session-1',timestamp,location:'Friedrichshafen',
  items:[item(pfand)],subtotal:10,totalNet:8.4,totalTax:1.6,totalPfand:pfand,
  total:10+pfand,paymentMethod:'cash',taxByRate:{19:1.6},
});
const original=tx('before',opened+1000,2);
const later=tx('after',finalized+5000,15);
const session={
  id:'session-1',date:'2026-11-12',location:'Friedrichshafen',
  openedAt:opened,openingBalance:100,entries:[],corrections:[],closed:true,
  closedAt:finalized,closingBalance:112,
  dailyCloseReceiptNumber:7,dailyCloseReceiptYear:2026,
  dailyCloseReceiptLocation:'Friedrichshafen',
  dailyCloseFinalizedAt:finalized,
  dailyCloseSnapshot:{transactions:[original],finalizedAt:finalized},
};
const first=closedSessionReport(session,[original],[]);
const laterInDatabase=closedSessionReport(session,[original,later],[]);
assert.deepEqual(first.transactions,laterInDatabase.transactions);
assert.deepEqual(first.yearlyPfandOverview,laterInDatabase.yearlyPfandOverview,
  'The original finalized PDF must not change because of later sales');
assert.equal(first.yearlyPfandOverview.pfandCollected,2);
assert.equal(first.receiptNumber,laterInDatabase.receiptNumber);
assert.equal(first.dailyCloseCash.remainingBalance,laterInDatabase.dailyCloseCash.remainingBalance);
console.log('HISTORISCHER TAGESABSCHLUSS: späterer Umsatz/Pfand verändert Originalbericht nicht.');
