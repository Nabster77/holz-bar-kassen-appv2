/**
 * A cash session records absolute Unix-millisecond instants, independently
 * of the screen's current date and the device's timezone.
 * Both WOODMO locations use the Europe/Berlin civil timezone (CET/CEST).
 */
const timestampFormat = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function formatCashSessionTimestamp(at: number): string {
  if (!Number.isFinite(at)) throw new Error('Ungültiger Kassensitzungs-Zeitstempel.');
  return timestampFormat.format(new Date(at)) + ' Uhr';
}

export function verifiedCloseTimestamp(session: {
  closedAt?: number;
  dailyCloseFinalizedAt?: number;
  dailyCloseSnapshot?: { finalizedAt: number };
}): number | null {
  const timestamp = session.dailyCloseSnapshot?.finalizedAt
    ?? session.closedAt
    ?? session.dailyCloseFinalizedAt;
  return typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : null;
}
