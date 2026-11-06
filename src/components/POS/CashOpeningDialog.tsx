import { useMemo, useState } from 'react';
import { MapPin, Euro, Check, Store, Settings, KeyRound, Loader2, WifiOff } from 'lucide-react';
import type { Location, StaffUser } from '@/types';
import { verifyStaffPassword } from '@/lib/staffDirectory';

interface Props {
  onSave: (location: Location, openingBalance: number) => void;
  onClose: () => void;
  onEnterAdmin?: () => void;
  defaultLocation?: Location;
  staffUsers: StaffUser[];
  currentStaff: StaffUser | null;
  online: boolean;
  lastStaffId: string | null;
  onStaffAuthenticated: (staff: StaffUser) => void;
  onSetStaffPassword: (id: string, password: string) => Promise<unknown>;
  onResetStaffPassword: (id: string, password: string) => Promise<unknown>;
}

const LOCATIONS: Location[] = ['Friedrichshafen', 'Bregenz'];

export function CashOpeningDialog({ onSave, onClose, onEnterAdmin, defaultLocation, staffUsers, currentStaff, online, lastStaffId, onStaffAuthenticated, onSetStaffPassword, onResetStaffPassword }: Props) {
  void onClose;
  const [location, setLocation] = useState<Location>(defaultLocation ?? 'Friedrichshafen');
  const [balance, setBalance] = useState('');
  const availableStaff = useMemo(() => staffUsers.filter((user) => user.active), [staffUsers]);
  const [selectedStaffId, setSelectedStaffId] = useState(currentStaff?.id ?? lastStaffId ?? '');
  const [staffPassword, setStaffPassword] = useState('');
  const [passwordRepeat, setPasswordRepeat] = useState('');
  const [staffAuthenticated, setStaffAuthenticated] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [staffBusy, setStaffBusy] = useState(false);
  const selectedStaff = availableStaff.find((user) => user.id === selectedStaffId) ?? null;
  const firstPassword = Boolean(selectedStaff && !selectedStaff.passwordHash);

  function handleSave() {
    const parsed = parseFloat(balance.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) return;
    if (!selectedStaff || !staffAuthenticated) return;
    onSave(location, parsed);
  }

  function chooseStaff(id: string) {
    setSelectedStaffId(id);
    setStaffPassword('');
    setPasswordRepeat('');
    setStaffAuthenticated(false);
    setResetMode(false);
    setStaffError(null);
  }

  async function authenticateStaff() {
    if (!selectedStaff || staffBusy) return;
    setStaffError(null);
    setStaffBusy(true);
    try {
      if (firstPassword) {
        if (!online) throw new Error('Die erstmalige Passwortvergabe ist nur online möglich.');
        if (staffPassword.length < 6) throw new Error('Das Passwort muss mindestens 6 Zeichen haben.');
        if (staffPassword !== passwordRepeat) throw new Error('Die beiden Passwörter stimmen nicht überein.');
        await onSetStaffPassword(selectedStaff.id, staffPassword);
      } else if (!(await verifyStaffPassword(selectedStaff, staffPassword))) {
        throw new Error('Passwort ist nicht korrekt.');
      }
      setStaffAuthenticated(true);
      onStaffAuthenticated(selectedStaff);
    } catch (cause) {
      setStaffError(cause instanceof Error ? cause.message : String(cause));
    } finally { setStaffBusy(false); }
  }

  async function resetPassword() {
    if (!selectedStaff || staffBusy) return;
    setStaffError(null);
    setStaffBusy(true);
    try {
      if (!online) throw new Error('Passwort-Zurücksetzung ist nur online möglich.');
      if (staffPassword.length < 6) throw new Error('Das Passwort muss mindestens 6 Zeichen haben.');
      if (staffPassword !== passwordRepeat) throw new Error('Die beiden Passwörter stimmen nicht überein.');
      await onResetStaffPassword(selectedStaff.id, staffPassword);
      setStaffAuthenticated(true);
      setResetMode(false);
      onStaffAuthenticated(selectedStaff);
    } catch (cause) {
      setStaffError(cause instanceof Error ? cause.message : String(cause));
    } finally { setStaffBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/60 p-4 sm:items-center">
      <div className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl dark:bg-gray-800">
        <div className="mb-5 flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg"><Store className="h-8 w-8" /></div>
          <div><h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Kasseneröffnung</h3><p className="text-sm text-gray-500 dark:text-gray-400">Bitte zuerst als Mitarbeiter anmelden und anschließend die Kasse eröffnen.</p></div>
        </div>
        <div className="space-y-4">
          <div className="space-y-3"><label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Mitarbeiter</label><select value={selectedStaffId} onChange={(event) => chooseStaff(event.target.value)} disabled={availableStaff.length === 0} className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-3 text-base font-semibold text-slate-100 [color-scheme:dark] disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"><option className="bg-slate-900 text-slate-100" value="">Mitarbeiter auswählen</option>{availableStaff.map((user) => <option className="bg-slate-900 text-slate-100" key={user.id} value={user.id}>{user.name}</option>)}</select>{availableStaff.length === 0 && <p className="text-xs text-amber-700 dark:text-amber-300">Bitte zuerst einen Mitarbeiter oder Administrator in der Verwaltung anlegen.</p>}
            {selectedStaff && !staffAuthenticated && !resetMode && <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20"><label className="block text-sm font-medium text-gray-700 dark:text-gray-200">{firstPassword ? 'Neues persönliches Passwort' : 'Persönliches Passwort'}<input type="password" value={staffPassword} onChange={(event) => { setStaffPassword(event.target.value); setStaffError(null); }} onKeyDown={(event) => event.key === 'Enter' && void authenticateStaff()} autoFocus className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-base dark:border-gray-700 dark:bg-gray-900" /></label>{firstPassword && <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">Passwort wiederholen<input type="password" value={passwordRepeat} onChange={(event) => { setPasswordRepeat(event.target.value); setStaffError(null); }} onKeyDown={(event) => event.key === 'Enter' && void authenticateStaff()} className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-base dark:border-gray-700 dark:bg-gray-900" /></label>}{firstPassword && !online && <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300"><WifiOff className="h-3.5 w-3.5" /> Die erste Passwortvergabe benötigt eine Internetverbindung.</p>}{staffError && <p className="text-sm text-red-600 dark:text-red-400">{staffError}</p>}<button onClick={() => void authenticateStaff()} disabled={!staffPassword || staffBusy || (firstPassword && !online)} className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white disabled:opacity-50">{staffBusy ? <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> : <Check className="mr-1 inline h-4 w-4" />}{firstPassword ? 'Bestätigen und speichern' : 'Mitarbeiter anmelden'}</button>{!firstPassword && <button disabled={!online} onClick={() => { setResetMode(true); setStaffPassword(''); setPasswordRepeat(''); setStaffError(null); }} className="w-full text-center text-xs font-semibold text-blue-700 disabled:text-gray-400 dark:text-blue-300"><KeyRound className="mr-1 inline h-3.5 w-3.5" /> Passwort zurücksetzen (nur online)</button>}</div>}
            {selectedStaff && resetMode && <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20"><p className="text-sm font-semibold text-blue-900 dark:text-blue-100">Passwort zurücksetzen</p><input type="password" value={staffPassword} onChange={(event) => setStaffPassword(event.target.value)} placeholder="Neues Passwort" className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm dark:border-blue-800 dark:bg-gray-900" /><input type="password" value={passwordRepeat} onChange={(event) => setPasswordRepeat(event.target.value)} placeholder="Passwort wiederholen" className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm dark:border-blue-800 dark:bg-gray-900" />{staffError && <p className="text-sm text-red-600 dark:text-red-400">{staffError}</p>}<button onClick={() => void resetPassword()} disabled={!online || !staffPassword || staffBusy} className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white disabled:opacity-50">Jetzt online zurücksetzen</button><button onClick={() => setResetMode(false)} className="w-full text-xs font-semibold text-gray-600 dark:text-gray-300">Zurück</button></div>}
            {selectedStaff && staffAuthenticated && <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200"><Check className="mr-1 inline h-4 w-4" /> {selectedStaff.name} ist angemeldet.</p>}</div>
          <div><label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300"><MapPin className="h-4 w-4" /> Standort</label><div className="grid grid-cols-2 gap-2">{LOCATIONS.map((entry) => <button key={entry} onClick={() => setLocation(entry)} className={`rounded-xl py-3 text-sm font-bold transition active:scale-95 ${location === entry ? 'bg-blue-600 text-white shadow-md' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'}`}>{entry}</button>)}</div></div>
          <div><label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300"><Euro className="h-4 w-4" /> Kassen-Anfangsbestand (€)</label><input value={balance} onChange={(event) => setBalance(event.target.value)} placeholder="z.B. 150,00" inputMode="decimal" autoFocus className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-base text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100" /></div>
          <button onClick={handleSave} disabled={!balance || !staffAuthenticated} className="w-full rounded-xl bg-blue-600 py-3.5 text-base font-bold text-white shadow-md transition hover:bg-blue-700 active:scale-95 disabled:opacity-50"><Check className="mr-1.5 inline h-5 w-5" /> Kasse eröffnen</button>
          {onEnterAdmin && <button onClick={onEnterAdmin} className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300 dark:hover:bg-gray-700"><Settings className="h-4 w-4" /> Verwaltung öffnen</button>}
        </div>
      </div>
    </div>
  );
}
