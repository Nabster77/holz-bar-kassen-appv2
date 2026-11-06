import { useState } from 'react';
import { Check, KeyRound, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

export function CloudPasswordPanel({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!supabase || busy) return;
    if (password.length < 6) { setError('Bitte mindestens 6 Zeichen verwenden.'); return; }
    if (password !== confirmation) { setError('Die beiden Passwörter stimmen nicht überein.'); return; }
    setBusy(true); setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) { setError(updateError.message); return; }
    onChanged(); setPassword(''); setConfirmation(''); setOpen(false);
  }

  return <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
    <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-5 w-5 text-amber-700 dark:text-amber-300" /><div><h4 className="font-bold text-amber-950 dark:text-amber-100">Cloud-Hauptzugang</h4><p className="text-sm text-amber-800 dark:text-amber-200">Die Neuinstallation startet mit <strong>Admin / 123456</strong>. Nur Administratoren dürfen dieses davon getrennte Cloud-Passwort ändern.</p></div></div>
    {!open ? <button onClick={() => setOpen(true)} className="mt-3 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white"><KeyRound className="mr-1 inline h-4 w-4" /> Cloud-Passwort ändern</button> : <div className="mt-3 space-y-3"><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Neues Cloud-Passwort" className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 dark:border-amber-800 dark:bg-gray-900" /><input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Passwort wiederholen" className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 dark:border-amber-800 dark:bg-gray-900" /><p className="text-xs text-amber-800 dark:text-amber-200">Mindestens 6 Zeichen. Empfehlung: 10 oder mehr Zeichen sowie Groß-/Kleinbuchstaben, Zahlen und Sonderzeichen.</p>{error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}<div className="flex gap-2"><button onClick={() => { setOpen(false); setError(null); }} className="flex-1 rounded-xl border border-amber-300 py-2.5 text-sm font-semibold text-amber-900 dark:border-amber-700 dark:text-amber-100">Abbrechen</button><button disabled={busy || !password || !confirmation} onClick={() => void save()} className="flex-1 rounded-xl bg-amber-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Check className="mr-1 inline h-4 w-4" /> Speichern</button></div></div>}
  </section>;
}
