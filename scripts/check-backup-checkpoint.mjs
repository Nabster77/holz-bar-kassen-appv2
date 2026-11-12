import assert from 'node:assert/strict';
import { readBackupCheckpoint, markCloudSyncVerified, markBackupVerified } from '../src/lib/backupCheckpoint.ts';
const values=new Map();
globalThis.localStorage={
  getItem:key=>values.get(key)??null,
  setItem:(key,value)=>{values.set(key,String(value));},
};
const a='a'.repeat(64), b='b'.repeat(64),time=Date.parse('2026-11-12T22:00:00Z');
assert.equal(readBackupCheckpoint().cloudSyncedAt,null);
assert.equal(readBackupCheckpoint().backup1SyncedAt,null);
assert.equal(readBackupCheckpoint().backup2SyncedAt,null);
const synced=markCloudSyncVerified(time);
assert.equal(synced.cloudSyncedAt,time);
assert.equal(readBackupCheckpoint().backup1SyncedAt,null,'Cloud is not a proof of Backup1');
const b1=markBackupVerified('backup1',a,time+10);
assert.equal(b1.backup1Revision,a);
assert.equal(b1.backup2SyncedAt,null,'Backup1 is not a proof of Backup2');
assert.throws(()=>markBackupVerified('backup2',b,time+20),/abweicht/);
const b2=markBackupVerified('backup2',a,time+30);
assert.equal(b2.backup2Revision,a);
assert.equal(readBackupCheckpoint().backup2SyncedAt,time+30);
markBackupVerified('backup1',b,time+40);
assert.equal(readBackupCheckpoint().backup2Revision,a,'Older Backup2 must remain correctly marked as stale');
assert.throws(()=>markCloudSyncVerified(-1),/Ungültiger/);
assert.throws(()=>markBackupVerified('backup1','bad',time),/nicht gültig/);
console.log('BACKUP-STATUS: Cloud/Backup1/Backup2 unterscheiden, nur verifizierte Versionen bekommen Zeitstempel.');
