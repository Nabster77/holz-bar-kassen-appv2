import type { CashSession, Location, PaymentMethod, Transaction } from '../types';

/**
 * Immutable storno audit records. Originals stay in the ledger;
 * aggregation uses effectiveSales(). Writing must be atomic server-side.
 */
export interface StornoRecord {
  id: string;
  originalTransactionId: string;
  /** Original cash session; ensures final-close audit cannot mix registers. */
  cashSessionId: string;
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

/**
 * The five newest receipts of an open cash session, INCLUDING already voided
 * receipts. This selection is temporary; receipts themselves are persisted
 * from their creation and remain available for immutable daily close records.
 * A voided receipt still occupies its chronological slot, so no older one
 * becomes eligible again when a newer receipt is cancelled.
 */
export function lastFiveCashReceipts(
  transactions: readonly Transaction[],
  session: CashSession,
): Transaction[] {
  if (session.closed || session.discarded || session.closedAt != null ||
      session.dailyCloseFinalizedAt != null || session.dailyCloseSnapshot != null) return [];
  return transactions
    .filter((t) => t.location === session.location && t.timestamp >= session.openedAt)
    .sort((a, b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id))
    .slice(0, 5);
}

export function lastFiveStornoCandidates(
  transactions: readonly Transaction[],
  previousStornos: readonly StornoRecord[],
  session: CashSession,
): Transaction[] {
  const voided = new Set(previousStornos.map((entry) => entry.originalTransactionId));
  return lastFiveCashReceipts(transactions, session)
    .filter((receipt) => !voided.has(receipt.id));
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
  if (previousStornos.some((s) => s.originalTransactionId === receipt.id)) {
    throw new StornoRuleError('Dieser Beleg wurde bereits storniert.');
  }
  if (!lastFiveStornoCandidates(input.allTransactions, previousStornos, session).some((item) => item.id === receipt.id)) {
    throw new StornoRuleError('Nur die letzten fünf Einzelbelege der offenen Kasse können storniert werden.');
  }
  if (!Number.isFinite(now) || now < receipt.timestamp || now < session.openedAt) {
    throw new StornoRuleError('Ungültiger Stornozeitpunkt.');
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
    cashSessionId: session.id,
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

/**
 * The complete documentary close basis. The five-receipt UI window is NEVER a
 * data-retention rule. Final close must preserve every receipt and all storno
 * reasons for this session, even if the receipt is no longer stornierbar.
 *
 * This is a pure preparation/validation step, not a cloud write. The caller
 * must persist the resulting snapshot atomically with the finalized session
 * after the server-side storno log has been synchronized and verified.
 */
export function prepareFinalCloseStornoSnapshot(
  transactions: readonly Transaction[],
  stornoRecords: readonly StornoRecord[],
  session: CashSession,
  finalizedAt: number,
): Pick<NonNullable<CashSession['dailyCloseSnapshot']>, 'transactions' | 'stornos'> {
  if (!Number.isFinite(finalizedAt) || finalizedAt < session.openedAt) {
    throw new StornoRuleError('Ungültiger Abschlusszeitpunkt.');
  }
  if (session.closed || session.discarded || session.closedAt != null ||
      session.dailyCloseFinalizedAt != null || session.dailyCloseSnapshot != null) {
    throw new StornoRuleError('Ein bereits abgeschlossener Kassenvorgang darf nicht erneut abgeschlossen werden.');
  }
  const sales = transactions.filter((t) => t.location === session.location &&
    t.timestamp >= session.openedAt && t.timestamp <= finalizedAt);
  const byId = new Map(sales.map((t) => [t.id, t]));
  if (byId.size !== sales.length) throw new StornoRuleError('Doppelte Originalbelege im Tagesabschluss.');
  const stornos = stornoRecords.filter((entry) => entry.cashSessionId === session.id);
  const stornoIds = new Set<string>();
  const cancelledIds = new Set<string>();
  for (const storno of stornos) {
    const original = byId.get(storno.originalTransactionId);
    if (!original || storno.location !== session.location ||
        storno.timestamp < original.timestamp || storno.timestamp > finalizedAt ||
        stornoIds.has(storno.id) || cancelledIds.has(storno.originalTransactionId) ||
        !storno.originalSnapshot || storno.originalSnapshot.id !== original.id ||
        storno.originalSnapshot.paymentMethod !== original.paymentMethod ||
        cents(storno.grossAmount) !== cents(original.total)) {
      throw new StornoRuleError('Unvollständiger oder doppelter Stornonachweis im Tagesabschluss.');
    }
    stornoIds.add(storno.id);
    cancelledIds.add(storno.originalTransactionId);
  }
  // Cloning makes accidental later UI mutations unable to alter the close.
  return {
    transactions: sales.map((sale) => structuredClone(sale)),
    stornos: stornos.map((storno) => structuredClone(storno)),
  };
}

/** Current effective sales only. Never delete immutable historical receipts. */
export function effectiveSales(transactions: readonly Transaction[], stornoRecords: readonly StornoRecord[]): Transaction[] {
  const voidedIds = new Set(stornoRecords.map((s) => s.originalTransactionId));
  return transactions.filter((t) => !voidedIds.has(t.id));
}
