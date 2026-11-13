import { supabase } from '@/lib/supabaseClient';

const DB_NAME = 'tablet-kasse-sync';
const STORE = 'outbox';
const BATCH_SIZE = 100;

export type CloudTable = 'pos_transactions' | 'pos_cash_sessions';

export interface OutboxEntry {
  table: CloudTable;
  row: { id: string; booking_generation: number } & Record<string, unknown>;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { autoIncrement: true });
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

// Removes queued entries from an earlier reset generation. This is deliberately
// persistent: a reset must also neutralize entries stored while the device was offline.
export async function discardEntriesBeforeGeneration(generation: number): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const keysRequest = store.getAllKeys();
  const entriesRequest = store.getAll();
  await transactionDone(tx);

  const keys = keysRequest.result;
  const entries = entriesRequest.result as OutboxEntry[];
  const deleteTx = db.transaction(STORE, 'readwrite');
  const deleteStore = deleteTx.objectStore(STORE);
  entries.forEach((entry, index) => {
    // Missing generations originate from an older app version and are stale.
    if (!Number.isInteger(entry.row.booking_generation) || entry.row.booking_generation < generation) {
      deleteStore.delete(keys[index]);
    }
  });
  await transactionDone(deleteTx);
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
