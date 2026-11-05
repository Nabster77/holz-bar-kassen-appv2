import { useState } from 'react';
import { MapPin, Euro, Check, Store, Settings, Lock, X, Loader2 } from 'lucide-react';
import type { Location } from '@/types';
import { verifyAdminPassword } from '@/lib/adminGate';

interface Props {
  onSave: (location: Location, openingBalance: number, employeeCode: string) => void;
  onClose: () => void;
  onEnterAdmin?: () => void;
  defaultLocation?: Location;
}

const LOCATIONS: Location[] = ['Friedrichshafen', 'Bregenz'];

export function CashOpeningDialog({ onSave, onClose, onEnterAdmin, defaultLocation }: Props) {
  void onClose;
  const [location, setLocation] = useState<Location>(defaultLocation ?? 'Friedrichshafen');
  const [balance, setBalance] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminInput, setAdminInput] = useState('');
  const [adminError, setAdminError] = useState<'wrong' | 'unavailable' | null>(null);
  const [adminChecking, setAdminChecking] = useState(false);

  function handleSave() {
    const b = parseFloat(balance.replace(',', '.'));
    if (isNaN(b) || b < 0 || !employeeCode.trim()) return;
    onSave(location, b, employeeCode.trim().toUpperCase());
  }

  async function handleAdminSubmit() {
    if (adminChecking) return;
    setAdminChecking(true);
    setAdminError(null);
    try {
      if (await verifyAdminPassword(adminInput)) onEnterAdmin?.();
      else setAdminError('wrong');
    } catch {
      setAdminError('unavailable');
    } finally {
      setAdminChecking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/60 p-4 sm:items-center">
      <div className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl dark:bg-gray-800">
        {!showAdmin ? (
          <>
            <div className="mb-5 flex flex-col items-center gap-3 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg">
                <Store className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Kasseneröffnung</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Bitte eröffnen Sie die Kasse, um mit dem Verkauf zu beginnen.</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <MapPin className="h-4 w-4" /> Standort
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {LOCATIONS.map((loc) => (
                    <button
                      key={loc}
                      onClick={() => setLocation(loc)}
                      className={`rounded-xl py-3 text-sm font-bold transition active:scale-95 ${
                        location === loc
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
                      }`}
                    >
                      {loc}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <Euro className="h-4 w-4" /> Kassen-Anfangsbestand (€)
                </label>
                <input value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="z.B. 150,00" inputMode="decimal" autoFocus
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-base text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100" />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Mitarbeiter-Kürzel
                </label>
                <input value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value.toUpperCase())} placeholder="z.B. AB" maxLength={8} autoCapitalize="characters"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-base font-semibold uppercase text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100" />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Pflichtfeld. Das Kürzel wird bei Verkäufen und Kassenbewegungen gespeichert.</p>
              </div>
              <button onClick={handleSave} disabled={!balance || !employeeCode.trim()}
                className="w-full rounded-xl bg-blue-600 py-3.5 text-base font-bold text-white shadow-md transition hover:bg-blue-700 active:scale-95 disabled:opacity-50">
                <Check className="mr-1.5 inline h-5 w-5" /> Kasse eröffnen
              </button>
              {onEnterAdmin && (
                <button
                  onClick={() => setShowAdmin(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <Settings className="h-4 w-4" /> Verwaltung
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="mb-5 flex flex-col items-center gap-3 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-gray-600 to-gray-800 text-white shadow-lg">
                <Lock className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Verwaltung — Passwort</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Bitte geben Sie das Verwaltungspasswort ein.</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <input
                  type="password"
                  name="admin-gate-secret"
                  autoComplete="new-password"
                  value={adminInput}
                  onChange={(e) => { setAdminInput(e.target.value); setAdminError(null); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdminSubmit()}
                  placeholder="Passwort"
                  autoFocus
                  className={`w-full rounded-xl border px-3 py-3 text-base text-gray-900 focus:outline-none focus:ring-2 dark:bg-gray-900 dark:text-gray-100 ${
                    adminError
                      ? 'border-red-500 focus:ring-red-500/30'
                      : 'border-gray-200 focus:border-blue-500 focus:ring-blue-500/30 dark:border-gray-700'
                  }`}
                />
                {adminError === 'wrong' && (
                  <p className="mt-1.5 flex items-center gap-1 text-sm text-red-500">
                    <X className="h-4 w-4" /> Falsches Passwort
                  </p>
                )}
                {adminError === 'unavailable' && (
                  <p className="mt-1.5 flex items-center gap-1 text-sm text-red-500">
                    <X className="h-4 w-4" /> Prüfung nicht möglich. Bitte Internetverbindung kontrollieren.
                  </p>
                )}
              </div>
              <button
                onClick={handleAdminSubmit}
                disabled={adminChecking}
                className="w-full rounded-xl bg-blue-600 py-3.5 text-base font-bold text-white shadow-md transition hover:bg-blue-700 active:scale-95 disabled:opacity-60"
              >
                {adminChecking ? <Loader2 className="mr-1.5 inline h-5 w-5 animate-spin" /> : <Check className="mr-1.5 inline h-5 w-5" />} Entsperren
              </button>
              <button
                onClick={() => { setShowAdmin(false); setAdminInput(''); setAdminError(null); }}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Zurück zur Kasseneröffnung
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
