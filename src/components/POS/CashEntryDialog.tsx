import { useRef, useState } from 'react';
import { X, ArrowDownCircle, ArrowUpCircle, Check } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import type { CashSession } from '@/types';

interface Props {
  session: CashSession;
  currentCashBalance: number;
  type: 'deposit' | 'withdrawal';
  onSave: (amount: number, reason: string) => void;
  onClose: () => void;
}

export function CashEntryDialog({ currentCashBalance, type, onSave, onClose }: Props) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const isDeposit = type === 'deposit';

  const parsedAmount = Number(amount.trim().replace(',', '.'));
  const validAmount = amount.trim().length > 0 && Number.isFinite(parsedAmount) && parsedAmount > 0 && (isDeposit || Math.round(parsedAmount * 100) <= Math.round(currentCashBalance * 100));

  const submitted = useRef(false);

  function handleSave() {
    if (submitted.current) return;
    const a = parsedAmount;
    if (!validAmount || !reason.trim()) return;
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
            {isDeposit ? <ArrowDownCircle className="h-5 w-5 text-violet-600 dark:text-violet-400" /> : <ArrowUpCircle className="h-5 w-5 text-red-600 dark:text-red-400" />}
            {isDeposit ? 'Bargeld-Einlage' : 'Bargeld-Ausgabe'}
          </h3>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); handleSave(); }} className="space-y-4">
          <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
            Aktueller Kassenbestand: <span className="font-bold text-gray-900 dark:text-gray-100">{formatCurrency(currentCashBalance)}</span>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Betrag (€)</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="z.B. 50,00" inputMode="decimal"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Beschreibung / Grund</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={isDeposit ? 'z.B. Wechselgeld aufgefüllt' : 'z.B. Privatentnahme'}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100" />
          </div>
          {!isDeposit && !validAmount && amount.trim() && <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-400">Die Buchung kann nicht durchgeführt werden. Der vorhandene Bargeldbestand reicht nicht aus oder der Betrag ist ungültig. Ein negativer Kassenbestand ist nicht zulässig.</p>}
          <button type="submit" disabled={!validAmount || !reason.trim()}
            className={`w-full rounded-xl py-3 text-base font-semibold text-white shadow-md transition active:scale-95 disabled:opacity-50 ${isDeposit ? 'bg-violet-600 hover:bg-violet-700' : 'bg-red-600 hover:bg-red-700'}`}>
            <Check className="mr-1.5 inline h-4 w-4" /> Bestätigen
          </button>
        </form>
      </div>
    </div>
  );
}
