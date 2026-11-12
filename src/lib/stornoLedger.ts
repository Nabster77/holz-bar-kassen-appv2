import type { Location, PaymentMethod, Transaction } from '../types';
import type { StornoRecord } from './stornoRules';

/**
 * Append-only ledger: post a sale at its original time and its reversing
 * storno at the storno time. This NEVER rewrites a finalized earlier day.
 * Do not feed this output back as persisted transactions.
 */
export interface SalesLedgerMovement {
  id: string;
  originalTransactionId: string;
  kind: 'sale' | 'storno';
  location: Location;
  timestamp: number;
  paymentMethod: PaymentMethod;
  totalCents: number;
  salesCents: number;
  netSalesCents: number;
  pfandCents: number;
  taxCentsByRate: Record<string, number>;
  articleQuantities: Record<string, number>;
}

export interface LedgerTotals {
  cashCents: number;
  cardCents: number;
  salesCents: number;
  netSalesCents: number;
  pfandCents: number;
  taxCentsByRate: Record<string, number>;
  articleQuantities: Record<string, number>;
}

function cents(amount: number): number {
  if (!Number.isFinite(amount)) throw new Error('Ungültiger Geldbetrag im Buchungsjournal.');
  const n = Math.round(amount * 100);
  if (!Number.isSafeInteger(n)) throw new Error('Geldbetrag außerhalb des zulässigen Bereichs.');
  return n;
}

function movement(transaction: Transaction, kind: 'sale' | 'storno', timestamp: number, id: string): SalesLedgerMovement {
  const factor = kind === 'sale' ? 1 : -1;
  const taxes: Record<string, number> = {};
  for (const [rate, value] of Object.entries(transaction.taxByRate ?? {})) taxes[rate] = factor * cents(value);
  const quantities: Record<string, number> = {};
  for (const item of transaction.items) {
    if (!Number.isFinite(item.quantity)) throw new Error('Ungültige Artikelmenge im Buchungsjournal.');
    quantities[item.productId] = (quantities[item.productId] ?? 0) + factor * item.quantity;
  }
  return {
    id,
    originalTransactionId: transaction.id,
    kind,
    location: transaction.location,
    timestamp,
    paymentMethod: transaction.paymentMethod,
    totalCents: factor * cents(transaction.total),
    salesCents: factor * cents(transaction.subtotal),
    netSalesCents: factor * cents(transaction.totalNet),
    pfandCents: factor * cents(transaction.totalPfand),
    taxCentsByRate: taxes,
    articleQuantities: quantities,
  };
}

/**
 * From inclusive, to exclusive; timestamps must match the requested local-day
 * boundary calculated by the caller. A later reversal belongs to the new day.
 */
export function salesLedgerMovements(
  transactions: readonly Transaction[],
  stornos: readonly StornoRecord[],
  from: number = -Infinity,
  to: number = Infinity,
): SalesLedgerMovement[] {
  if (!(from < to)) throw new Error('Ungültiger Berichtszeitraum.');
  const byId = new Map<string, Transaction>();
  for (const sale of transactions) {
    if (byId.has(sale.id)) throw new Error('Doppelte Originalbeleg-ID im Journal.');
    byId.set(sale.id, sale);
  }
  const reversed = new Set<string>();
  const stornoIds = new Set<string>();
  const result: SalesLedgerMovement[] = [];
  for (const sale of transactions) {
    if (sale.timestamp >= from && sale.timestamp < to) result.push(movement(sale, 'sale', sale.timestamp, sale.id));
  }
  for (const cancellation of stornos) {
    if (stornoIds.has(cancellation.id) || reversed.has(cancellation.originalTransactionId)) {
      throw new Error('Doppelter Stornonachweis im Journal.');
    }
    stornoIds.add(cancellation.id);
    reversed.add(cancellation.originalTransactionId);
    const original = byId.get(cancellation.originalTransactionId) ?? cancellation.originalSnapshot;
    if (!original || original.id !== cancellation.originalTransactionId ||
      original.location !== cancellation.location || original.paymentMethod !== cancellation.paymentMethod ||
      cents(original.total) !== cents(cancellation.grossAmount)) {
      throw new Error('Storno ohne überprüfbaren Originalbeleg.');
    }
    if (cancellation.timestamp < original.timestamp) throw new Error('Stornozeitpunkt liegt vor der Originalbuchung.');
    if (cancellation.timestamp >= from && cancellation.timestamp < to) {
      result.push(movement(original, 'storno', cancellation.timestamp, cancellation.id));
    }
  }
  return result.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
}

/** Report totals use posted movement dates, never silently delete originals. */
export function sumSalesLedger(movements: readonly SalesLedgerMovement[]): LedgerTotals {
  const total: LedgerTotals = {
    cashCents: 0, cardCents: 0, salesCents: 0, netSalesCents: 0, pfandCents: 0,
    taxCentsByRate: {}, articleQuantities: {},
  };
  for (const m of movements) {
    if (m.paymentMethod === 'cash') total.cashCents += m.totalCents;
    else total.cardCents += m.totalCents;
    total.salesCents += m.salesCents;
    total.netSalesCents += m.netSalesCents;
    total.pfandCents += m.pfandCents;
    for (const [rate, amount] of Object.entries(m.taxCentsByRate)) {
      total.taxCentsByRate[rate] = (total.taxCentsByRate[rate] ?? 0) + amount;
    }
    for (const [id, quantity] of Object.entries(m.articleQuantities)) {
      total.articleQuantities[id] = (total.articleQuantities[id] ?? 0) + quantity;
    }
  }
  return total;
}
