import type { Location, TaxClass, Transaction, TransactionItem } from '@/types';

export const LOCATION_TAX_RATES: Record<Location, Record<TaxClass, number>> = {
  Friedrichshafen: { reduced: 7, standard: 19, zero: 0 },
  Bregenz: { reduced: 10, standard: 20, zero: 0 },
};

export function taxRateForClass(cls: TaxClass, location: Location): number {
  return LOCATION_TAX_RATES[location][cls];
}

export function classifyRate(rate: number): TaxClass | null {
  if (rate === 0) return 'zero';
  for (const loc of Object.keys(LOCATION_TAX_RATES) as Location[]) {
    const table = LOCATION_TAX_RATES[loc];
    if (table.reduced === rate) return 'reduced';
    if (table.standard === rate) return 'standard';
  }
  return null;
}

export function isReducedRate(rate: number): boolean {
  return classifyRate(rate) === 'reduced';
}

export function getTaxByRate(tx: Transaction): Map<number, number> {
  const map = new Map<number, number>();
  if (tx.taxByRate) {
    for (const [k, v] of Object.entries(tx.taxByRate)) {
      const rate = Number(k);
      if (v) map.set(rate, (map.get(rate) ?? 0) + v);
    }
    return map;
  }
  // Legacy: derive from tax7/tax19
  if (tx.tax7) map.set(7, (map.get(7) ?? 0) + tx.tax7);
  if (tx.tax19) map.set(19, (map.get(19) ?? 0) + tx.tax19);
  return map;
}

export function mergeTaxByRate(transactions: Transaction[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const tx of transactions) {
    for (const [rate, amt] of getTaxByRate(tx)) {
      map.set(rate, (map.get(rate) ?? 0) + amt);
    }
  }
  return map;
}

export function isTaxFreeItem(item: TransactionItem): boolean {
  return item.isPfandRetoure || item.taxRate === 0 || (item.taxAmount === 0 && item.pfand === item.price * item.quantity);
}

export function taxByRateToObject(map: Map<number, number>): Record<number, number> {
  const obj: Record<number, number> = {};
  for (const [k, v] of map) obj[k] = v;
  return obj;
}

export function sortedRateKeys(map: Map<number, number>): number[] {
  return [...map.keys()].sort((a, b) => a - b);
}
