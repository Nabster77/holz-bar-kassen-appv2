import type { CashEntry, CashSession, StaffUser, Transaction, Location } from '@/types';
import { sessionTransactions } from '@/lib/sessionTransactions';

export interface CloseDetails {
  closedAt: number;
  receipt: { number: number; location: Location; year: number };
  snapshot: NonNullable<CashSession['dailyCloseSnapshot']>;
}

/** The exact same finalized object is persisted to Cloud and local state. */
export function buildFinalizedCashSession(
  session: CashSession,
  transactions: Transaction[],
  actualBalance: number,
  staff: Pick<StaffUser, 'id' | 'name'>,
  withdrawalAmount: number,
  close: CloseDetails,
): CashSession {
  if (session.closed || session.discarded || session.dailyCloseSnapshot ||
      session.dailyCloseFinalizedAt != null) throw new Error('Kassensitzung bereits abgeschlossen.');
  if (close.receipt.location !== session.location ||
      !Number.isSafeInteger(close.receipt.number) || close.receipt.number <= 0 ||
      !Number.isSafeInteger(close.receipt.year) ||
      !Number.isFinite(close.closedAt) || close.closedAt < session.openedAt ||
      !Number.isFinite(withdrawalAmount) || withdrawalAmount < 0 ||
      !Number.isFinite(actualBalance) ||
      close.snapshot.finalizedAt !== close.closedAt) {
    throw new Error('Ungültiger Tagesabschluss oder Belegnummer.');
  }
  const ownSales = sessionTransactions(transactions, session, close.closedAt);
  if (close.snapshot.transactions.length !== ownSales.length ||
      ownSales.some((sale) => !close.snapshot.transactions.some((item) => item.id === sale.id))) {
    throw new Error('Tagesabschluss enthält nicht alle Buchungen der Sitzung.');
  }
  const withdrawal: CashEntry | null = withdrawalAmount > 0 ? {
    id: `daily-close-withdrawal-${session.id}`,type:'withdrawal',
    amount:withdrawalAmount,reason:'Entnahme zum Tagesabschluss',timestamp:close.closedAt,
    isClosingWithdrawal:true,employeeId:staff.id,employeeName:staff.name,
  } : null;
  const entries = withdrawal ? [...session.entries,withdrawal] : [...session.entries];
  const cashTotal=ownSales.filter(t=>t.paymentMethod==='cash').reduce((sum,t)=>sum+t.total,0);
  const stornoCashTotal=(close.snapshot.stornos??[]).filter(storno=>storno.cashSessionId===session.id).reduce((sum,storno)=>sum+storno.cashEffect,0);
  const deposits=entries.filter(e=>e.type==='deposit').reduce((sum,e)=>sum+e.amount,0);
  const withdrawals=entries.filter(e=>e.type==='withdrawal').reduce((sum,e)=>sum+e.amount,0);
  const expected=Math.round((session.openingBalance+cashTotal+stornoCashTotal+deposits-withdrawals)*100)/100;
  if (!Number.isFinite(expected) || expected < 0) throw new Error('Negativer oder ungültiger Kassenbestand.');
  const intervals=(session.staffLoginIntervals??[]).map(i=>i.logoutAt?i:{...i,logoutAt:close.closedAt});
  return {
    ...session,closed:true,closedAt:close.closedAt,entries,
    closingBalance:expected,expectedBalance:expected,
    difference:Math.round((actualBalance-expected)*100)/100,
    closingWithdrawalAmount:withdrawalAmount,
    closedById:staff.id,closedByName:staff.name,
    dailyCloseReceiptNumber:close.receipt.number,
    dailyCloseReceiptLocation:close.receipt.location,
    dailyCloseReceiptYear:close.receipt.year,
    dailyCloseFinalizedAt:close.closedAt,
    dailyCloseFinalizedById:staff.id,dailyCloseFinalizedByName:staff.name,
    dailyCloseSnapshot:close.snapshot,
    activities:[
      ...(session.activities??[]),
      ...(withdrawal?[{id:`daily-close-activity-withdrawal-${session.id}`,
        type:'withdrawal' as const,staffId:staff.id,staffName:staff.name,
        timestamp:close.closedAt,amount:withdrawalAmount,reason:withdrawal.reason}]:[]),
      {id:`daily-close-activity-finalized-${session.id}`,type:'cash_closed' as const,
        staffId:staff.id,staffName:staff.name,timestamp:close.closedAt,amount:expected},
    ],
    staffLoginIntervals:intervals,
  };
}
