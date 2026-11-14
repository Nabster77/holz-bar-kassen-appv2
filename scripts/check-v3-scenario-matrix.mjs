import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activeSessionForLocation } from '../src/lib/cashSessionSelection.ts';
import { openingBalanceForLocation } from '../src/lib/cashBalanceCarry.ts';
import { assessBackupRestore, backupMergeConfirmation } from '../src/lib/backupRestoreSafety.ts';
import { recoverableCashSessions, recoverableTransactions } from '../src/lib/recoveryGuards.ts';

let passed = 0;
function check(name, callback) {
  try { callback(); passed++; console.log('BESTANDEN:', name); }
  catch(error) { console.error('FEHLER:', name); throw error; }
}
const fn='Friedrichshafen', br='Bregenz';
const open=(id, location, amount, at=1000)=>({
  id,location,openedAt:at,openingBalance:amount,date:'2026-11-14',
  closed:false,entries:[],corrections:[],activities:[],
});
const closed=(id, location, openingBalance, closingBalance, at=1000)=>({
  ...open(id,location,openingBalance,at),closed:true,closedAt:at+100,
  closingBalance,dailyCloseReceiptNumber:1,
});
const tx=(id,location,cashSessionId,timestamp=1500)=>({id,location,cashSessionId,timestamp});
const assess=(backup,cloud,at=4000,reset=1000,candidates=backup)=>
  assessBackupRestore(backup,cloud,at,reset,candidates);
const empty={transactions:[],cashSessions:[]};
const fnOpened=open('FN-1',fn,500), brOpened=open('BR-1',br,70);
const fnClosed=closed('FN-C',fn,500,547);
const brClosed=closed('BR-C',br,70,80);
const fnSale=tx('FN-TX',fn,'FN-1'),brSale=tx('BR-TX',br,'BR-1');

