import { useCallback, useEffect, useState } from 'react';
import type { StaffRole, StaffUser } from '@/types';
import { createPasswordProof, loadStaffUsers, makeStaffUser, pullStaffUsers, pushStaffUser, removeAllStaffUsers, removeStaffUser, saveStaffUsers } from '@/lib/staffDirectory';

export function useStaffDirectory() {
  const [users, setUsers] = useState<StaffUser[]>(loadStaffUsers);

  const replaceLocal = useCallback((next: StaffUser[]) => {
    const sorted = [...next].sort((a, b) => a.name.localeCompare(b.name, 'de'));
    saveStaffUsers(sorted);
    setUsers(sorted);
    return sorted;
  }, []);

  const sync = useCallback(async () => replaceLocal(await pullStaffUsers()), [replaceLocal]);

  useEffect(() => {
    if (navigator.onLine) void sync().catch(() => undefined);
  }, [sync]);

  const create = useCallback(async (name: string, role: StaffRole, initialPassword?: string) => {
    if (!name.trim()) throw new Error('Bitte einen Namen eingeben.');
    if (initialPassword && initialPassword.length < 6) throw new Error('Das Passwort muss mindestens 6 Zeichen haben.');
    const user = await makeStaffUser(name, role, initialPassword);
    await pushStaffUser(user);
    replaceLocal([...loadStaffUsers(), user]);
    return user;
  }, [replaceLocal]);

  const update = useCallback(async (user: StaffUser) => {
    const next = { ...user, updatedAt: Date.now() };
    await pushStaffUser(next);
    replaceLocal(loadStaffUsers().map((entry) => entry.id === next.id ? next : entry));
    return next;
  }, [replaceLocal]);

  const setPassword = useCallback(async (id: string, password: string) => {
    if (!navigator.onLine) throw new Error('Passwörter können nur online gesetzt oder zurückgesetzt werden.');
    if (password.length < 6) throw new Error('Das Passwort muss mindestens 6 Zeichen haben.');
    const user = loadStaffUsers().find((entry) => entry.id === id);
    if (!user) throw new Error('Mitarbeiter wurde nicht gefunden.');
    const proof = await createPasswordProof(password);
    return update({ ...user, ...proof });
  }, [update]);

  const resetPassword = useCallback(async (id: string, password: string) => {
    if (!navigator.onLine) throw new Error('Passwort-Zurücksetzung ist nur online möglich.');
    const user = loadStaffUsers().find((entry) => entry.id === id);
    if (!user) throw new Error('Benutzer wurde nicht gefunden.');
    return setPassword(id, password);
  }, [setPassword]);

  const remove = useCallback(async (id: string) => {
    const user = loadStaffUsers().find((entry) => entry.id === id);
    if (!user) throw new Error('Benutzer wurde nicht gefunden.');
    await removeStaffUser(user);
    replaceLocal(loadStaffUsers().filter((entry) => entry.id !== id));
  }, [replaceLocal]);

  const resetAll = useCallback(async () => {
    await removeAllStaffUsers();
    replaceLocal([]);
  }, [replaceLocal]);

  return { users, sync, create, update, setPassword, resetPassword, remove, resetAll };
}
