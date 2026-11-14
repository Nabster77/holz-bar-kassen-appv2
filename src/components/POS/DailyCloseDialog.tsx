import { movementStyle, movementBadgeHTML, hasNegativeMoney, negativeMoneyClass } from '@/lib/movementStyle';
import { useMemo, useState, type ReactNode } from 'react';
import { X, Lock, FileDown, Check, TriangleAlert as AlertTriangle, Calculator, Coins, Banknote, ChevronDown } from 'lucide-react';
import { formatCurrency, formatDateGermanFromISO, formatTime } from '@/lib/format';
import { formatCashSessionTimestamp, verifiedCloseTimestamp } from '@/lib/cashSessionTimes';
import { escapeHtml } from '@/lib/escapeHtml';
import { mergeTaxByRate, sortedRateKeys } from '@/lib/tax';
import { formatDailyCloseReceiptNumber } from '@/lib/dailyCloseReceipt';
import { renderPdfHtml } from '@/lib/journalPdfFile';
import { calculateYearlyPfandOverview, type YearlyPfandOverview } from '@/lib/journalPdf';
import { sessionTransactions } from '@/lib/sessionTransactions';
import { projectFinancialTransactions, type StornoJournalTransaction } from '@/lib/stornoReportProjection';
import type { StornoRecord } from '@/lib/stornoRules';
import type { CashSession, StaffActivity, StaffLoginInterval, StaffUser, Transaction } from '@/types';

const DENOMINATIONS: { label: string; value: number }[] = [
  { label: '1 Cent', value: 0.01 },
  { label: '2 Cent', value: 0.02 },
  { label: '5 Cent', value: 0.05 },
  { label: '10 Cent', value: 0.10 },
  { label: '20 Cent', value: 0.20 },
  { label: '50 Cent', value: 0.50 },
  { label: '1 Euro', value: 1 },
  { label: '2 Euro', value: 2 },
  { label: '5 Euro', value: 5 },
  { label: '10 Euro', value: 10 },
  { label: '20 Euro', value: 20 },
  { label: '50 Euro', value: 50 },
  { label: '100 Euro', value: 100 },
];

const COINS = DENOMINATIONS.filter((denomination) => denomination.value < 1);
const NOTES = DENOMINATIONS.filter((denomination) => denomination.value >= 1);

type MovementKind = 'Pfandausgabe' | 'Bareinnahme' | 'Karteneinnahme' | 'Storno' | 'Einlage' | 'Ausgabe' | 'Korrektur';

interface MovementRecord {
  id: string;
  kind: MovementKind;
  timestamp: number;
  employeeName?: string;
  amount: number;
  details: string;
}

/**
 * A checkout can contain both sold articles and a returned deposit.  The
 * payment itself remains one transaction, but its display must be split so a
 * "Pfandausgabe" never contains a sold article or an incoming deposit.
 */
function transactionMovementRecords(transaction: Transaction): MovementRecord[] {
  if ('isStornoProjection' in transaction && transaction.isStornoProjection === true) {
    return [{
      id: transaction.id,
      kind: 'Storno',
      timestamp: transaction.timestamp,
      employeeName: transaction.employeeName,
      amount: transaction.total,
      details: `Originalbon: ${(transaction as StornoJournalTransaction).stornoOriginalId} · Grund: ${(transaction as StornoJournalTransaction).stornoReason}`,
    }];
  }
  const records: MovementRecord[] = [];
  const returnedDepositItems = transaction.items.filter((item) => item.isPfandRetoure);
  const soldItems = transaction.items.filter((item) => !item.isPfandRetoure);

  if (returnedDepositItems.length > 0) {
    records.push({
      id: `${transaction.id}-pfand-retoure`,
      kind: 'Pfandausgabe',
      timestamp: transaction.timestamp,
      employeeName: transaction.employeeName,
      amount: returnedDepositItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
      details: returnedDepositItems.map((item) => `${item.quantity}× Pfand-Retoure`).join(', '),
    });
  }

  if (soldItems.length > 0) {
    records.push({
      id: `${transaction.id}-artikelverkauf`,
      kind: transaction.paymentMethod === 'cash' ? 'Bareinnahme' : 'Karteneinnahme',
      timestamp: transaction.timestamp,
      employeeName: transaction.employeeName,
      // The item line's pfand is an incoming deposit and therefore belongs to
      // the actual sale/payment method, never to the deposit payout group.
      amount: soldItems.reduce((sum, item) => sum + item.price * item.quantity + item.pfand, 0),
      details: soldItems.map((item) => `${item.quantity}× ${item.name}`).join(', '),
    });
  }

  return records;
}

const MOVEMENT_ORDER: MovementKind[] = ['Pfandausgabe', 'Bareinnahme', 'Karteneinnahme', 'Storno', 'Einlage', 'Ausgabe', 'Korrektur'];

function movementColor(kind: MovementKind): string { return movementStyle(kind).badge; }

interface Props {
  session: CashSession;
  transactions: Transaction[];
  stornos?: StornoRecord[];
  currentStaff: StaffUser | null;
  onClose: (closingBalance: number, closingWithdrawalAmount: number) => Promise<{ ok: boolean; error?: string }>;
  onCancel: () => void;
}

