import { useCallback, useEffect, useRef, useState } from 'react';
import type { CashSession, Transaction } from '@/types';
import { supabase } from '@/lib/supabaseClient';
import { discardEntriesBeforeGeneration, enqueueEntries, flushOutbox, type OutboxEntry } from '@/lib/outbox';
import { loadJSON, saveJSON, STORAGE_KEYS } from '@/lib/storage';
import { fetchCloudData, type CloudData } from '@/lib/cloudPull';
import { fetchLatestBookingReset, knownBookingReset, rememberBookingReset } from '@/lib/bookingReset';
import type { CatalogSyncResult } from '@/lib/catalogEngine';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const PING_INTERVAL_MS = 15_000;
const PING_TIMEOUT_MS = 5_000;
const FLUSH_INTERVAL_MS = 30_000;

export interface SyncResult {
  ok: boolean;
  error?: string;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

async function isReachable(): Promise<boolean> {
  if (!navigator.onLine) return false;
  if (!SUPABASE_URL) return true;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
      headers: { apikey: SUPABASE_ANON_KEY },
    });
    // Any HTTP answer below 500 proves the server is reachable; the ping endpoint answers 401 without a session.
    return response.status < 500;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

function transactionEntry(t: Transaction): OutboxEntry {
  return { table: 'pos_transactions', row: { id: t.id, booking_generation: knownBookingReset().generation, location: t.location, timestamp: t.timestamp, data: t } };
}

function sessionEntry(s: CashSession): OutboxEntry {
  return { table: 'pos_cash_sessions', row: { id: s.id, booking_generation: knownBookingReset().generation, location: s.location, date: s.date, data: s } };
}

interface Snapshot {
  txIds: Set<string>;
  sessions: Map<string, CashSession>;
}

function snapshotOf(transactions: Transaction[], cashSessions: CashSession[]): Snapshot {
  return {
    txIds: new Set(transactions.map((t) => t.id)),
    sessions: new Map(cashSessions.map((s) => [s.id, s])),
  };
}

// Returns whether the app can reach the cloud. The reset marker is always
// reconciled before upload, so an offline queue cannot revive deleted bookings.
async function uploadPendingChanges(reconcileReset: () => Promise<void>, pullCloudData: () => Promise<void>): Promise<SyncResult> {
  try {
    await reconcileReset();
    let processed = await flushOutbox();
    while (processed > 0) processed = await flushOutbox();
    await pullCloudData();
    return { ok: true };
  } catch (err) {
    console.warn('Cloud-Sync pausiert, neuer Versuch folgt automatisch.', err);
    return { ok: false, error: errorMessage(err) };
  }
}

