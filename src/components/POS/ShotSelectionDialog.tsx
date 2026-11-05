import type { Product, ShotOption } from '@/types';
import { SHOT_OPTIONS } from '@/lib/seed';
import { X, Wine } from 'lucide-react';
import { formatCurrency } from '@/lib/format';

interface Props {
  product: Product;
  onSelect: (shot: ShotOption) => void;
  onCancel: () => void;
}

export function ShotSelectionDialog({ product, onSelect, onCancel }: Props) {
  const options: ShotOption[] = SHOT_OPTIONS.map((s) => ({
    ...s,
    price: s.id === 'none' ? 0 : (product.shotPrices?.[s.id] ?? s.price),
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/50 p-4 sm:items-center" onClick={onCancel}>
      <div className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-gray-100">
            <Wine className="h-5 w-5 text-blue-600 dark:text-blue-400" /> Schuss-Auswahl
          </h3>
          <button onClick={onCancel} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{product.name} — Schuss hinzufügen?</p>
        <div className="space-y-2">
          {options.map((shot) => (
            <button
              key={shot.id}
              onClick={() => onSelect(shot)}
              className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition hover:border-blue-500 hover:bg-blue-50 active:scale-95 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-400 dark:hover:bg-blue-900/20"
            >
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{shot.name}</span>
              <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                {shot.price > 0 ? `+ ${formatCurrency(shot.price)}` : 'kein Aufpreis'}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
