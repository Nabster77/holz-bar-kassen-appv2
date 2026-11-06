import { useState, type ReactNode } from 'react';
import { Edit3, Plus, ShieldCheck, Trash2, UserRound, UserRoundCheck, WifiOff, X } from 'lucide-react';
import type { StaffRole, StaffUser } from '@/types';

interface Props {
  users: StaffUser[];
  online: boolean;
  onCreate: (name: string, role: StaffRole, initialPassword?: string) => Promise<unknown>;
  onUpdate: (user: StaffUser) => Promise<unknown>;
  onSetPassword: (id: string, password: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
}

export function StaffManager({ users, online, onCreate, onUpdate, onSetPassword, onDelete }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<StaffUser | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState<StaffRole>('employee');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function openCreate() { setName(''); setRole('employee'); setPassword(''); setConfirmation(''); setError(null); setCreateOpen(true); }
  function openEdit(user: StaffUser) { setSelected({ ...user }); setPassword(''); setConfirmation(''); setError(null); setConfirmDelete(false); }
  function validatePassword(): string | null {
    if (password && password.length < 6) return 'Das Passwort muss mindestens 6 Zeichen haben.';
    if (password !== confirmation) return 'Die beiden Passwörter stimmen nicht überein.';
    return null;
  }

  async function createUser() {
    const problem = validatePassword();
    if (!name.trim()) { setError('Bitte einen Namen eingeben.'); return; }
    if (problem) { setError(problem); return; }
    setBusy(true); setError(null); setMessage(null);
    try {
      await onCreate(name, role, password || undefined);
      setCreateOpen(false);
      setMessage('Benutzer wurde angelegt.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  async function saveUser() {
    if (!selected || !selected.name.trim()) { setError('Bitte einen Namen eingeben.'); return; }
    setBusy(true); setError(null); setMessage(null);
    try { await onUpdate({ ...selected, name: selected.name.trim() }); setSelected(null); setMessage('Benutzer gespeichert.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  async function savePassword() {
    if (!selected) return;
    const problem = validatePassword();
    if (!password) { setError('Bitte ein Passwort eingeben.'); return; }
    if (problem) { setError(problem); return; }
    setBusy(true); setError(null); setMessage(null);
    try { await onSetPassword(selected.id, password); setPassword(''); setConfirmation(''); setSelected({ ...selected, passwordHash: 'gesetzt' }); setMessage('Passwort wurde online gespeichert.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  async function deleteUser() {
    if (!selected) return;
    setBusy(true); setError(null);
    try { await onDelete(selected.id); setSelected(null); setConfirmDelete(false); setMessage('Benutzer wurde gelöscht. Artikel, Preise, Bilder und Buchungen bleiben erhalten.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Benutzer verwalten</h3><p className="text-sm text-gray-500 dark:text-gray-400">Mitarbeiter bedienen nur die Kasse. Administratoren dürfen zusätzlich Verwaltung und Journal öffnen.</p></div><button disabled={!online} onClick={openCreate} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Plus className="mr-1 inline h-4 w-4" /> Anlegen</button></div>
    {!online && <p className="flex items-center gap-1 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"><WifiOff className="h-4 w-4" /> Benutzer können nur online angelegt, geändert oder gelöscht werden.</p>}
    {message && <p className="rounded-xl bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/30 dark:text-green-300">{message}</p>}
    {error && !createOpen && !selected && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</p>}
    {users.length === 0 ? <p className="rounded-2xl border border-dashed border-gray-300 p-5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">Noch keine Benutzer angelegt.</p> : <div className="grid gap-2 sm:grid-cols-2">{users.map((user) => <button key={user.id} onClick={() => openEdit(user)} className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 text-left shadow-sm transition hover:border-blue-400 dark:border-gray-700 dark:bg-gray-800"><div className={`flex h-10 w-10 items-center justify-center rounded-xl text-white ${user.role === 'administrator' ? 'bg-violet-600' : 'bg-blue-600'}`}>{user.role === 'administrator' ? <ShieldCheck className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}</div><div className="min-w-0 flex-1"><p className="truncate font-semibold">{user.name}</p><p className="text-xs text-gray-500 dark:text-gray-400">{user.role === 'administrator' ? 'Administrator' : 'Mitarbeiter'} · {user.active ? 'aktiv' : 'inaktiv'} · {user.passwordHash ? 'Passwort vorhanden' : 'noch kein Passwort'}</p></div><Edit3 className="h-4 w-4 text-gray-400" /></button>)}</div>}

    {createOpen && <Modal title="Benutzer anlegen" onClose={() => setCreateOpen(false)}><UserForm name={name} role={role} password={password} confirmation={confirmation} onName={setName} onRole={setRole} onPassword={setPassword} onConfirmation={setConfirmation} /><p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Ein Passwort ist optional. Ohne Passwort legt die Person es bei ihrer ersten persönlichen Anmeldung fest.</p>{error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}<div className="mt-4 flex gap-2"><button onClick={() => setCreateOpen(false)} className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-semibold dark:border-gray-600">Abbrechen</button><button disabled={busy || !online} onClick={() => void createUser()} className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white disabled:opacity-50">Anlegen</button></div></Modal>}

    {selected && <Modal title="Benutzer bearbeiten" onClose={() => setSelected(null)}><label className="mb-3 block text-sm font-medium">Name<input value={selected.name} onChange={(event) => setSelected({ ...selected, name: event.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900" /></label><label className="mb-3 flex items-center justify-between gap-3 text-sm font-medium">Benutzer aktiv<input type="checkbox" checked={selected.active} onChange={(event) => setSelected({ ...selected, active: event.target.checked })} className="h-4 w-4 accent-blue-600" /></label><label className="mb-4 block text-sm font-medium">Rolle<select value={selected.role} onChange={(event) => setSelected({ ...selected, role: event.target.value as StaffRole })} className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900"><option value="employee">Mitarbeiter</option><option value="administrator">Administrator</option></select></label><button disabled={busy || !online} onClick={() => void saveUser()} className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"><UserRoundCheck className="mr-1 inline h-4 w-4" /> Änderungen speichern</button><div className="my-4 border-t border-gray-200 dark:border-gray-700" /><p className="mb-2 text-sm font-semibold">Passwort vergeben oder ändern</p><PasswordFields password={password} confirmation={confirmation} onPassword={setPassword} onConfirmation={setConfirmation} /><button disabled={busy || !online || !password} onClick={() => void savePassword()} className="mt-3 w-full rounded-xl bg-violet-600 py-2.5 text-sm font-bold text-white disabled:opacity-50">Passwort speichern</button>{error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}<button onClick={() => setConfirmDelete(true)} disabled={busy || !online} className="mt-4 w-full rounded-xl border border-red-300 py-2.5 text-sm font-bold text-red-600 disabled:opacity-50"><Trash2 className="mr-1 inline h-4 w-4" /> Benutzer löschen</button>{confirmDelete && <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200"><p>Benutzer wirklich löschen? Der Zugang wird entfernt; Artikel, Preise, Bilder und Buchungen bleiben erhalten.</p><div className="mt-3 flex gap-2"><button onClick={() => setConfirmDelete(false)} className="flex-1 rounded-lg border border-red-300 py-2 font-semibold">Abbrechen</button><button onClick={() => void deleteUser()} disabled={busy} className="flex-1 rounded-lg bg-red-600 py-2 font-bold text-white">Jetzt löschen</button></div></div>}</Modal>}
  </div>;
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) { return <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/60 p-4"><div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl dark:bg-gray-800"><div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold">{title}</h3><button onClick={onClose} aria-label="Schließen"><X className="h-5 w-5" /></button></div>{children}</div></div>; }
function PasswordFields({ password, confirmation, onPassword, onConfirmation }: { password: string; confirmation: string; onPassword: (value: string) => void; onConfirmation: (value: string) => void }) { return <><label className="mb-3 block text-sm font-medium">Passwort<input type="password" value={password} onChange={(event) => onPassword(event.target.value)} placeholder="mindestens 6 Zeichen" className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900" /></label><label className="block text-sm font-medium">Passwort wiederholen<input type="password" value={confirmation} onChange={(event) => onConfirmation(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900" /></label></>; }
function UserForm({ name, role, password, confirmation, onName, onRole, onPassword, onConfirmation }: { name: string; role: StaffRole; password: string; confirmation: string; onName: (value: string) => void; onRole: (value: StaffRole) => void; onPassword: (value: string) => void; onConfirmation: (value: string) => void }) { return <><label className="mb-3 block text-sm font-medium">Name<input value={name} onChange={(event) => onName(event.target.value)} autoFocus className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900" /></label><label className="mb-4 block text-sm font-medium">Rolle<select value={role} onChange={(event) => onRole(event.target.value as StaffRole)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900"><option value="employee">Mitarbeiter</option><option value="administrator">Administrator</option></select></label><PasswordFields password={password} confirmation={confirmation} onPassword={onPassword} onConfirmation={onConfirmation} /></>; }
