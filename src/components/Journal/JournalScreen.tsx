import { useEffect, useMemo, useState } from 'react';
import type { Category, CashSession, StaffUser, Transaction } from '@/types';
import {
  formatCurrency, formatDate, formatDateGermanFromISO, formatDateISO, formatDateLong, parseGermanDate,
  formatTime,
  startOfDay, endOfDay, startOfWeek, startOfMonth, startOfYear,
  monthLabel, yearLabel, getWeekNumber,
} from '@/lib/format';
import { DynamicIcon } from '@/components/DynamicIcon';
import { buildJournalFileName, exportJournalPdf, exportJournalPdfBatch, openJournalPrintBatch, openJournalPrintDialog } from '@/lib/journalPdfFile';
import { cashAuditRecordsFromSessions, closedSessionReport } from '@/lib/dailyReport';
import { formatDailyCloseReceiptNumber } from '@/lib/dailyCloseReceipt';
import { JournalPreviewDialog } from '@/components/Journal/JournalPreviewDialog';
import { calculateYearlyPfandOverview, type JournalReportData } from '@/lib/journalPdf';
import { mergeTaxByRate, getTaxByRate, isTaxFreeItem, isReducedRate, sortedRateKeys } from '@/lib/tax';
import {
  Calendar, TrendingUp, Clock, Receipt, ChevronDown, ChevronUp,
  Filter, List, LayoutGrid, Package, Tag, Euro, Trophy, MapPin,
  Recycle, Banknote, CreditCard, Printer, FileDown, ClipboardCheck, CheckSquare, Square, Eye,
} from 'lucide-react';

type Period = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

type GroupMode = 'category' | 'article' | 'tax' | 'bestseller' | 'transaction' | 'dailyClose';
type LocationFilter = 'all' | 'Friedrichshafen' | 'Bregenz';
type DailyCloseStatus = 'all' | 'numbered' | 'pending';
type JournalSort = 'newest' | 'oldest' | 'nameAsc' | 'nameDesc' | 'amountHigh' | 'amountLow' | 'quantityHigh' | 'quantityLow' | 'receiptAsc' | 'receiptDesc';


interface Props {
  transactions: Transaction[];
  categories: Category[];
  cashSessions: CashSession[];
  defaultLocation?: Exclude<LocationFilter, 'all'>;
  currentStaff?: StaffUser | null;
}

