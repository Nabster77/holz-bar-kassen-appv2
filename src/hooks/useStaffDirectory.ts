import { useCallback, useEffect, useState } from 'react';
import type { StaffRole, StaffSecurityQuestion, StaffUser } from '@/types';
import { configureStaffSecurity, createPasswordProof, loadStaffUsers, makeStaffUser, pullStaffUsers, pushStaffUser, removeAllStaffUsers, removeStaffUser, resetStaffPasswordWithSecurity, saveStaffUsers } from '@/lib/staffDirectory';

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

  const create = useCallback(async (name: string, role: StaffRole, initialPassword?: string, securityQuestion?: StaffSecurityQuestion | null, securityAnswer?: string) => {
    if (!name.trim()) throw new Error('Bitte einen Namen eingeben.');
    if (initialPassword && initialPassword.length < 6) throw new Error('Das Passwort muss mindestens 6 Zeichen haben.');
    if (initialPassword && (!securityQuestion || !securityAnswer)) throw new Error('Für ein direkt vergebenes Passwort bitte auch Sicherheitsfrage und Antwort einrichten.');
    const user = await makeStaffUser(name, role, initialPassword);
    if (initialPassword && securityQuestion && securityAnswer) {
      user.securityQuestion = securityQuestion;
      user.securityConfigured = true;
    }
    await pushStaffUser(user);
    if (securityQuestion && securityAnswer) await configureStaffSecurity(user.id, securityQuestion, securityAnswer);
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

  const setInitialCredentials = useCallback(async (id: string, password: string, securityQuestion: StaffSecurityQuestion | null, securityAnswer: string) => {
    if (!navigator.onLine) throw new Error('Die erste Einrichtung ist nur online möglich.');
    if (password.length < 6) throw new Error('Das Passwort muss mindestens 6 Zeichen haben.');
    if (!securityQuestion || !securityAnswer.trim()) throw new Error('Bitte Sicherheitsfrage und Antwort vollständig einrichten.');
    const user = loadStaffUsers().find((entry) => entry.id === id);
    if (!user) throw new Error('Benutzer wurde nicht gefunden.');
    const proof = await createPasswordProof(password);
    const next = { ...user, ...proof, securityQuestion, securityConfigured: true, updatedAt: Date.now() };
    await pushStaffUser(next);
    await configureStaffSecurity(id, securityQuestion, securityAnswer);
    replaceLocal(loadStaffUsers().map((entry) => entry.id === id ? next : entry));
    return next;
  }, [replaceLocal]);

  const configureSecurity = useCallback(async (id: string, securityQuestion: StaffSecurityQuestion | null, securityAnswer: string) => {
    const user = loadStaffUsers().find((entry) => entry.id === id);
    if (!user) throw new Error('Benutzer wurde nicht gefunden.');
    await configureStaffSecurity(id, securityQuestion, securityAnswer);
    return update({ ...user, securityQuestion, securityConfigured: true });
  }, [update]);

  const resetPassword = useCallback(async (id: string, answer: string, password: string) => {
    if (!navigator.onLine) throw new Error('Passwort-Zurücksetzung ist nur online möglich.');
    const user = loadStaffUsers().find((entry) => entry.id === id);
    if (!user) throw new Error('Benutzer wurde nicht gefunden.');
    if (password.length < 6) throw new Error('Das Passwort muss mindestens 6 Zeichen haben.');
    const proof = await createPasswordProof(password);
    await resetStaffPasswordWithSecurity(id, answer, proof);
    const next = { ...user, ...proof, updatedAt: Date.now() };
    replaceLocal(loadStaffUsers().map((entry) => entry.id === id ? next : entry));
    return next;
  }, [replaceLocal]);

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

  return { users, sync, create, update, setPassword, setInitialCredentials, configureSecurity, resetPassword, remove, resetAll };
}
