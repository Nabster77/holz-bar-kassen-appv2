import { createPasswordProof, verifyPasswordProof } from '@/lib/staffDirectory';
import { loadJSON, saveJSON, STORAGE_KEYS } from '@/lib/storage';

interface ManagerCredential {
  passwordSalt: string | null;
  passwordHash: string | null;
  changedAt: number;
}

export function managerPasswordWasChanged(): boolean {
  return loadJSON<ManagerCredential | null>(STORAGE_KEYS.managerCredential, null) !== null;
}

export function resetManagerPassword(): void {
  // `null` is deliberately treated as "not changed" and therefore restores
  // the built-in initial password `kasse`.
  saveJSON(STORAGE_KEYS.managerCredential, null);
}

export async function verifyManagerPassword(password: string): Promise<boolean> {
  const stored = loadJSON<ManagerCredential | null>(STORAGE_KEYS.managerCredential, null);
  // The management password belongs to this installation, not to the cloud
  // account. A fresh/reset test profile deliberately starts at "kasse" again.
  if (!stored) return password === 'kasse';
  return verifyPasswordProof(stored.passwordSalt, stored.passwordHash, password);
}

export async function changeManagerPassword(currentPassword: string, nextPassword: string, hasAdministrator: boolean): Promise<void> {
  if (!navigator.onLine) throw new Error('Das Verwalter-Passwort kann nur online geändert werden.');
  if (!hasAdministrator) throw new Error('Lege zuerst einen aktiven Administrator mit Passwort an.');
  if (!(await verifyManagerPassword(currentPassword))) throw new Error('Das bisherige Verwalter-Passwort ist nicht korrekt.');
  if (nextPassword.length < 6) throw new Error('Das neue Passwort muss mindestens 6 Zeichen haben.');
  const proof = await createPasswordProof(nextPassword);
  saveJSON<ManagerCredential>(STORAGE_KEYS.managerCredential, { ...proof, changedAt: Date.now() });
}
