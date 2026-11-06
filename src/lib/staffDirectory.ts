import { supabase } from '@/lib/supabaseClient';
import { loadJSON, saveJSON, STORAGE_KEYS } from '@/lib/storage';
import type { StaffRole, StaffUser } from '@/types';

const PBKDF2_ITERATIONS = 210_000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function passwordHash(password: string, salt: string): Promise<string> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: base64ToBytes(salt), iterations: PBKDF2_ITERATIONS },
    material,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let different = 0;
  for (let index = 0; index < left.length; index += 1) different |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return different === 0;
}

export function loadStaffUsers(): StaffUser[] {
  return loadJSON<StaffUser[]>(STORAGE_KEYS.staffUsers, []);
}

export function saveStaffUsers(users: StaffUser[]): void {
  saveJSON(STORAGE_KEYS.staffUsers, users);
}

export async function createPasswordProof(password: string): Promise<Pick<StaffUser, 'passwordSalt' | 'passwordHash'>> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const passwordSalt = bytesToBase64(saltBytes);
  return { passwordSalt, passwordHash: await passwordHash(password, passwordSalt) };
}

export async function verifyPasswordProof(salt: string | null, hash: string | null, password: string): Promise<boolean> {
  if (!salt || !hash) return false;
  return constantTimeEqual(await passwordHash(password, salt), hash);
}

export async function verifyStaffPassword(user: StaffUser, password: string): Promise<boolean> {
  return verifyPasswordProof(user.passwordSalt, user.passwordHash, password);
}

export async function makeStaffUser(name: string, role: StaffRole, initialPassword?: string): Promise<StaffUser> {
  const password = initialPassword ? await createPasswordProof(initialPassword) : { passwordSalt: null, passwordHash: null };
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    role,
    active: true,
    passwordSalt: password.passwordSalt,
    passwordHash: password.passwordHash,
    updatedAt: Date.now(),
  };
}

type StaffRow = { id: string; data: StaffUser; updated_at: number; deleted: boolean };

function isStaffUser(value: unknown): value is StaffUser {
  if (!value || typeof value !== 'object') return false;
  const user = value as Partial<StaffUser>;
  return typeof user.id === 'string' && typeof user.name === 'string' && (user.role === 'administrator' || user.role === 'employee');
}

export async function pullStaffUsers(): Promise<StaffUser[]> {
  if (!supabase) throw new Error('Cloud ist nicht konfiguriert.');
  // The visible name is stored inside the JSON `data` column, not as a
  // database column. Sort by the persisted timestamp here; the hook then
  // sorts the decoded users alphabetically for the interface.
  const { data, error } = await supabase.from('pos_staff_users').select('id, data, updated_at, deleted').eq('deleted', false).order('updated_at');
  if (error) throw error;
  const users = ((data ?? []) as StaffRow[])
    .map((row) => row.data)
    .filter(isStaffUser)
    .map((user) => ({ ...user, updatedAt: Number(user.updatedAt) || Date.now() }));
  saveStaffUsers(users);
  return users;
}

export async function pushStaffUser(user: StaffUser): Promise<void> {
  if (!navigator.onLine) throw new Error('Benutzerverwaltung ist nur online möglich.');
  if (!supabase) throw new Error('Cloud ist nicht konfiguriert.');
  const row: StaffRow = { id: user.id, data: user, updated_at: user.updatedAt, deleted: false };
  const { error } = await supabase.from('pos_staff_users').upsert(row, { onConflict: 'id' });
  if (error) throw error;
}

export async function removeStaffUser(user: StaffUser): Promise<void> {
  if (!navigator.onLine) throw new Error('Benutzer können nur online gelöscht werden.');
  if (!supabase) throw new Error('Cloud ist nicht konfiguriert.');
  const row: StaffRow = { id: user.id, data: user, updated_at: Date.now(), deleted: true };
  const { error } = await supabase.from('pos_staff_users').upsert(row, { onConflict: 'id' });
  if (error) throw error;
}

// A booking reset starts the personnel setup from scratch as well. We use
// tombstones so all connected devices learn about the removal on their next
// synchronisation instead of accidentally restoring an old local user.
export async function removeAllStaffUsers(): Promise<void> {
  if (!navigator.onLine) throw new Error('Benutzer können nur online zurückgesetzt werden.');
  if (!supabase) throw new Error('Cloud ist nicht konfiguriert.');
  const { data, error } = await supabase
    .from('pos_staff_users')
    .select('id, data')
    .eq('deleted', false);
  if (error) throw error;
  if (!data?.length) return;
  const updatedAt = Date.now();
  const rows = data.map((row) => ({ id: row.id, data: row.data, updated_at: updatedAt, deleted: true }));
  const { error: writeError } = await supabase.from('pos_staff_users').upsert(rows, { onConflict: 'id' });
  if (writeError) throw writeError;
}
