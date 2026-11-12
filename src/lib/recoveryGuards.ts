/**
 * Conservative recovery guards. A booking reset defines a new ledger
 * generation; old backup records must never silently reappear after reset.
 * Completed sales cannot be rewritten because pos_transactions is immutable.
 */
interface IdRecord { id: string }

export function recoverableTransactions<T extends IdRecord & { timestamp: number }>(
  backup: T[],
  cloud: T[],
  resetAt: number,
): T[] {
  const cloudIds = new Set(cloud.map((entry) => entry.id));
  const seen = new Set<string>();
  return backup.filter((entry) => {
    if (cloudIds.has(entry.id) || seen.has(entry.id) ||
        !Number.isFinite(entry.timestamp) || entry.timestamp <= resetAt) return false;
    seen.add(entry.id);
    return true;
  });
}

export function recoverableCashSessions<T extends IdRecord & {
  openedAt: number;
  closed?: boolean;
  closedAt?: number;
  dailyCloseFinalizedAt?: number;
  dailyCloseSnapshot?: unknown;
}>(
  backup: T[],
  cloud: T[],
  resetAt: number,
  newestSessionTime: (session: T) => number,
): T[] {
  const cloudById = new Map(cloud.map((entry) => [entry.id, entry]));
  const seen = new Set<string>();
  return backup.filter((entry) => {
    if (seen.has(entry.id) || !Number.isFinite(entry.openedAt) ||
        entry.openedAt <= resetAt) return false;
    seen.add(entry.id);
    const stored = cloudById.get(entry.id);
    if (!stored) return true;
    // Finalized sessions and their snapshots are never overwritten.
    if (stored.closed || stored.closedAt || stored.dailyCloseFinalizedAt ||
        stored.dailyCloseSnapshot) return false;
    return newestSessionTime(entry) > newestSessionTime(stored);
  });
}
