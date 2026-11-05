import { useState } from 'react';
import { X, Recycle, Check, MapPin, Minus, Plus } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import type { CashSession, PfandSettings } from '@/types';

interface Props {
  session: CashSession;
  pfandSettings: PfandSettings;
  onSave: (amount: number, count: number) => void;
  onClose: () => void;
}

export function PfandRetoureDialog({ session, pfandSettings, onSave, onClose }: Props) {
  const [count, setCount] = useState(0);

  const location = session.location;
  const pfandAmount = pfandSettings[location];
  const total = count * pfandAmount;

  function handleSave() {
    if (count <= 0) return;
    onSave(total, count);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
          <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-gray-100">
            <Recycle className="h-5 w-5 text-green-600 dark:text-green-400" /> Pfand-Retoure
          </h3>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          <div className="mb-5 flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-gray-900/40">
            <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{location}</span>
            <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
              Pfandbetrag: <span className="font-bold text-teal-600 dark:text-teal-400">{formatCurrency(pfandAmount)}</span> pro Artikel
            </span>
          </div>

          <div className="flex flex-col items-center gap-4">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Anzahl retournierte Pfandartikel</p>

            <div className="flex items-center gap-4">
              <button
                onClick={() => setCount((c) => Math.max(0, c - 1))}
                className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-2xl font-bold text-gray-700 transition active:scale-90 dark:bg-gray-700 dark:text-gray-200"
              >
                <Minus className="h-6 w-6" />
              </button>
              <span className="w-16 text-center text-4xl font-bold text-gray-900 dark:text-gray-100">{count}</span>
              <button
                onClick={() => setCount((c) => c + 1)}
                className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-2xl font-bold text-gray-700 transition active:scale-90 dark:bg-gray-700 dark:text-gray-200"
              >
                <Plus className="h-6 w-6" />
              </button>
            </div>

            <div className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-center dark:border-gray-700 dark:bg-gray-900/40">
              <p className="text-xs text-gray-500 dark:text-gray-400">{count} Artikel × {formatCurrency(pfandAmount)}</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{formatCurrency(total)}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 p-4 dark:border-gray-700">
          <button
            onClick={handleSave}
            disabled={count <= 0}
            className="w-full rounded-xl bg-green-600 py-3 text-base font-semibold text-white shadow-md transition hover:bg-green-700 active:scale-95 disabled:opacity-50"
          >
            <Check className="mr-1.5 inline h-4 w-4" /> Pfand-Retoure verbuchen
          </button>
        </div>
      </div>
    </div>
  );
}
