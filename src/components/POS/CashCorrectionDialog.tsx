import { useState } from 'react';
import { X, Edit3, Check } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import type { CashSession } from '@/types';

interface Props {
  session: CashSession;
  onSave: (newAmount: number, reason: string, employeeCode: string) => void;
  onClose: () => void;
}

export function CashCorrectionDialog({ session, onSave, onClose }: Props) {
  const [newAmount, setNewAmount] = useState(String(session.openingBalance));
  const [reason, setReason] = useState('');
  const employeeCode = session.activeEmployeeCode ?? session.employeeCode ?? '';

  function handleSave() {
    const a = parseFloat(newAmount.replace(',', '.'));
    if (isNaN(a) || a < 0 || !reason.trim() || !employeeCode.trim()) return;
    onSave(a, reason.trim(), employeeCode.trim().toUpperCase());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/50 p-4 sm:items-center" onClick={onClose}>
      <div className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-gray-100">
            <Edit3 className="h-5 w-5 text-amber-600 dark:text-amber-400" /> Anfangsbestand korrigieren
          </h3>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
            Aktueller Anfangsbestand: <span className="font-bold text-gray-900 dark:text-gray-100">{formatCurrency(session.openingBalance)}</span>
          </div>
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
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Buchendes Mitarbeiter-Kürzel</p>
            <p className="mt-1 text-xl font-bold uppercase text-amber-800 dark:text-amber-200">{employeeCode || '—'}</p>
          </div>
          <button onClick={handleSave} disabled={!newAmount || !reason.trim() || !employeeCode.trim()}
            className="w-full rounded-xl bg-amber-600 py-3 text-base font-semibold text-white shadow-md transition hover:bg-amber-700 active:scale-95 disabled:opacity-50">
            <Check className="mr-1.5 inline h-4 w-4" /> Korrektur speichern
          </button>
        </div>
      </div>
    </div>
  );
}
