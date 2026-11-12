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
const file=b1dir.files.keys().find(x=>x.startsWith('transactions-')&&x.endsWith('.json'));
b1dir.files.set(file,'CORRUPTED');
await assert.rejects(loadArchivedBackup(parent,configuredAt,'Backup1'),/beschädigt|Revision/);
console.log('BACKUP-ARCHIV: Kasse26, Vollsicherung, unveränderte Abschnitte, inkrementelles Backup2, Mitarbeiter-Gate und Integrität OK.');
