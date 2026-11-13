import { useMemo, useState } from 'react';
import { ClipboardList, FileDown, LockKeyhole, ShieldCheck, X } from 'lucide-react';
import type { CashSession, StaffUser, Transaction } from '@/types';
import type { StornoRecord } from '@/lib/stornoRules';
import { lastFiveCashReceipts, lastFiveStornoCandidates, prepareStorno } from '@/lib/stornoRules';
import { formatCurrency } from '@/lib/format';
import { exportStornoDocument } from '@/lib/stornoReceiptPdf';

interface Props {
  session: CashSession;
  transactions: Transaction[];
  stornos: StornoRecord[];
  staff: StaffUser;
  currentCashBalance: number;
  online: boolean;
  testMode: boolean;
  cloudReady: boolean;
  cloudError?: string;
  onClose: () => void;
  onCommit: (receipt: Transaction, reason: string, password: string, id: string) => Promise<StornoRecord>;
}

const dateTime = (ts: number) => new Date(ts).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

/** The last five are a selection window, never a deletion policy. */
export function BonlisteDialog({ session, transactions, stornos, staff, currentCashBalance,
  online, testMode, cloudReady, cloudError, onClose, onCommit }: Props) {
  const newest = useMemo(() => lastFiveCashReceipts(transactions, session), [transactions, session]);
  const available = useMemo(() => new Set(lastFiveStornoCandidates(transactions, stornos, session).map((r) => r.id)),
    [transactions, stornos, session]);
  const existing = useMemo(() => new Map(stornos.map((r) => [r.originalTransactionId, r])), [stornos]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = newest.find((r) => r.id === selectedId) ?? null;
  const alreadyVoided = selected ? existing.get(selected.id) : undefined;
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState<StornoRecord | null>(null);
  const [idempotencyId, setIdempotencyId] = useState(() => crypto.randomUUID());

  const canSubmit = Boolean(selected && available.has(selected.id) && reason.trim().length >= 3 &&
    reason.trim().length <= 500 && password && !busy && (testMode || online && cloudReady));

  const select = (receipt: Transaction) => {
    if (busy) return;
    setSelectedId(receipt.id);
    setReason('');
    setPassword('');
    setConfirming(false);
    setCompleted(null);
    setError('');
    setIdempotencyId(crypto.randomUUID());
  };

  const review = () => {
    if (!selected) return;
    setError('');
    try {
      prepareStorno({
        receipt: selected, session, previousStornos: stornos, allTransactions: transactions,
        reason, employeeId: staff.id, employeeName: staff.name,
        currentCashBalance, now: Date.now(), stornoId: idempotencyId,
      });
      if (!password.trim()) throw new Error('Bitte das persönliche Mitarbeiterpasswort eingeben.');
      if (!online && !testMode) throw new Error('Ein Storno ist ohne Cloud-Verbindung nicht möglich.');
      if (!cloudReady && !testMode) throw new Error(cloudError || 'Storno-Dienst derzeit nicht freigegeben.');
      setConfirming(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const commit = async () => {
    if (!selected || !canSubmit) return;
    setBusy(true);
    setError('');
    try {
      const confirmed = await onCommit(selected, reason.trim(), password, idempotencyId);
      setCompleted(confirmed);
      setPassword('');
      setConfirming(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Storno nicht bestätigt. Im Journal prüfen.');
      // Keep the original UUID for an idempotent retry after a timeout.
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/75 p-2 sm:p-4"
      role="presentation" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label="Bonliste und Stornierung"
        className="flex max-h-[96dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-emerald-600/40 bg-white text-gray-900 shadow-2xl dark:bg-[#111d2e] dark:text-gray-100"
        onClick={(event) => event.stopPropagation()}>
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-slate-700">
          <h2 className="flex items-center gap-2 text-base font-bold sm:text-lg">
            <ClipboardList className="h-5 w-5 text-emerald-500" /> Bonliste · letzte 5 Einzelbons
          </h2>
          <button type="button" aria-label="Bonliste schließen" onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-300 dark:border-slate-600">
            <X className="h-5 w-5" />
          </button>
        </header>
        <p className="shrink-0 px-4 py-2 text-xs text-slate-600 dark:text-slate-300">
          {session.location} · Nur Bons der geöffneten Kassensitzung. Stornierte Bons bleiben in der Liste und im Journal erhalten.
        </p>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 sm:grid-cols-[minmax(220px,.85fr)_minmax(0,1.35fr)] sm:overflow-hidden">
          <div className="min-h-0 space-y-2 overflow-y-auto">
            {!newest.length && <p className="rounded-xl bg-slate-100 p-4 text-sm dark:bg-slate-800">Noch keine Einzelbons dieser Kasse vorhanden.</p>}
            {newest.map((receipt, index) => {
              const voided = existing.get(receipt.id);
              return <button type="button" key={receipt.id} onClick={() => select(receipt)}
                aria-pressed={selected?.id === receipt.id}
                className={`w-full rounded-xl border p-3 text-left transition ${selected?.id === receipt.id
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                  : 'border-gray-200 bg-gray-50 hover:border-emerald-500/60 dark:border-slate-700 dark:bg-slate-800'}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-300">Bon {index + 1} · {dateTime(receipt.timestamp)}</span>
                  <strong className="text-sm">{formatCurrency(receipt.total)}</strong>
                </span>
                <span className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span>{receipt.paymentMethod === 'cash' ? 'Bar' : 'Karte'} · {receipt.items.length} Positionen</span>
                  <span className={voided ? 'font-bold text-red-600 dark:text-red-400' : 'font-semibold text-emerald-700 dark:text-emerald-300'}>
                    {voided ? 'STORNIERT' : 'Offener Bon'}
                  </span>
                </span>
              </button>;
            })}
          </div>
          <div className="min-h-0 overflow-y-auto rounded-xl border border-gray-200 p-3 dark:border-slate-700">
            {!selected ? <p className="text-sm text-slate-500">Zum Anzeigen einen Einzelbon auswählen.</p> : <>
              <h3 className="text-base font-bold">Originalbon</h3>
              <p className="mb-3 break-all text-xs text-slate-500 dark:text-slate-400">ID: {selected.id}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead><tr className="border-b border-slate-300 text-left dark:border-slate-600">
                    <th className="py-2">Artikel</th><th className="text-right">Anzahl</th><th className="text-right">Preis</th><th className="text-right">Pfand</th>
                  </tr></thead>
                  <tbody>{selected.items.map((item, i) => <tr key={i} className="border-b border-slate-200 dark:border-slate-700">
                    <td className="py-2">{item.name}</td><td className="text-right">{item.quantity}</td>
                    <td className="text-right">{formatCurrency(item.price * item.quantity)}</td>
                    <td className="text-right">{formatCurrency(item.pfand)}</td>
                  </tr>)}</tbody>
                </table>
              </div>
              <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-sm">
                <dt>Brutto ohne Pfand</dt><dd className="text-right">{formatCurrency(selected.subtotal)}</dd>
                <dt>Netto</dt><dd className="text-right">{formatCurrency(selected.totalNet)}</dd>
                {Object.entries(selected.taxByRate).map(([rate,money]) => <div key={rate} className="contents">
                  <dt>MwSt {rate}%</dt><dd className="text-right">{formatCurrency(money)}</dd>
                </div>)}
                <dt>Pfand</dt><dd className="text-right">{formatCurrency(selected.totalPfand)}</dd>
                <dt className="font-bold">Gesamt / {selected.paymentMethod === 'cash' ? 'Bar' : 'Karte'}</dt>
                <dd className="text-right font-bold">{formatCurrency(selected.total)}</dd>
              </dl>
              {alreadyVoided ? <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
                <strong>Storniert</strong> am {dateTime(alreadyVoided.timestamp)} · {alreadyVoided.employeeName}.
                <p className="mt-1">Grund: {alreadyVoided.reason}</p>
                <button type="button" onClick={() => { void exportStornoDocument(alreadyVoided, testMode); }}
                  className="mt-2 flex min-h-10 items-center gap-2 rounded-lg border border-red-300 px-3 py-2 font-semibold">
                  <FileDown className="h-4 w-4" /> Stornobeleg als PDF
                </button>
              </div> : completed ? <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950/30">
                <strong>{testMode ? 'TEST-STORNO' : 'Storno von Cloud bestätigt'}</strong>
                <p className="mt-1 break-all">Storno-ID: {completed.id}</p>
                <button type="button" onClick={() => { void exportStornoDocument(completed, testMode); }}
                  className="mt-2 flex min-h-10 items-center gap-2 rounded-lg border border-emerald-500 px-3 py-2 font-semibold">
                  <FileDown className="h-4 w-4" /> Stornobeleg als PDF
                </button>
              </div> : available.has(selected.id) ? (
                <div className="mt-4 space-y-3 border-t border-slate-300 pt-3 dark:border-slate-700">
                  <h4 className="flex items-center gap-2 font-bold"><ShieldCheck className="h-4 w-4" /> Stornierung vorbereiten</h4>
                  {!testMode && (!online || !cloudReady) && (
                    <p role="alert" className="rounded-lg bg-amber-50 p-2 text-xs font-semibold text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                      {online ? cloudError || 'Storno-Dienst noch nicht vollständig eingerichtet.' : 'Offline: Stornieren gesperrt.'}
                    </p>
                  )}
                  <label className="block text-xs font-semibold">Begründung (Pflichtfeld, 3–500 Zeichen)
                    <textarea rows={2} value={reason} maxLength={500}
                      onChange={(event) => { setReason(event.target.value); setConfirming(false); setError(''); }}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-gray-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
                  </label>
                  <label className="block text-xs font-semibold">Persönliches Mitarbeiterpasswort zur Bestätigung
                    <input type="password" autoComplete="off" value={password}
                      onChange={(event) => { setPassword(event.target.value); setConfirming(false); setError(''); }}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-base text-gray-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
                  </label>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Gegenbuchung: {formatCurrency(-selected.total)} {selected.paymentMethod === 'cash'
                      ? 'Bargeld (nur bei ausreichendem Kassenbestand)'
                      : 'Kartenumsatz (keine automatische Kartenterminal-Erstattung)'}.
                    Der Originalbon bleibt erhalten.
                  </p>
                  {error && <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm font-semibold text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
                  {!confirming ? <button type="button" disabled={!canSubmit} onClick={review}
                    className="min-h-11 w-full rounded-xl bg-amber-600 p-2 text-sm font-bold text-white disabled:opacity-50">
                    Storno prüfen
                  </button> : <>
                    <p className="flex items-center gap-2 rounded-lg border border-amber-500 bg-amber-50 p-2 text-xs font-bold text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                      <LockKeyhole className="h-5 w-5 shrink-0" />
                      {testMode ? 'Nur Simulation: Es erfolgt keine dauerhafte Buchung.' : 'Endgültig bestätigen: Der Beleg wird unveränderlich storniert.'}
                    </p>
                    <div className="flex gap-2">
                      <button type="button" disabled={busy} onClick={() => setConfirming(false)}
                        className="min-h-11 flex-1 rounded-xl border border-slate-400 p-2 text-sm font-bold">Abbrechen</button>
                      <button type="button" disabled={!canSubmit} onClick={() => void commit()}
                        className="min-h-11 flex-1 rounded-xl bg-red-700 p-2 text-sm font-bold text-white disabled:opacity-50">
                        {busy ? 'Cloud wird bestätigt …' : testMode ? 'Test-Storno ausführen' : 'Verbindlich stornieren'}
                      </button>
                    </div>
                  </>}
                </div>
              ) : <p className="mt-3 text-xs font-semibold text-amber-700">Dieser Bon ist nicht mehr stornierbar.</p>}
            </>}
          </div>
        </div>
      </section>
    </div>
  );
}
