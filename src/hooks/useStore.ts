import { canDiscardCashSession } from '@/lib/cashBalanceCarry';
import { useCallback, useEffect, useState } from 'react';
import { sessionTransactions } from '@/lib/sessionTransactions';
import type { Category, CashSession, CashEntry, CashCorrection, Product, Transaction, Location, PfandSettings, StaffActivity, StaffUser, ShotOption } from '@/types';
import { loadJSON, saveJSON, STORAGE_KEYS } from '@/lib/storage';
import { seedCategories, seedProducts, DEFAULT_PFAND_SETTINGS } from '@/lib/seed';
import { formatDateISO } from '@/lib/format';
import type { CloudData } from '@/lib/cloudPull';
import { keyOf, mergeById, PFAND_SETTING_ID, type CatalogKind, type CatalogRow } from '@/lib/catalogSync';
import type { TaxClass } from '@/types';
import { DEFAULT_SHOTS, SHOT_CATEGORY_ID, SHOT_SETTING_ID, normalizeCategories, validShots } from '@/lib/shotCatalog';

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
    if (stored && stored.length > 0 && stored.every((c) => typeof c.sortOrder === 'number')) return normalizeCategories(stored);
    return normalizeCategories(seedCategories);
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

  const [shotOptions, setShotOptions] = useState<ShotOption[]>(() => {
    const stored = loadJSON<unknown>(STORAGE_KEYS.shotOptions, null);
    return validShots(stored) ? stored : DEFAULT_SHOTS;
  });
  useEffect(() => saveJSON(STORAGE_KEYS.shotOptions, shotOptions), [shotOptions]);
  useEffect(() => saveJSON(STORAGE_KEYS.categories, categories), [categories]);
  useEffect(() => saveJSON(STORAGE_KEYS.products, products), [products]);
  useEffect(() => saveJSON(STORAGE_KEYS.transactions, transactions), [transactions]);
  useEffect(() => saveJSON(STORAGE_KEYS.cashSessions, cashSessions), [cashSessions]);
  useEffect(() => saveJSON(STORAGE_KEYS.selectedLocation, selectedLocation), [selectedLocation]);
  useEffect(() => saveJSON(STORAGE_KEYS.pfandSettings, pfandSettings), [pfandSettings]);

  // Category CRUD
  const addCategory = useCallback((data: Omit<Category, 'id'>) => {
    if (data.name.trim().toUpperCase() === 'SCHUSS') return;
    setCategories((cs) => normalizeCategories([...cs, { ...data, id: uid('cat') }]));
  }, []);

  const updateCategory = useCallback((id: string, data: Partial<Omit<Category, 'id'>>) => {
    if (id === SHOT_CATEGORY_ID || data.name?.trim().toUpperCase() === 'SCHUSS') return;
    setCategories((cs) => normalizeCategories(cs.map((c) => (c.id === id ? { ...c, ...data } : c))));
  }, []);

  const deleteCategory = useCallback((id: string) => {
    if (id === SHOT_CATEGORY_ID) return;
    setCategories((cs) => cs.filter((c) => c.id !== id));
    setProducts((ps) => ps.filter((p) => p.categoryId !== id));
  }, []);

  const reorderCategory = useCallback((id: string, direction: 'up' | 'down') => {
    if (id === SHOT_CATEGORY_ID) return;
    setCategories((cs) => {
      const sorted = [...cs.filter((c) => c.id !== SHOT_CATEGORY_ID)].sort((a, b) => a.sortOrder - b.sortOrder);
      const idx = sorted.findIndex((c) => c.id === id);
      if (idx < 0) return cs;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sorted.length) return cs;
      [sorted[idx], sorted[swapIdx]] = [sorted[swapIdx], sorted[idx]];
      return normalizeCategories(sorted.map((c, i) => ({ ...c, sortOrder: i })));
    });
  }, []);

  const moveCategoryTo = useCallback((sourceId: string, targetId: string) => {
    if (sourceId === SHOT_CATEGORY_ID || targetId === SHOT_CATEGORY_ID) return;
    setCategories((cs) => {
      const sorted = [...cs.filter(c => c.id !== SHOT_CATEGORY_ID)].sort((a, b) => a.sortOrder - b.sortOrder);
      const sourceIdx = sorted.findIndex(c => c.id === sourceId);
      const targetIdx = sorted.findIndex(c => c.id === targetId);
      if (sourceIdx < 0 || targetIdx < 0 || sourceIdx === targetIdx) return cs;
      const [moved] = sorted.splice(sourceIdx, 1);
      sorted.splice(targetIdx, 0, moved);
      const shot = cs.filter(c => c.id === SHOT_CATEGORY_ID);
      return normalizeCategories([...sorted.map((c, i) => ({ ...c, sortOrder: i })), ...shot]);
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

  // Only the latest session at each location may be resumed. Older open
  // records from a restore must not reappear after a newer daily close.
  const latestSessionsToday = new Map<Location, CashSession>();
  for (const session of cashSessions.filter((s) => s.date === today && !s.discarded)) {
    const latest = latestSessionsToday.get(session.location);
    if (!latest || session.openedAt > latest.openedAt ||
        (session.openedAt === latest.openedAt && session.closed)) {
      latestSessionsToday.set(session.location, session);
    }
  }
  const openSessionsToday = [...latestSessionsToday.values()].filter((s) =>
    !s.closed && !s.closedAt && !s.dailyCloseFinalizedAt && !s.dailyCloseSnapshot);
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

  const openCashSession = useCallback((location: Location, openingBalance: number, staff?: StaffUser) => {
    if (!Number.isFinite(openingBalance) || openingBalance <= 0) return;
    setSelectedLocation(location);
    const openedAt = Date.now();
    const session: CashSession = {
      id: uid('session'),
      date: formatDateISO(Date.now()),
      location,
      openingBalance,
      openedAt,
      corrections: [],
      entries: [],
      closed: false,
      openedById: staff?.id,
      openedByName: staff?.name,
      activities: staff ? [{ id: uid('activity'), type: 'cash_opened', staffId: staff.id, staffName: staff.name, timestamp: openedAt, amount: openingBalance }] : [],
      staffLoginIntervals: staff ? [{ id: uid('staff-login'), staffId: staff.id, staffName: staff.name, loginAt: openedAt }] : [],
    };
    setCashSessions((ss) => {
      const latest = ss.filter(s => s.date === session.date && s.location === location && !s.discarded)
        .sort((a, b) => b.openedAt - a.openedAt)[0];
      if (latest && !latest.closed && !latest.closedAt && !latest.dailyCloseSnapshot && !latest.dailyCloseFinalizedAt) return ss;
      return [...ss, session];
    });
  }, []);

  const correctOpeningBalance = useCallback((sessionId: string, newAmount: number, reason: string, staff?: StaffUser) => {
    if (!Number.isFinite(newAmount) || newAmount <= 0 || !reason.trim()) return;
    setCashSessions((ss) =>
      ss.map((s) => {
        if (s.id !== sessionId || s.closed) return s;
        const correction: CashCorrection = {
          id: uid('corr'),
          oldAmount: s.openingBalance,
          newAmount,
          reason,
          timestamp: Date.now(),
          employeeId: staff?.id,
          employeeName: staff?.name,
        };
        return {
          ...s,
          openingBalance: newAmount,
          corrections: [...s.corrections, correction],
          activities: staff ? [...(s.activities ?? []), { id: uid('activity'), type: 'correction', staffId: staff.id, staffName: staff.name, timestamp: correction.timestamp, reason }] : s.activities,
        };
      }),
    );
  }, []);

  const addCashEntry = useCallback((sessionId: string, type: 'deposit' | 'withdrawal', amount: number, reason: string, isPfandRetoure = false, staff?: StaffUser) => {
    const entry: CashEntry = {
      id: uid('entry'),
      type,
      amount,
      reason,
      timestamp: Date.now(),
      isPfandRetoure,
      employeeId: staff?.id,
      employeeName: staff?.name,
    };
    setCashSessions((ss) =>
      ss.map((s) => (s.id === sessionId && !s.closed ? { ...s, entries: [...s.entries, entry], activities: staff ? [...(s.activities ?? []), { id: uid('activity'), type, staffId: staff.id, staffName: staff.name, timestamp: entry.timestamp, amount, reason }] : s.activities } : s)),
    );
  }, []);

  const closeCashSession = useCallback((
    sessionId: string,
    closingBalance: number,
    staff?: StaffUser,
    closingWithdrawalAmount = 0,
    finalization?: {
      closedAt: number;
      receipt: { number: number; location: Location; year: number };
      snapshot: NonNullable<CashSession['dailyCloseSnapshot']>;
    },
  ) => {
    const closedAt = finalization?.closedAt ?? Date.now();
    setCashSessions((ss) =>
      ss.map((s) => {
        if (s.id !== sessionId || s.closed) return s;
        const finalWithdrawal = closingWithdrawalAmount > 0 ? {
          id: uid('entry'),
          type: 'withdrawal' as const,
          amount: closingWithdrawalAmount,
          reason: 'Entnahme zum Tagesabschluss',
          timestamp: closedAt,
          isClosingWithdrawal: true,
          employeeId: staff?.id,
          employeeName: staff?.name,
        } satisfies CashEntry : null;
        const entries = finalWithdrawal ? [...s.entries, finalWithdrawal] : s.entries;
        const sessionTx = sessionTransactions(transactions, s, closedAt);
        const cashTxTotal = sessionTx.filter((transaction) => transaction.paymentMethod === 'cash').reduce((sum, t) => sum + t.total, 0);
        const deposits = entries.filter((e) => e.type === 'deposit').reduce((sum, e) => sum + e.amount, 0);
        const withdrawals = entries.filter((e) => e.type === 'withdrawal').reduce((sum, e) => sum + e.amount, 0);
        const expected = Math.round((s.openingBalance + cashTxTotal + deposits - withdrawals) * 100) / 100;
        return {
          ...s,
          closed: true,
          closedAt,
          // The persisted remainder is derived from all booked movements,
          // including the final withdrawal. This prevents an old/manual value
          // from becoming the next opening balance.
          closingBalance: expected,
          expectedBalance: expected,
          difference: closingBalance - expected,
          closingWithdrawalAmount,
          entries,
          closedById: staff?.id,
          closedByName: staff?.name,
          // These values are written together with the first and only closed
          // cloud version. A closed cash session is deliberately immutable.
          dailyCloseReceiptNumber: finalization?.receipt.number,
          dailyCloseReceiptLocation: finalization?.receipt.location,
          dailyCloseReceiptYear: finalization?.receipt.year,
          dailyCloseFinalizedAt: finalization?.closedAt,
          dailyCloseFinalizedById: staff?.id,
          dailyCloseFinalizedByName: staff?.name,
          dailyCloseSnapshot: finalization?.snapshot,
          activities: staff ? [...(s.activities ?? []), ...(finalWithdrawal ? [{ id: uid('activity'), type: 'withdrawal' as const, staffId: staff.id, staffName: staff.name, timestamp: closedAt, amount: closingWithdrawalAmount, reason: finalWithdrawal.reason }] : []), { id: uid('activity'), type: 'cash_closed', staffId: staff.id, staffName: staff.name, timestamp: closedAt, amount: expected }] : s.activities,
          // An employee still logged in at final close receives a real end
          // time; this also safely closes a period after a browser interruption.
          staffLoginIntervals: (s.staffLoginIntervals ?? []).map((interval) => interval.logoutAt ? interval : { ...interval, logoutAt: closedAt }),
        };
      }),
    );
  }, [transactions]);

  const setDailyCloseReceipt = useCallback((sessionId: string, receiptNumber: number, location: Location, year: number, finalizedBy?: Pick<StaffUser, 'id' | 'name'>) => {
    setCashSessions((sessions) => sessions.map((session) => {
      if (session.id !== sessionId) return session;
      return {
        ...session,
        dailyCloseReceiptNumber: receiptNumber,
        dailyCloseReceiptLocation: location,
        dailyCloseReceiptYear: year,
        dailyCloseFinalizedAt: session.closedAt ?? Date.now(),
        dailyCloseFinalizedById: finalizedBy?.id ?? session.closedById,
        dailyCloseFinalizedByName: finalizedBy?.name ?? session.closedByName,
      };
    }));
  }, []);

  const setDailyCloseSnapshot = useCallback((sessionId: string, snapshot: NonNullable<CashSession['dailyCloseSnapshot']>) => {
    setCashSessions((sessions) => sessions.map((session) => session.id === sessionId
      ? { ...session, dailyCloseSnapshot: snapshot }
      : session));
  }, []);

  const recordStaffActivity = useCallback((sessionId: string, activity: StaffActivity) => {
    setCashSessions((ss) => ss.map((session) => {
      if (session.id !== sessionId || session.closed) return session;
      const intervals = [...(session.staffLoginIntervals ?? [])];
      if (activity.type === 'login') {
        const alreadyOpen = intervals.some((interval) => interval.staffId === activity.staffId && interval.logoutAt === undefined);
        if (!alreadyOpen) intervals.push({ id: `staff-login-${activity.id}`, staffId: activity.staffId, staffName: activity.staffName, loginAt: activity.timestamp });
      } else if (activity.type === 'logout') {
        for (let index = intervals.length - 1; index >= 0; index -= 1) {
          const interval = intervals[index];
          if (interval.staffId === activity.staffId && interval.logoutAt === undefined) {
            intervals[index] = { ...interval, logoutAt: Math.max(activity.timestamp, interval.loginAt) };
            break;
          }
        }
      }
      return { ...session, activities: [...(session.activities ?? []), activity], staffLoginIntervals: intervals };
    }));
  }, []);

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
      version: 2,
      app: 'tablet-kasse',
      exportedAt: new Date().toISOString(),
      data: { transactions, cashSessions, categories, products, pfandSettings, shotOptions, selectedLocation },
    };
    return payload;
  }, [transactions, cashSessions, categories, products, pfandSettings, shotOptions, selectedLocation]);

  const importBackup = useCallback((payload: { data: { transactions?: Transaction[]; cashSessions?: CashSession[]; categories?: Category[]; products?: Product[]; pfandSettings?: PfandSettings; shotOptions?: ShotOption[]; selectedLocation?: Location } }) => {
    const d = payload.data;
    if (d.transactions) setTransactions([...d.transactions].sort((a, b) => b.timestamp - a.timestamp));
    if (d.cashSessions) setCashSessions(d.cashSessions);
    if (d.categories) setCategories(normalizeCategories(d.categories));
    if (d.products) setProducts([...d.products].sort((a, b) => a.sortOrder - b.sortOrder));
    if (d.pfandSettings) setPfandSettings(d.pfandSettings);
    if (validShots(d.shotOptions)) setShotOptions(d.shotOptions);
    if (d.selectedLocation) setSelectedLocation(d.selectedLocation);
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
        if (!remote || !remote.closed) return s;
        // A previously closed session can still gain its central receipt
        // number on another device. Never let the older local copy hide it.
        if (s.closed && !remote.dailyCloseReceiptNumber) return s;
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
    setCategories((cs) => normalizeCategories(mergeById(cs, remoteCategories, 'category', skipKeys)));

    setProducts((ps) => mergeById(ps, remoteProducts, 'product', skipKeys));
    const pfandRow = byId('setting').get(PFAND_SETTING_ID);
    if (pfandRow && !pfandRow.deleted && !skipKeys.has(keyOf('setting', PFAND_SETTING_ID))) {
      setPfandSettings(pfandRow.data as PfandSettings);
    }
    const shotRow = byId('setting').get(SHOT_SETTING_ID);
    if (shotRow && !shotRow.deleted && !skipKeys.has(keyOf('setting', SHOT_SETTING_ID)) && validShots(shotRow.data)) {
      setShotOptions(shotRow.data);
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
    shotOptions,
    updateShotOptions: (next: ShotOption[]) => { if (validShots(next)) setShotOptions(next); },
    transactions,
    cashSessions,
    activeSession,
    selectedLocation,
    addCategory,
    updateCategory,
    deleteCategory,
    reorderCategory,
    moveCategoryTo,
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
    setDailyCloseReceipt,
    setDailyCloseSnapshot,
    recordStaffActivity,
    switchLocation,
    mergeCloudData,
    applyCatalogRows,
    resetAllData,
    discardEmptySession: (id: string) => setCashSessions((sessions) => sessions.map((session) => session.id === id && canDiscardCashSession(session, transactions) ? { ...session, closed: true, discarded: true } : session)),
    applyCloudBookingReset,
    exportBackup,
    importBackup,
    pfandSettings,
    updatePfandSettings,
    getProductPfand,
  };
}

export type Store = ReturnType<typeof useStore>;