export function useCloudSync(
  transactions: Transaction[],
  cashSessions: CashSession[],
  testMode: boolean,
  onReconnectSynced: () => void,
  mergeCloudData: (cloud: CloudData) => void,
  syncCatalog: () => Promise<CatalogSyncResult>,
  applyCloudBookingReset: (cutoff: number, generationChanged?: boolean) => void,
): {
  online: boolean;
  syncNow: () => Promise<SyncResult>;
  pauseSyncForRestore: () => Promise<void>;
  resumeSyncAfterRestore: () => void;
} {
  const [online, setOnline] = useState(navigator.onLine);
  const inFlightRef = useRef<Promise<SyncResult> | null>(null);
  const offlineSinceRef = useRef(false);
  const snapshotRef = useRef<Snapshot | null>(null);
  const newestPulledRef = useRef<number | null>(null);
  const restorePausedRef = useRef(false);
  const rebaseAfterRestoreRef = useRef(false);
  const onReconnectSyncedRef = useRef(onReconnectSynced);
  onReconnectSyncedRef.current = onReconnectSynced;

  const flush = useCallback((): Promise<SyncResult> => {
    if (!supabase) return Promise.resolve({ ok: false, error: 'Cloud ist nicht konfiguriert.' });
    if (restorePausedRef.current || rebaseAfterRestoreRef.current) {
      return Promise.resolve({ ok: true });
    }
    inFlightRef.current ??= (async () => {
      const catalogResult = await syncCatalog();
      const bookingResult = await uploadPendingChanges(async () => {
      if (testMode) return;
      const latestReset = await fetchLatestBookingReset();
      if (latestReset !== null) {
        const known = knownBookingReset();
        const generationChanged = latestReset.generation > known.generation;
        // Apply even when already known: it repairs stale local state written by
        // a cloud request that began before a completed reset. A new generation
        // clears every local booking, including entries created offline after the
        // reset timestamp but before this device learned about the reset.
        // Restored bookings retain their original dates but belong to the
        // current generation. Reapplying the cutoff would remove them on
        // every sync, only for the following pull to add them again.
        if (generationChanged || latestReset.resetAt > known.resetAt) {
          applyCloudBookingReset(latestReset.resetAt, generationChanged);
        }
        if (generationChanged) {
          await discardEntriesBeforeGeneration(latestReset.generation);
        }
        if (generationChanged || latestReset.resetAt > known.resetAt) {
          rememberBookingReset(latestReset);
        }
        newestPulledRef.current = null;
      }
      }, async () => {
      if (testMode) return;
      const generation = knownBookingReset().generation;
      const cloud = await fetchCloudData(newestPulledRef.current, generation);
      // A reset may have completed while this request was in flight. Such a
      // response must never be merged back into local state.
      if (cloud.generation !== knownBookingReset().generation) return;
      mergeCloudData(cloud);
      if (cloud.newestTransactionTimestamp !== null) {
        newestPulledRef.current = Math.max(newestPulledRef.current ?? 0, cloud.newestTransactionTimestamp);
      }
      });
      if (!bookingResult.ok) return bookingResult;
      if (!catalogResult.ok) {
        return { ok: false, error: `Artikel-Synchronisierung: ${catalogResult.error ?? 'Unbekannter Fehler.'}` };
      }
      return bookingResult;
    })().finally(() => {
      inFlightRef.current = null;
    });
    return inFlightRef.current;
  }, [testMode, mergeCloudData, applyCloudBookingReset]);

  const pauseSyncForRestore = useCallback(async () => {
    restorePausedRef.current = true;
    const activeSync = inFlightRef.current;
    if (activeSync) await activeSync.catch(() => undefined);
  }, []);

  const resumeSyncAfterRestore = useCallback(() => {
    rebaseAfterRestoreRef.current = true;
    restorePausedRef.current = false;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const ok = await isReachable();
      if (!cancelled) setOnline(ok);
    };
    void check();
    const id = window.setInterval(check, PING_INTERVAL_MS);
    window.addEventListener('online', check);
    window.addEventListener('offline', check);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener('online', check);
      window.removeEventListener('offline', check);
    };
  }, []);

  useEffect(() => {
    if (!online) {
      offlineSinceRef.current = true;
      return;
    }
    let cancelled = false;
    const syncAfterReconnect = async () => {
      const result = await flush();
      if (result.ok && offlineSinceRef.current && !cancelled) {
        offlineSinceRef.current = false;
        onReconnectSyncedRef.current();
      }
    };
    void syncAfterReconnect();
    const id = window.setInterval(() => {
      void flush();
    }, FLUSH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [online, flush, syncCatalog]);

  useEffect(() => {
    if (testMode || !supabase) return;

    if (restorePausedRef.current || rebaseAfterRestoreRef.current) {
      snapshotRef.current = snapshotOf(transactions, cashSessions);
      rebaseAfterRestoreRef.current = false;
      return;
    }

    const previous = snapshotRef.current;
    if (!previous) {
      snapshotRef.current = snapshotOf(transactions, cashSessions);
      if (loadJSON<boolean>(STORAGE_KEYS.cloudBackfilled, false)) return;
      const everything = [...transactions.map(transactionEntry), ...cashSessions.map(sessionEntry)];
      enqueueEntries(everything)
        .then(() => saveJSON(STORAGE_KEYS.cloudBackfilled, true))
        .then(flush)
        .catch((err) => console.error('Cloud-Übertragung der bestehenden Daten fehlgeschlagen.', err));
      return;
    }

    const newTransactions = transactions.filter((t) => !previous.txIds.has(t.id));
    const changedSessions = cashSessions.filter((s) => previous.sessions.get(s.id) !== s);
    snapshotRef.current = snapshotOf(transactions, cashSessions);

    const entries = [...newTransactions.map(transactionEntry), ...changedSessions.map(sessionEntry)];
    if (entries.length === 0) return;
    enqueueEntries(entries)
      .then(flush)
      .catch((err) => console.error('Speichern in der Warteschlange fehlgeschlagen.', err));
  }, [transactions, cashSessions, testMode, flush]);

  return { online, syncNow: flush, pauseSyncForRestore, resumeSyncAfterRestore };
}