export function DailyCloseDialog({ session, transactions, stornos = [], currentStaff, onClose, onCancel }: Props) {
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [manualBalance, setManualBalance] = useState('');
  const [useCounting, setUseCounting] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [withdrawalStep, setWithdrawalStep] = useState(false);
  const [closingWithdrawalInput, setClosingWithdrawalInput] = useState('');
  const [expandedMovementGroups, setExpandedMovementGroups] = useState<Partial<Record<MovementKind, boolean>>>({});

  const sessionTx = useMemo(
    () => projectFinancialTransactions(
      sessionTransactions(transactions, session),
      stornos.filter((entry) => entry.cashSessionId === session.id),
      session.openedAt,
      Infinity,
    ),
    [transactions, session, stornos],
  );
  const yearlyPfandOverview = useMemo(
    () => calculateYearlyPfandOverview(
      projectFinancialTransactions(transactions, stornos),
      new Date(session.openedAt).getFullYear(), session.location),
    [transactions, stornos, session.openedAt, session.location],
  );

  // Sales turnover never includes deposits. Deposits are neither taxable nor
  // revenue; they are displayed separately below.
  const txTotal = sessionTx.reduce((sum, transaction) => sum + transaction.subtotal, 0);
  const cashTxTotal = sessionTx
    .filter((transaction) => transaction.paymentMethod === 'cash')
    .reduce((sum, transaction) => sum + transaction.subtotal, 0);
  const cardTxTotal = sessionTx
    .filter((transaction) => transaction.paymentMethod === 'card')
    .reduce((sum, transaction) => sum + transaction.subtotal, 0);
  // The physical till does include cash deposits and returned deposits. Keep
  // this separate from taxable cash turnover.
  const cashTillTransactionTotal = sessionTx
    .filter((transaction) => transaction.paymentMethod === 'cash')
    .reduce((sum, transaction) => sum + transaction.total, 0);
  const taxByRate = useMemo(() => mergeTaxByRate(sessionTx), [sessionTx]);
  const totalTax = [...taxByRate.values()].reduce((s, v) => s + v, 0);
  const totalNet = sessionTx.reduce((s, t) => s + t.totalNet, 0);
  const deposits = session.entries.filter((e) => e.type === 'deposit').reduce((s, e) => s + e.amount, 0);
  const withdrawals = session.entries.filter((e) => e.type === 'withdrawal').reduce((s, e) => s + e.amount, 0);
  const expected = Math.round((session.openingBalance + cashTillTransactionTotal + deposits - withdrawals) * 100) / 100;
  const openingCorrectionTotal = session.corrections.reduce((sum, correction) => sum + correction.newAmount - correction.oldAmount, 0);
  const cashPfandIncome = sessionTx
    .filter((transaction) => transaction.paymentMethod === 'cash')
    .reduce((sum, transaction) => sum + transaction.items
      .filter((item) => !item.isPfandRetoure)
      .reduce((itemSum, item) => itemSum + item.pfand, 0), 0);
  const cashPfandPayout = Math.abs(sessionTx
    .filter((transaction) => transaction.paymentMethod === 'cash')
    .reduce((sum, transaction) => sum + transaction.items
    .filter((item) => item.isPfandRetoure)
    .reduce((itemSum, item) => itemSum + item.price * item.quantity, 0), 0));

  const movementGroups = useMemo(() => {
    const grouped = new Map<MovementKind, MovementRecord[]>();
    const add = (record: MovementRecord) => grouped.set(record.kind, [...(grouped.get(record.kind) ?? []), record]);

    sessionTx.forEach((transaction) => transactionMovementRecords(transaction).forEach(add));
    session.entries.forEach((entry) => add({
      id: entry.id,
      kind: entry.isPfandRetoure ? 'Pfandausgabe' : entry.type === 'deposit' ? 'Einlage' : 'Ausgabe',
      timestamp: entry.timestamp,
      employeeName: entry.employeeName,
      amount: entry.type === 'deposit' ? entry.amount : -entry.amount,
      details: entry.reason,
    }));
    session.corrections.forEach((correction) => add({
      id: correction.id,
      kind: 'Korrektur',
      timestamp: correction.timestamp,
      employeeName: correction.employeeName,
      amount: correction.newAmount - correction.oldAmount,
      details: `${formatCurrency(correction.oldAmount)} → ${formatCurrency(correction.newAmount)} · ${correction.reason}`,
    }));

    return MOVEMENT_ORDER.flatMap((kind) => {
      const records = grouped.get(kind);
      return records?.length ? [{ kind, records: [...records].sort((a, b) => a.timestamp - b.timestamp) }] : [];
    });
  }, [sessionTx, session.entries, session.corrections]);

  const countedTotal = useMemo(() => {
    let sum = 0;
    for (const d of DENOMINATIONS) {
      const c = parseInt(counts[d.value] ?? '', 10);
      if (!isNaN(c) && c > 0) sum += c * d.value;
    }
    return Math.round(sum * 100) / 100;
  }, [counts]);

  const countValue = (denominations: typeof DENOMINATIONS) => Math.round(
    denominations.reduce((sum, denomination) => {
      const quantity = parseInt(counts[denomination.value] ?? '', 10);
      return sum + (Number.isNaN(quantity) || quantity < 1 ? 0 : quantity * denomination.value);
    }, 0) * 100,
  ) / 100;
  const coinTotal = countValue(COINS);
  const noteTotal = countValue(NOTES);

  const hasInput = useCounting ? Object.values(counts).some((v) => v && v !== '0') : !!manualBalance;
  const closingBalance = useCounting
    ? (hasInput ? countedTotal : expected)
    : (manualBalance ? parseFloat(manualBalance.replace(',', '.')) : expected);
  const diff = closingBalance - expected;
  const closingWithdrawalAmount = Math.max(0, parseFloat(closingWithdrawalInput.replace(',', '.')) || 0);
  // The next opening balance is always determined from the booked cash
  // movements. A counted/manual value is only a control value and must not
  // accidentally overwrite the mathematical closing balance.
  const remainingCash = Math.round((expected - closingWithdrawalAmount) * 100) / 100;

  function beginClose() {
    if (isNaN(closingBalance) || closingBalance < 0 || !confirmed) return;
    setCloseError(null);
    setWithdrawalStep(true);
  }

  async function handleClose() {
    if (isNaN(closingBalance) || closingBalance < 0 || !confirmed) return;
    if (closingWithdrawalAmount > expected) {
      setCloseError('Die Entnahme darf nicht höher sein als der rechnerische Kassenbestand.');
      return;
    }
    setCloseError(null);
    setIsFinalizing(true);
    try {
      const result = await onClose(Math.round(remainingCash * 100) / 100, Math.round(closingWithdrawalAmount * 100) / 100);
      if (!result.ok) setCloseError(result.error ?? 'Beleg konnte nicht erstellt werden. Bitte erneut versuchen.');
    } catch {
      setCloseError('Beleg konnte nicht erstellt werden. Bitte Internetverbindung prüfen und erneut versuchen.');
    } finally {
      setIsFinalizing(false);
    }
  }

  function handlePDFExport() {
    const b = hasInput && !isNaN(closingBalance) ? closingBalance : expected;
    void generatePDF(session, sessionTx, {
      txTotal, cashTxTotal, cardTxTotal, taxByRate: Object.fromEntries(taxByRate), totalNet, deposits, withdrawals, expected, closingBalance: b, difference: b - expected,
    }, currentStaff?.name, yearlyPfandOverview);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/50 p-4 sm:items-center" onClick={onCancel}>
      <div className="my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col rounded-3xl bg-white shadow-2xl dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
          <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-gray-100">
            <Lock className="h-5 w-5 text-blue-600 dark:text-blue-400" /> Tagesabschluss
          </h3>
          <button onClick={onCancel} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-4">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Standort: {session.location}</p>
            <p className="mt-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
              Kasseneröffnung: {formatCashSessionTimestamp(session.openedAt)}
            </p>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Endgültiger Tagesabschluss: {session.closed && verifiedCloseTimestamp(session) !== null
                ? formatCashSessionTimestamp(verifiedCloseTimestamp(session)!)
                : 'Noch nicht gebucht'}
            </p>
            <p className={`mt-1 text-sm font-bold ${session.closed ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>
              {session.closed ? 'Endgültig abgeschlossen' : 'Entwurf – noch nicht endgültig abgeschlossen'}
            </p>
            {session.dailyCloseReceiptNumber && <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Belegnummer: {formatDailyCloseReceiptNumber(session.dailyCloseReceiptNumber, session.dailyCloseReceiptLocation ?? session.location, session.closedAt ?? session.openedAt, session.dailyCloseReceiptYear)}</p>}
          </div>

          {/* Summary */}
          <div className="mb-4 space-y-1.5 rounded-2xl bg-gray-50 p-4 dark:bg-gray-900/40">
            <Row label="Anfangsbestand" value={<MoneyAmount value={session.openingBalance} />} />
            <Row label="Brutto-Umsatz (ohne Pfand)" value={<MoneyAmount value={txTotal} />} bold />
            <Row label="davon Barumsatz (ohne Pfand)" value={<MoneyAmount value={cashTxTotal} />} />
            <Row label="davon Kartenumsatz (ohne Pfand)" value={<MoneyAmount value={cardTxTotal} />} />
            <Row label="Pfandeinnahmen (bar)" value={`+ ${formatCurrency(cashPfandIncome)}`} />
            <Row label="Pfandretouren" value={`- ${formatCurrency(cashPfandPayout)}`} />
            <Row label="Bareinlagen" value={`+ ${formatCurrency(deposits)}`} />
            <Row label="Barausgaben" value={`- ${formatCurrency(withdrawals)}`} />
            {openingCorrectionTotal !== 0 && <Row label="Korrekturen am Anfangsbestand (bereits enthalten)" value={`${openingCorrectionTotal > 0 ? '+' : '-'} ${formatCurrency(Math.abs(openingCorrectionTotal))}`} />}
            <div className="border-t border-gray-200 pt-1.5 dark:border-gray-700">
              <Row label="Erwarteter Kassenbestand" value={<MoneyAmount value={expected} />} bold />
            </div>
          </div>

          {/* Tax breakdown */}
          <div className="mb-4 space-y-1.5 rounded-2xl bg-gray-50 p-4 dark:bg-gray-900/40">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Mehrwertsteuer</p>
            <Row label="Nettoumsatz" value={<MoneyAmount value={totalNet} />} />
            {sortedRateKeys(taxByRate).map((rate) => (
              <Row key={rate} label={`MwSt ${rate}%`} value={formatCurrency(taxByRate.get(rate) ?? 0)} />
            ))}
            <Row label="MwSt gesamt" value={<MoneyAmount value={totalTax} />} bold />
          </div>

          {/* Collapsible transaction and cash movement groups */}
          {movementGroups.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Transaktionen und Kassenbewegungen</p>
              <div className="space-y-2">
                {movementGroups.map(({ kind, records }) => {
                  const total = records.reduce((sum, record) => sum + record.amount, 0);
                  const expanded = !!expandedMovementGroups[kind];
                  return (
                    <div key={kind} className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                      <button
                        type="button"
                        onClick={() => setExpandedMovementGroups((current) => ({ ...current, [kind]: !current[kind] }))}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-gray-50 dark:hover:bg-gray-900/40"
                        aria-expanded={expanded}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${movementColor(kind)}`}>{kind}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{records.length} Buchung{records.length === 1 ? '' : 'en'}</span>
                        </span>
                        <span className={`shrink-0 font-bold ${total < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}><MoneyAmount value={total} /></span>
                      </button>
                      {expanded && (
                        <div className="border-t border-gray-200 bg-gray-50 px-3 py-1.5 dark:border-gray-700 dark:bg-gray-900/30">
                          {records.map((record) => (
                            <div key={record.id} className="flex items-start justify-between gap-3 border-b border-gray-200 py-2 last:border-0 dark:border-gray-700">
                              <div className="min-w-0 text-sm">
                                <p className="font-medium text-gray-800 dark:text-gray-200">{formatTime(record.timestamp)} · {record.employeeName ?? 'Nicht zugeordnet'}</p>
                                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{record.details}</p>
                              </div>
                              <span className={`shrink-0 text-sm font-semibold ${record.amount < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}><MoneyAmount value={record.amount} /></span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Closing balance: counting or manual */}
          <div className="mb-3">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Tatsächlicher Kassenbestand</label>
              <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-900/60">
                <button onClick={() => setUseCounting(true)}
                  className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition ${useCounting ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                  <Calculator className="h-3 w-3" /> Stückeln
                </button>
                <button onClick={() => setUseCounting(false)}
                  className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition ${!useCounting ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                  Direkt
                </button>
              </div>
            </div>

            {useCounting ? (
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/40">
                <DenominationGroup
                  title="Münzen"
                  subtitle="1 Cent bis 50 Cent"
                  icon={<Coins className="h-4 w-4" />}
                  denominations={COINS}
                  counts={counts}
                  total={coinTotal}
                  onChange={(value, quantity) => setCounts((previous) => ({ ...previous, [value]: quantity }))}
                />
                <DenominationGroup
                  title="Scheine"
                  subtitle="1 € bis 100 €"
                  icon={<Banknote className="h-4 w-4" />}
                  denominations={NOTES}
                  counts={counts}
                  total={noteTotal}
                  onChange={(value, quantity) => setCounts((previous) => ({ ...previous, [value]: quantity }))}
                />
                <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2 dark:border-gray-700">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Leere Felder zählen als 0. Gesamtsumme:</span>
                  <span className="text-base font-bold text-gray-900 dark:text-gray-100"><MoneyAmount value={countedTotal} /></span>
                </div>
              </div>
            ) : (
              <input
                value={manualBalance}
                onChange={(e) => setManualBalance(e.target.value)}
                placeholder={formatCurrency(expected)}
                inputMode="decimal"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
            )}
          </div>

          {hasInput && !isNaN(closingBalance) && Math.abs(diff) > 0.01 && (
            <div className={`mb-3 flex items-center gap-2 rounded-xl p-3 text-sm ${diff > 0 ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
              <AlertTriangle className="h-4 w-4" />
              {diff > 0 ? `Mehrbestand: ${formatCurrency(diff)}` : `Fehlbestand: ${formatCurrency(Math.abs(diff))}`}
            </div>
          )}

          {hasInput && !isNaN(closingBalance) && Math.abs(diff) <= 0.01 && (
            <div className="mb-3 flex items-center gap-2 rounded-xl bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              <Check className="h-4 w-4" />
              Kassenbestand stimmt mit dem errechneten Bestand überein.
            </div>
          )}

          <div className="mb-3 rounded-xl bg-green-50 p-3 dark:bg-green-900/30">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-green-600 dark:text-green-500">Tagesumsatz</p>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm text-green-700 dark:text-green-400">
                <span>Brutto-Umsatz (ohne Pfand)</span>
                <span className="text-lg font-bold text-green-700 dark:text-green-400"><MoneyAmount value={txTotal} /></span>
              </div>
              <div className="flex items-center justify-between text-sm text-green-700/80 dark:text-green-500">
                <span>davon Barumsatz (ohne Pfand)</span>
                <span className="font-medium"><MoneyAmount value={cashTxTotal} /></span>
              </div>
              <div className="flex items-center justify-between text-sm text-green-700/80 dark:text-green-500">
                <span>davon Kartenumsatz (ohne Pfand)</span>
                <span className="font-medium"><MoneyAmount value={cardTxTotal} /></span>
              </div>
              <div className="flex items-center justify-between text-sm text-green-700/80 dark:text-green-500">
                <span>Netto-Umsatz</span>
                <span className="font-medium"><MoneyAmount value={totalNet} /></span>
              </div>
              <div className="flex items-center justify-between text-sm text-green-700/80 dark:text-green-500">
                <span>Enthaltene Mehrwertsteuer aus Warenumsätzen</span>
                <span className="font-medium"><MoneyAmount value={totalTax} /></span>
              </div>
            </div>
          </div>

          {!hasInput && (
            <div className="mb-3 rounded-xl bg-gray-50 p-3 text-sm text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
              Keine Stückelung eingegeben. Beim Abschließen wird der errechnete Bestand (<MoneyAmount value={expected} />) als Ist-Bestand übernommen.
            </div>
          )}

          {closeError && (
            <div className="mb-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
              {closeError}
            </div>
          )}

          {withdrawalStep && (
            <div className="mb-3 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm dark:border-red-800 dark:bg-red-900/20">
              <p className="font-bold text-red-900 dark:text-red-100">Entnahme zum Tagesabschluss</p>
              <p className="mt-1 text-red-800 dark:text-red-200">Möchten Sie Geld aus der Kasse entnehmen? Ein Grund ist nicht erforderlich. Der Rest wird als Anfangsbestand für die nächste Kassenöffnung an diesem Standort vorgeschlagen.</p>
              <label className="mt-3 block font-medium text-gray-700 dark:text-gray-200">Entnahmebetrag (€)
                <input value={closingWithdrawalInput} onChange={(event) => { setClosingWithdrawalInput(event.target.value); setCloseError(null); }} placeholder="0,00 (keine Entnahme)" inputMode="decimal" autoFocus className="mt-1.5 w-full rounded-xl border border-red-300 bg-white px-3 py-2.5 text-base text-gray-900 dark:border-red-700 dark:bg-gray-900 dark:text-gray-100" />
              </label>
              <div className="mt-3 space-y-1 rounded-xl bg-white/70 p-3 dark:bg-gray-900/50">
                <Row label="Kassenbestand vor Entnahme" value={<MoneyAmount value={expected} />} />
                <Row label="Entnahme" value={`- ${formatCurrency(closingWithdrawalAmount)}`} />
                <Row label="Restbestand / nächster Anfangsbestand" value={<MoneyAmount value={remainingCash} />} bold />
              </div>
            </div>
          )}

          <label className="mb-3 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="h-4 w-4 rounded accent-blue-600" />
            Ich bestätige, dass der Tagesabschluss korrekt ist. Nach dem Abschließen ist er nicht mehr änderbar.
          </label>
        </div>

        <div className="flex gap-2 border-t border-gray-200 p-4 dark:border-gray-700">
          <button onClick={handlePDFExport}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-300 bg-white py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">
            <FileDown className="h-4 w-4" /> PDF-Export
          </button>
          <button onClick={() => withdrawalStep ? void handleClose() : beginClose()} disabled={isFinalizing || isNaN(closingBalance) || closingBalance < 0 || !confirmed}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 active:scale-95 disabled:opacity-50">
            <Check className="h-4 w-4" /> {isFinalizing ? 'Beleg wird erstellt …' : withdrawalStep ? 'Mit Entnahme endgültig abschließen' : 'Endgültig abschließen'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DenominationGroup({
  title,
  subtitle,
  icon,
  denominations,
  counts,
  total,
  onChange,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  denominations: typeof DENOMINATIONS;
  counts: Record<number, string>;
  total: number;
  onChange: (value: number, quantity: string) => void;
}) {
  return (
    <section className="mb-3 rounded-xl border border-gray-200 bg-white p-2.5 dark:border-gray-700 dark:bg-gray-800/60">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-bold text-gray-800 dark:text-gray-100">
          <span className="text-blue-600 dark:text-blue-400">{icon}</span>
          <span>{title}</span>
          <span className="text-xs font-normal text-gray-500 dark:text-gray-400">· {subtitle}</span>
        </div>
        <span className="text-sm font-bold text-gray-800 dark:text-gray-100"><MoneyAmount value={total} /></span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {denominations.map((denomination) => {
          const quantity = parseInt(counts[denomination.value] ?? '', 10);
          const itemTotal = Number.isNaN(quantity) || quantity < 1 ? 0 : quantity * denomination.value;
          return (
            <label key={denomination.value} className="rounded-lg bg-gray-50 px-2 py-1.5 dark:bg-gray-900/60">
              <span className="mb-1 flex items-center justify-between text-xs font-semibold text-gray-700 dark:text-gray-200">
                {denomination.label}
                <span className="font-normal text-gray-500 dark:text-gray-400"><MoneyAmount value={itemTotal} /></span>
              </span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={counts[denomination.value] ?? ''}
                onChange={(event) => onChange(denomination.value, event.target.value)}
                placeholder="0 Stück"
                className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
            </label>
          );
        })}
      </div>
    </section>
  );
}

function MoneyAmount({ value }: { value: number }) {
  return <span className={value < 0 ? negativeMoneyClass : undefined}>{formatCurrency(value)}</span>;
}

function Row({ label, value, bold }: { label: string; value: ReactNode; bold?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className={bold ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}>{label}</span>
      <span className={`${bold ? 'font-bold' : ''} ${typeof value === 'string' && hasNegativeMoney(value) ? negativeMoneyClass : 'text-gray-600 dark:text-gray-300'}`}>{value}</span>
    </div>
  );
}

// ---- PDF generation ----

interface StaffTimeRow { name: string; loginAt: number; logoutAt: number; durationMs: number; }

function formatDuration(durationMs: number): string {
  const totalMinutes = Math.max(0, Math.round(durationMs / 60_000));
  return `${Math.floor(totalMinutes / 60)} Std. ${String(totalMinutes % 60).padStart(2, '0')} Min.`;
}

/**
 * Old sessions did not have explicit login intervals. Build a best-effort
 * fallback from their activity history so existing reports stay readable.
 */
function intervalsFromLegacyActivities(activities: StaffActivity[], closedAt: number): StaffLoginInterval[] {
  const intervals: StaffLoginInterval[] = [];
  for (const activity of [...activities].sort((a, b) => a.timestamp - b.timestamp)) {
    if (activity.type === 'login' || activity.type === 'cash_opened') {
      if (!intervals.some((interval) => interval.staffId === activity.staffId && interval.logoutAt === undefined)) {
        intervals.push({ id: `legacy-${activity.id}`, staffId: activity.staffId, staffName: activity.staffName, loginAt: activity.timestamp });
      }
    } else if (activity.type === 'logout') {
      for (let index = intervals.length - 1; index >= 0; index -= 1) {
        const interval = intervals[index];
        if (interval.staffId === activity.staffId && interval.logoutAt === undefined) {
          intervals[index] = { ...interval, logoutAt: Math.max(activity.timestamp, interval.loginAt) };
          break;
        }
      }
    }
  }
  return intervals.map((interval) => interval.logoutAt ? interval : { ...interval, logoutAt: closedAt });
}

function staffTimesForFinalClose(session: CashSession, closedAt: number): StaffTimeRow[] {
  const intervals = session.staffLoginIntervals?.length
    ? session.staffLoginIntervals
    : intervalsFromLegacyActivities(session.activities ?? [], closedAt);

  // Every row is one real login period. If a person logs out and returns,
  // the inactive time is never counted as working time.
  return intervals
    .map((interval) => {
      const logoutAt = Math.max(interval.logoutAt ?? closedAt, interval.loginAt);
      return { name: interval.staffName, loginAt: interval.loginAt, logoutAt, durationMs: logoutAt - interval.loginAt };
    })
    .sort((a, b) => a.loginAt - b.loginAt);
}

async function generatePDF(
  session: CashSession,
  txList: Transaction[],
  sums: { txTotal: number; cashTxTotal: number; cardTxTotal: number; taxByRate: Record<number, number>; totalNet: number; deposits: number; withdrawals: number; expected: number; closingBalance: number; difference: number },
  exportedByName?: string,
  yearlyPfandOverview?: YearlyPfandOverview,
) {
  const taxEntries = Object.entries(sums.taxByRate).map(([rate, amount]) => [Number(rate), amount] as const).sort((a, b) => a[0] - b[0]);
  const totalTax = taxEntries.reduce((sum, [, amount]) => sum + amount, 0);
  // These are display values for the receipt only. They do not change the
  // sales, cash-balance, or tax calculations above.
  const pfandIncome = txList.reduce((sum, transaction) => sum + transaction.items
    .filter((item) => !item.isPfandRetoure)
    .reduce((itemSum, item) => itemSum + item.pfand, 0), 0);
  const pfandPayout = Math.abs(txList.reduce((sum, transaction) => sum + transaction.items
    .filter((item) => item.isPfandRetoure)
    .reduce((itemSum, item) => itemSum + item.price * item.quantity, 0), 0));
  // Only a cash transaction can change the physical till. A returned deposit
  // inside a card sale is settled through the card total and must not appear
  // as a cash payout in the cash-balance section.
  const cashPfandIncome = txList
    .filter((transaction) => transaction.paymentMethod === 'cash')
    .reduce((sum, transaction) => sum + transaction.items
      .filter((item) => !item.isPfandRetoure)
      .reduce((itemSum, item) => itemSum + item.pfand, 0), 0);
  const cashPfandPayout = Math.abs(txList
    .filter((transaction) => transaction.paymentMethod === 'cash')
    .reduce((sum, transaction) => sum + transaction.items
      .filter((item) => item.isPfandRetoure)
      .reduce((itemSum, item) => itemSum + item.price * item.quantity, 0), 0));
  const openingCorrectionTotal = session.corrections.reduce((sum, correction) => sum + correction.newAmount - correction.oldAmount, 0);
  const correctionLine = openingCorrectionTotal === 0
    ? ''
    : `<div class="sum"><span>Korrekturen am Anfangsbestand (bereits enthalten)</span><span>${openingCorrectionTotal > 0 ? '+' : '-'} ${formatCurrency(Math.abs(openingCorrectionTotal))}</span></div>`;
  const pfandBalance = Math.round((pfandIncome - pfandPayout) * 100) / 100;
  const pfandResult = pfandBalance > 0
    ? `<div class="sum bold pfand-profit"><span>Pfandgewinn</span><span>+ ${formatCurrency(pfandBalance)}</span></div>`
    : pfandBalance < 0
      ? `<div class="sum bold pfand-loss"><span>Pfandverlust</span><span>- ${formatCurrency(Math.abs(pfandBalance))}</span></div>`
      : '<div class="sum bold"><span>Pfandsaldo</span><span>0,00 €</span></div>';
  const isFinal = session.closed;
  const finalTime = verifiedCloseTimestamp(session);
  if (isFinal && (finalTime === null || finalTime < session.openedAt)) {
    throw new Error('Tagesabschluss ohne verifizierbaren Abschlusszeitpunkt. PDF nicht erstellt.');
  }
  const documentTime = finalTime ?? Date.now();
  const receipt = formatDailyCloseReceiptNumber(session.dailyCloseReceiptNumber, session.dailyCloseReceiptLocation ?? session.location, documentTime, session.dailyCloseReceiptYear);
  // Use the same split representation as the on-screen overview: a mixed
  // sale with a returned deposit is two visible movements, never one false
  // "Pfandausgabe" containing an article sale.
  const transactionRows = txList
    .flatMap((transaction) => transactionMovementRecords(transaction))
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((record) => ({ timestamp: record.timestamp, staff: record.employeeName ?? 'Unbekannt', kind: record.kind, value: formatCurrency(record.amount), reason: record.details }))
    .map((row) => `<tr><td>${new Date(row.timestamp).toLocaleDateString('de-DE')}</td><td>${formatTime(row.timestamp)}</td><td>${escapeHtml(row.staff)}</td><td>${movementBadgeHTML(row.kind)}</td><td>${escapeHtml(row.value)}</td><td>${escapeHtml(row.reason)}</td></tr>`).join('');
  const cashMovementRows = [
    ...session.entries.map((entry) => ({ timestamp: entry.timestamp, staff: entry.employeeName ?? 'Unbekannt', kind: entry.type === 'deposit' ? 'Einlage' : entry.isPfandRetoure ? 'Pfand-Retoure' : 'Ausgabe', value: `${entry.type === 'deposit' ? '+' : '-'}${formatCurrency(entry.amount)}`, reason: entry.reason })),
    ...session.corrections.map((correction) => ({ timestamp: correction.timestamp, staff: correction.employeeName ?? 'Unbekannt', kind: 'Korrektur', value: `${formatCurrency(correction.oldAmount)} → ${formatCurrency(correction.newAmount)} (${correction.newAmount - correction.oldAmount > 0 ? '+' : ''}${formatCurrency(correction.newAmount - correction.oldAmount)})`, reason: correction.reason })),
  ].sort((a, b) => a.timestamp - b.timestamp)
    .map((row) => `<tr><td>${new Date(row.timestamp).toLocaleDateString('de-DE')}</td><td>${formatTime(row.timestamp)}</td><td>${escapeHtml(row.staff)}</td><td>${movementBadgeHTML(row.kind)}</td><td>${escapeHtml(row.value)}</td><td>${escapeHtml(row.reason)}</td></tr>`).join('');
  const staffRows = staffTimesForFinalClose(session, documentTime)
    .map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${formatTime(row.loginAt)}</td><td>${formatTime(row.logoutAt)}</td><td>${formatDuration(row.durationMs)}</td></tr>`).join('');
  const staffTotals = new Map<string, number>();
  for (const row of staffTimesForFinalClose(session, documentTime)) {
    staffTotals.set(row.name, (staffTotals.get(row.name) ?? 0) + row.durationMs);
  }
  const staffTotalRows = [...staffTotals.entries()].map(([name, duration]) =>
    `<div class="sum"><span>${escapeHtml(name)}: gesamte Anmeldezeit am Tag:</span><strong>${formatDuration(duration)}</strong></div>`,
  ).join('');
  const taxLines = taxEntries.map(([rate, amount]) => `<div class="sum"><span>davon MwSt ${rate}%</span><span>${formatCurrency(amount)}</span></div>`).join('');
  const status = isFinal ? 'Endgültig abgeschlossen' : 'Entwurf – noch nicht endgültig abgeschlossen';
  const statusClass = isFinal ? 'final' : 'draft';
  const overallDuration = isFinal && session.closedAt ? formatDuration(session.closedAt - session.openedAt) : 'wird beim endgültigen Abschluss berechnet';
  const yearlyPfandSaldo = yearlyPfandOverview?.pfandSaldo ?? 0;
  const yearlyPfandLabel = yearlyPfandSaldo > 0 ? 'Pfandgewinn' : yearlyPfandSaldo < 0 ? 'Pfandverlust' : 'Pfandsaldo';
  const yearlyPfandValue = yearlyPfandSaldo > 0
    ? `+ ${formatCurrency(yearlyPfandSaldo)}`
    : yearlyPfandSaldo < 0 ? `- ${formatCurrency(Math.abs(yearlyPfandSaldo))}` : formatCurrency(0);
  const yearlyPfandClass = yearlyPfandSaldo > 0 ? 'pfand-profit' : yearlyPfandSaldo < 0 ? 'pfand-loss' : '';
  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>${escapeHtml(`${session.location}_Tagesabschluss_${session.date.split('-').reverse().join('-')}`)}</title><style>
    *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#1e293b;line-height:1.4;font-size:12px;margin:0}h1{font-size:26px;margin:0;text-align:center;color:#1e3a5f}h2{font-size:15px;margin:22px 0 7px;border-bottom:1px solid #cbd5e1;padding-bottom:4px;break-after:avoid;page-break-after:avoid}.heading{text-align:center;margin-bottom:17px}.meta{font-size:15px;font-weight:700;color:#2563eb;margin-top:5px}.staff{font-size:13px;margin-top:4px}.status{display:inline-block;border-radius:5px;padding:4px 8px;font-weight:700;margin-bottom:8px}.draft{background:#fef3c7;color:#92400e}.final{background:#dcfce7;color:#166534}.receipt{font-size:13px;font-weight:700;color:#0f172a;margin-top:5px}.sum{display:flex;justify-content:space-between;padding:4px 0}.bold{font-weight:700;border-top:1px solid #64748b;margin-top:5px;padding-top:7px}.pfand-profit{color:#15803d}.pfand-loss{color:#dc2626}.box{border:1px solid #cbd5e1;border-radius:8px;padding:12px;margin-bottom:14px}.sales{background:#ecfdf5;border-color:#a7f3d0}.sales h2{margin-top:0;color:#047857;border-color:#a7f3d0}table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:10.5px}thead{display:table-header-group}th{text-align:left;border-bottom:2px solid #334155;padding:5px 4px}td{padding:4px;border-bottom:1px solid #e2e8f0;vertical-align:top}tr{break-inside:avoid;page-break-inside:avoid}tr:nth-child(even){background:#f8fafc}.report-block{break-inside:avoid;page-break-inside:avoid}.report-block h2{break-after:avoid;page-break-after:avoid}.report-block table{break-inside:avoid;page-break-inside:avoid}.staff-times{break-inside:avoid;page-break-inside:avoid}.staff-times h2{border-bottom:0;margin-bottom:7px;break-after:avoid;page-break-after:avoid}.staff-times table{break-inside:avoid;page-break-inside:avoid}.staff-times tbody tr{break-inside:avoid;page-break-inside:avoid}
  </style></head><body>
    <div class="heading" data-pdf-page-location="${escapeHtml(session.location)}" data-pdf-page-header="${escapeHtml(`Tagesabschluss · ${session.location} · ${formatDateGermanFromISO(session.date)} · ${formatTime(documentTime)} Uhr`)}"><div class="status ${statusClass}">${status}</div><h1>Tagesabschluss</h1><div class="meta">${escapeHtml(session.location)} · ${formatDateGermanFromISO(session.date)} · ${formatTime(documentTime)} Uhr</div><div class="staff">Mitarbeiter: <strong>${escapeHtml(exportedByName ?? session.closedByName ?? session.openedByName ?? 'Nicht angemeldet')}</strong></div><div class="box" style="margin-top:10px;text-align:left"><div class="sum"><strong>Kasseneröffnung</strong><strong>${escapeHtml(formatCashSessionTimestamp(session.openedAt))}</strong></div><div class="sum"><strong>Endgültiger Tagesabschluss</strong><strong>${isFinal ? escapeHtml(formatCashSessionTimestamp(documentTime)) : 'Noch nicht gebucht (Entwurf)'}</strong></div></div>${receipt ? `<div class="receipt">Belegnummer: ${receipt}</div>` : isFinal ? '<div class="receipt">Belegnummer: wird bei der nächsten Synchronisierung vergeben.</div>' : '<div class="receipt">Belegnummer: wird beim endgültigen Abschluss vergeben.</div>'}</div>
    <div class="box sales"><h2>Tagesumsatz</h2>
      <div class="sum bold"><span>Brutto-Umsatz (ohne Pfand)</span><span>${formatCurrency(sums.txTotal)}</span></div>
      <div class="sum"><span>davon Barumsatz (ohne Pfand)</span><span>${formatCurrency(sums.cashTxTotal)}</span></div>
      <div class="sum"><span>davon Kartenumsatz (ohne Pfand)</span><span>${formatCurrency(sums.cardTxTotal)}</span></div>
      <div class="sum"><span>Pfandeinnahmen</span><span>+ ${formatCurrency(pfandIncome)}</span></div>
      <div class="sum"><span>Pfand-Retouren</span><span>- ${formatCurrency(pfandPayout)}</span></div>${pfandResult}
      <div class="sum"><span>Netto-Umsatz</span><span>${formatCurrency(sums.totalNet)}</span></div>
      <div class="sum bold"><span>Enthaltene Mehrwertsteuer aus Warenumsätzen</span><span>${formatCurrency(totalTax)}</span></div>${taxLines}
    </div>
    <h2>Kassenbestand</h2><div class="box">
      <div class="sum"><span>Anfangsbestand</span><span>${formatCurrency(session.openingBalance)}</span></div>
      <div class="sum"><span>Barumsatz</span><span>${formatCurrency(sums.cashTxTotal)}</span></div>
      <div class="sum"><span>Pfandeinnahmen (bar)</span><span>+ ${formatCurrency(cashPfandIncome)}</span></div>
      <div class="sum"><span>Pfandretouren (bar)</span><span>- ${formatCurrency(cashPfandPayout)}</span></div>
      <div class="sum"><span>Bareinlagen</span><span>+ ${formatCurrency(sums.deposits)}</span></div>
      <div class="sum"><span>Barausgaben</span><span>- ${formatCurrency(sums.withdrawals)}</span></div>${correctionLine}
      <div class="sum bold"><span>Erwarteter Kassenbestand</span><span>${formatCurrency(sums.expected)}</span></div>
      <div class="sum bold"><span>Tatsächlicher Kassenbestand</span><span>${formatCurrency(sums.closingBalance)}</span></div>
      <div class="sum bold"><span>Differenz</span><span>${formatCurrency(sums.difference)}</span></div>
    </div>
    <section class="report-block"><h2>Transaktionen (${txList.length})</h2><table><thead><tr><th>Datum</th><th>Uhrzeit</th><th>Mitarbeiter</th><th>Vorgang</th><th>Betrag</th><th>Details</th></tr></thead><tbody>${transactionRows || '<tr><td colspan="6">Keine Transaktionen</td></tr>'}</tbody></table></section>
    <section class="report-block"><h2>Kassenbewegungen (${session.entries.length + session.corrections.length})</h2><table><thead><tr><th>Datum</th><th>Uhrzeit</th><th>Mitarbeiter</th><th>Vorgang</th><th>Betrag / Änderung</th><th>Grund</th></tr></thead><tbody>${cashMovementRows || '<tr><td colspan="6">Keine Kassenbewegungen</td></tr>'}</tbody></table></section>
    ${staffRows ? `<section class="staff-times"><h2>Mitarbeiterzeiten</h2><table><thead><tr><th>Mitarbeiter</th><th>Anmeldung</th><th>Abmeldung</th><th>Gesamtzeit</th></tr></thead><tbody>${staffRows}</tbody></table><div class="box">${staffTotalRows}</div></section>` : ''}
    <div class="box"><div class="sum bold"><span>Gesamtdauer der Kasse</span><span>${overallDuration}</span></div></div>
    ${yearlyPfandOverview ? `<section class="report-block"><h2>Pfand-Kontrollübersicht ${yearlyPfandOverview.year}</h2><div class="box"><div class="sum"><span>Pfandeinnahmen</span><span>+ ${formatCurrency(yearlyPfandOverview.pfandCollected)}</span></div><div class="sum"><span>Pfandretouren</span><span>- ${formatCurrency(yearlyPfandOverview.pfandReturned)}</span></div><div class="sum bold ${yearlyPfandClass}"><span>${yearlyPfandLabel}</span><span>${yearlyPfandValue}</span></div><p style="font-size:10px;color:#64748b;margin-top:7px">${escapeHtml(yearlyPfandOverview.scopeLabel)} · alle Buchungen im Kalenderjahr. Der Wert wird beim Zurücksetzen der Buchungen automatisch zurückgesetzt.</p></div></section>` : ''}
  </body></html>`;
  try {
    const pdf = await renderPdfHtml(html);
    const url = URL.createObjectURL(pdf);
    const printWindow = window.open(url, '_blank', 'width=900,height=700');
    if (!printWindow) { alert('Bitte Popups für diese Seite erlauben, um den PDF-Export zu nutzen.'); URL.revokeObjectURL(url); return; }
    // The rendered document already contains correct "Seite X von Y" labels.
    window.setTimeout(() => { try { printWindow.focus(); printWindow.print(); } catch { /* Browser may block printing */ } }, 900);
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    alert('Der Tagesabschluss konnte nicht als PDF erzeugt werden. Bitte erneut versuchen.');
  }
}
