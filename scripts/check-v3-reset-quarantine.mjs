import assert from 'node:assert/strict';
import { isStaleOutboxEntry, summarizeResetQuarantine } from '../src/lib/resetQuarantine.ts';

let passed=0;
const check=(label,fn)=>{fn();passed++;console.log('BESTANDEN: '+label);};
const row=(id,table,gen)=>({table,row:{id,booking_generation:gen,location:'Friedrichshafen',data:{id}}});
const entries=[row('old-sale','pos_transactions',1),row('recent-sale','pos_transactions',2),
  row('old-open','pos_cash_sessions',1),row('legacy-sale','pos_transactions',undefined)];
check('01 Alte Offline-Bons werden als Archivkandidaten erkannt',()=>{
  assert.equal(isStaleOutboxEntry(entries[0],3),true);
  assert.equal(isStaleOutboxEntry(entries[1],3),true);
});
check('02 Offline-Kasse bleibt als Archivkandidat erhalten',()=>{
  assert.equal(isStaleOutboxEntry(entries[2],3),true);
});
check('03 Altbeleg ohne Generation wird NICHT still gelöscht',()=>{
  assert.equal(isStaleOutboxEntry(entries[3],3),true);
});
check('04 Gültige aktuelle Generation bleibt in Uploadwarteschlange',()=>{
  assert.equal(isStaleOutboxEntry(row('new','pos_transactions',3),3),false);
});
check('05 Keine Umsortierung auf Grund abweichender Geräteuhr',()=>{
  assert.equal(isStaleOutboxEntry({...entries[0],row:{...entries[0].row,timestamp:1e15}},3),true);
});
check('06 Reset-Snapshot erhält auch lokale Einträge ohne Outboxbeleg',()=>{
  const records=[
    {key:'outbox:1',archivedAt:1,targetGeneration:3,kind:'pending-outbox',entry:entries[0]},
    {key:'outbox:2',archivedAt:1,targetGeneration:3,kind:'pending-outbox',entry:entries[0]},
    {key:'outbox:3',archivedAt:1,targetGeneration:3,kind:'pending-outbox',entry:entries[2]},
    {key:'snapshot:generation-3',archivedAt:1,targetGeneration:3,kind:'local-snapshot',
      transactions:[{id:'only-local'},{id:'old-sale'}],cashSessions:[{id:'old-open'}]},
  ];
  const info=summarizeResetQuarantine(records);
  assert.deepEqual(info,{pendingReceipts:1,pendingSessions:1,localSnapshots:1,localReceipts:2,archivedEntries:4});
});
check('07 Ohne Quarantäne keine falsche Buchungswarnung',()=>{
  assert.deepEqual(summarizeResetQuarantine([]),
    {pendingReceipts:0,pendingSessions:0,localSnapshots:0,localReceipts:0,archivedEntries:0});
});
console.log('WOODMO V3 OFFLINE-RESET-QUARANTÄNE: '+passed+'/'+passed+' VERHALTENSTESTS BESTANDEN.');
