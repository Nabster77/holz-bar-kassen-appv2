import type { Category, CashSession, Location, StaffActivity, StaffLoginInterval, Transaction } from '@/types';
import { sessionTransactions } from '@/lib/sessionTransactions';
import { projectFinancialTransactions } from '@/lib/stornoReportProjection';
import type { StornoRecord } from '@/lib/stornoRules';
import { buildJournalFileName } from '@/lib/journalPdfFile';
import { calculateYearlyPfandOverview, type CashAuditRecord, type JournalReportData, type StaffTimeRecord } from '@/lib/journalPdf';
import { endOfDay, startOfDay } from '@/lib/format';
import { formatDailyCloseReceiptNumber } from '@/lib/dailyCloseReceipt';

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
      location: session.location, timestamp: entry.timestamp, kind: entry.isClosingWithdrawal ? 'Entnahme zum Tagesabschluss' : entry.type === 'deposit' ? 'Einlage' : 'Ausgabe',
      amount: entry.amount, reason: entry.reason, employeeName: entry.employeeName,
    })),
    ...session.corrections.map((correction): CashAuditRecord => ({
      location: session.location, timestamp: correction.timestamp, kind: 'Korrektur', oldAmount: correction.oldAmount,
      newAmount: correction.newAmount, reason: correction.reason, employeeName: correction.employeeName,
    })),
  ]);
}

export function buildDailyReport(
  loc: Location,
  date: string,
  transactions: Transaction[],
  categories: Category[],
  sessions: CashSession[] = [],
  exportedByName?: string,
  allTransactions: Transaction[] = transactions,
  stornos: readonly StornoRecord[] = [],
): JournalReportData {
  const day = new Date(date + 'T00:00:00');
  return {
    headerLabel: `Tagesübersicht ${loc} — ${day.toLocaleDateString('de-DE')}`,
    location: loc,
    transactions: projectFinancialTransactions(transactions, stornos, startOfDay(day.getTime()), endOfDay(day.getTime()) + 1),
    stornos: stornos.filter((storno) => storno.location === loc && storno.timestamp >= startOfDay(day.getTime()) && storno.timestamp <= endOfDay(day.getTime())),
    categories,
    fileName: buildJournalFileName('daily', startOfDay(day.getTime()), endOfDay(day.getTime()), loc),
    reportPeriodStart: startOfDay(day.getTime()),
    exportedByName,
    cashAuditRecords: cashAuditRecordsFromSessions(sessions),
    yearlyPfandOverview: calculateYearlyPfandOverview(
      projectFinancialTransactions(allTransactions, stornos), day.getFullYear(), loc),
  };
}

/**
 * Sessions created before login intervals existed retain readable reports.  The
 * fallback pairs explicit login/logout activities; it never fabricates a
 * period between a logout and a later login.
 */
function intervalsFromActivities(activities: StaffActivity[], closedAt: number): StaffLoginInterval[] {
  const intervals: StaffLoginInterval[] = [];
  for (const activity of [...activities].sort((a, b) => a.timestamp - b.timestamp)) {
    if (activity.type === 'login' || activity.type === 'cash_opened') {
      if (!intervals.some((interval) => interval.staffId === activity.staffId && interval.logoutAt === undefined)) {
        intervals.push({ id: `legacy-${activity.id}`, staffId: activity.staffId, staffName: activity.staffName, loginAt: activity.timestamp });
      }
    } else if (activity.type === 'logout') {
      for (let index = intervals.length - 1; index >= 0; index -= 1) {
        const interval = intervals[index];
        if (interval.staffId === activity.staffId && interval.logoutAt === undefined) {
          intervals[index] = { ...interval, logoutAt: Math.max(activity.timestamp, interval.loginAt) };
          break;
        }
      }
    }
  }
  return intervals.map((interval) => interval.logoutAt ? interval : { ...interval, logoutAt: closedAt });
}

function staffTimesFromSession(session: CashSession, closedAt: number): StaffTimeRecord[] {
  const intervals = session.dailyCloseSnapshot?.staffLoginIntervals
    ?? (session.staffLoginIntervals?.length ? session.staffLoginIntervals : intervalsFromActivities(session.activities ?? [], closedAt));
  return intervals
    .map((interval) => {
      const logoutAt = Math.max(interval.logoutAt ?? closedAt, interval.loginAt);
      return {
        location: session.location,
        staffName: interval.staffName,
        loginAt: interval.loginAt,
        logoutAt,
        durationMs: logoutAt - interval.loginAt,
      };
    })
    .sort((a, b) => a.loginAt - b.loginAt);
}

