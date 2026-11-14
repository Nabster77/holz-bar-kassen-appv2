import { createPasswordProof, verifyPasswordProof } from '@/lib/staffDirectory';
import { loadJSON, saveJSON, STORAGE_KEYS } from '@/lib/storage';
import { supabase } from '@/lib/supabaseClient';

export interface ManagerCredential {
  passwordSalt: string | null;
  passwordHash: string | null;
  changedAt: number;
}

export function loadManagerCredential(): ManagerCredential | null {
  return loadJSON<ManagerCredential | null>(STORAGE_KEYS.managerCredential, null);
}

export function restoreManagerCredential(credential: ManagerCredential | null): void {
  saveJSON(STORAGE_KEYS.managerCredential, credential);
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
  // Online, the cloud gate is authoritative across all devices.
  if (navigator.onLine && supabase) {
    const { data, error } = await supabase.rpc('verify_admin_gate_password', { p_password: password });
    if (error) throw new Error('Cloud-Verwaltungspasswort nicht prüfbar: ' + error.message);
    if (typeof data !== 'boolean') throw new Error('Unerwartete Cloud-Passwortantwort.');
    return data;
  }
  // The reset itself always remains online-only.
  if (!stored) return password === 'kasse';
  return verifyPasswordProof(stored.passwordSalt, stored.passwordHash, password);
}

export async function changeManagerPassword(currentPassword: string, nextPassword: string, hasAdministrator: boolean): Promise<void> {
  if (!navigator.onLine) throw new Error('Das Verwalter-Passwort kann nur online geändert werden.');
  if (!hasAdministrator) throw new Error('Lege zuerst einen aktiven Administrator mit Passwort an.');
  if (!(await verifyManagerPassword(currentPassword))) throw new Error('Das bisherige Verwalter-Passwort ist nicht korrekt.');
  if (nextPassword.length < 6) throw new Error('Das neue Passwort muss mindestens 6 Zeichen haben.');
  if (!supabase) throw new Error('Cloud ist nicht konfiguriert.');
  const proof = await createPasswordProof(nextPassword);
  // Commit to cloud first: local success must not leave the reset gate stale.
  const { data, error } = await supabase.rpc('set_admin_gate_password', {
    p_current: currentPassword, p_next: nextPassword,
  });
  if (error) throw new Error('Cloud-Passwort nicht geändert: ' + error.message);
  if (data !== true) throw new Error('Cloud-Passwortänderung wurde nicht bestätigt.');
  saveJSON<ManagerCredential>(STORAGE_KEYS.managerCredential, { ...proof, changedAt: Date.now() });
}
