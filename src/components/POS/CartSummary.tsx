import type { CartItem, Location } from '@/types';
import { calcNet, calcTax, formatCurrency } from '@/lib/format';
import { taxRateForClass } from '@/lib/tax';
import { ShoppingCart, Recycle } from 'lucide-react';

interface Props {
  items: CartItem[];
  location: Location;
}

export function CartSummary({ items, location }: Props) {
  const grossByRate = new Map<number, number>();
  let totalPfand = 0, pfandRetoure = 0;

  for (const item of items) {
    if (item.isPfandRetoure) {
      pfandRetoure += item.unitPrice * item.quantity;
      continue;
    }
    const rate = taxRateForClass(item.product.taxClass, location);
    const gross = item.unitPrice * item.quantity;
    grossByRate.set(rate, (grossByRate.get(rate) ?? 0) + gross);
    totalPfand += item.unitPfand * item.quantity;
  }

  let totalNet = 0, totalTax = 0;
  const rateEntries = [...grossByRate.entries()].sort((a, b) => a[0] - b[0]);
  for (const [rate, gross] of rateEntries) {
    totalNet += calcNet(gross, rate);
    totalTax += calcTax(gross, rate);
  }
  const subtotal = [...grossByRate.values()].reduce((s, v) => s + v, 0);
  const total = subtotal + totalPfand + pfandRetoure;

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-gray-400 dark:text-gray-500">
        <ShoppingCart className="h-16 w-16" />
        <p className="text-sm font-medium">Warenkorb ist leer</p>
        <p className="text-xs">Tippe auf Artikel, um sie hinzuzufügen</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 text-sm">
      <div className="flex justify-between text-gray-600 dark:text-gray-400">
        <span>Zwischensumme (netto)</span>
        <span className="font-medium">{formatCurrency(totalNet)}</span>
      </div>
      {rateEntries.map(([rate, gross]) => (
        <div key={rate} className="flex justify-between text-gray-600 dark:text-gray-400">
          <span>MwSt {rate}%</span>
          <span className="font-medium">{formatCurrency(calcTax(gross, rate))}</span>
        </div>
      ))}
      <div className="flex justify-between border-t border-gray-200 pt-1.5 text-gray-600 dark:border-gray-700 dark:text-gray-400">
        <span>MwSt gesamt</span>
        <span className="font-medium">{formatCurrency(totalTax)}</span>
      </div>
      {totalPfand > 0 && (
        <div className="flex justify-between text-gray-600 dark:text-gray-400">
          <span>Pfand</span>
          <span className="font-medium">{formatCurrency(totalPfand)}</span>
        </div>
      )}
      {pfandRetoure !== 0 && (
        <div className="flex items-center justify-between text-teal-600 dark:text-teal-400">
          <span className="flex items-center gap-1.5">
            <Recycle className="h-3.5 w-3.5" />
            Pfand-Retoure
          </span>
          <span className="font-medium">{formatCurrency(pfandRetoure)}</span>
        </div>
      )}
      <div className="flex items-baseline justify-between border-t-2 border-gray-300 pt-2 dark:border-gray-600">
        <span className="text-lg font-bold text-gray-900 dark:text-gray-100">Gesamt</span>
        <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{formatCurrency(total)}</span>
      </div>
    </div>
  );
}