export function JournalScreen({ transactions, categories, cashSessions, defaultLocation = 'Friedrichshafen', currentStaff }: Props) {
  const [period, setPeriod] = useState<Period>('daily');
  const [groupMode, setGroupMode] = useState<GroupMode>('category');
  const [locationFilter, setLocationFilter] = useState<LocationFilter>(defaultLocation);
  const [customFrom, setCustomFrom] = useState(formatDateISO(Date.now() - 6 * 86400000));
  const [customTo, setCustomTo] = useState(formatDateISO(Date.now()));
  const [selectedCloseIds, setSelectedCloseIds] = useState<Set<string>>(() => new Set());
  const [previewReport, setPreviewReport] = useState<JournalReportData | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [journalSearch, setJournalSearch] = useState('');
  const [dailyCloseStatus, setDailyCloseStatus] = useState<DailyCloseStatus>('all');
  const [journalSort, setJournalSort] = useState<JournalSort>('newest');

  const { start, end, headerLabel } = useMemo(() => {
    const now = Date.now();
    switch (period) {
      case 'daily': return { start: startOfDay(now), end: endOfDay(now), headerLabel: `Tagesjournal - ${formatDateLong(now)}` };
      case 'weekly': {
        const ws = startOfWeek(now);
        const we = endOfDay(now);
        const we2 = new Date(ws);
        we2.setDate(we2.getDate() + 6);
        const kw = getWeekNumber(now);
        return { start: ws, end: we, headerLabel: `Wochenjournal - KW ${kw} (${formatDate(ws)} - ${formatDate(we2.getTime())})` };
      }
      case 'monthly': return { start: startOfMonth(now), end: endOfDay(now), headerLabel: `Monatsjournal - ${monthLabel(now)}` };
      case 'yearly': return { start: startOfYear(now), end: endOfDay(now), headerLabel: `Jahresjournal - ${yearLabel(now)}` };
      case 'custom': {
        const s = startOfDay(new Date(customFrom).getTime());
        const e = endOfDay(new Date(customTo).getTime());
        return { start: s, end: e, headerLabel: `Zeitraum: ${formatDate(s)} bis ${formatDate(e)}` };
      }
    }
  }, [period, customFrom, customTo]);

  const filteredTx = useMemo(() => {
    const search = journalSearch.trim().toLocaleLowerCase('de-DE');
    const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
    return transactions.filter((t) => {
      if (t.timestamp < start || t.timestamp > end || (locationFilter !== 'all' && t.location !== locationFilter)) return false;
      if (!search) return true;
      const text = [
        formatDate(t.timestamp), formatDateISO(t.timestamp), t.employeeName, t.paymentMethod,
        ...t.items.flatMap((item) => [item.name, categoryNames.get(item.categoryId), `${item.taxRate}%`]),
      ].filter(Boolean).join(' ').toLocaleLowerCase('de-DE');
      return text.includes(search);
    });
  }, [transactions, start, end, locationFilter, journalSearch, categories]);

  const taxByRateMap = useMemo(() => mergeTaxByRate(filteredTx), [filteredTx]);

  const stats = useMemo(() => {
    let total = 0, count = 0, totalNet = 0;
    let pfandCollected = 0, pfandReturned = 0;
    for (const t of filteredTx) {
      total += t.subtotal;
      count++;
      totalNet += t.totalNet;
      for (const item of t.items) {
        if (item.isPfandRetoure) {
          pfandReturned += Math.abs(item.pfand);
        } else {
          pfandCollected += item.pfand;
        }
      }
    }
    const totalTax = [...taxByRateMap.values()].reduce((s, v) => s + v, 0);
    const taxByRate: Record<number, number> = {};
    for (const [k, v] of taxByRateMap) taxByRate[k] = v;
    return { total, taxByRate, count, totalNet, totalTax, pfandCollected, pfandReturned, pfandSaldo: pfandCollected - pfandReturned };
  }, [filteredTx, taxByRateMap]);

  const relevantSessions = useMemo(
    () => cashSessions.filter((s) => {
      const sDate = new Date(s.date + 'T00:00:00').getTime();
      return !s.discarded && sDate >= start && sDate <= end &&
        (locationFilter === 'all' || s.location === locationFilter);
    }),
    [cashSessions, start, end, locationFilter],
  );

  const totalOpeningBalance = relevantSessions.reduce((s, sess) => s + sess.openingBalance, 0);
  const sessionLocationLabel = locationFilter === 'all' ? 'Alle Standorte' : locationFilter;
  // The control total is intentionally independent from the displayed period:
  // every journal shows the current calendar year's deposit balance.
  const yearlyPfandOverview = useMemo(
    () => calculateYearlyPfandOverview(transactions, new Date().getFullYear(), locationFilter, sessionLocationLabel),
    [transactions, locationFilter, sessionLocationLabel],
  );
  const reportData = () => ({
    headerLabel,
    location: sessionLocationLabel,
    transactions: filteredTx,
    categories,
    fileName: buildJournalFileName(period, start, end, locationFilter),
    exportedByName: currentStaff?.name,
    cashAuditRecords: cashAuditRecordsFromSessions(relevantSessions)
      .filter((record) => record.timestamp >= start && record.timestamp <= end),
    yearlyPfandOverview,
  });
  const exportReport = () => void exportJournalPdf(reportData());
  const printReport = () => openJournalPrintDialog(reportData());
  const visibleDailyCloses = useMemo(() => {
    const search = journalSearch.trim().toLocaleLowerCase('de-DE');
    const receiptNumber = (session: CashSession) => session.dailyCloseReceiptNumber ?? null;
    const searchableText = (session: CashSession) => {
      const at = session.dailyCloseFinalizedAt ?? session.closedAt ?? session.openedAt;
      const receipt = formatDailyCloseReceiptNumber(receiptNumber(session) ?? undefined, session.dailyCloseReceiptLocation ?? session.location, at, session.dailyCloseReceiptYear) ?? '';
      return [receipt, session.location, session.dailyCloseFinalizedByName, session.closedByName, formatDate(at), formatDateISO(at)].filter(Boolean).join(' ').toLocaleLowerCase('de-DE');
    };
    const matches = cashSessions.filter((session) => {
      if (!session.closed || session.discarded) return false;
      const at = session.closedAt ?? session.openedAt;
      if (at < start || at > end || (locationFilter !== 'all' && session.location !== locationFilter)) return false;
      if (dailyCloseStatus === 'numbered' && receiptNumber(session) === null) return false;
      if (dailyCloseStatus === 'pending' && receiptNumber(session) !== null) return false;
      return !search || searchableText(session).includes(search);
    });
    return matches.sort((a, b) => {
      const aAt = a.dailyCloseFinalizedAt ?? a.closedAt ?? a.openedAt;
      const bAt = b.dailyCloseFinalizedAt ?? b.closedAt ?? b.openedAt;
      if (journalSort === 'oldest') return aAt - bAt;
      if (journalSort === 'receiptAsc') return (receiptNumber(a) ?? Number.MAX_SAFE_INTEGER) - (receiptNumber(b) ?? Number.MAX_SAFE_INTEGER) || bAt - aAt;
      if (journalSort === 'receiptDesc') return (receiptNumber(b) ?? -1) - (receiptNumber(a) ?? -1) || bAt - aAt;
      return bAt - aAt;
    });
  }, [cashSessions, start, end, locationFilter, journalSearch, dailyCloseStatus, journalSort]);
  const closeReport = (session: CashSession) => closedSessionReport(session, transactions, categories, currentStaff?.name);
  const selectedCloseReports = visibleDailyCloses.filter((session) => selectedCloseIds.has(session.id)).map(closeReport);
  const toggleClose = (id: string) => setSelectedCloseIds((current) => {
    const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const toggleAllCloses = () => setSelectedCloseIds((current) => {
    const allVisibleSelected = visibleDailyCloses.length > 0 && visibleDailyCloses.every((session) => current.has(session.id));
    const next = new Set(current);
    if (allVisibleSelected) visibleDailyCloses.forEach((session) => next.delete(session.id));
    else visibleDailyCloses.forEach((session) => next.add(session.id));
    return next;
  });
  const selectedCloseFileName = `Tagesabschluesse_${locationFilter === 'all' ? 'Alle-Standorte' : locationFilter}_${formatDateISO(start)}_bis_${formatDateISO(end)}.pdf`;
  const exportSelectedCloses = () => void exportJournalPdfBatch(selectedCloseReports, selectedCloseFileName);
  const printSelectedCloses = () => openJournalPrintBatch(selectedCloseReports);

  return (
    <div className="h-full overflow-y-auto overscroll-contain pb-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{groupMode === 'dailyClose' ? 'Tagesabschlüsse' : headerLabel}</h2>
        <div className="flex gap-2">
          <button
            onClick={groupMode === 'dailyClose' ? exportSelectedCloses : exportReport}
            disabled={groupMode === 'dailyClose' ? selectedCloseReports.length === 0 : filteredTx.length === 0}
            className="flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <FileDown className="h-3.5 w-3.5" /> PDF-Export
          </button>
          <button
            onClick={groupMode === 'dailyClose' ? printSelectedCloses : printReport}
            disabled={groupMode === 'dailyClose' ? selectedCloseReports.length === 0 : filteredTx.length === 0}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-40"
          >
            <Printer className="h-3.5 w-3.5" /> Drucken
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFiltersOpen((open) => !open)}
          className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${filtersOpen ? 'border-blue-500 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}`}
        >
          <Filter className="h-3.5 w-3.5" /> Filter & Sortierung <ChevronDown className={`h-3.5 w-3.5 transition ${filtersOpen ? 'rotate-180' : ''}`} />
        </button>
        <div className="flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
          <GroupBtn mode="category" active={groupMode} onClick={setGroupMode} icon={<Tag className="h-3.5 w-3.5" />} label="Warengruppen" />
          <GroupBtn mode="article" active={groupMode} onClick={setGroupMode} icon={<Package className="h-3.5 w-3.5" />} label="Einzelartikel" />
          <GroupBtn mode="tax" active={groupMode} onClick={setGroupMode} icon={<Euro className="h-3.5 w-3.5" />} label="MwSt-Klassen" />
          <GroupBtn mode="bestseller" active={groupMode} onClick={setGroupMode} icon={<Trophy className="h-3.5 w-3.5" />} label="Bestseller" />
          <GroupBtn mode="transaction" active={groupMode} onClick={setGroupMode} icon={<Receipt className="h-3.5 w-3.5" />} label="Einzel-Bons" />
          <GroupBtn mode="dailyClose" active={groupMode} onClick={setGroupMode} icon={<ClipboardCheck className="h-3.5 w-3.5" />} label="Tagesabschlüsse" />
        </div>
      </div>

      {filtersOpen && (
        <div className="mb-3 grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4 dark:border-gray-700 dark:bg-gray-800">
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">Suchen
            <input value={journalSearch} onChange={(event) => setJournalSearch(event.target.value)} placeholder={groupMode === 'dailyClose' ? 'Belegnummer, Mitarbeiter …' : groupMode === 'tax' ? 'Steuersatz suchen …' : 'Artikel, Warengruppe, Mitarbeiter …'} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm font-normal text-gray-900 outline-none focus:border-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
          </label>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">Standort
            <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value as LocationFilter)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm font-normal text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100">
              <option value="all">Alle Standorte</option><option value="Friedrichshafen">Friedrichshafen</option><option value="Bregenz">Bregenz</option>
            </select>
          </label>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">Zeitraum
            <select value={period} onChange={(event) => setPeriod(event.target.value as Period)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm font-normal text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100">
              <option value="daily">Heute</option><option value="weekly">Diese Woche</option><option value="monthly">Dieser Monat</option><option value="yearly">Dieses Jahr</option><option value="custom">Datum von / bis</option>
            </select>
          </label>
          {groupMode === 'dailyClose' && <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">Status
            <select value={dailyCloseStatus} onChange={(event) => setDailyCloseStatus(event.target.value as DailyCloseStatus)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm font-normal text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100">
              <option value="all">Alle Belege</option><option value="numbered">Belegnummer vergeben</option><option value="pending">Belegnummer ausstehend</option>
            </select>
          </label>}
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">Sortierung
            <select value={journalSort} onChange={(event) => setJournalSort(event.target.value as JournalSort)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm font-normal text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100">
              {journalSortOptions(groupMode).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {period === 'custom' && <div className="flex items-end gap-2 sm:col-span-2"><GermanDateField label="Von" value={customFrom} onChange={setCustomFrom} /><GermanDateField label="Bis" value={customTo} onChange={setCustomTo} /></div>}
        </div>
      )}

      {groupMode === 'dailyClose' ? (
        <DailyCloseListView sessions={visibleDailyCloses} selectedIds={selectedCloseIds} onToggle={toggleClose} onToggleAll={toggleAllCloses} onOpen={(session) => setPreviewReport(closeReport(session))} />
      ) : <>
      {relevantSessions.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-4 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
            <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="font-medium">{sessionLocationLabel}</span>
          </div>
          <div className="text-gray-600 dark:text-gray-400">
            Anfangsbestand: <span className="font-bold text-gray-900 dark:text-gray-100">{formatCurrency(totalOpeningBalance)}</span>
          </div>
          <div className="text-gray-600 dark:text-gray-400">
            Kassen gesamt: <span className="font-bold text-gray-900 dark:text-gray-100">{relevantSessions.length}</span>
          </div>
        </div>
      )}

      <div className="mb-3 overflow-hidden rounded-2xl border border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 p-4 shadow-sm dark:border-green-800 dark:from-green-900/30 dark:to-emerald-900/20">
        <div className="mb-2 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
          <p className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">Umsatz im Zeitraum</p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2 dark:bg-gray-900/40">
            <span className="text-xs text-green-700 dark:text-green-400">Umsatz (ohne Pfand)</span>
            <span className="text-base font-bold text-green-700 dark:text-green-400">{formatCurrency(stats.total)}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2 dark:bg-gray-900/40">
            <span className="text-xs text-green-700 dark:text-green-400">Netto-Umsatz</span>
            <span className="text-base font-bold text-green-700 dark:text-green-400">{formatCurrency(stats.totalNet)}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2 dark:bg-gray-900/40">
            <span className="text-xs text-green-700 dark:text-green-400">Enthaltene MwSt</span>
            <span className="text-base font-bold text-green-700 dark:text-green-400">{formatCurrency(stats.totalTax)}</span>
          </div>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2.5 lg:grid-cols-6">
        <StatCard label="Umsatz (ohne Pfand)" value={formatCurrency(stats.total)} icon={<TrendingUp className="h-4 w-4" />} color="text-blue-600 dark:text-blue-400" />
        <StatCard label="Netto" value={formatCurrency(stats.totalNet)} icon={<Euro className="h-4 w-4" />} color="text-gray-600 dark:text-gray-400" />
        {sortedRateKeys(taxByRateMap).map((rate) => (
          <StatCard key={rate} label={`MwSt ${rate}%`} value={formatCurrency(stats.taxByRate[rate] ?? 0)} icon={<Receipt className="h-4 w-4" />} color={isReducedRate(rate) ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'} />
        ))}
        {stats.pfandCollected > 0 && (
          <StatCard label="Pfand eingenommen" value={formatCurrency(stats.pfandCollected)} icon={<Recycle className="h-4 w-4" />} color="text-teal-600 dark:text-teal-400" />
        )}
        {stats.pfandReturned > 0 && (
          <StatCard label="Pfand retourniert" value={formatCurrency(stats.pfandReturned)} icon={<Recycle className="h-4 w-4" />} color="text-amber-600 dark:text-amber-400" />
        )}
        {stats.pfandCollected > 0 || stats.pfandReturned > 0 ? (
          <StatCard
            label="Pfand-Saldo"
            value={`${stats.pfandSaldo > 0 ? '+' : ''}${formatCurrency(stats.pfandSaldo)}`}
            icon={<Recycle className="h-4 w-4" />}
            color="text-blue-600 dark:text-blue-400"
            valueClass={stats.pfandSaldo < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}
          />
        ) : null}
        <StatCard label="Verkäufe" value={String(stats.count)} icon={<Receipt className="h-4 w-4" />} color="text-green-600 dark:text-green-400" />
      </div>

      <div>
        {filteredTx.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-gray-400 dark:text-gray-500">
            <Receipt className="h-12 w-12" />
            <p className="text-sm">Keine Verkäufe im gewählten Zeitraum für {locationFilter === 'all' ? 'die gewählten Standorte' : locationFilter}</p>
          </div>
        ) : groupMode === 'category' ? (
          <CategoryGroupView transactions={filteredTx} categories={categories} sort={journalSort} />
        ) : groupMode === 'article' ? (
          <ArticleGroupView transactions={filteredTx} sort={journalSort} />
        ) : groupMode === 'tax' ? (
          <TaxClassView transactions={filteredTx} sort={journalSort} />
        ) : groupMode === 'bestseller' ? (
          <BestsellerView transactions={filteredTx} categories={categories} sort={journalSort} />
        ) : (
          <TransactionListView transactions={filteredTx} sort={journalSort} />
        )}
      </div>
      </>}
      {previewReport && <JournalPreviewDialog data={previewReport} onClose={() => setPreviewReport(null)} />}
    </div>
  );
}

function GermanDateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [text, setText] = useState(() => formatDateGermanFromISO(value));

  useEffect(() => setText(formatDateGermanFromISO(value)), [value]);

  const commit = () => {
    const parsed = parseGermanDate(text);
    if (parsed) onChange(parsed);
    else setText(formatDateGermanFromISO(value));
  };

  return <label className="flex-1 text-xs font-semibold text-gray-600 dark:text-gray-300">
    {label}
    <input
      type="text"
      inputMode="numeric"
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
      placeholder="TT.MM.JJJJ"
      aria-label={`${label}: Datum im Format Tag.Monat.Jahr`}
      className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm font-normal text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
    />
  </label>;
}

function DailyCloseListView({ sessions, selectedIds, onToggle, onToggleAll, onOpen }: { sessions: CashSession[]; selectedIds: Set<string>; onToggle: (id: string) => void; onToggleAll: () => void; onOpen: (session: CashSession) => void }) {
  const grouped = sessions.reduce<Record<string, CashSession[]>>((all, session) => {
    (all[session.location] ??= []).push(session); return all;
  }, {});
  const allVisibleSelected = sessions.length > 0 && sessions.every((session) => selectedIds.has(session.id));
  if (sessions.length === 0) return <div className="flex flex-col items-center justify-center gap-2 py-16 text-gray-400 dark:text-gray-500"><ClipboardCheck className="h-12 w-12" /><p className="text-sm">Keine Tagesabschlüsse im gewählten Zeitraum.</p></div>;
  return <div className="space-y-5">
    <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
      <div><p className="font-semibold text-gray-900 dark:text-gray-100">Abschlüsse auswählen</p><p className="text-xs text-gray-500">PDF-Export und Druck fassen die ausgewählten Belege in einer Datei zusammen.</p></div>
      <button onClick={onToggleAll} className="rounded-lg border border-blue-300 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/30">{allVisibleSelected ? 'Auswahl aufheben' : 'Alle sichtbaren auswählen'}</button>
    </div>
    {(['Friedrichshafen', 'Bregenz'] as const).map((location) => grouped[location]?.length ? <section key={location}>
      <h3 className={`mb-2 text-sm font-bold ${location === 'Bregenz' ? 'text-green-700 dark:text-green-400' : 'text-blue-700 dark:text-blue-400'}`}>{location}</h3>
      <div className="space-y-2">{grouped[location].map((session) => {
        const at = session.dailyCloseFinalizedAt ?? session.closedAt ?? session.openedAt;
        const receipt = formatDailyCloseReceiptNumber(session.dailyCloseReceiptNumber, session.dailyCloseReceiptLocation ?? session.location, at, session.dailyCloseReceiptYear) ?? 'Belegnummer wird synchronisiert';
        return <div key={session.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <button aria-label="Abschluss auswählen" onClick={() => onToggle(session.id)} className="text-blue-600 dark:text-blue-400">{selectedIds.has(session.id) ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}</button>
          <div className="min-w-[190px] flex-1"><p className="font-semibold text-gray-900 dark:text-gray-100">{receipt}</p><p className="text-xs text-gray-500">{formatDate(at)} · {formatTime(at)} Uhr · abgeschlossen von {session.dailyCloseFinalizedByName ?? session.closedByName ?? 'Unbekannt'}</p></div>
          <div className="text-right text-xs text-gray-500">Kassenbestand <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatCurrency(session.closingBalance ?? 0)}</p></div>
          <div className={`text-right text-xs ${Math.abs(session.difference ?? 0) > 0.009 ? 'text-rose-600 dark:text-rose-400' : 'text-green-700 dark:text-green-400'}`}>Differenz <p className="text-sm font-bold">{formatCurrency(session.difference ?? 0)}</p></div>
          <button onClick={() => onOpen(session)} className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"><Eye className="h-3.5 w-3.5" /> Bericht</button>
        </div>;
      })}</div>
    </section> : null)}</div>;
}

function GroupBtn({ mode, active, onClick, icon, label }: { mode: GroupMode; active: GroupMode; onClick: (m: GroupMode) => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={() => onClick(mode)}
      className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${active === mode ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
      {icon} {label}
    </button>
  );
}

function journalSortOptions(mode: GroupMode): { value: JournalSort; label: string }[] {
  if (mode === 'dailyClose') return [
    { value: 'newest', label: 'Neueste zuerst' }, { value: 'oldest', label: 'Älteste zuerst' },
    { value: 'receiptAsc', label: 'Belegnummer aufsteigend' }, { value: 'receiptDesc', label: 'Belegnummer absteigend' },
  ];
  if (mode === 'transaction') return [
    { value: 'newest', label: 'Neueste zuerst' }, { value: 'oldest', label: 'Älteste zuerst' },
    { value: 'amountHigh', label: 'Betrag: hoch nach niedrig' }, { value: 'amountLow', label: 'Betrag: niedrig nach hoch' },
  ];
  if (mode === 'tax') return [
    { value: 'nameAsc', label: 'Steuersatz aufsteigend' }, { value: 'nameDesc', label: 'Steuersatz absteigend' },
    { value: 'amountHigh', label: 'Umsatz: hoch nach niedrig' }, { value: 'amountLow', label: 'Umsatz: niedrig nach hoch' },
  ];
  return [
    { value: 'amountHigh', label: 'Umsatz: hoch nach niedrig' }, { value: 'amountLow', label: 'Umsatz: niedrig nach hoch' },
    { value: 'quantityHigh', label: 'Menge: hoch nach niedrig' }, { value: 'quantityLow', label: 'Menge: niedrig nach hoch' },
    { value: 'nameAsc', label: 'Name A–Z' }, { value: 'nameDesc', label: 'Name Z–A' },
  ];
}

function compareJournalRows(
  a: { name?: string; label?: string; total: number; count: number },
  b: { name?: string; label?: string; total: number; count: number },
  sort: JournalSort,
) {
  const nameA = a.name ?? a.label ?? '';
  const nameB = b.name ?? b.label ?? '';
  if (sort === 'nameAsc') return nameA.localeCompare(nameB, 'de-DE');
  if (sort === 'nameDesc') return nameB.localeCompare(nameA, 'de-DE');
  if (sort === 'quantityHigh') return b.count - a.count || b.total - a.total;
  if (sort === 'quantityLow') return a.count - b.count || a.total - b.total;
  if (sort === 'amountLow') return a.total - b.total || nameA.localeCompare(nameB, 'de-DE');
  return b.total - a.total || nameA.localeCompare(nameB, 'de-DE');
}

function StatCard({ label, value, icon, color, valueClass }: { label: string; value: string; icon: React.ReactNode; color: string; valueClass?: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-2.5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className={`mb-0.5 flex items-center gap-1.5 ${color}`}>
        {icon}
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
      </div>
      <p className={`text-lg font-bold ${valueClass ?? 'text-gray-900 dark:text-gray-100'}`}>{value}</p>
    </div>
  );
}

// ---- 1. Warengruppen view ----

function CategoryGroupView({ transactions, categories, sort }: { transactions: Transaction[]; categories: Category[]; sort: JournalSort }) {
  const groups = useMemo(() => {
    const map = new Map<string, { cat: Category | null; label: string; total: number; count: number; pfand: number; items: { name: string; price: number; quantity: number; taxRate: number; timestamp: number; pfand: number }[] }>();
    for (const tx of transactions) {
      for (const item of tx.items) {
        if (isTaxFreeItem(item)) continue;
        const cat = categories.find((c) => c.id === item.categoryId) ?? null;
        const key = item.categoryId;
        if (!map.has(key)) map.set(key, { cat, label: cat?.name ?? 'Unbekannt', total: 0, count: 0, pfand: 0, items: [] });
        const g = map.get(key)!;
        g.total += item.price * item.quantity;
        g.count += item.quantity;
        g.pfand += item.pfand;
        g.items.push({ name: item.name, price: item.price, quantity: item.quantity, taxRate: isTaxFreeItem(item) ? 0 : item.taxRate, timestamp: tx.timestamp, pfand: item.pfand });
      }
    }
    return [...map.values()].sort((a, b) => compareJournalRows(a, b, sort));
  }, [transactions, categories, sort]);

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <CategoryGroupCard key={g.cat?.id ?? g.label} cat={g.cat} label={g.label} total={g.total} count={g.count} pfand={g.pfand} items={g.items} />
      ))}
    </div>
  );
}

