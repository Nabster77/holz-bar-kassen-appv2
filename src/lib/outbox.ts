import { supabase } from '@/lib/supabaseClient';
import { isStaleOutboxEntry, summarizeResetQuarantine, type ResetQuarantineEntry } from '@/lib/resetQuarantine';

const DB_NAME = 'tablet-kasse-sync';
const STORE = 'outbox';
const QUARANTINE_STORE = 'resetQuarantine';
export const RESET_QUARANTINE_EVENT = 'woodmo-reset-quarantine-updated';
const BATCH_SIZE = 100;

export type CloudTable = 'pos_transactions' | 'pos_cash_sessions';

export interface OutboxEntry {
  table: CloudTable;
  row: { id: string; booking_generation: number } & Record<string, unknown>;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { autoIncrement: true });
      }
      if (!request.result.objectStoreNames.contains(QUARANTINE_STORE)) {
        request.result.createObjectStore(QUARANTINE_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function enqueueEntries(entries: OutboxEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  for (const entry of entries) store.add(entry);
  await transactionDone(tx);
}

// A confirmed backup restore replaces the booking snapshot.  Queued changes
// from before that restore must not be uploaded afterwards.
export async function clearOutbox(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).clear();
  await transactionDone(tx);
}

// An older-generation queue is never silently deleted. Moving records to a
// durable local archive and deleting their old upload requests happen in ONE
// IndexedDB transaction; if archiving fails, the queue is unchanged and the
// generation switch must fail closed. Old records cannot be uploaded into the
// new generation without a separate administrator recovery procedure.
export async function quarantineEntriesBeforeGeneration(
  generation: number,
  localSnapshot?: { transactions: readonly unknown[]; cashSessions: readonly unknown[] },
): Promise<void> {
  if (!Number.isInteger(generation) || generation < 0) throw new Error('Ungültige Buchungsgeneration.');
  const db = await openDb();
  const tx = db.transaction([STORE, QUARANTINE_STORE], 'readwrite');
  const outbox = tx.objectStore(STORE);
  const quarantine = tx.objectStore(QUARANTINE_STORE);
  const archivedAt = Date.now();

  // Protect against a React-state/outbox enqueue race: the complete local
  // snapshot is additionally retained, even when no pending queue row exists.
  if (localSnapshot && (localSnapshot.transactions.length || localSnapshot.cashSessions.length)) {
    const record: ResetQuarantineEntry = {
      key: 'snapshot:generation-' + generation,
      archivedAt, targetGeneration: generation, kind: 'local-snapshot',
      transactions: [...localSnapshot.transactions],
      cashSessions: [...localSnapshot.cashSessions],
    };
    quarantine.put(record);
  }

  const req = outbox.openCursor();
  req.onsuccess = () => {
    const cursor = req.result;
    if (!cursor) return;
    const entry = cursor.value as OutboxEntry;
    if (isStaleOutboxEntry(entry, generation)) {
      const record: ResetQuarantineEntry = {
        key: 'outbox:' + String(cursor.primaryKey),
        archivedAt, targetGeneration: generation,
        kind: 'pending-outbox', entry,
      };
      quarantine.put(record);
      cursor.delete();
    }
    cursor.continue();
  };
  req.onerror = () => tx.abort();
  await transactionDone(tx);
  window.dispatchEvent(new Event(RESET_QUARANTINE_EVENT));
}

// Kept as a compatibility alias for existing reset/restore callers.
// It now archives stale rows atomically instead of destroying them.
export async function discardEntriesBeforeGeneration(generation: number): Promise<void> {
  await quarantineEntriesBeforeGeneration(generation);
}

export async function readResetQuarantine(): Promise<ResetQuarantineEntry[]> {
  const db = await openDb();
  const tx = db.transaction(QUARANTINE_STORE, 'readonly');
  const request = tx.objectStore(QUARANTINE_STORE).getAll();
  await transactionDone(tx);
  return request.result as ResetQuarantineEntry[];
}

export async function readResetQuarantineSummary() {
  return summarizeResetQuarantine(await readResetQuarantine());
}

/** No automatic deletion of quarantined records. The operator can download
 * the original queued rows and full local snapshots for an audited review. */
export async function exportResetQuarantine(): Promise<void> {
  const entries = await readResetQuarantine();
  if (!entries.length) throw new Error('Keine archivierten Offline-Buchungen gefunden.');
  const json = JSON.stringify({
    type: 'woodmo-v3-offline-reset-quarantine',
    version: 1, exportedAt: new Date().toISOString(),
    summary: summarizeResetQuarantine(entries),
    entries,
  }, null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'woodmo-offline-quarantaene-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

// Uploads the oldest queued entries and removes them once the cloud has them.
// Returns how many queue entries were processed; throws when the upload fails.
export async function flushOutbox(): Promise<number> {
  if (!supabase) return 0;
  const db = await openDb();

  const readTx = db.transaction(STORE, 'readonly');
  const store = readTx.objectStore(STORE);
  const keysRequest = store.getAllKeys(null, BATCH_SIZE);
  const entriesRequest = store.getAll(null, BATCH_SIZE);
  await transactionDone(readTx);

  const keys = keysRequest.result;
  const entries = entriesRequest.result as OutboxEntry[];
  if (keys.length === 0) return 0;

  const latestByTable = new Map<CloudTable, Map<string, OutboxEntry['row']>>();
  for (const entry of entries) {
    let rows = latestByTable.get(entry.table);
    if (!rows) {
      rows = new Map();
      latestByTable.set(entry.table, rows);
    }
    rows.set(entry.row.id, entry.row);
  }

  // Never upload a new active till if the cloud already holds a different
  // active till at that location. Prevent partial uploads of sales first.
  // Conflicting offline records remain queued for explicit reconciliation.
  const queuedSessions = [...(latestByTable.get('pos_cash_sessions')?.values() ?? [])];
  const active = (row: OutboxEntry['row']) => {
    const session = row.data as Record<string, unknown> | undefined;
    return session && session.closed !== true && session.discarded !== true &&
      !session.closedAt && !session.dailyCloseFinalizedAt && !session.dailyCloseSnapshot;
  };
  const openingSessions = queuedSessions.filter(active);
  if (openingSessions.length) {
    const locations = [...new Set(openingSessions.map((row) => String(row.location)))];
    const generation = openingSessions[0].booking_generation;
    if (openingSessions.some((row) => row.booking_generation !== generation)) {
      throw new Error('Unterschiedliche Buchungs-Generationen in der Offline-Warteschlange. Reset-Abgleich erforderlich.');
    }
    const { data: cloudSessions, error: readError } = await supabase
      .from('pos_cash_sessions')
      .select('id,location,data')
      .eq('booking_generation', generation)
      .in('location', locations)
      .eq('data->>closed', 'false');
    if (readError) throw readError;
    for (const opening of openingSessions) {
      const otherLocal = openingSessions.find((row) => row.id !== opening.id && row.location === opening.location);
      if (otherLocal) {
        throw new Error(`Zwei verschiedene lokale Kassenöffnungen für ${opening.location}. Keine Daten wurden verworfen.`);
      }
      const otherCloud = (cloudSessions ?? []).find((row) =>
        row.id !== opening.id && active({ id: row.id, booking_generation: generation, location: row.location, data: row.data }));
      if (otherCloud) {
        // A queued close of the old cloud till can legitimately precede the
        // new opening. The close is uploaded first, then the new opening.
        const queuedClose = queuedSessions.find((row) => row.id === otherCloud.id && !active(row));
        if (!queuedClose) {
          throw new Error(`Kassenkonflikt in ${opening.location}: Cloud-Kasse ${otherCloud.id} ist noch offen. Die neue lokale Kasse ${opening.id} bleibt offline gespeichert. Bitte nicht löschen; bestehenden Kassenstatus abgleichen.`);
        }
      }
    }
  }

  // Sessions must be acknowledged before their sales (and before a new
  // session can be safely used on another device).
  for (const table of ['pos_cash_sessions', 'pos_transactions'] as const) {
    const rows = latestByTable.get(table);
    if (!rows?.size) continue;
    const { error } = await supabase.from(table).upsert([...rows.values()], { onConflict: 'id' });
    if (error) throw error;
  }

  const deleteTx = db.transaction(STORE, 'readwrite');
  const deleteStore = deleteTx.objectStore(STORE);
  for (const key of keys) deleteStore.delete(key);
  await transactionDone(deleteTx);

  return keys.length;
}

/**
 * Explicit recovery of a duplicate, unused local till. This does not touch
 * cloud data and never drops receipts. All queued snapshots of the opening
 * must be financially empty; otherwise recovery is refused.
 * The caller must have archived the snapshot BEFORE calling this function.
 */
export async function removeQueuedUnusedCashSession(
  localSessionId: string,
  location: string,
  openedAt: number,
): Promise<OutboxEntry[]> {
  const db = await openDb();
  const read = db.transaction(STORE, 'readonly');
  const keysRequest = read.objectStore(STORE).getAllKeys();
  const entriesRequest = read.objectStore(STORE).getAll();
  await transactionDone(read);
  const keys = keysRequest.result;
  const entries = entriesRequest.result as OutboxEntry[];
  const relevant = entries.filter((entry) =>
    entry.table === 'pos_cash_sessions' && entry.row.id === localSessionId);

  const unsafeReceipt = entries.some((entry) => entry.table === 'pos_transactions' &&
    (entry.row.data as { cashSessionId?: string; timestamp?: number; location?: string } | undefined)?.cashSessionId === localSessionId);
  if (unsafeReceipt) throw new Error('Es gibt noch nicht hochgeladene Verkäufe zu dieser Kasse. Automatische Übernahme gesperrt.');
  // Legacy sales without a session ID cannot be safely reassigned either.
  const legacyReceipt = entries.some((entry) => {
    if (entry.table !== 'pos_transactions') return false;
    const data = entry.row.data as { cashSessionId?: string; timestamp?: number; location?: string } | undefined;
    return data?.location === location && !data.cashSessionId && typeof data.timestamp === 'number' && data.timestamp >= openedAt;
  });
  if (legacyReceipt) throw new Error('Alte, noch nicht synchronisierte Verkäufe erkannt. Übernahme gesperrt.');

  const hasMovements = (entry: OutboxEntry) => {
    const data = entry.row.data as { entries?: unknown[]; corrections?: unknown[];
      closingWithdrawalAmount?: number; dailyCloseSnapshot?: unknown; closed?: boolean;
      activities?: Array<{ type?: string }> } | undefined;
    return !data || (data.entries?.length ?? 0) > 0 || (data.corrections?.length ?? 0) > 0 ||
      Boolean(data.closingWithdrawalAmount || data.dailyCloseSnapshot || data.closed) ||
      (data.activities ?? []).some((activity) => !['cash_opened', 'login', 'logout'].includes(activity.type ?? ''));
  };
  if (relevant.some(hasMovements)) {
    throw new Error('Die lokale Offline-Warteschlange enthält Kassenbewegungen. Übernahme gesperrt.');
  }
  if (!relevant.length) return [];
  const transaction = db.transaction(STORE, 'readwrite');
  const store = transaction.objectStore(STORE);
  entries.forEach((entry, index) => {
    if (entry.table === 'pos_cash_sessions' && entry.row.id === localSessionId) store.delete(keys[index]);
  });
  await transactionDone(transaction);
  return relevant;
}

/** Read-only snapshot of pending entries for an explicit, verified backup. */
export async function readPendingOutbox(): Promise<OutboxEntry[]> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const request = tx.objectStore(STORE).getAll();
  await transactionDone(tx);
  return request.result as OutboxEntry[];
}
