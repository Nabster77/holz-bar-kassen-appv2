import assert from 'node:assert/strict';
import { archiveRootName, backupDirectorySegments } from '../src/lib/archiveRoot.ts';
import { saveBackup1, mirrorBackup2, loadArchivedBackup } from '../src/lib/backupArchive.ts';
import { BACKUP_1_PERIOD_MS, BACKUP_2_IDLE_MS, afterVerifiedBackup } from '../src/lib/backupSyncPolicy.ts';

class MemFile {
  constructor(dir,name) {this.dir=dir;this.name=name;}
  async getFile() {return {text:async()=>this.dir.files.get(this.name)};}
  async createWritable() {
    let written;
    return {
      write:async(value)=>{written=value;},
      close:async()=>{if(typeof written!=='string') throw Error('No data written');this.dir.files.set(this.name,written);this.dir.writes.push(this.name);},
      abort:async()=>{},
    };
  }
}
class MemDirectory {
  constructor() {this.folders=new Map();this.files=new Map();this.writes=[];}
  async getDirectoryHandle(name,{create=false}={}) {
    if(!this.folders.has(name)) {
      if(!create) throw new DOMException('Missing folder','NotFoundError');
      this.folders.set(name,new MemDirectory());
    }
    return this.folders.get(name);
  }
  async getFileHandle(name,{create=false}={}) {
    if(!this.files.has(name)) {
      if(!create) throw new DOMException('Missing file','NotFoundError');
      this.files.set(name,'');
    }
    return new MemFile(this,name);
  }
}
const parent=new MemDirectory();
const configuredAt=Date.parse('2026-11-12T12:00:00Z');
assert.equal(archiveRootName(configuredAt),'Kasse 26');
assert.deepEqual(backupDirectorySegments(configuredAt,'Backup1'),['Kasse 26','Sicherung','Backup1']);
assert.deepEqual(backupDirectorySegments(configuredAt,'Backup2'),['Kasse 26','Sicherung','Backup2']);

const now=Date.parse('2026-11-12T22:00:00Z');
let state={cloudSyncedAt:now-1000,backup1SyncedAt:null,backup2SyncedAt:null,
  backup1Revision:null,backup2Revision:null,lastActivityAt:now-BACKUP_2_IDLE_MS-1};
const conditions={now,cloudOnline:true,testMode:false,staffSignedIn:false,
  allStaffSignedOutVerified:true,busy:false,hasPendingBookings:false,folderWritable:true};
const original={version:5,exportedAt:new Date(now).toISOString(),
  data:{transactions:[{id:'sale-1',total:12.5}],cashSessions:[{id:'session-1',closed:true}],
        staffUsers:[{id:'employee-1',role:'employee'}]}};
const result=await saveBackup1(parent,configuredAt,original,state,conditions);
assert.deepEqual(result.changedSections,['cashSessions','staffUsers','transactions']);
state=afterVerifiedBackup(state,'backup1',result.revision,now);
const restored=await loadArchivedBackup(parent,configuredAt,'Backup1');
assert.deepEqual(restored,original);
const denied=await mirrorBackup2(parent,configuredAt,state,{...conditions,staffSignedIn:true})
  .then(()=>false,()=>true);
assert.equal(denied,true,'Never mirror Backup 2 while logged in');
const unverified=await mirrorBackup2(parent,configuredAt,state,{...conditions,allStaffSignedOutVerified:false})
  .then(()=>false,()=>true);
assert.equal(unverified,true,'Unknown other-tablet presence must be blocked');
const mirrored=await mirrorBackup2(parent,configuredAt,state,conditions);
assert.deepEqual(mirrored.changedSections,['cashSessions','staffUsers','transactions']);
state=afterVerifiedBackup(state,'backup2',mirrored.revision,now+1);
assert.deepEqual(await loadArchivedBackup(parent,configuredAt,'Backup2'),original);

const root=parent.folders.get('Kasse 26').folders.get('Sicherung');
const b2dir=root.folders.get('Backup2');
const initialWrites=b2dir.writes.length;
const unchanged=await mirrorBackup2(parent,configuredAt,state,conditions);
assert.deepEqual(unchanged.changedSections,[]);
assert.equal(b2dir.writes.length,initialWrites,'Unchanged Backup2 must not be rewritten');

const changed={...original,exportedAt:new Date(now+10_000).toISOString(),
  data:{...original.data,transactions:[...original.data.transactions,{id:'sale-2',total:6}]}};
const updated=await saveBackup1(parent,configuredAt,changed,state,{...conditions,now:now+10_000},true);
assert.deepEqual(updated.changedSections,['transactions']);
state=afterVerifiedBackup(state,'backup1',updated.revision,now+10_000);
const mirroredUpdate=await mirrorBackup2(parent,configuredAt,state,{...conditions,now:now+10_001});
assert.deepEqual(mirroredUpdate.changedSections,['transactions'],
  'Only changed section must be mirrored to Backup2');
assert.deepEqual((await loadArchivedBackup(parent,configuredAt,'Backup2')).data.transactions,
  changed.data.transactions);

const b1dir=root.folders.get('Backup1');
// Mutate the shard named by the CURRENT manifest, not an older preserved
// version. Old immutable shards are intentionally kept for recovery.
const pointer=JSON.parse(b1dir.files.get('current.json'));
const manifest=JSON.parse(b1dir.files.get(pointer.manifestFile));
const file=`transactions-${manifest.sections.transactions}.json`;
b1dir.files.set(file,'CORRUPTED');
await assert.rejects(loadArchivedBackup(parent,configuredAt,'Backup1'),/beschädigt|Revision/);
// A new annual root must not modify earlier backups.
const jan2027=Date.parse('2026-12-31T23:30:00Z');
const nextYearState={...state,cloudSyncedAt:jan2027-1000};
const yearConditions={...conditions,now:jan2027};
const oldFiles=new Map(b1dir.files);
const nextYearBackup={...changed,exportedAt:new Date(jan2027).toISOString()};
const first2027=await saveBackup1(parent,configuredAt,nextYearBackup,nextYearState,yearConditions,true);
assert.ok(parent.folders.has('Kasse 27'));
assert.deepEqual(new Map(b1dir.files),oldFiles,'Vorjahres-Backup darf nicht verändert werden.');
const backup2027=parent.folders.get('Kasse 27').folders.get('Sicherung').folders.get('Backup1');
assert.ok(backup2027.files.has('current.json'),'Neue Sicherung gehört nach Kasse 27.');
assert.deepEqual(await loadArchivedBackup(parent,jan2027,'Backup1'),nextYearBackup);
await assert.rejects(loadArchivedBackup(parent,Date.parse('2028-01-01T12:00:00Z'),'Backup1'),/Missing|NotFound/);
assert.equal(parent.folders.has('Kasse 28'),false,'Lesen einer fehlenden Sicherung darf keine Ordner erstellen.');
const deniedParent=new MemDirectory();
await assert.rejects(saveBackup1(deniedParent,configuredAt,nextYearBackup,nextYearState,{...yearConditions,cloudOnline:false},false),/offline/);
assert.equal(deniedParent.folders.size,0,'Verbotenes Backup darf keine Ordner erzeugen.');
assert.ok(first2027.changedSections.length>0);
console.log('BACKUP-ARCHIV: Kasse 26/27, inkrementell, Mitarbeiter-Gate, Vorjahresschutz, Offline-Schreibsperre, Integrität OK.');
