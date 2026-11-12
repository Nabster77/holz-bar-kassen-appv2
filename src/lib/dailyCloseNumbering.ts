/**
 * Official WOODMO operating dates: Friedrichshafen (DE) and Bregenz (AT)
 * both use Central European civil time, including DST. Browser or server UTC
 * must never make a close after local midnight belong to the previous year.
 */
export const CASH_BUSINESS_TIMEZONE = 'Europe/Berlin';

export function businessCloseDate(timestamp: number): string {
  if (!Number.isFinite(timestamp)) throw new Error('Ungültiger Abschlusszeitpunkt.');
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: CASH_BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const part = (kind: 'year' | 'month' | 'day'): string => {
    const value = parts.find((entry) => entry.type === kind)?.value;
    if (!value || !/^\d+$/.test(value)) throw new Error('Abschlussdatum nicht ermittelbar.');
    return value;
  };
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function businessCloseYear(timestamp: number): number {
  return Number(businessCloseDate(timestamp).slice(0, 4));
}

export function formatDailyCloseNumber(
  number: number | undefined,
  location: 'Friedrichshafen' | 'Bregenz',
  timestamp: number,
  storedYear?: number,
): string | null {
  if (!Number.isSafeInteger(number) || !number || number < 1) return null;
  const locationCode = location === 'Bregenz' ? 'BR' : 'FN';
  const year = storedYear ?? businessCloseYear(timestamp);
  if (!Number.isSafeInteger(year) || year < 2000 || year > 9999) return null;
  return `TA-${locationCode}-${year}-${String(number).padStart(6, '0')}`;
}
