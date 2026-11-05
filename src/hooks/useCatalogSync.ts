import { useCallback, useEffect, useRef, useState } from 'react';
import { createCatalogEngine, type ConflictChoice } from '@/lib/catalogEngine';
import type { CatalogRow } from '@/lib/catalogSync';
import type { Category, PfandSettings, Product } from '@/types';

interface CatalogSyncOptions {
  categories: Category[];
  products: Product[];
  pfandSettings: PfandSettings;
  testMode: boolean;
  applyRows: (rows: CatalogRow[], skipKeys: Set<string>) => void;
}

export function useCatalogSync({ categories, products, pfandSettings, testMode, applyRows }: CatalogSyncOptions) {
  const [conflict, setConflict] = useState<CatalogRow[] | null>(null);

  const localRef = useRef({ categories, products, pfandSettings });
  localRef.current = { categories, products, pfandSettings };
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

  useEffect(() => {
    engine.localChanged();
  }, [engine, categories, products, pfandSettings, testMode]);

  const syncCatalog = useCallback(() => engine.sync(), [engine]);
  const resolveConflict = useCallback((choice: ConflictChoice) => engine.resolveConflict(choice), [engine]);

  return { conflict, syncCatalog, resolveConflict };
}
