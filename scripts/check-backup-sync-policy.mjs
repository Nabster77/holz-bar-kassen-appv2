import assert from 'node:assert/strict';
import {
  BACKUP_1_PERIOD_MS, BACKUP_2_IDLE_MS,
  backup1Eligibility, backup2Eligibility, backup2IncrementalDiff, afterVerifiedBackup,
} from '../src/lib/backupSyncPolicy.ts';

const now=Date.parse('2026-11-12T21:00:00Z');
const state={
  cloudSyncedAt:now-60_000,
  backup1SyncedAt:now-BACKUP_1_PERIOD_MS-1,
  backup2SyncedAt:now-2*BACKUP_2_IDLE_MS,
  backup1Revision:'r8',backup2Revision:'r7',
  lastActivityAt:now-BACKUP_2_IDLE_MS-1,
};
const conditions={now,cloudOnline:true,testMode:false,staffSignedIn:false,
  busy:false,hasPendingBookings:false,folderWritable:true,allStaffSignedOutVerified:true};
assert.deepEqual(backup1Eligibility(state,conditions,'r9'),{allowed:true});
assert.deepEqual(backup1Eligibility(state,{...conditions,staffSignedIn:true},'r9'),{allowed:true},
  'Cloud -> Backup 1 may continue while cashier is logged in');
assert.deepEqual(backup1Eligibility(state,conditions,'r8'),{allowed:false,reason:'up-to-date'});
assert.deepEqual(backup1Eligibility(state,{...conditions,cloudOnline:false},'r9'),{allowed:false,reason:'offline'});
assert.deepEqual(backup1Eligibility(state,{...conditions,hasPendingBookings:true},'r9'),{allowed:false,reason:'cloud-pending'});
assert.deepEqual(backup1Eligibility(state,{...conditions,folderWritable:false},'r9'),{allowed:false,reason:'no-folder-permission'});
assert.deepEqual(backup1Eligibility({...state,backup1SyncedAt:now-1000},conditions,'r9'),
  {allowed:false,reason:'not-idle'});
assert.deepEqual(backup1Eligibility({...state,backup1SyncedAt:now-1000},conditions,'r9',true),{allowed:true},
  'A manual backup1 run can ignore only the cadence, not pending writes or permissions');
assert.deepEqual(backup2Eligibility(state,conditions),{allowed:true});
assert.deepEqual(backup2Eligibility(state,{...conditions,staffSignedIn:true}),
  {allowed:false,reason:'employee-signed-in'});
assert.deepEqual(backup2Eligibility(state,{...conditions,allStaffSignedOutVerified:false}),
  {allowed:false,reason:'presence-unverified'},'Other tablets must also be logged out');
assert.deepEqual(backup2Eligibility({...state,lastActivityAt:now-BACKUP_2_IDLE_MS+1000},conditions),
  {allowed:false,reason:'not-idle'});
assert.deepEqual(backup2Eligibility({...state,backup2Revision:'r8'},conditions),
  {allowed:false,reason:'up-to-date'});
assert.deepEqual(backup2Eligibility({...state,backup1Revision:null},conditions),
  {allowed:false,reason:'backup1-pending'});
assert.deepEqual(backup2Eligibility(state,{...conditions,hasPendingBookings:true}),
  {allowed:false,reason:'cloud-pending'});
assert.deepEqual(backup2IncrementalDiff([
  {name:'transactions',digest:'b'}, {name:'cashSessions',digest:'a'},
  {name:'staffUsers',digest:'s'},
],[
  {name:'transactions',digest:'a'}, {name:'cashSessions',digest:'a'},
  {name:'staffUsers',digest:'s'},
]),[{name:'transactions',digest:'b'}],
  'Only changed transaction shard should be copied');
assert.deepEqual(backup2IncrementalDiff([{name:'transactions',digest:'a'}],[{name:'transactions',digest:'a'}]),[]);
assert.throws(()=>backup2IncrementalDiff([{name:'x',digest:'1'},{name:'x',digest:'2'}],[]),/doppeltes/);
const b1=afterVerifiedBackup(state,'backup1','r9',now);
assert.equal(b1.backup1Revision,'r9');
assert.equal(b1.backup2Revision,'r7');
assert.throws(()=>afterVerifiedBackup(b1,'backup2','r8',now+1),/neuere Version/);
const b2=afterVerifiedBackup(b1,'backup2','r9',now+1);
assert.equal(b2.backup2Revision,'r9');
assert.equal(b2.backup1Revision,'r9');
console.log('BACKUP-SYNCHRONISATIONSREGELN: Cloud laufend, Backup 2 nur abgemeldet/idle, Revision & Deltas OK.');
