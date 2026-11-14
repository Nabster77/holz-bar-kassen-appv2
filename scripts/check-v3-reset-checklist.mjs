import assert from 'node:assert/strict';
import { runResetSafetyChecks } from '../src/lib/resetSafetyChecklist.ts';

const label={connection:'Cloud-Verbindung',sync:'Gerät synchronisiert',pending:'Warteschlange',
  ledger:'Journal und Stornos',closed:'Kassen abgeschlossen'};
function tasks(options={}){
  return Object.entries(label).map(([id,name])=>({
    id,label:name,run:async()=>{
      if(options[id] instanceof Error) throw options[id];
      return 'Bestätigt: '+id;
    },
  }));
}
let passed=0;
async function check(name,fn){
  await fn();passed++;console.log('BESTANDEN: '+name);
}
await check('01 Fünf echte asynchrone Prüfungen ergeben erst danach 100 Prozent',async()=>{
  let pendingResolve;
  const reports=[];
  const t=tasks();
  t[1].run=()=>new Promise(resolve=>{pendingResolve=resolve;});
  const promise=runResetSafetyChecks(t,result=>reports.push(result));
  await new Promise(setImmediate);
  assert.equal(reports.at(-1).completed,1);
  assert.equal(reports.at(-1).percent,20);
  assert.equal(reports.at(-1).resetAllowed,false);
  pendingResolve('Synchronisiert');
  const result=await promise;
  assert.equal(result.percent,100);
  assert.equal(result.checks.length,5);
  assert.equal(result.resetAllowed,true);
  assert.equal(result.backupAllowed,true);
});
await check('02 Offene Kasse rot; Backup weiterhin möglich; Reset gesperrt',async()=>{
  const result=await runResetSafetyChecks(tasks({
    closed:new Error('1 Kasse noch offen – Tagesabschluss durchführen'),
  }),()=>{});
  assert.equal(result.percent,100);
  assert.equal(result.checks.find(x=>x.id==='closed').ok,false);
  assert.equal(result.resetAllowed,false);
  assert.equal(result.backupAllowed,true);
});
await check('03 Cloud nicht erreichbar: weder Backup noch Reset möglich',async()=>{
  const result=await runResetSafetyChecks(tasks({
    connection:new Error('Offline'),
    sync:new Error('Synchronisierung unmöglich'),
    ledger:new Error('Kein Cloud-Journal'),
    closed:new Error('Ohne Cloud nicht prüfbar'),
  }),()=>{});
  assert.equal(result.percent,100);
  assert.equal(result.resetAllowed,false);
  assert.equal(result.backupAllowed,false);
  assert.equal(result.checks.filter(x=>!x.ok).length,4);
});
await check('04 Unbestätigte lokale Verkäufe blockieren beide Aktionen',async()=>{
  const result=await runResetSafetyChecks(tasks({
    pending:new Error('2 Buchungen noch nicht in der Cloud'),
  }),()=>{});
  assert.equal(result.resetAllowed,false);
  assert.equal(result.backupAllowed,false);
});
await check('05 Nach Tagesabschluss und Recheck kann Reset freigegeben werden',async()=>{
  const failed=await runResetSafetyChecks(tasks({closed:new Error('offen')}),()=>{});
  const success=await runResetSafetyChecks(tasks(),()=>{});
  assert.equal(failed.resetAllowed,false);
  assert.equal(success.resetAllowed,true);
  assert.equal(success.checks.every(c=>c.ok),true);
});
console.log('WOODMO RESET-SICHERHEITSLISTE: '+passed+'/'+passed+' echte Verhaltenstests bestanden.');
