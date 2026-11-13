import type { CashSession, Location } from '../types';

/**
 * A cash session belongs to its opening event, not just its opening date.
 * Keep the latest non-discarded session per location even when midnight passes.
 * An older open record must not supersede a newer finalized session.
 */
export function activeCashSessionsByLocation(sessions: readonly CashSession[]): CashSession[] {
  const latest = new Map<Location, CashSession>();
  for (const session of sessions) {
    if (session.discarded) continue;
    const previous = latest.get(session.location);
    if (!previous || session.openedAt > previous.openedAt ||
        (session.openedAt === previous.openedAt && session.closed && !previous.closed)) {
      latest.set(session.location, session);
    }
  }
  return [...latest.values()].filter((session) =>
    !session.closed && session.closedAt == null &&
    session.dailyCloseFinalizedAt == null && !session.dailyCloseSnapshot);
}

/** Opening a new till is forbidden if its latest session is still active. */
export function canOpenNewCashSession(sessions: readonly CashSession[], location: Location): boolean {
  return !activeCashSessionsByLocation(sessions).some((session) => session.location === location);
}
