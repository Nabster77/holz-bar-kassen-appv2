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

  useEffect(() => {
    engine.localChanged();
  }, [engine, categories, products, pfandSettings, shotOptions, testMode]);

  const syncCatalog = useCallback(() => engine.sync(), [engine]);
  const resolveConflict = useCallback((choice: ConflictChoice) => engine.resolveConflict(choice), [engine]);

  return { conflict, syncCatalog, resolveConflict, prepareImport: engine.prepareImport, commitImport: engine.commitImport };
}
