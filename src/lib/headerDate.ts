/** Visible current shop date for both Friedrichshafen and Bregenz.
 * Display is never used for closing cash sessions or grouping transactions.
 * Germany and Austria use the same Europe/Berlin civil time.
 */
const LONG_DATE = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const SHORT_DATE = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function headerDateLong(timestamp: number): string {
  return LONG_DATE.format(new Date(timestamp));
}

export function headerDateShort(timestamp: number): string {
  return SHORT_DATE.format(new Date(timestamp));
}