export function closedSessionReport(session: CashSession, transactions: Transaction[], categories: Category[], exportedByName?: string, allStornos: readonly StornoRecord[] = []): JournalReportData {
  const snapshot = session.dailyCloseSnapshot;
  const originalTransactions = snapshot?.transactions ?? sessionTransactions(transactions, session);
  // A final close reproduces the stored immutable storno snapshot. Older
  // receipts never disappear because the Bonliste displays only five.
  const sessionStornos = snapshot?.stornos ?? allStornos.filter((entry) => entry.cashSessionId === session.id);
  const reportTransactions = projectFinancialTransactions(originalTransactions, sessionStornos);
  const finalizedAt = snapshot?.finalizedAt ?? session.closedAt ?? Date.now();
  const [year] = session.date.split('-');
  const closingWithdrawalAmount = session.closingWithdrawalAmount ?? session.entries.filter((entry) => entry.isClosingWithdrawal).reduce((sum, entry) => sum + entry.amount, 0);
  const deposits = session.entries.filter((entry) => entry.type === 'deposit').reduce((sum, entry) => sum + entry.amount, 0);
  const normalWithdrawals = session.entries.filter((entry) => entry.type === 'withdrawal' && !entry.isClosingWithdrawal).reduce((sum, entry) => sum + entry.amount, 0);
  const formattedReceipt = formatDailyCloseReceiptNumber(session.dailyCloseReceiptNumber, session.dailyCloseReceiptLocation ?? session.location, session.closedAt ?? session.openedAt, session.dailyCloseReceiptYear);
  const cashTransactions = reportTransactions.filter((transaction) => transaction.paymentMethod === 'cash');
  // A cash balance only changes through cash transactions. Card-paid deposit
  // income and returns are deliberately excluded here.
  const cashSales = cashTransactions.reduce((sum, transaction) => sum + transaction.subtotal, 0);
  const cashPfandIncome = cashTransactions.reduce((sum, transaction) => sum + transaction.items
    .filter((item) => !item.isPfandRetoure)
    .reduce((itemSum, item) => itemSum + item.pfand, 0), 0);
  const cashPfandPayout = Math.abs(cashTransactions.reduce((sum, transaction) => sum + transaction.items
    .filter((item) => item.isPfandRetoure)
    .reduce((itemSum, item) => itemSum + item.price * item.quantity, 0), 0));
  const cashTurnover = cashTransactions.reduce((sum, transaction) => sum + transaction.total, 0);
  const openingCorrectionTotal = session.corrections.reduce((sum, correction) => sum + correction.newAmount - correction.oldAmount, 0);
  const balanceBeforeWithdrawal = Math.round((session.openingBalance + cashTurnover + deposits - normalWithdrawals) * 100) / 100;
  return {
    ...buildDailyReport(session.location, session.date, originalTransactions, categories, [session], exportedByName ?? snapshot?.finalizedByName,
      transactions, sessionStornos),
    headerLabel: `${session.location} · ${new Date(session.openedAt).toLocaleDateString('de-DE')} · ${new Date(finalizedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`,
    documentTitle: 'Tagesabschluss',
    documentStatus: 'Endgültig abgeschlossen',
    fileName: `${session.location}_Tagesabschluss_${session.date}_${formattedReceipt ?? session.id}.pdf`,
    receiptNumber: formattedReceipt ?? 'wird bei der nächsten Synchronisierung vergeben',
    staffTimeRecords: staffTimesFromSession(session, finalizedAt),
    // An archived daily close must not change when later transactions add
    // more yearly deposit movements; freeze the year-to-date scope at close.
    yearlyPfandOverview: calculateYearlyPfandOverview(
      projectFinancialTransactions(
        transactions.filter((transaction) => transaction.timestamp <= finalizedAt),
        [...new Map([...allStornos, ...sessionStornos]
          .filter((storno) => storno.timestamp <= finalizedAt)
          .map((storno) => [storno.id, storno])).values()],
      ),
      Number(year), session.location,
    ),
    transactions: reportTransactions,
    stornos: sessionStornos,
    dailyCloseCash: {
      openingBalance: session.openingBalance,
      cashSales,
      cashPfandIncome,
      cashPfandPayout,
      cashDeposits: deposits,
      cashWithdrawals: normalWithdrawals,
      openingCorrectionTotal,
      balanceBeforeWithdrawal,
      closingWithdrawalAmount,
      // The printed remaining balance must be reproducible from the document
      // itself and must therefore never depend on a stale/manual close value.
      remainingBalance: Math.round((balanceBeforeWithdrawal - closingWithdrawalAmount) * 100) / 100,
    },
  };
}
