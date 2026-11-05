import { useCallback, useEffect, useState } from 'react';
import type { Category, CashSession, CashEntry, CashCorrection, Product, Transaction, Location, PfandSettings } from '@/types';
import { loadJSON, saveJSON, STORAGE_KEYS } from '@/lib/storage';
import { seedCategories, seedProducts, DEFAULT_PFAND_SETTINGS } from '@/lib/seed';
import { formatDateISO } from '@/lib/format';
import type { CloudData } from '@/lib/cloudPull';
import { keyOf, mergeById, PFAND_SETTING_ID, type CatalogKind, type CatalogRow } from '@/lib/catalogSync';
import type { TaxClass } from '@/types';

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function migrateProduct(p: any): Product {
  if (p.taxClass) return p as Product;
  // Legacy product with taxRate: 0|7|19
  const cls: TaxClass = p.taxRate === 7 ? 'reduced' : p.taxRate === 0 ? 'zero' : 'standard';
  const { taxRate, ...rest } = p;
  return { ...rest, taxClass: cls } as Product;
}

export function useStore() {
  const [categories, setCategories] = useState<Category[]>(() => {
    const stored = loadJSON<Category[] | null>(STORAGE_KEYS.categories, null);
    if (stored && stored.length > 0 && stored.every((c) => typeof c.sortOrder === 'number')) return stored;
    return seedCategories;
  });
  const [products, setProducts] = useState<Product[]>(() => {
    const stored = loadJSON<Product[] | null>(STORAGE_KEYS.products, null);
    if (stored && stored.length > 0 && stored.every((p) => p.prices && typeof p.prices === 'object' && p.pfand && typeof p.pfand === 'object')) {
      const migrated = stored.map(migrateProduct);
      if (migrated.some((p, i) => p !== stored[i])) saveJSON(STORAGE_KEYS.products, migrated);
      return migrated;
    }
    return seedProducts;
  });
  const [transactions, setTransactions] = useState<Transaction[]>(() =>
    loadJSON<Transaction[]>(STORAGE_KEYS.transactions, []),
  );
  const [cashSessions, setCashSessions] = useState<CashSession[]>(() => {
    const stored = loadJSON<CashSession[]>(STORAGE_KEYS.cashSessions, []);
    if (stored.length === 0) return stored;
    let changed = false;
    const cleaned = stored.map((s) => {
      const hasStalePfand = s.entries.some((e) => e.isPfandRetoure);
      if (!hasStalePfand) return s;
      changed = true;
      return { ...s, entries: s.entries.filter((e) => !e.isPfandRetoure) };
    });
    if (changed) saveJSON(STORAGE_KEYS.cashSessions, cleaned);
    return cleaned;
  });
  const [selectedLocation, setSelectedLocation] = useState<Location>(() =>
    loadJSON<Location>(STORAGE_KEYS.selectedLocation, 'Friedrichshafen'),
  );
  const [pfandSettings, setPfandSettings] = useState<PfandSettings>(() =>
    loadJSON<PfandSettings>(STORAGE_KEYS.pfandSettings, DEFAULT_PFAND_SETTINGS),
  );

  useEffect(() => saveJSON(STORAGE_KEYS.categories, categories), [categories]);
  useEffect(() => saveJSON(STORAGE_KEYS.products, products), [products]);
  useEffect(() => saveJSON(STORAGE_KEYS.transactions, transactions), [transactions]);
  useEffect(() => saveJSON(STORAGE_KEYS.cashSessions, cashSessions), [cashSessions]);
  useEffect(() => saveJSON(STORAGE_KEYS.selectedLocation, selectedLocation), [selectedLocation]);
  useEffect(() => saveJSON(STORAGE_KEYS.pfandSettings, pfandSettings), [pfandSettings]);

  // Category CRUD
  const addCategory = useCallback((data: Omit<Category, 'id'>) => {
    setCategories((cs) => [...cs, { ...data, id: uid('cat') }].sort((a, b) => a.sortOrder - b.sortOrder));
  }, []);

  const updateCategory = useCallback((id: string, data: Partial<Omit<Category, 'id'>>) => {
    setCategories((cs) =>
      cs.map((c) => (c.id === id ? { ...c, ...data } : c)).sort((a, b) => a.sortOrder - b.sortOrder),
    );
  }, []);

  const deleteCategory = useCallback((id: string) => {
    setCategories((cs) => cs.filter((c) => c.id !== id));
    setProducts((ps) => ps.filter((p) => p.categoryId !== id));
  }, []);

  const reorderCategory = useCallback((id: string, direction: 'up' | 'down') => {
    setCategories((cs) => {
      const sorted = [...cs].sort((a, b) => a.sortOrder - b.sortOrder);
      const idx = sorted.findIndex((c) => c.id === id);
      if (idx < 0) return cs;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sorted.length) return cs;
      [sorted[idx], sorted[swapIdx]] = [sorted[swapIdx], sorted[idx]];
      return sorted.map((c, i) => ({ ...c, sortOrder: i }));
    });
  }, []);

  // Product CRUD
  const addProduct = useCallback((data: Omit<Product, 'id'>) => {
    setProducts((ps) => [...ps, { ...data, id: uid('p') }]);
  }, []);

  const updateProduct = useCallback((id: string, data: Partial<Omit<Product, 'id'>>) => {
    setProducts((ps) => ps.map((p) => (p.id === id ? { ...p, ...data } : p)));
  }, []);

  const deleteProduct = useCallback((id: string) => {
    setProducts((ps) => ps.filter((p) => p.id !== id));
  }, []);

  const reorderProduct = useCallback((id: string, direction: 'up' | 'down') => {
    setProducts((ps) => {
      const sorted = [...ps].sort((a, b) => a.sortOrder - b.sortOrder);
      const idx = sorted.findIndex((p) => p.id === id);
      if (idx < 0) return ps;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sorted.length) return ps;
      [sorted[idx], sorted[swapIdx]] = [sorted[swapIdx], sorted[idx]];
      return sorted.map((p, i) => ({ ...p, sortOrder: i }));
    });
  }, []);

  const moveProductTo = useCallback((sourceId: string, targetId: string) => {
    setProducts((ps) => {
      const sorted = [...ps].sort((a, b) => a.sortOrder - b.sortOrder);
      const sourceIdx = sorted.findIndex((p) => p.id === sourceId);
      const targetIdx = sorted.findIndex((p) => p.id === targetId);
      if (sourceIdx < 0 || targetIdx < 0 || sourceIdx === targetIdx) return ps;
      const [moved] = sorted.splice(sourceIdx, 1);
      sorted.splice(targetIdx, 0, moved);
      return sorted.map((p, i) => ({ ...p, sortOrder: i }));
    });
  }, []);

  // Transaction
  const addTransaction = useCallback((tx: Transaction) => {
    setTransactions((ts) => [tx, ...ts]);
  }, []);

  // Cash session management
  const today = formatDateISO(Date.now());

  const openSessionsToday = cashSessions.filter((s) => s.date === today && !s.closed);
  // Resume the selected till first.  A newly opened browser/device may not
  // have a stored selection yet; when exactly one till is open today, it is
  // unambiguous and should be resumed automatically.
  const activeSession =
    openSessionsToday.find((s) => s.location === selectedLocation) ??
    (openSessionsToday.length === 1 ? openSessionsToday[0] : null);

  useEffect(() => {
    if (activeSession && activeSession.location !== selectedLocation) {
      setSelectedLocation(activeSession.location);
    }
  }, [activeSession, selectedLocation]);

  const openCashSession = useCallback((location: Location, openingBalance: number, employeeCode: string) => {
    setSelectedLocation(location);
    const session: CashSession = {
      id: uid('session'),
      date: formatDateISO(Date.now()),
      location,
      openingBalance,
      openedAt: Date.now(),
      employeeCode,
      corrections: [],
      entries: [],
      closed: false,
    };
    setCashSessions((ss) => [...ss.filter((s) => !(s.date === session.date && s.location === location && !s.closed)), session]);
  }, []);

  const correctOpeningBalance = useCallback((sessionId: string, newAmount: number, reason: string, employeeCode: string) => {
    setCashSessions((ss) =>
      ss.map((s) => {
        if (s.id !== sessionId || s.closed) return s;
        const correction: CashCorrection = {
          id: uid('corr'),
          oldAmount: s.openingBalance,
          newAmount,
          reason,
          timestamp: Date.now(),
          employeeCode,
        };
        return {
          ...s,
          openingBalance: newAmount,
          corrections: [...s.corrections, correction],
        };
      }),
    );
  }, []);

  const addCashEntry = useCallback((sessionId: string, type: 'deposit' | 'withdrawal', amount: number, reason: string, employeeCode: string, isPfandRetoure = false) => {
    const entry: CashEntry = {
      id: uid('entry'),
      type,
      amount,
      reason,
      timestamp: Date.now(),
      employeeCode,
      isPfandRetoure,
    };
    setCashSessions((ss) =>
      ss.map((s) => (s.id === sessionId && !s.closed ? { ...s, entries: [...s.entries, entry] } : s)),
    );
  }, []);

  const closeCashSession = useCallback((sessionId: string, closingBalance: number, closingEmployeeCode?: string) => {
    setCashSessions((ss) =>
      ss.map((s) => {
        if (s.id !== sessionId || s.closed) return s;
        const sessionTx = transactions.filter((t) => {
          const txDate = formatDateISO(t.timestamp);
          return txDate === s.date && t.location === s.location;
        });
        const txTotal = sessionTx.reduce((sum, t) => sum + t.total, 0);
        const deposits = s.entries.filter((e) => e.type === 'deposit').reduce((sum, e) => sum + e.amount, 0);
        const withdrawals = s.entries.filter((e) => e.type === 'withdrawal').reduce((sum, e) => sum + e.amount, 0);
        const expected = s.openingBalance + txTotal + deposits - withdrawals;
        return {
          ...s,
          closed: true,
          closedAt: Date.now(),
          closingBalance,
          expectedBalance: expected,
          difference: closingBalance - expected,
          closingEmployeeCode: closingEmployeeCode || s.employeeCode,
        };
      }),
    );
  }, [transactions]);

  const resetAllData = useCallback(() => {
    setTransactions([]);
    setCashSessions([]);
  }, []);

  const applyCloudBookingReset = useCallback((cutoff: number, generationChanged = false) => {
    // A higher generation means every local booking belongs to the generation
    // before the reset. Do not rely on device clocks here: an offline device
    // may have created an old-generation booking after the server reset.
    if (generationChanged) {
      setTransactions([]);
      setCashSessions([]);
      return;
    }

    // When the generation is already known, keep bookings made afterwards but
    // still remove stale data that a cloud request could have written locally
    // while the reset was in progress.
    setTransactions((ts) => ts.filter((t) => t.timestamp > cutoff));
    setCashSessions((ss) => ss.filter((s) => s.openedAt > cutoff));
  }, []);

  const exportBackup = useCallback(() => {
    const payload = {
      version: 1,
      app: 'tablet-kasse',
      exportedAt: new Date().toISOString(),
      data: { transactions, cashSessions, categories, products },
    };
    return payload;
  }, [transactions, cashSessions, categories, products]);

  const importBackup = useCallback((payload: { data: { transactions?: Transaction[]; cashSessions?: CashSession[]; categories?: Category[]; products?: Product[] } }) => {
    const d = payload.data;
    if (d.transactions) {
      setTransactions((existing) => {
        const ids = new Set(existing.map((t) => t.id));
        const merged = [...existing];
        for (const t of d.transactions!) {
          if (!ids.has(t.id)) merged.push(t);
        }
        return merged.sort((a, b) => b.timestamp - a.timestamp);
      });
    }
    if (d.cashSessions) {
      setCashSessions((existing) => {
        const ids = new Set(existing.map((s) => s.id));
        const merged = [...existing];
        for (const s of d.cashSessions!) {
          if (!ids.has(s.id)) merged.push(s);
        }
        return merged;
      });
    }
    if (d.categories && d.categories.length > 0) {
      setCategories((existing) => {
        const ids = new Set(existing.map((c) => c.id));
        const merged = [...existing];
        for (const c of d.categories!) {
          if (!ids.has(c.id)) merged.push(c);
        }
        return merged.sort((a, b) => a.sortOrder - b.sortOrder);
      });
    }
    if (d.products && d.products.length > 0) {
      setProducts((existing) => {
        const ids = new Set(existing.map((p) => p.id));
        const merged = [...existing];
        for (const p of d.products!) {
          if (!ids.has(p.id)) merged.push(p);
        }
        return merged.sort((a, b) => a.sortOrder - b.sortOrder);
      });
    }
  }, []);

  const mergeCloudData = useCallback((cloud: CloudData) => {
    setTransactions((ts) => {
      const known = new Set(ts.map((t) => t.id));
      const missing = cloud.transactions.filter((t) => !known.has(t.id));
      if (missing.length === 0) return ts;
      return [...ts, ...missing].sort((a, b) => b.timestamp - a.timestamp);
    });
    setCashSessions((ss) => {
      const cloudById = new Map(cloud.cashSessions.map((s) => [s.id, s]));
      const localIds = new Set(ss.map((s) => s.id));
      let changed = false;
      const merged = ss.map((s) => {
        const remote = cloudById.get(s.id);
        if (!remote || !remote.closed || s.closed) return s;
        changed = true;
        return remote;
      });
      const added = cloud.cashSessions.filter((s) => !localIds.has(s.id));
      if (!changed && added.length === 0) return ss;
      return [...merged, ...added];
    });
  }, []);

  const applyCatalogRows = useCallback((rows: CatalogRow[], skipKeys: Set<string>) => {
    const byId = (kind: CatalogKind) => new Map(rows.filter((r) => r.kind === kind).map((r) => [r.id, r]));
    const remoteCategories = byId('category');
    const remoteProducts = byId('product');
    setCategories((cs) => mergeById(cs, remoteCategories, 'category', skipKeys).sort((a, b) => a.sortOrder - b.sortOrder));
    setProducts((ps) => mergeById(ps, remoteProducts, 'product', skipKeys));
    const pfandRow = byId('setting').get(PFAND_SETTING_ID);
    if (pfandRow && !pfandRow.deleted && !skipKeys.has(keyOf('setting', PFAND_SETTING_ID))) {
      setPfandSettings(pfandRow.data as PfandSettings);
    }
  }, []);

  const switchLocation = useCallback((location: Location) => {
    setSelectedLocation(location);
  }, []);

  const updatePfandSettings = useCallback((settings: PfandSettings) => {
    setPfandSettings(settings);
    setProducts((ps) =>
      ps.map((p) =>
        p.isPfandArticle
          ? { ...p, pfand: { Friedrichshafen: settings.Friedrichshafen, Bregenz: settings.Bregenz } }
          : p,
      ),
    );
  }, []);

  const getProductPfand = useCallback((product: Product, loc: Location): number => {
    if (product.isPfandArticle) return pfandSettings[loc];
    return product.pfand?.[loc] ?? 0;
  }, [pfandSettings]);

  return {
    categories,
    products,
    transactions,
    cashSessions,
    activeSession,
    selectedLocation,
    addCategory,
    updateCategory,
    deleteCategory,
    reorderCategory,
    addProduct,
    updateProduct,
    deleteProduct,
    reorderProduct,
    moveProductTo,
    addTransaction,
    openCashSession,
    correctOpeningBalance,
    addCashEntry,
    closeCashSession,
    switchLocation,
    mergeCloudData,
    applyCatalogRows,
    resetAllData,
    applyCloudBookingReset,
    exportBackup,
    importBackup,
    pfandSettings,
    updatePfandSettings,
    getProductPfand,
  };
}

export type Store = ReturnType<typeof useStore>;
