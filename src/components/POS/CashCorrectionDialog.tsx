import { useRef, useState } from 'react';
import { X, Edit3, Check } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import type { CashSession } from '@/types';

interface Props {
  session: CashSession;
  currentCashBalance: number;
  onSave: (newAmount: number, reason: string) => void;
  onClose: () => void;
}

export function CashCorrectionDialog({ session, currentCashBalance, onSave, onClose }: Props) {
  const [newAmount, setNewAmount] = useState(String(session.openingBalance));
  const [reason, setReason] = useState('');

  const amount = Number(newAmount.trim().replace(',', '.'));
  const validCorrection = newAmount.trim().length > 0 && Number.isFinite(amount) && amount > 0 && currentCashBalance > 0 && Boolean(reason.trim());

  const submitted = useRef(false);

  function handleSave() {
    if (submitted.current) return;
    const a = amount;
    if (!validCorrection) return;
    submitted.current = true;
    try {
      onSave(a, reason.trim());
    } catch (error) {
      submitted.current = false;
      throw error;
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/50 p-4 sm:items-center" onClick={onClose}>
      <div className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-gray-100">
            <Edit3 className="h-5 w-5 text-orange-600 dark:text-orange-400" /> Anfangsbestand korrigieren
          </h3>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); handleSave(); }} className="space-y-4">
          <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
            Aktueller Anfangsbestand: <span className="font-bold text-gray-900 dark:text-gray-100">{formatCurrency(session.openingBalance)}</span>
          </div>
          {currentCashBalance <= 0 && <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-400">Korrektur gesperrt: Es ist kein positiver Kassenbestand vorhanden.</p>}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Neuer Anfangsbestand (€)</label>
            <input value={newAmount} onChange={(e) => setNewAmount(e.target.value)} placeholder="z.B. 200,00" inputMode="decimal"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Begründung (Pflichtfeld)</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="z.B. Zählfehler bei Eröffnung" rows={2}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100" />
          </div>
          <button type="submit" disabled={!validCorrection}
            className="w-full rounded-xl bg-orange-600 py-3 text-base font-semibold text-white shadow-md transition hover:bg-orange-700 active:scale-95 disabled:opacity-50">
            <Check className="mr-1.5 inline h-4 w-4" /> Korrektur speichern
          </button>
        </form>
      </div>
    </div>
  );
}
