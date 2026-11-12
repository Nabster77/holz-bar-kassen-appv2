import type { CartItem, Location } from '@/types';
import { formatCurrency } from '@/lib/format';
import { taxRateForProduct } from '@/lib/tax';
import { Minus, Plus, Trash2, Recycle } from 'lucide-react';

interface Props {
  item: CartItem;
  location: Location;
  onInc: () => void;
  onDec: () => void;
  onRemove: () => void;
  onEditShot?: () => void;
}

/**
 * Two-row cart entry stays usable in a narrow right-hand tablet column.
 * All quantity, shot and deposit operations remain wired to the original handlers.
 */
export function CartItemRow({ item, location, onInc, onDec, onRemove, onEditShot }: Props) {
  const unitTotal = item.unitPrice + item.unitPfand;
  const shotPrice = item.shot && item.shot.id !== 'none' ? item.shot.price : 0;
  const basePrice = item.unitPrice - shotPrice;
  const rate = taxRateForProduct(item.product, location);

  return (
    <div className="min-w-0 space-y-2 border-b border-slate-200 py-2.5 dark:border-slate-700">
      <div className="flex min-w-0 items-start justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <p className={`break-words text-sm font-semibold leading-tight ${item.isPfandRetoure ? 'text-teal-700 dark:text-teal-300' : 'text-slate-900 dark:text-slate-100'}`}>
            {item.isPfandRetoure && <Recycle className="mr-1 inline h-3.5 w-3.5" />}
            {item.product.name}
            {!item.isPfandRetoure && item.shot && item.shot.id !== 'none' && (
              <span className="text-blue-600 dark:text-blue-400"> + {item.shot.name}</span>
            )}
          </p>
          {item.isPfandRetoure ? (
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Pfand-Rückgabe · {formatCurrency(Math.abs(item.unitPrice))}/Stück
            </p>
          ) : (
            <div className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              {shotPrice > 0 ? (
                <span>Grundpreis {formatCurrency(basePrice)} + SCHUSS {formatCurrency(shotPrice)}</span>
              ) : (
                <span>Stückpreis {formatCurrency(unitTotal)} · MwSt. {rate}%</span>
              )}
              {item.unitPfand > 0 && <span className="block text-amber-600 dark:text-amber-400">+ {formatCurrency(item.unitPfand)} Pfand</span>}
            </div>
          )}
          {onEditShot && !item.isPfandRetoure && (
            <button type="button" onClick={onEditShot}
              className="mt-1.5 min-h-8 rounded-lg border border-violet-300 bg-violet-50 px-2 text-xs font-bold text-violet-800 hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-900/30 dark:text-violet-200">
              {item.shot ? 'SCHUSS ändern' : '+ SCHUSS'}
            </button>
          )}
        </div>
        <button type="button" aria-label={`${item.product.name} aus Warenkorb entfernen`} onClick={onRemove}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-1.5">
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" aria-label={`${item.product.name}: Menge verringern`} onClick={onDec}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-800 active:scale-95 dark:bg-slate-700 dark:text-slate-100">
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-6 text-center text-sm font-bold tabular-nums">{item.quantity}</span>
          <button type="button" aria-label={`${item.product.name}: Menge erhöhen`} onClick={onInc}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-800 active:scale-95 dark:bg-slate-700 dark:text-slate-100">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <span className={`min-w-0 text-right text-sm font-bold tabular-nums ${unitTotal * item.quantity < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'}`}>
          {formatCurrency(unitTotal * item.quantity)}
        </span>
      </div>
    </div>
  );
}
