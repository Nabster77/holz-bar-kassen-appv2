import { useState } from 'react';
import { X, ArrowDownCircle, ArrowUpCircle, Check } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import type { CashSession } from '@/types';

interface Props {
  session: CashSession;
  type: 'deposit' | 'withdrawal';
  onSave: (amount: number, reason: string) => void;
  onClose: () => void;
}

export function CashEntryDialog({ session, type, onSave, onClose }: Props) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const isDeposit = type === 'deposit';

  function handleSave() {
    const a = parseFloat(amount.replace(',', '.'));
    if (isNaN(a) || a <= 0 || !reason.trim()) return;
    onSave(a, reason.trim());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/50 p-4 sm:items-center" onClick={onClose}>
      <div className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-gray-100">
            {isDeposit ? <ArrowDownCircle className="h-5 w-5 text-green-600 dark:text-green-400" /> : <ArrowUpCircle className="h-5 w-5 text-red-600 dark:text-red-400" />}
            {isDeposit ? 'Bargeld-Einlage' : 'Bargeld-Ausgabe'}
          </h3>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
            Aktueller Kassenbestand: <span className="font-bold text-gray-900 dark:text-gray-100">{formatCurrency(session.openingBalance + session.entries.reduce((s, e) => s + (e.type === 'deposit' ? e.amount : -e.amount), 0))}</span>
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
          <button onClick={handleSave} disabled={!amount || !reason.trim()}
            className={`w-full rounded-xl py-3 text-base font-semibold text-white shadow-md transition active:scale-95 disabled:opacity-50 ${isDeposit ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-600 hover:bg-orange-700'}`}>
            <Check className="mr-1.5 inline h-4 w-4" /> Bestätigen
          </button>
        </div>
      </div>
    </div>
  );
}
