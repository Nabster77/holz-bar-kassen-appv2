import type { Category, CashSession, Location, Transaction } from '@/types';
import { buildJournalFileName } from '@/lib/journalPdfFile';
import type { CashAuditRecord, JournalReportData } from '@/lib/journalPdf';
import { endOfDay, startOfDay } from '@/lib/format';

export function dayTransactions(transactions: Transaction[], date: string, loc: Location): Transaction[] {
  return transactions.filter((t) => {
    const d = new Date(t.timestamp);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return iso === date && t.location === loc;
  });
}

export function cashAuditRecordsFromSessions(sessions: CashSession[]): CashAuditRecord[] {
  return sessions.flatMap((session) => [
    ...session.entries.map((entry): CashAuditRecord => ({
      location: session.location, timestamp: entry.timestamp, kind: entry.type === 'deposit' ? 'Einlage' : 'Ausgabe',
      amount: entry.amount, reason: entry.reason, employeeName: entry.employeeName,
    })),
    ...session.corrections.map((correction): CashAuditRecord => ({
      location: session.location, timestamp: correction.timestamp, kind: 'Korrektur', oldAmount: correction.oldAmount,
      newAmount: correction.newAmount, reason: correction.reason, employeeName: correction.employeeName,
    })),
  ]);
}

export function buildDailyReport(loc: Location, date: string, transactions: Transaction[], categories: Category[], sessions: CashSession[] = [], exportedByName?: string): JournalReportData {
  const day = new Date(date + 'T00:00:00');
  return {
    headerLabel: `Tagesübersicht ${loc} — ${day.toLocaleDateString('de-DE')}`,
    location: loc,
    transactions,
    categories,
    fileName: buildJournalFileName('daily', startOfDay(day.getTime()), endOfDay(day.getTime()), loc),
    exportedByName,
    cashAuditRecords: cashAuditRecordsFromSessions(sessions),
  };
}

export function closedSessionReport(session: CashSession, transactions: Transaction[], categories: Category[], exportedByName?: string): JournalReportData {
  return {
    ...buildDailyReport(session.location, session.date, dayTransactions(transactions, session.date, session.location), categories, [session], exportedByName),
  };
}
