import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Loader2, LogIn, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

const ACCOUNT_DOMAIN = 'kasse.local';

interface Props {
  children: ReactNode;
}

export function CloudLoginGate({ children }: Props) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  if (!supabase) return children;
  if (session === undefined) {
    return (
      <div className="flex h-dvh items-center justify-center bg-gray-100 dark:bg-gray-900">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
      </div>
    );
  }
  if (!session) return <LoginForm />;
  return children;
}

function LoginForm() {
  const [username, setUsername] = useState('Admin');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase || submitting) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: `${username.trim().toLowerCase()}@${ACCOUNT_DOMAIN}`,
        password,
      });
      if (error) setErrorMessage(error.message);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-dvh items-center justify-center bg-gray-100 p-4 dark:bg-gray-900">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-800"
      >
        <div className="space-y-1 text-center">
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Tablet-Kasse anmelden</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Die Anmeldung ist für die Cloud-Synchronisation nötig.</p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Benutzer</span>
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-base text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Passwort</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-base text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>

        {errorMessage !== null && (
          <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              <p>Anmeldung fehlgeschlagen. Bitte Benutzer und Passwort prüfen und die Internetverbindung kontrollieren.</p>
              <p className="break-words text-xs">Fehlermeldung: {errorMessage}</p>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 active:scale-95 disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          Anmelden
        </button>
      </form>
    </div>
  );
}
