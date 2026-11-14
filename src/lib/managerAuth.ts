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
  // This clears only the local offline verifier, not the Cloud secret.
  // Only set_admin_gate_password can change the authoritative password.
  saveJSON(STORAGE_KEYS.managerCredential, null);
}

export async function verifyManagerPassword(password: string): Promise<boolean> {
  const stored = loadJSON<ManagerCredential | null>(STORAGE_KEYS.managerCredential, null);
  // Online the Cloud is authoritative. Stale local passwords must not work
  // after a change on another device.
  if (navigator.onLine) {
    if (!supabase) throw new Error('Cloud ist nicht konfiguriert.');
    const { data, error } = await supabase.rpc('verify_admin_gate_password', { p_password: password });
    if (error) throw new Error('Cloud-Passwortprüfung nicht möglich: ' + error.message);
    if (typeof data !== 'boolean') throw new Error('Unerwartete Cloud-Passwortantwort.');
    return data;
  }
  // Offline: only an already provisioned local verifier may authorize.
  if (!stored) throw new Error('Verwaltung ohne eingerichtetes Offline-Passwort benötigt eine Cloud-Verbindung.');
  return verifyPasswordProof(stored.passwordSalt, stored.passwordHash, password);
}

export async function changeManagerPassword(currentPassword: string, nextPassword: string, hasAdministrator: boolean): Promise<void> {
  if (!navigator.onLine) throw new Error('Das Verwalter-Passwort kann nur online geändert werden.');
  if (!hasAdministrator) throw new Error('Lege zuerst einen aktiven Administrator mit Passwort an.');
  if (!(await verifyManagerPassword(currentPassword))) throw new Error('Das bisherige Verwalter-Passwort ist nicht korrekt.');
  if (nextPassword.length < 6) throw new Error('Das neue Passwort muss mindestens 6 Zeichen haben.');
  if (!supabase) throw new Error('Cloud ist nicht konfiguriert.');
  // Persist local proof only after the server confirms the password change.
  const proof = await createPasswordProof(nextPassword);
  const { data, error } = await supabase.rpc('set_admin_gate_password', {
    p_current: currentPassword, p_next: nextPassword,
  });
  if (error) throw new Error('Verwaltungspasswort in der Cloud nicht geändert: ' + error.message);
  if (data !== true) throw new Error('Die Cloud hat die Passwortänderung nicht bestätigt.');
  saveJSON<ManagerCredential>(STORAGE_KEYS.managerCredential, { ...proof, changedAt: Date.now() });
}
