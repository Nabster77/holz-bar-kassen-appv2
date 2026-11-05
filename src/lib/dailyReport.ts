import type { Category, CashSession, Location, Transaction } from '@/types';
import { buildJournalFileName } from '@/lib/journalPdfFile';
import type { JournalReportData } from '@/lib/journalPdf';
import { endOfDay, startOfDay } from '@/lib/format';

export function dayTransactions(transactions: Transaction[], date: string, loc: Location): Transaction[] {
  return transactions.filter((t) => {
    const d = new Date(t.timestamp);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return iso === date && t.location === loc;
  });
}

export function buildDailyReport(loc: Location, date: string, transactions: Transaction[], categories: Category[]): JournalReportData {
  const day = new Date(date + 'T00:00:00');
  return {
    headerLabel: `Tagesübersicht ${loc} — ${day.toLocaleDateString('de-DE')}`,
    location: loc,
    transactions,
    categories,
    fileName: buildJournalFileName('daily', startOfDay(day.getTime()), endOfDay(day.getTime()), loc),
  };
}

export function closedSessionReport(session: CashSession, transactions: Transaction[], categories: Category[]): JournalReportData {
  return buildDailyReport(session.location, session.date, dayTransactions(transactions, session.date, session.location), categories);
}
