import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import { verifyExistingStaffPassword } from '../supabase/functions/woodmo-v3-storno/passwordProof.ts';

const salt = Buffer.from(Array.from({length:16}, (_,i) => i+1));
const correct = 'Tao-Eigenes-Testpasswort-2026';
const hash = pbkdf2Sync(correct, salt, 210_000, 32, 'sha256').toString('base64');
const saltBase64 = salt.toString('base64');
assert.equal(await verifyExistingStaffPassword(correct, saltBase64, hash), true);
assert.equal(await verifyExistingStaffPassword(correct+'x', saltBase64, hash), false);
assert.equal(await verifyExistingStaffPassword('', saltBase64, hash), false);
assert.equal(await verifyExistingStaffPassword(correct, null, hash), false);
assert.equal(await verifyExistingStaffPassword(correct, saltBase64, null), false);
assert.equal(await verifyExistingStaffPassword(correct, '!!!', hash), false);
assert.equal(await verifyExistingStaffPassword(correct, saltBase64, 'AA=='), false);
assert.equal(await verifyExistingStaffPassword('x'.repeat(257), saltBase64, hash), false);
assert.equal(await verifyExistingStaffPassword(correct, Buffer.alloc(17).toString('base64'), hash), false);
console.log('STORNO MITARBEITER-NACHWEIS: PBKDF2-kompatibel, ungültige Nachweise zurückgewiesen.');
