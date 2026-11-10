const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const cache = {};
function load(name) {
  if (cache[name]) return cache[name];
  if (name === 'journalPdfFile') return { buildJournalFileName: () => 'test.pdf' };
  if (name === 'dailyCloseReceipt') return { formatDailyCloseReceiptNumber: () => 'test' };
  const exports = cache[name] = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib', name + '.ts'), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  new Function('require','exports',code)(id => load(id.replace('@/lib/','')), exports);
  return exports;
}
const {openingBalanceForLocation: carry, canDiscardCashSession: discard} = load('cashBalanceCarry');
const location = 'Friedrichshafen';
const session = (id, openedAt, extra={}) => ({id,location,date:'2026-11-10',openedAt,openingBalance:100,closed:true,closedAt:openedAt+10,entries:[],corrections:[],...extra});
const closed = session('closed',100,{openingBalance:242,closingWithdrawalAmount:142,closingBalance:100,entries:[{id:'entnahme',type:'withdrawal',amount:142,isClosingWithdrawal:true,timestamp:110}]});
const unused = session('unused',200,{closingBalance:0});
assert.equal(carry([closed],[],location),100);
assert.equal(carry([closed,unused],[],location),100,'empty close must not replace 100 with default zero');
assert.equal(carry([closed,{...unused,openingBalance:0,dailyCloseReceiptNumber:4}],[],location),100,'empty finalized zero must not erase prior cash');
assert.equal(carry([closed,{...unused,openingBalance:0,closingBalance:0,dailyCloseSnapshot:{transactions:[],finalizedAt:210}}],[],location),100,'empty frozen zero must not erase prior cash');
assert.equal(carry([closed,{...unused,discarded:true,openingBalance:0}],[],location),100,'legacy discard marker must not reset carry');
assert.equal(carry([unused],[],location),100,'first empty close retains initial cash');
assert.equal(carry([closed,session('empty-next-day',300,{date:'2026-11-11'})],[],location),100);
const emptied=session('empty',400,{closingBalance:0,closingWithdrawalAmount:100,entries:[{type:'withdrawal',amount:100,isClosingWithdrawal:true}]});
assert.equal(carry([closed,emptied],[],location),0,'real full withdrawal must remain zero');
assert.equal(carry([closed,emptied,session('later-unused',500,{openingBalance:0})],[],location),0);
const expense=session('expense',600,{entries:[{type:'withdrawal',amount:20}],closingBalance:80});
assert.equal(carry([closed,expense],[],location),80);
const correction=session('correction',700,{openingBalance:70,corrections:[{oldAmount:100,newAmount:70}],closingBalance:70});
assert.equal(carry([closed,correction],[],location),70);
assert.equal(carry([closed,session('other',800,{location:'Bregenz',closingBalance:0})],[],location),100,'locations isolated');
assert.equal(carry([],[],location),null);
assert.equal(carry([closed,session('active',900,{closed:false,closedAt:undefined,openingBalance:0})],[],location),100,'active session does not erase previous close');
assert.equal(discard({...unused,closed:false,closedAt:undefined},[]),false,'funded till cannot be discarded');
assert.equal(discard({...unused,closed:false,closedAt:undefined,openingBalance:0},[]),true);
assert.equal(discard({...unused,closed:false,openingBalance:0,corrections:[{}]},[]),false);
const pending= session('pending',1000,{closingBalance:55,dailyCloseReceiptNumber:3});
assert.equal(carry([closed,pending],[],location),55,'persisted finalized balance is used while cloud bookings load');
const sale={id:'sale',location,timestamp:1015,paymentMethod:'cash',subtotal:20,total:20,totalNet:20,totalTax:0,taxByRate:{},items:[]};
const frozen=session('frozen',1000,{closedAt:1020,closingBalance:0,dailyCloseSnapshot:{transactions:[sale],finalizedAt:1020}});
assert.equal(carry([closed,frozen],[],location),120,'snapshot, not incomplete cloud transactions, determines balance');
// Reported sequence: first close retains 100; the subsequent close removes
// the entire 102. The opening correction is already included in 110.
const backupFirst=session('example-first',2000,{openingBalance:200,closingBalance:100,closingWithdrawalAmount:142,
  entries:[{type:'withdrawal',amount:142,isClosingWithdrawal:true}],
  dailyCloseSnapshot:{finalizedAt:2010,transactions:[{...sale,timestamp:2005,subtotal:39,total:42}]}});
const backupSecond=session('example-second',2100,{openingBalance:110,closingBalance:0,closingWithdrawalAmount:102,
  corrections:[{oldAmount:100,newAmount:110}],
  entries:[{type:'deposit',amount:10},{type:'withdrawal',amount:20},{type:'withdrawal',amount:102,isClosingWithdrawal:true}],
  dailyCloseSnapshot:{finalizedAt:2110,transactions:[{...sale,timestamp:2102,paymentMethod:'card',subtotal:5,total:8},{...sale,timestamp:2103,subtotal:5,total:8},{...sale,timestamp:2104,subtotal:0,total:-6}]}});
assert.equal(carry([backupFirst],[],location),100);
assert.equal(carry([backupFirst,backupSecond],[],location),0,'later full withdrawal supersedes earlier 100; card excluded and correction counted once');
assert.equal(carry([backupFirst,backupSecond,session('example-discard',2200,{openingBalance:110,discarded:true})],[],location),0,'discarded opening must not resurrect fully withdrawn cash');
if (process.argv[2]) {
  const backup=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
  console.log('Sicherung, errechneter Rest:',JSON.stringify(Object.fromEntries(['Friedrichshafen','Bregenz'].map(loc=>[loc,carry(backup.data.cashSessions,backup.data.transactions,loc)]))));
}
assert.equal(JSON.stringify(closed),JSON.stringify(session('closed',100,{openingBalance:242,closingWithdrawalAmount:142,closingBalance:100,entries:[{id:'entnahme',type:'withdrawal',amount:142,isClosingWithdrawal:true,timestamp:110}]})),'input records unchanged');
console.log('Bestandsuebernahme geprueft: 100 EUR unveraendert, leere Sitzungen, Tageswechsel, echte Null, Ausgabe, Korrektur, Standorte und Cloud-Nachladen.');
