import { useState } from 'react';
import { KeyRound, LockKeyhole } from 'lucide-react';

interface Props {
  online: boolean;
  hasAdministrator: boolean;
  onChange: (currentPassword: string, nextPassword: string) => Promise<unknown>;
}

export function ManagerPasswordPanel({ online, hasAdministrator, onChange }: Props) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null); setMessage(null);
    if (next !== confirm) { setError('Die beiden neuen Passwörter stimmen nicht überein.'); return; }
    setBusy(true);
    try { await onChange(current, next); setCurrent(''); setNext(''); setConfirm(''); setMessage('Passwort für Verwaltung und Journal wurde geändert.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-3 flex items-start gap-2"><LockKeyhole className="mt-0.5 h-5 w-5 text-violet-600" /><div><h4 className="font-bold">Passwort für Verwaltung und Journal</h4><p className="text-sm text-gray-500 dark:text-gray-400">Dieses App-interne Standardpasswort lautet zunächst <strong>kasse</strong>. Es ist vollständig getrennt vom Cloud-Hauptzugang <strong>Admin / 123456</strong>.</p></div></div>
      {!hasAdministrator ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">Noch gesperrt: Lege zuerst einen Administrator an und lass ihn sein persönliches Passwort festlegen.</p> : <div className="grid gap-2 sm:grid-cols-3"><input type="password" value={current} onChange={(event) => setCurrent(event.target.value)} placeholder="Bisheriges Passwort" className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900" /><input type="password" value={next} onChange={(event) => setNext(event.target.value)} placeholder="Neues Passwort" className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900" /><input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="Passwort wiederholen" className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900" /><button disabled={!online || !current || !next || !confirm || busy} onClick={() => void submit()} className="sm:col-span-3 rounded-xl bg-violet-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"><KeyRound className="mr-1 inline h-4 w-4" /> Passwort für Verwaltung und Journal ändern</button></div>}
      {message && <p className="mt-3 text-sm text-green-700 dark:text-green-300">{message}</p>}{error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
