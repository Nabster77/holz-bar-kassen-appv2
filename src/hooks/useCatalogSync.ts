import { useCallback, useEffect, useRef, useState } from 'react';
import { createCatalogEngine, type ConflictChoice } from '@/lib/catalogEngine';
import type { CatalogRow } from '@/lib/catalogSync';
import type { Category, PfandSettings, Product, ShotOption } from '@/types';

interface CatalogSyncOptions {
  categories: Category[];
  products: Product[];
  pfandSettings: PfandSettings;
  shotOptions: ShotOption[];
  testMode: boolean;
  applyRows: (rows: CatalogRow[], skipKeys: Set<string>) => void;
}

export function useCatalogSync({ categories, products, pfandSettings, shotOptions, testMode, applyRows }: CatalogSyncOptions) {
  const [conflict, setConflict] = useState<CatalogRow[] | null>(null);
  const [syncStatus, setSyncStatus] = useState<'pending' | 'syncing' | 'saved' | 'error'>('pending');
  const revision = useRef(0);

  const localRef = useRef({ categories, products, pfandSettings, shotOptions });
  localRef.current = { categories, products, pfandSettings, shotOptions };
  const applyRef = useRef(applyRows);
  applyRef.current = applyRows;
  const testModeRef = useRef(testMode);
  testModeRef.current = testMode;

  const [engine] = useState(() =>
    createCatalogEngine({
      getLocal: () => localRef.current,
      applyRows: (rows, skipKeys) => applyRef.current(rows, skipKeys),
      setConflict,
      isEnabled: () => !testModeRef.current,
    }),
  );

  const syncCatalog = useCallback(async () => {
    if (testModeRef.current) return { ok: false, error: 'Im Testmodus ist die Cloud-Synchronisierung deaktiviert.' };
    const startedAt = revision.current;
    setSyncStatus('syncing');
    const result = await engine.sync();
    if (revision.current === startedAt) setSyncStatus(result.ok ? 'saved' : 'error');
    return result;
  }, [engine]);

  useEffect(() => {
    engine.localChanged();
    if (testMode) return;
    const current = ++revision.current;
    setSyncStatus('pending');
    // Allow rapid field edits to settle before verifying the automatic cloud sync.
    const timer = window.setTimeout(() => {
      if (revision.current === current) void syncCatalog();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [engine, categories, products, pfandSettings, shotOptions, testMode, syncCatalog]);

  useEffect(() => {
    if (testMode) return;
    // Retry pending uploads after reconnect and periodically when the app stays open.
    const retry = () => { void syncCatalog(); };
    window.addEventListener('online', retry);
    const interval = window.setInterval(retry, 30_000);
    return () => {
      window.removeEventListener('online', retry);
      window.clearInterval(interval);
    };
  }, [syncCatalog, testMode]);
  const resolveConflict = useCallback((choice: ConflictChoice) => engine.resolveConflict(choice), [engine]);

  return { conflict, syncStatus, syncCatalog, resolveConflict, prepareImport: engine.prepareImport, commitImport: engine.commitImport };
}
