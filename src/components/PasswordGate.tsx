import { useState } from 'react';
import { Lock, Check, X, Loader2 } from 'lucide-react';
import { verifyManagerPassword } from '@/lib/managerAuth';
import { verifyStaffPassword } from '@/lib/staffDirectory';
import type { StaffUser } from '@/types';

interface Props {
  // `undefined` means that the shared Verwaltung/Journal password was used.
  // A staff record means that a personal administrator password unlocked it.
  onSuccess: (administrator?: StaffUser) => void;
  title: string;
  onStaffLogin?: () => void;
  onCancel?: () => void;
  administrators?: StaffUser[];
  /** Whether the shared Verwaltung/Journal password is accepted in this gate. */
  allowManagerPassword?: boolean;
  /** Shows an explanation instead of a password field for a normal employee. */
  accessDenied?: boolean;
}

type GateError = 'wrong' | 'unavailable' | null;

export function PasswordGate({ onSuccess, title, onStaffLogin, onCancel, administrators = [], allowManagerPassword = true, accessDenied = false }: Props) {
  const [input, setInput] = useState('');
  const [error, setError] = useState<GateError>(null);
  const [checking, setChecking] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  async function handleSubmit() {
    if (checking) return;
    setChecking(true);
    setError(null);
    try {
      let authenticatedAdministrator: StaffUser | null = null;
      for (const user of administrators) {
        if (user.active && user.role === 'administrator' && await verifyStaffPassword(user, input)) {
          authenticatedAdministrator = user;
          break;
        }
      }
      if (authenticatedAdministrator) {
        onSuccess(authenticatedAdministrator);
      } else if (allowManagerPassword && await verifyManagerPassword(input)) {
        onSuccess();
      } else {
        setError('wrong');
      }
    } catch {
      setError('unavailable');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-40 flex justify-center overflow-y-auto px-3 ${passwordFocused ? 'items-start py-2' : 'items-center py-3'}`}
    >
      <div className={`pointer-events-auto w-full max-w-sm shrink-0 rounded-3xl bg-white shadow-xl dark:bg-gray-800 ${passwordFocused ? 'my-0 p-3' : 'my-auto p-6'}`}>
        <div className={`${passwordFocused ? 'mb-2 gap-1' : 'mb-5 gap-3'} flex flex-col items-center text-center`}>
          <div className={`${passwordFocused ? 'h-9 w-9' : 'h-16 w-16'} flex items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg`}>
            <Lock className={passwordFocused ? "h-5 w-5" : "h-8 w-8"} />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{title}</h3>
        </div>
        {accessDenied ? (
          <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-center text-sm font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            Mitarbeiter haben keinen Zugriff auf Verwaltung oder Journal.
          </p>
        ) : <div className="space-y-3">
          <input
            type="password"
            name="admin-gate-secret"
            autoComplete="new-password"
            value={input}
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
            onChange={(e) => { setInput(e.target.value); setError(null); }}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="Passwort"
            className={`w-full rounded-xl border px-3 py-3 text-base text-gray-900 focus:outline-none focus:ring-2 dark:bg-gray-900 dark:text-gray-100 ${
              error
                ? 'border-red-500 focus:ring-red-500/30'
                : 'border-gray-200 focus:border-blue-500 focus:ring-blue-500/30 dark:border-gray-700'
            }`}
          />
          {error === 'wrong' && (
            <p className="flex items-center gap-1 text-sm text-red-500">
              <X className="h-4 w-4" /> Falsches Passwort
            </p>
          )}
          {error === 'unavailable' && (
            <p className="flex items-center gap-1 text-sm text-red-500">
              <X className="h-4 w-4" /> Prüfung nicht möglich. Bitte Internetverbindung kontrollieren.
            </p>
          )}
          <button
            onClick={handleSubmit}
            disabled={checking}
            className="w-full rounded-xl bg-blue-600 py-3 text-base font-bold text-white shadow-md transition hover:bg-blue-700 active:scale-95 disabled:opacity-60"
          >
            {checking ? <Loader2 className="mr-1.5 inline h-5 w-5 animate-spin" /> : <Check className="mr-1.5 inline h-5 w-5" />} Entsperren
          </button>
          {onCancel && <button type="button" onClick={onCancel} disabled={checking} className="w-full rounded-xl border border-gray-300 py-2.5 text-sm font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-200 disabled:opacity-60">Abbrechen</button>}
          {onStaffLogin && <button onClick={onStaffLogin} className="w-full rounded-xl border border-blue-300 bg-blue-50 py-2.5 text-sm font-semibold text-blue-700 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-300">Als Administrator anmelden</button>}
        </div>}
        {accessDenied && onCancel && <button type="button" onClick={onCancel} className="mt-4 w-full rounded-xl border border-gray-300 py-2.5 text-sm font-semibold dark:border-gray-600 dark:text-gray-200">Abbrechen</button>}
      </div>
    </div>
  );
}
