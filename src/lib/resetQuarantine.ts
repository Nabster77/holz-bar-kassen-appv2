import type { OutboxEntry } from '@/lib/outbox';

export type ResetQuarantineEntry = {
  key: string;
  archivedAt: number;
  targetGeneration: number;
  kind: 'pending-outbox' | 'local-snapshot';
  entry?: OutboxEntry;
  transactions?: unknown[];
  cashSessions?: unknown[];
};

/** A reset generation supersedes ALL earlier queued writes, even those with
 * a local device timestamp later than the server reset. Missing generations
 * are legacy entries and must also be preserved rather than discarded. */
export function isStaleOutboxEntry(entry: OutboxEntry, generation: number): boolean {
  return !Number.isInteger(entry.row.booking_generation) ||
    entry.row.booking_generation < generation;
}

export function summarizeResetQuarantine(entries: readonly ResetQuarantineEntry[]) {
  const pendingReceiptIds = new Set<string>();
  const pendingSessionIds = new Set<string>();
  let localSnapshotCount = 0;
  let localReceiptCount = 0;
  for (const record of entries) {
    if (record.kind === 'pending-outbox' && record.entry) {
      if (record.entry.table === 'pos_transactions') pendingReceiptIds.add(record.entry.row.id);
      if (record.entry.table === 'pos_cash_sessions') pendingSessionIds.add(record.entry.row.id);
    }
    if (record.kind === 'local-snapshot') {
      localSnapshotCount++;
      localReceiptCount += record.transactions?.length ?? 0;
    }
  }
  return {
    pendingReceipts: pendingReceiptIds.size,
    pendingSessions: pendingSessionIds.size,
    localSnapshots: localSnapshotCount,
    localReceipts: localReceiptCount,
    archivedEntries: entries.length,
  };
}