function CategoryGroupCard({ cat, label, total, count, pfand, items }: {
  cat: Category | null; label: string; total: number; count: number; pfand: number;
  items: { name: string; price: number; quantity: number; taxRate: number; timestamp: number; pfand: number }[];
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <button onClick={() => setExpanded(!expanded)} className="flex w-full items-center justify-between p-3 text-left">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${cat ? `bg-gradient-to-br ${cat.color}` : 'bg-gray-200 dark:bg-gray-700'} text-white`}>
            <DynamicIcon name={cat?.icon ?? 'Package'} className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{label}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{count} verkaufte Artikel{pfand > 0 && ` · Pfand ${formatCurrency(pfand)}`}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(total)}</span>
          {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400">
                <th className="pb-1 text-left font-medium">Artikel</th>
                <th className="pb-1 text-right font-medium">Einzelpreis</th>
                <th className="pb-1 text-right font-medium">Menge</th>
                <th className="pb-1 text-right font-medium">Summe</th>
                <th className="pb-1 pl-2 text-right font-medium">MwSt</th>
                <th className="pb-1 pl-2 text-right font-medium">Datum/Zeit</th>
              </tr>
            </thead>
            <tbody>
              {items.sort((a, b) => b.timestamp - a.timestamp).map((item, i) => (
                <tr key={i} className="text-gray-600 dark:text-gray-400">
                  <td className="py-1">{item.name}</td>
                  <td className="py-1 text-right">{formatCurrency(item.price)}</td>
                  <td className="py-1 text-right">{item.quantity}</td>
                  <td className="py-1 text-right">{formatCurrency(item.price * item.quantity)}</td>
                  <td className="py-1 pl-2 text-right text-xs">{item.taxRate === 0 ? 'steuerfrei' : `${item.taxRate}%`}</td>
                  <td className="py-1 pl-2 text-right text-xs">{formatDate(item.timestamp)} {formatTime(item.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---- 2. Einzelartikel view ----

function ArticleGroupView({ transactions, sort }: { transactions: Transaction[]; sort: JournalSort }) {
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number; price: number; taxRate: number; pfand: number; instances: { quantity: number; timestamp: number }[] }>();
    for (const tx of transactions) {
      for (const item of tx.items) {
        if (item.isPfandRetoure) continue;
        const key = `${item.productId}-${item.name}`;
        if (!map.has(key)) map.set(key, { name: item.name, total: 0, count: 0, price: item.price, taxRate: isTaxFreeItem(item) ? 0 : item.taxRate, pfand: 0, instances: [] });
        const g = map.get(key)!;
        g.total += item.price * item.quantity;
        g.count += item.quantity;
        g.pfand += item.pfand;
        g.instances.push({ quantity: item.quantity, timestamp: tx.timestamp });
      }
    }
    return [...map.values()].sort((a, b) => compareJournalRows(a, b, sort));
  }, [transactions, sort]);

  return (
    <div className="space-y-2">
      {groups.map((g, i) => (
        <ArticleGroupCard key={i} name={g.name} total={g.total} count={g.count} price={g.price} taxRate={g.taxRate} pfand={g.pfand} instances={g.instances} />
      ))}
    </div>
  );
}

function ArticleGroupCard({ name, total, count, price, taxRate, pfand, instances }: {
  name: string; total: number; count: number; price: number; taxRate: number; pfand: number;
  instances: { quantity: number; timestamp: number }[];
}) {
  const [expanded, setExpanded] = useState(false);
  const firstTime = instances.length > 0 ? Math.min(...instances.map((i) => i.timestamp)) : 0;
  const lastTime = instances.length > 0 ? Math.max(...instances.map((i) => i.timestamp)) : 0;
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <button onClick={() => setExpanded(!expanded)} className="flex w-full items-center justify-between p-3 text-left">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/30">
            <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {count}× verkauft · {formatCurrency(price)}/Stück · {taxRate === 0 ? 'steuerfrei' : `${taxRate}% MwSt`}{pfand > 0 ? ` · Pfand ${formatCurrency(pfand)}` : ''}
              {instances.length > 1 && ` · ${formatDate(firstTime)} ${formatTime(firstTime)} bis ${formatDate(lastTime)} ${formatTime(lastTime)}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(total)}</span>
          {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400">
                <th className="pb-1 text-left font-medium">Datum</th>
                <th className="pb-1 text-left font-medium">Uhrzeit</th>
                <th className="pb-1 text-right font-medium">Menge</th>
                <th className="pb-1 text-right font-medium">Summe</th>
              </tr>
            </thead>
            <tbody>
              {instances.sort((a, b) => b.timestamp - a.timestamp).map((inst, i) => (
                <tr key={i} className="text-gray-600 dark:text-gray-400">
                  <td className="py-1">{formatDate(inst.timestamp)}</td>
                  <td className="py-1">{formatTime(inst.timestamp)}</td>
                  <td className="py-1 text-right">{inst.quantity}</td>
                  <td className="py-1 text-right">{formatCurrency(price * inst.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---- 3. MwSt-Klassen view ----

function TaxClassView({ transactions, sort }: { transactions: Transaction[]; sort: JournalSort }) {
  const data = useMemo(() => {
    const map = new Map<number, { gross: number; net: number; tax: number; count: number }>();
    for (const tx of transactions) {
      for (const item of tx.items) {
        if (isTaxFreeItem(item)) continue;
        const rate = item.taxRate;
        const gross = item.price * item.quantity;
        const net = item.netPrice;
        const tax = item.taxAmount;
        const g = map.get(rate) ?? { gross: 0, net: 0, tax: 0, count: 0 };
        g.gross += gross; g.net += net; g.tax += tax; g.count += item.quantity;
        map.set(rate, g);
      }
    }
    return [...map.entries()].sort(([aRate, a], [bRate, b]) => {
      if (sort === 'amountHigh') return b.gross - a.gross;
      if (sort === 'amountLow') return a.gross - b.gross;
      return sort === 'nameDesc' ? bRate - aRate : aRate - bRate;
    });
  }, [transactions, sort]);

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-gray-400 dark:text-gray-500">
        <Euro className="h-12 w-12" />
        <p className="text-sm">Keine steuerpflichtigen Umsätze im Zeitraum</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.map(([rate, d]) => (
        <TaxClassCard key={rate} rate={rate} gross={d.gross} net={d.net} tax={d.tax} count={d.count} />
      ))}
    </div>
  );
}

function TaxClassCard({ rate, gross, net, tax, count }: { rate: number; gross: number; net: number; tax: number; count: number }) {
  const reduced = isReducedRate(rate);
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-3 flex items-center gap-2">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${reduced ? 'bg-amber-50 dark:bg-amber-900/30' : 'bg-rose-50 dark:bg-rose-900/30'}`}>
          <Euro className={`h-5 w-5 ${reduced ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`} />
        </div>
        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">MwSt {rate}%</h3>
      </div>
      <div className="space-y-1.5">
        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400"><span>Bruttoumsatz</span><span className="font-medium">{formatCurrency(gross)}</span></div>
        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400"><span>Nettoumsatz</span><span className="font-medium">{formatCurrency(net)}</span></div>
        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400"><span>MwSt-Anteil ({rate}%)</span><span className="font-medium">{formatCurrency(tax)}</span></div>
        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400"><span>Verkaufte Menge</span><span className="font-medium">{count}</span></div>
      </div>
    </div>
  );
}

// ---- 4. Bestseller view ----

function BestsellerView({ transactions, categories, sort }: { transactions: Transaction[]; categories: Category[]; sort: JournalSort }) {
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; count: number; total: number; categoryId: string }>();
    for (const tx of transactions) {
      for (const item of tx.items) {
        if (item.isPfandRetoure) continue;
        const key = `${item.productId}-${item.name}`;
        if (!map.has(key)) map.set(key, { name: item.name, count: 0, total: 0, categoryId: item.categoryId });
        const g = map.get(key)!;
        g.count += item.quantity;
        g.total += item.price * item.quantity;
      }
    }
    return [...map.values()].sort((a, b) => compareJournalRows(a, b, sort));
  }, [transactions, sort]);

  const maxCount = groups.length > 0 ? groups[0].count : 1;

  return (
    <div className="space-y-2">
      {groups.map((g, i) => {
        const cat = categories.find((c) => c.id === g.categoryId);
        const isTop = i < 3 && groups.length > 3;
        const isLow = i >= groups.length - 2 && groups.length > 3 && g.count <= maxCount * 0.2;
        return (
          <div key={i} className={`flex items-center gap-3 rounded-2xl border p-3 shadow-sm ${
            isTop ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20' :
            isLow ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20' :
            'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
          }`}>
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
              isTop ? 'bg-green-600 text-white' : isLow ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
            }`}>
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{g.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{cat?.name ?? '—'} · {g.count}× verkauft</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden h-6 w-32 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700 sm:block">
                <div className={`h-full rounded-full ${isTop ? 'bg-green-500' : isLow ? 'bg-red-400' : 'bg-blue-500'}`} style={{ width: `${(g.count / maxCount) * 100}%` }} />
              </div>
              <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatCurrency(g.total)}</span>
              {isTop && <Trophy className="h-4 w-4 text-green-600 dark:text-green-400" />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- 5. Einzel-Bons / Transaktionen ----

function TransactionListView({ transactions, sort }: { transactions: Transaction[]; sort: JournalSort }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const sorted = [...transactions].sort((a, b) => {
    if (sort === 'oldest') return a.timestamp - b.timestamp;
    if (sort === 'amountHigh') return b.total - a.total;
    if (sort === 'amountLow') return a.total - b.total;
    return b.timestamp - a.timestamp;
  });

  return (
    <div className="space-y-2">
      {sorted.map((tx) => {
        const taxMap = getTaxByRate(tx);
        const taxLine = sortedRateKeys(taxMap).map((r) => `MwSt ${r}%: ${formatCurrency(taxMap.get(r) ?? 0)}`).join(' · ');
        return (
          <div key={tx.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <button onClick={() => setExpanded(expanded === tx.id ? null : tx.id)} className="flex w-full items-center justify-between p-3 text-left">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/30">
                  <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatDate(tx.timestamp)} · {formatTime(tx.timestamp)}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {tx.items.length} Artikel · {taxLine || 'keine MwSt'}
                    {tx.totalPfand > 0 && ` · Pfand: ${formatCurrency(tx.totalPfand)}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {tx.paymentMethod === 'cash' ? <Banknote className="h-4 w-4 text-green-600 dark:text-green-400" /> : <CreditCard className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
                </div>
                <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(tx.total)}</span>
                {expanded === tx.id ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
              </div>
            </button>
            {expanded === tx.id && (
              <div className="border-t border-gray-100 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/40">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400">
                      <th className="pb-1 text-left font-medium">Artikel</th>
                      <th className="pb-1 text-right font-medium">Einzelpreis</th>
                      <th className="pb-1 text-right font-medium">Menge</th>
                      <th className="pb-1 text-right font-medium">Summe</th>
                      <th className="pb-1 pl-2 text-right font-medium">Pfand</th>
                      <th className="pb-1 pl-2 text-right font-medium">MwSt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tx.items.map((item, i) => (
                      <tr key={i} className="text-gray-600 dark:text-gray-400">
                        <td className="py-1">{item.name}</td>
                        <td className="py-1 text-right">{formatCurrency(item.price)}</td>
                        <td className="py-1 text-right">{item.quantity}</td>
                        <td className="py-1 text-right">{formatCurrency(item.price * item.quantity)}</td>
                        <td className="py-1 pl-2 text-right text-xs">{item.pfand > 0 ? formatCurrency(item.pfand) : '—'}</td>
                        <td className="py-1 pl-2 text-right text-xs">{item.taxRate === 0 ? 'steuerfrei' : `${item.taxRate}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-2 space-y-0.5 border-t border-gray-200 pt-2 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  <div className="flex justify-between"><span>Netto</span><span>{formatCurrency(tx.totalNet)}</span></div>
                  <div className="flex justify-between"><span>MwSt gesamt</span><span>{formatCurrency(tx.totalTax)}</span></div>
                  {tx.totalPfand > 0 && <div className="flex justify-between"><span>Pfand</span><span>{formatCurrency(tx.totalPfand)}</span></div>}
                  {tx.totalPfand > 0 && <div className="flex justify-between"><span>Pfand (eingenommen)</span><span>{formatCurrency(tx.totalPfand)}</span></div>}
                  <div className="flex justify-between font-bold text-gray-900 dark:text-gray-100"><span>Umsatz (ohne Pfand)</span><span>{formatCurrency(tx.subtotal)}</span></div>
                  <div className="flex justify-between font-bold text-gray-900 dark:text-gray-100"><span>Gesamt (Kassenbetrag)</span><span>{formatCurrency(tx.total)}</span></div>
                  <div className="flex justify-between">
                    <span>Zahlart: {tx.items.every((item) => item.isPfandRetoure) ? 'PFANDAUSGABE' : tx.paymentMethod === 'cash' ? 'BAR' : 'KARTE'}</span>
                    {tx.paymentMethod === 'cash' && tx.amountPaid !== undefined && <span>Gegeben: {formatCurrency(tx.amountPaid)}</span>}
                  </div>
                  {tx.paymentMethod === 'cash' && tx.change !== undefined && tx.change > 0 && (
                    <div className="flex justify-between"><span>Rückgeld</span><span>{formatCurrency(tx.change)}</span></div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
