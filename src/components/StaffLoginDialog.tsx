import { useEffect, useMemo, useState } from 'react';
import { Check, KeyRound, Loader2, UserRound, WifiOff } from 'lucide-react';
import type { StaffRole, StaffUser } from '@/types';
import { verifyStaffPassword } from '@/lib/staffDirectory';

interface Props {
  users: StaffUser[];
  allowedRoles: StaffRole[];
  online: boolean;
  title: string;
  onAuthenticated: (user: StaffUser) => void;
  onSetPassword: (id: string, password: string) => Promise<unknown>;
  onResetPassword: (id: string, password: string) => Promise<unknown>;
  initialStaffId?: string | null;
  onCancel?: () => void;
}

export function StaffLoginDialog({ users, allowedRoles, online, title, onAuthenticated, onSetPassword, onResetPassword, initialStaffId, onCancel }: Props) {
  const availableUsers = useMemo(
    () => users.filter((user) => user.active && allowedRoles.includes(user.role)),
    [allowedRoles, users],
  );
  const [selectedId, setSelectedId] = useState(initialStaffId ?? '');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetMode, setResetMode] = useState(false);

  useEffect(() => {
    if (!selectedId && initialStaffId && availableUsers.some((user) => user.id === initialStaffId)) setSelectedId(initialStaffId);
  }, [availableUsers, initialStaffId, selectedId]);

  const selected = availableUsers.find((user) => user.id === selectedId) ?? null;
  const firstPassword = selected !== null && !selected.passwordHash;

  async function submit() {
    if (!selected || busy) return;
    setError(null);
    setBusy(true);
    try {
      if (firstPassword) {
        if (!online) throw new Error('Die erste Passwortvergabe ist nur online möglich.');
        if (password.length < 6) throw new Error('Das Passwort muss mindestens 6 Zeichen haben.');
        if (password !== confirmation) throw new Error('Die beiden Passwörter stimmen nicht überein.');
        await onSetPassword(selected.id, password);
        onAuthenticated({ ...selected, passwordHash: 'gesetzt' });
      } else if (await verifyStaffPassword(selected, password)) {
        onAuthenticated(selected);
      } else {
        throw new Error('Passwort ist nicht korrekt.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!selected || busy) return;
    setError(null); setBusy(true);
    try {
      if (!online) throw new Error('Passwort-Zurücksetzung ist nur online möglich.');
      if (password.length < 6) throw new Error('Das Passwort muss mindestens 6 Zeichen haben.');
      if (password !== confirmation) throw new Error('Die beiden Passwörter stimmen nicht überein.');
      await onResetPassword(selected.id, password);
      onAuthenticated(selected);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-gray-800">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white"><UserRound className="h-7 w-7" /></div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{title}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Der zuletzt verwendete Name bleibt ausgewählt. Mit „Namen wechseln“ kann eine andere Person gewählt werden.</p>
        </div>

        {availableUsers.length === 0 ? (
          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            Noch keine passenden Benutzer angelegt. Bitte zuerst in der Verwaltung einen Mitarbeiter oder Administrator anlegen.
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Name
              <select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setPassword(''); setConfirmation(''); setError(null); }} className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-base dark:border-gray-700 dark:bg-gray-900">
                <option value="">Bitte auswählen</option>
                {availableUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
            </label>

            {selected && !resetMode && (
              <>
                {firstPassword && !online && <p className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400"><WifiOff className="h-4 w-4" /> Die erstmalige Passwortvergabe benötigt eine Internetverbindung.</p>}
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {firstPassword ? 'Neues persönliches Passwort' : 'Persönliches Passwort'}
                  <input type="password" value={password} onChange={(event) => { setPassword(event.target.value); setError(null); }} onKeyDown={(event) => event.key === 'Enter' && void submit()} autoFocus className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-base dark:border-gray-700 dark:bg-gray-900" />
                </label>
                {firstPassword && (
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Passwort wiederholen
                    <input type="password" value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setError(null); }} onKeyDown={(event) => event.key === 'Enter' && void submit()} className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-base dark:border-gray-700 dark:bg-gray-900" />
                  </label>
                )}
                {!online && !firstPassword && <p className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400"><WifiOff className="h-3.5 w-3.5" /> Offline-Anmeldung mit lokal gespeicherten Zugangsdaten möglich.</p>}
              </>
            )}
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            {!resetMode && <button onClick={() => void submit()} disabled={!selected || !password || busy || (firstPassword && !online)} className="w-full rounded-xl bg-blue-600 py-3 font-bold text-white disabled:opacity-50">
              {busy ? <Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" /> : <Check className="mr-1.5 inline h-4 w-4" />}
              {firstPassword ? 'Bestätigen und speichern' : 'Anmelden'}
            </button>}
            {selected && !firstPassword && !resetMode && <button disabled={!online} onClick={() => { setResetMode(true); setPassword(''); setConfirmation(''); setError(null); }} className="w-full text-center text-xs font-semibold text-blue-700 disabled:text-gray-400 dark:text-blue-300"><KeyRound className="mr-1 inline h-3.5 w-3.5" /> Passwort zurücksetzen (nur online)</button>}
            {selected && resetMode && <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20"><p className="text-sm font-semibold text-blue-900 dark:text-blue-100">Passwort wirklich zurücksetzen?</p><p className="text-xs text-blue-800 dark:text-blue-200">Gib ein neues Passwort ein und wiederhole es zur Bestätigung.</p><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Neues Passwort" className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm dark:border-blue-800 dark:bg-gray-900" /><input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Neues Passwort wiederholen" className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm dark:border-blue-800 dark:bg-gray-900" /><button onClick={() => void resetPassword()} disabled={!online || !password || busy} className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white disabled:opacity-50">Jetzt online zurücksetzen</button><button onClick={() => { setResetMode(false); setError(null); }} className="w-full py-1 text-xs font-semibold text-gray-600 dark:text-gray-300">Altes Passwort verwenden</button></div>}
          </div>
        )}
        {onCancel && <button onClick={onCancel} className="mt-4 w-full rounded-xl border border-gray-300 py-2.5 text-sm font-semibold dark:border-gray-600">Abbrechen</button>}
      </div>
    </div>
  );
}
