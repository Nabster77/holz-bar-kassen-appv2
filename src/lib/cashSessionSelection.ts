import type { CashSession, Location } from '@/types';

/** A till is open until its FINAL day close, even across midnight/reload.
 * Only the latest non-discarded session at the selected location matters.
 * Another site's open till must never automatically switch the location.
 */
export function activeSessionForLocation(
  cashSessions: readonly CashSession[],
  selectedLocation: Location,
): CashSession | null {
  let latest: CashSession | null = null;
  for (const session of cashSessions) {
    if (session.discarded || session.location !== selectedLocation) continue;
    if (!latest || session.openedAt > latest.openedAt ||
      (session.openedAt === latest.openedAt && session.closed)) latest = session;
  }
  if (!latest || latest.closed || latest.closedAt ||
    latest.dailyCloseFinalizedAt || latest.dailyCloseSnapshot) return null;
  return latest;
}
