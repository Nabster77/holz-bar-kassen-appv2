import type { Transaction, TransactionItem } from '../types';
import type { StornoRecord } from './stornoRules';

/**
 * Projection for existing financial reports. Never persist these synthetic
 * entries: originals and their append-only storno documents remain separate.
 *
 * Dates/amounts are taken from the ORIGINAL snapshot and posted on the
 * STORNO date. This preserves historical VAT rather than looking up today's
 * article catalog. Every reversal is one original multiplied by -1.
 */
export interface StornoJournalTransaction extends Transaction {
  readonly isStornoProjection: true;
  readonly stornoOriginalId: string;
  readonly stornoReason: string;
  readonly stornoDocumentId: string;
}

export function stornoAsNegativeTransaction(storno: StornoRecord): StornoJournalTransaction {
  const src = storno.originalSnapshot;
  if (src.id !== storno.originalTransactionId || src.location !== storno.location ||
      src.paymentMethod !== storno.paymentMethod ||
      Math.round(src.total * 100) !== Math.round(storno.grossAmount * 100)) {
    throw new Error('Stornobeleg stimmt nicht mit dem Originalbon überein.');
  }
  const taxes = Object.fromEntries(
    Object.entries(src.taxByRate).map(([rate, money]) => [rate, -money]),
  ) as Record<number, number>;
  const items = src.items.map((item): TransactionItem => ({
    ...item,
    quantity: -item.quantity,
    pfand: -item.pfand,
    // The line's total tax needs to reverse exactly; the quantity is
    // already inverted, but taxAmount is not consistently per-unit in legacy data.
    taxAmount: -item.taxAmount,
    netPrice: -item.netPrice,
  }));
  return {
    ...src,
    id: `storno:${storno.id}`,
    cashSessionId: storno.cashSessionId,
    timestamp: storno.timestamp,
    items,
    subtotal: -src.subtotal,
    totalNet: -src.totalNet,
    totalTax: -src.totalTax,
    totalPfand: -src.totalPfand,
    total: -src.total,
    taxByRate: taxes,
    amountPaid: undefined,
    change: undefined,
    employeeId: storno.employeeId,
    employeeName: storno.employeeName,
    isStornoProjection: true,
    stornoOriginalId: src.id,
    stornoReason: storno.reason,
    stornoDocumentId: storno.id,
  };
}

export function projectFinancialTransactions(
  transactions: readonly Transaction[],
  stornos: readonly StornoRecord[],
  from = -Infinity,
  to = Infinity,
): Transaction[] {
  if (!(from < to)) throw new Error('Ungültiger Berichtszeitraum.');
  const originals = transactions.filter((t) => t.timestamp >= from && t.timestamp < to);
  const reversals = stornos.filter((s) => s.timestamp >= from && s.timestamp < to)
    .map(stornoAsNegativeTransaction);
  return [...originals, ...reversals].sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
}
