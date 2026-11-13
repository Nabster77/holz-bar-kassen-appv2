import type { CashSession, Location } from '../types';

/** A till stays open across midnight and restarts until its explicit final close. */
export function isOpenCashSession(session: CashSession): boolean {
  return !session.discarded && !session.closed && session.closedAt == null &&
    session.dailyCloseFinalizedAt == null && !session.dailyCloseSnapshot;
}

/**
 * Resolve one visible active till per location.
 * If an older still-open session exists, NEVER hide it behind a newer closed
 * session: it must be reconciled, not silently ignored.
 */
export function activeCashSessionsByLocation(sessions: readonly CashSession[]): CashSession[] {
  const latestOpen = new Map<Location, CashSession>();
  for (const session of sessions) {
    if (!isOpenCashSession(session)) continue;
    const previous = latestOpen.get(session.location);
    if (!previous || session.openedAt > previous.openedAt) latestOpen.set(session.location, session);
  }
  return [...latestOpen.values()];
}

/**
 * Hard guard: one active till per site. Every open record blocks a new opening,
 * regardless of date or whether another session was closed more recently.
 */
export function canOpenNewCashSession(sessions: readonly CashSession[], location: Location): boolean {
  return !sessions.some((session) => session.location === location && isOpenCashSession(session));
}
