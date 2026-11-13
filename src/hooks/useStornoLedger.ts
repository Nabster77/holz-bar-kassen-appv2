import { useCallback, useEffect, useState } from 'react';
import type { StornoRecord } from '@/lib/stornoRules';
import { loadCloudStornos } from '@/lib/stornoCloud';
import type { CatalogSyncResult } from '@/lib/catalogEngine';

export type StornoCloudState = 'test' | 'loading' | 'ready' | 'offline' | 'unavailable' | 'error';

function isSchemaNotInstalled(message: string): boolean {
  return /pos_stornos|PGRST205|42P01|relation .* does not exist|schema cache/i.test(message);
}

/** Stornos are online-only verified records. Test-mode simulations are
 * ephemeral in memory; no offline outbox or unacknowledged storno is allowed.
 */
export function useStornoLedger(testMode: boolean, online: boolean) {
  const [records, setRecords] = useState<StornoRecord[]>([]);
  const [status, setStatus] = useState<StornoCloudState>(testMode ? 'test' : 'loading');
  const [errorMessage, setErrorMessage] = useState('');

  const refresh = useCallback(async (): Promise<StornoRecord[]> => {
    if (testMode) {
      setStatus('test');
      return records;
    }
    if (!online) {
      setStatus('offline');
      throw new Error('Stornofunktion nur bei bestätigter Cloud-Verbindung verfügbar.');
    }
    try {
      const fetched = await loadCloudStornos();
      setRecords(fetched);
      setStatus('ready');
      setErrorMessage('');
      return fetched;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Stornojournal nicht erreichbar.';
      setErrorMessage(message);
      setStatus(isSchemaNotInstalled(message) ? 'unavailable' : 'error');
      throw error;
    }
  }, [online, testMode, records]);

  useEffect(() => {
    if (testMode) {
      setRecords([]);
      setStatus('test');
      return;
    }
    if (!online) { setStatus('offline'); return; }
    // Freshly retrieved cloud records are authoritative, not local guesses.
    void loadCloudStornos()
      .then((rows) => { setRecords(rows); setStatus('ready'); setErrorMessage(''); })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Stornojournal nicht erreichbar.';
        setErrorMessage(message);
        setStatus(isSchemaNotInstalled(message) ? 'unavailable' : 'error');
      });
  }, [online, testMode]);

  useEffect(() => {
    if (testMode || !online) return;
    const id = window.setInterval(() => {
      void loadCloudStornos()
        .then((rows) => { setRecords(rows); setStatus('ready'); setErrorMessage(''); })
        .catch((error) => {
          const message = error instanceof Error ? error.message : 'Stornojournal nicht erreichbar.';
          setErrorMessage(message);
          setStatus(isSchemaNotInstalled(message) ? 'unavailable' : 'error');
        });
    }, 30_000);
    return () => window.clearInterval(id);
  }, [testMode, online]);

  const addSimulatedRecord = useCallback((item: StornoRecord) => {
    if (!testMode) throw new Error('Simulationen dürfen niemals in eine aktive Kasse übernommen werden.');
    setRecords((current) => [...current, item]);
  }, [testMode]);

  return { records, status, errorMessage, refresh, addSimulatedRecord };
}
