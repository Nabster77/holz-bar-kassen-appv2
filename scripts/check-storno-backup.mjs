import assert from 'node:assert/strict';
import { assertBackupStornosPresent } from '../src/lib/stornoBackupIntegrity.ts';

const original={id:'s-1',originalTransactionId:'sale-1',cashSessionId:'cash-1',
  location:'Bregenz',timestamp:1794567900000,reason:'Falsche Buchung',
  employeeId:'staff-1',employeeName:'Mitarbeiterin',paymentMethod:'card',
  grossAmount:10,cashEffect:0,cardEffect:-10,
  originalSnapshot:{id:'sale-1',location:'Bregenz',paymentMethod:'card',
    taxByRate:{10:0.9},total:10,items:[{productId:'a',quantity:1,price:10}]}};
assert.doesNotThrow(()=>assertBackupStornosPresent([structuredClone(original)], [original]));
assert.doesNotThrow(()=>assertBackupStornosPresent(undefined, [original]), 'Legacy backup may omit storno field but cloud records remain authoritative');
assert.doesNotThrow(()=>assertBackupStornosPresent([], [original]), 'Empty backup cannot delete existing cloud records');
assert.throws(()=>assertBackupStornosPresent([original], []), /fehlt in der V3-Cloud/);
assert.throws(()=>assertBackupStornosPresent([{...original,reason:'Andere Begründung'}],[original]), /unterscheidet/);
assert.throws(()=>assertBackupStornosPresent([original,original],[original]), /Doppelte/);
assert.throws(()=>assertBackupStornosPresent('corrupt',[original]), /gültige Stornobeleg/);
assert.throws(()=>assertBackupStornosPresent([null],[original]), /Ungültiger Stornonachweis/);
const reordered={...original, originalSnapshot:{...original.originalSnapshot,items:[...original.originalSnapshot.items]}};
assert.doesNotThrow(()=>assertBackupStornosPresent([reordered],[original]),'JSON reordering must not be mistaken for a changed document');
console.log('STORNO-BACKUP: unveränderliche Cloud-Belege geschützt, Dubletten und Manipulationen erkannt, Altsicherungen kompatibel.');