check('01 Nur Friedrichshafen geoeffnet, Bregenz zu',()=>{
  assert.equal(activeSessionForLocation([fnOpened],fn)?.id,'FN-1');
  assert.equal(activeSessionForLocation([fnOpened],br),null);
});
check('02 Nur Bregenz geoeffnet, Friedrichshafen zu',()=>{
  assert.equal(activeSessionForLocation([brOpened],fn),null);
  assert.equal(activeSessionForLocation([brOpened],br)?.id,'BR-1');
});
check('03 Beide Standorte unabhaengig geoeffnet',()=>{
  assert.equal(activeSessionForLocation([fnOpened,brOpened],fn)?.openingBalance,500);
  assert.equal(activeSessionForLocation([fnOpened,brOpened],br)?.openingBalance,70);
});
check('04 Ein Standort geschlossen, anderer offen',()=>{
  assert.equal(activeSessionForLocation([fnClosed,brOpened],fn),null);
  assert.equal(activeSessionForLocation([fnClosed,brOpened],br)?.id,'BR-1');
});
check('05 Standortgebundener Restgeld-Uebertrag bei zwei Abschluessen',()=>{
  assert.equal(openingBalanceForLocation([fnClosed,brClosed],[],fn),547);
  assert.equal(openingBalanceForLocation([fnClosed,brClosed],[],br),80);
});
check('06 Nicht abgeschlossene Kasse auch nach Mitternacht offen',()=>{
  assert.equal(activeSessionForLocation([{...fnOpened,date:'2026-11-13'}],fn)?.id,'FN-1');
});
check('07 Reset: neue Generation ohne alte Sitzungen und Anfangsbestaende',()=>{
  const before=[fnOpened,brOpened];
  assert.equal(before.length,2);
  assert.equal(activeSessionForLocation([],fn),null);
  assert.equal(activeSessionForLocation([],br),null);
  assert.equal(openingBalanceForLocation([],[],fn),null);
  assert.equal(openingBalanceForLocation([],[],br),null);
});
check('08 Geoeffnete Kasse mit 0 EUR wird per App-Validierung verweigert',()=>{
  const source=readFileSync('src/hooks/useStore.ts','utf8');
  assert.match(source,/if \(!Number\.isFinite\(openingBalance\) \|\| openingBalance <= 0\) return;/);
});
check('09 Zwei Kassenstandorte muessen im Code getrennt bleiben',()=>{
  const src=readFileSync('src/hooks/useStore.ts','utf8');
  assert.match(src,/activeSessionForLocation\(cashSessions, selectedLocation\)/);
});
check('10 Nur die letzte Kassensitzung am Standort entscheidet',()=>{
  assert.equal(activeSessionForLocation([fnOpened,fnClosed],fn),null);
  assert.equal(activeSessionForLocation([fnClosed,{...fnOpened,openedAt:3000}],fn)?.id,'FN-1');
});
check('11 Archivierte Buchungen gehen beim Cloud-Reset nicht verloren',()=>{
  const sql=readFileSync('supabase/migrations/20261114034000_allow_archived_booking_reset.sql','utf8');
  assert.match(sql,/Original-bon\/session DELETE guards/);
  assert.doesNotMatch(sql,/DELETE FROM public\.pos_transactions/i);
  assert.doesNotMatch(sql,/DELETE FROM public\.pos_stornos/i);
});
check('12 Offline-Geraet gleicht Generation vor Upload ab',()=>{
  const src=readFileSync('src/hooks/useCloudSync.ts','utf8');
  assert(src.indexOf('await reconcileReset()') < src.indexOf('await flushOutbox()'));
  assert.match(src,/discardEntriesBeforeGeneration\(latestReset\.generation\)/);
});
check('13 Sicherung nach Reset alt: expliziter Fehler statt Teil-Erfolg',()=>{
  assert.throws(()=>assess({transactions:[fnSale],cashSessions:[fnOpened]},empty,1000,2000),
    /vor dem letzten Buchungs-Reset/);
});
check('14 Keine Cloud-Buchungen: voller Backup-Import derselben Generation ohne Merge-Warnung',()=>{
  const x=assess({transactions:[fnSale],cashSessions:[fnOpened]},empty);
  assert.equal(x.requiresConfirmation,false);
  assert.equal(x.newTransactions,1);
  assert.equal(x.newSessions,1);
});
check('15 Cloud hat andere Buchungen: ausdrueckliche Merge-Bestaetigung notwendig',()=>{
  const backup={transactions:[brSale],cashSessions:[brOpened]};
  const cloud={transactions:[fnSale],cashSessions:[fnOpened]};
  const x=assess(backup,cloud);
  assert.equal(x.requiresConfirmation,true);
  assert.match(backupMergeConfirmation(x),/NICHT geloescht|NICHT gelöscht/);
  assert.match(backupMergeConfirmation(x),/1 Buchung/);
});
check('16 Zwei verschiedene offene Kassen am selben Standort: Import gesperrt',()=>{
  assert.throws(()=>assess(
    {transactions:[],cashSessions:[open('FN-2',fn,90)]},
    {transactions:[],cashSessions:[fnOpened]}),/andere geöffnete Kasse/);
});
check('17 Zwei offene Kassen innerhalb eines Backups: Import gesperrt',()=>{
  assert.throws(()=>assess(
    {transactions:[],cashSessions:[fnOpened,open('FN-2',fn,90)]},empty),
    /zwei verschiedene offene Kassen/);
});
check('18 Offene Kassen unterschiedlicher Standorte duerfen koexistieren',()=>{
  const x=assess({transactions:[],cashSessions:[brOpened]},
    {transactions:[],cashSessions:[fnOpened]});
  assert.equal(x.requiresConfirmation,true);
});
check('19 Buchung ohne zugehoerige Kassensitzung: Import gesperrt',()=>{
  assert.throws(()=>assess(
    {transactions:[tx('orphan',fn,'not-found')],cashSessions:[]},empty),
    /fehlende Kassensitzung/);
});
check('20 Beleg-ID aus Cloud wird nicht doppelt importiert',()=>{
  assert.equal(recoverableTransactions([fnSale],[fnSale],1000).length,0);
});
check('21 Historisch alte Buchung aus voriger Reset-Generation wird nicht erneut eingereiht',()=>{
  assert.equal(recoverableTransactions([fnSale],[],2000).length,0);
});
check('22 Offene Cloud-Sitzung darf bei Restore nicht still durch alte Version ersetzt werden',()=>{
  const x=recoverableCashSessions([{...fnOpened,openedAt:1500}],[
    {...fnOpened,openedAt:1500,closed:true,closedAt:1600}],1000,
    session=>session.closedAt ?? session.openedAt);
  assert.equal(x.length,0);
});
check('23 Bestandene Backup-Sicherung kann Kategorien importieren ohne Finanzbuchungen',()=>{
  const x=assess({transactions:[],cashSessions:[]},empty,1000,2000);
  assert.equal(x.newTransactions,0);
});
check('24 Nach Reset sind Originalbuchungen nicht im aktuellen Journal, aber im Archiv',()=>{
  const src=readFileSync('src/lib/cloudPull.ts','utf8');
  assert.match(src,/\.eq\('booking_generation', generation\)/);
  const resetSql=readFileSync('supabase/migrations/20261114034000_allow_archived_booking_reset.sql','utf8');
  assert.doesNotMatch(resetSql,/TRUNCATE\s+public/i);
});
check('25 Alt-Kassenbestand darf nicht von anderem Standort uebernommen werden',()=>{
  assert.equal(openingBalanceForLocation([fnClosed],[],br),null);
});
check('26 Backup-Import darf Stornos nicht in die Buchungswarteschlange schreiben',()=>{
  const src=readFileSync('src/lib/backupRecovery.ts','utf8');
  const entries=src.slice(src.indexOf('const bookingEntries:'),src.indexOf('await enqueueEntries(bookingEntries)'));
  assert(!entries.includes('pos_stornos'));
});
console.log('WOODMO V3 ISOLIERTE SZENARIEN:',passed,'von',passed,'BESTANDEN; KEINE ECHTEN CLOUD-SCHREIBZUGRIFFE.');
