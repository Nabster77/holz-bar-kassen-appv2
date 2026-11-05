import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Loader2, RefreshCw, X } from 'lucide-react';
import type { SyncResult } from '@/hooks/useCloudSync';

type Status = 'syncing' | 'success' | 'error';

interface Props {
  syncNow: () => Promise<SyncResult>;
  onClose: () => void;
}

export function SyncDialog({ syncNow, onClose }: Props) {
  const [status, setStatus] = useState<Status>('syncing');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function applyResult(result: SyncResult) {
    setStatus(result.ok ? 'success' : 'error');
    setErrorMessage(result.error ?? null);
  }

  useEffect(() => {
    let cancelled = false;
    syncNow()
      .then((result) => {
        if (!cancelled) applyResult(result);
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error');
          setErrorMessage('Unbekannter Fehler bei der Synchronisierung.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [syncNow]);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-end bg-black/30 p-4 pt-16" onClick={onClose}>
      <div
        className="w-full max-w-xs rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl dark:border-gray-700 dark:bg-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Synchronisierung</h3>
          <button
            onClick={onClose}
            aria-label="Schließen"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {status === 'syncing' && (
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400" />
            <p className="text-sm text-gray-600 dark:text-gray-300">Synchronisiere Daten…</p>
          </div>
        )}

        {status === 'success' && (
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Erfolgreich synchronisiert.</p>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Fehler – erneuter Versuch</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Die Daten bleiben auf diesem Gerät gespeichert und werden automatisch erneut hochgeladen.</p>
                {errorMessage && <p className="break-words text-xs text-red-600 dark:text-red-400">Fehlermeldung: {errorMessage}</p>}
              </div>
            </div>
            <button
              onClick={() => {
                setStatus('syncing');
                setErrorMessage(null);
                syncNow()
                  .then(applyResult)
                  .catch(() => {
                    setStatus('error');
                    setErrorMessage('Unbekannter Fehler bei der Synchronisierung.');
                  });
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 active:scale-95"
            >
              <RefreshCw className="h-4 w-4" /> Erneut versuchen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
