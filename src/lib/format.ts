export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value);
}

export function formatTime(ts: number): string {
  return new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
}

export function formatDate(ts: number): string {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(ts));
}

export function formatDateLong(ts: number): string {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(ts));
}

export function isSameDay(ts: number, ref: number): boolean {
  const d1 = new Date(ts);
  const d2 = new Date(ref);
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

export function calcNet(gross: number, taxRate: number): number {
  return gross / (1 + taxRate / 100);
}

export function calcTax(gross: number, taxRate: number): number {
  return gross - calcNet(gross, taxRate);
}

export function formatWeekdayShort(ts: number): string {
  const d = new Date(ts);
  const idx = (d.getDay() + 6) % 7;
  return ['MO', 'DI', 'MI', 'DO', 'FR', 'SA', 'SO'][idx];
}

export function formatDateISO(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDateTime(ts: number): string {
  return `${formatDate(ts)}, ${formatTime(ts)}`;
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function startOfWeek(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1; // Monday-based
  d.setDate(d.getDate() - diff);
  return d.getTime();
}

export function startOfMonth(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.getTime();
}

export function startOfYear(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setMonth(0, 1);
  return d.getTime();
}

export function isSameMonth(ts: number, ref: number): boolean {
  const d1 = new Date(ts);
  const d2 = new Date(ref);
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth();
}

export function isSameYear(ts: number, ref: number): boolean {
  return new Date(ts).getFullYear() === new Date(ref).getFullYear();
}

export function monthLabel(ts: number): string {
  return new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(new Date(ts));
}

export function yearLabel(ts: number): string {
  return String(new Date(ts).getFullYear());
}

export function getWeekNumber(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}
