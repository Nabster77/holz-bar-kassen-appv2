import type { CashSession, Location, PaymentMethod, Transaction } from '../types';

/**
 * Immutable storno audit records. Originals stay in the ledger;
 * aggregation uses effectiveSales(). Writing must be atomic server-side.
 */
export interface StornoRecord {
  id: string;
  originalTransactionId: string;
  location: Location;
  timestamp: number;
  reason: string;
  employeeId: string;
  employeeName: string;
  paymentMethod: PaymentMethod;
  grossAmount: number;
  /** Frozen original including historic item prices and tax rates. */
  originalSnapshot: Transaction;
  cashEffect: number;
  cardEffect: number;
}

export class StornoRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StornoRuleError';
  }
}

function cents(amount: number): number {
  if (!Number.isFinite(amount)) throw new StornoRuleError('Ungültiger Geldbetrag.');
  const value = Math.round(amount * 100);
  if (!Number.isSafeInteger(value)) throw new StornoRuleError('Geldbetrag außerhalb des zulässigen Bereichs.');
  return value;
}

function assertSessionIsOpen(session: CashSession, receipt: Transaction): void {
  if (session.closed || session.closedAt != null || session.dailyCloseFinalizedAt != null || session.dailyCloseSnapshot != null) {
    throw new StornoRuleError('Dieser Kassenabschluss ist endgültig oder die Sitzung geschlossen. Eine Korrekturbuchung in einem neuen Zeitraum ist erforderlich.');
  }
  if (session.location !== receipt.location || receipt.timestamp < session.openedAt) {
    throw new StornoRuleError('Beleg und offene Kassensitzung passen nicht zusammen.');
  }
}

export function lastFiveStornoCandidates(
  transactions: readonly Transaction[],
  previousStornos: readonly StornoRecord[],
  session: CashSession,
): Transaction[] {
  if (session.closed || session.closedAt != null || session.dailyCloseFinalizedAt != null || session.dailyCloseSnapshot != null) return [];
  const voided = new Set(previousStornos.map((entry) => entry.originalTransactionId));
  return transactions
    .filter((t) => t.location === session.location && t.timestamp >= session.openedAt && !voided.has(t.id))
    .sort((a, b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id))
    .slice(0, 5);
}

export interface StornoProposalInput {
  receipt: Transaction;
  session: CashSession;
  previousStornos: readonly StornoRecord[];
  allTransactions: readonly Transaction[];
  reason: string;
  employeeId: string;
  employeeName: string;
  currentCashBalance: number;
  now: number;
  stornoId: string;
}

/** Preparation only. Explicit approval + atomic database commit still required. */
export function prepareStorno(input: StornoProposalInput): StornoRecord {
  const { receipt, session, previousStornos, now } = input;
  assertSessionIsOpen(session, receipt);
  if (!lastFiveStornoCandidates(input.allTransactions, previousStornos, session).some((item) => item.id === receipt.id)) {
    throw new StornoRuleError('Nur die letzten fünf noch nicht stornierten Einzelbelege können ausgewählt werden.');
  }
  if (!Number.isFinite(now) || now < receipt.timestamp || now < session.openedAt) {
    throw new StornoRuleError('Ungültiger Stornozeitpunkt.');
  }
  if (previousStornos.some((s) => s.originalTransactionId === receipt.id)) {
    throw new StornoRuleError('Dieser Beleg wurde bereits storniert.');
  }
  const reason = input.reason.trim();
  if (reason.length < 3) throw new StornoRuleError('Bitte eine nachvollziehbare Stornobegründung eingeben.');
  if (!input.employeeId.trim() || !input.employeeName.trim() || !input.stornoId.trim()) {
    throw new StornoRuleError('Storno-ID und Mitarbeiter müssen eindeutig angegeben sein.');
  }
  if (!Array.isArray(receipt.items) || !receipt.taxByRate || typeof receipt.taxByRate !== 'object') {
    throw new StornoRuleError('Originalbeleg unvollständig: Artikel oder Steueraufteilung fehlen.');
  }
  const gross = cents(receipt.total);
  const cashEffect = receipt.paymentMethod === 'cash' ? -gross : 0;
  const cardEffect = receipt.paymentMethod === 'card' ? -gross : 0;
  if (cents(input.currentCashBalance) + cashEffect < 0) {
    throw new StornoRuleError('Die Stornierung würde einen negativen Bargeldbestand erzeugen.');
  }
  return {
    id: input.stornoId.trim(),
    originalTransactionId: receipt.id,
    location: receipt.location,
    timestamp: now,
    reason,
    employeeId: input.employeeId.trim(),
    employeeName: input.employeeName.trim(),
    paymentMethod: receipt.paymentMethod,
    grossAmount: gross / 100,
    originalSnapshot: { ...receipt, items: receipt.items.map((item) => ({ ...item })), taxByRate: { ...receipt.taxByRate } },
    cashEffect: cashEffect / 100,
    cardEffect: cardEffect / 100,
  };
}

/** Current effective sales only. Never delete immutable historical receipts. */
export function effectiveSales(transactions: readonly Transaction[], stornoRecords: readonly StornoRecord[]): Transaction[] {
  const voidedIds = new Set(stornoRecords.map((s) => s.originalTransactionId));
  return transactions.filter((t) => !voidedIds.has(t.id));
}
