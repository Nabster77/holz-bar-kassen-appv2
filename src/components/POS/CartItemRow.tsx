import type { CartItem, Location } from '@/types';
import { formatCurrency } from '@/lib/format';
import { taxRateForClass } from '@/lib/tax';
import { Minus, Plus, Trash2, Recycle } from 'lucide-react';

interface Props {
  item: CartItem;
  location: Location;
  onInc: () => void;
  onDec: () => void;
  onRemove: () => void;
}

export function CartItemRow({ item, location, onInc, onDec, onRemove }: Props) {
  const unitTotal = item.unitPrice + item.unitPfand;
  const shotPrice = item.shot && item.shot.id !== 'none' ? item.shot.price : 0;
  const basePrice = item.unitPrice - shotPrice;
  const rate = taxRateForClass(item.product.taxClass, location);

  if (item.isPfandRetoure) {
    return (
      <div className="flex items-center gap-2 border-b border-gray-100 py-2 dark:border-gray-700">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/30">
          <Recycle className="h-4 w-4 text-teal-600 dark:text-teal-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-teal-700 dark:text-teal-400">{item.product.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Pfand-Rückgabe · {formatCurrency(Math.abs(item.unitPrice))}/Stück</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={onDec} className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-700 transition active:scale-90 dark:bg-gray-700 dark:text-gray-200">
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-7 text-center text-sm font-bold text-gray-900 dark:text-gray-100">{item.quantity}</span>
          <button onClick={onInc} className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-700 transition active:scale-90 dark:bg-gray-700 dark:text-gray-200">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <span className="w-20 shrink-0 text-right text-sm font-semibold text-teal-600 dark:text-teal-400">
          {formatCurrency(unitTotal * item.quantity)}
        </span>
        <button onClick={onRemove} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-red-500 transition hover:bg-red-50 active:scale-90 dark:hover:bg-red-900/30">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 border-b border-gray-100 py-2 dark:border-gray-700">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {item.product.name}
          {item.shot && item.shot.id !== 'none' && (
            <span className="text-blue-600 dark:text-blue-400"> + {item.shot.name}</span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          {shotPrice > 0 ? (
            <span className="block">
              Grundpreis {formatCurrency(basePrice)}
              <span className="text-blue-600 dark:text-blue-400"> + {item.shot?.name} {formatCurrency(shotPrice)}</span>
              <span className="text-gray-400"> = {formatCurrency(unitTotal)}</span>
            </span>
          ) : (
            <span>Stückpreis {formatCurrency(unitTotal)} · {rate}%</span>
          )}
          {item.unitPfand > 0 && (
            <span className="block text-amber-600 dark:text-amber-400">Pfand {formatCurrency(item.unitPfand)}</span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1 pt-0.5">
        <button onClick={onDec} className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-700 transition active:scale-90 dark:bg-gray-700 dark:text-gray-200">
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-7 text-center text-sm font-bold text-gray-900 dark:text-gray-100">{item.quantity}</span>
        <button onClick={onInc} className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-700 transition active:scale-90 dark:bg-gray-700 dark:text-gray-200">
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <span className="w-20 shrink-0 pt-0.5 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
        {formatCurrency(unitTotal * item.quantity)}
      </span>
      <button onClick={onRemove} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-red-500 transition hover:bg-red-50 active:scale-90 dark:hover:bg-red-900/30">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
