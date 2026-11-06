import { useState } from 'react';
import { AlertTriangle, Check, KeyRound, X } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { saveJSON, STORAGE_KEYS } from '@/lib/storage';

interface Props { visible: boolean; onClose: () => void; }

export function RootPasswordWarning({ visible, onClose }: Props) {
  const [changing, setChanging] = useState(false);
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!visible) return null;

  async function changePassword() {
    if (!supabase || busy) return;
    setError(null);
    if (next.length < 6) { setError('Bitte mindestens 6 Zeichen verwenden.'); return; }
    if (next !== confirm) { setError('Die beiden Passwörter stimmen nicht überein.'); return; }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    if (updateError) { setError(updateError.message); return; }
    saveJSON(STORAGE_KEYS.rootPasswordChanged, true);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-gray-800">
          <div className="mb-4 flex items-start gap-3"><AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-500" /><div><h2 className="font-bold text-gray-900 dark:text-gray-100">Standard-Cloud-Passwort ändern</h2><p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Der Cloud-Hauptzugang verwendet bei Neuinstallation <strong>Admin / 123456</strong>. Für einen echten Betrieb solltest du dieses Cloud-Passwort jetzt ändern. Es ist getrennt vom App-Passwort <strong>kasse</strong> für Verwaltung und Journal.</p></div></div>
        {!changing ? <div className="flex gap-2"><button onClick={() => setChanging(true)} className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white"><KeyRound className="mr-1 inline h-4 w-4" /> Jetzt ändern</button><button onClick={onClose} className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-semibold dark:border-gray-600">Nur Hinweis schließen</button></div> : <div className="space-y-3"><input type="password" value={next} onChange={(event) => setNext(event.target.value)} placeholder="Neues Cloud-Passwort" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900" /><input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="Passwort wiederholen" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900" /><p className="text-xs text-gray-500 dark:text-gray-400">Mindestens 6 Zeichen. Empfehlung: 10 oder mehr Zeichen sowie Groß-/Kleinbuchstaben, Zahlen und Sonderzeichen.</p>{error && <p className="text-sm text-red-600">{error}</p>}<button onClick={() => void changePassword()} disabled={busy} className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Check className="mr-1 inline h-4 w-4" /> Cloud-Passwort speichern</button><button onClick={() => { setChanging(false); setError(null); }} className="w-full rounded-xl py-2 text-sm font-semibold text-gray-600 dark:text-gray-300"><X className="mr-1 inline h-4 w-4" /> Zurück</button></div>}
      </div>
    </div>
  );
}
