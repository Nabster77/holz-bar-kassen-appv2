import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CartItem, Category, CashSession, Product, Transaction, ShotOption, Location, PfandSettings, StaffSecurityQuestion, StaffUser } from '@/types';
import { ProductTile } from './ProductTile';
import { CartItemRow } from './CartItemRow';
import { CartSummary } from './CartSummary';
import { CheckoutModal } from './CheckoutModal';
import { CashOpeningDialog } from './CashOpeningDialog';
import { CashEntryDialog } from './CashEntryDialog';
import { CashCorrectionDialog } from './CashCorrectionDialog';
import { DailyCloseDialog } from './DailyCloseDialog';
import { ShotSelectionDialog } from './ShotSelectionDialog';
import { PfandRetoureDialog } from './PfandRetoureDialog';
import { BonlisteDialog } from './BonlisteDialog';
import type { StornoRecord } from '@/lib/stornoRules';
import type { StornoCloudState } from '@/hooks/useStornoLedger';
import { DynamicIcon } from '@/components/DynamicIcon';
import { sessionTransactions } from '@/lib/sessionTransactions';
import { SHOT_CATEGORY_ID } from '@/lib/shotCatalog';
import {
  ShoppingCart, Trash2, Search, Lock, Move, Euro, Recycle, ClipboardList,
} from 'lucide-react';

type HeaderAction = 'deposit' | 'withdrawal' | 'pfand' | 'correction' | 'close' | null;

interface Props {
  shotOptions: ShotOption[];
  categories: Category[];
  products: Product[];
  activeSession: CashSession | null;
  onCheckout: (tx: Transaction) => void;
  onOpenCash: (location: Location, openingBalance: number) => Promise<boolean>;
  onCorrectOpening: (newAmount: number, reason: string) => void;
  onCashEntry: (type: 'deposit' | 'withdrawal', amount: number, reason: string, isPfandRetoure?: boolean) => void;
  onCloseCash: (closingBalance: number, closingWithdrawalAmount: number) => Promise<{ ok: boolean; error?: string }>;
  transactions: Transaction[];
  stornos: StornoRecord[];
  stornoStatus: StornoCloudState;
  stornoError?: string;
  stornoServiceReady: boolean;
  testMode: boolean;
  onCommitStorno: (receipt: Transaction, reason: string, password: string, id: string) => Promise<StornoRecord>;
  onMoveProduct?: (sourceId: string, targetId: string) => void;
  headerAction?: HeaderAction;
  onHeaderActionConsumed?: () => void;
  loginRequest: number;
  selectedLocation?: Location;
  pfandSettings: PfandSettings;
  staffUsers: StaffUser[];
  currentStaff: StaffUser | null;
  online: boolean;
  onStaffAuthenticated: (staff: StaffUser) => void;
  onSetInitialCredentials: (id: string, password: string, question: StaffSecurityQuestion | null, answer: string) => Promise<StaffUser>;
  onConfigureStaffSecurity: (id: string, question: StaffSecurityQuestion | null, answer: string) => Promise<StaffUser>;
  onResetStaffPassword: (id: string, answer: string, password: string) => Promise<StaffUser>;
  lastStaffId: string | null;
  onDiscardEmptySession: () => Promise<void>;
  onHome?: () => void;
  openingBalanceSuggestions?: Record<Location, number | null>;
}

const PFAND_RETOURE_PRODUCT: Product = {
  id: '__pfand_retoure__',
  name: 'Pfand-Retoure',
  categoryId: '__pfand__',
  imageUrl: '',
  taxClass: 'zero',
  available: true,
  sortOrder: 999999,
  hasShot: false,
  prices: { Friedrichshafen: 0, Bregenz: 0 },
  pfand: { Friedrichshafen: 0, Bregenz: 0 },
};

export function POSScreen({
  categories, products, shotOptions, activeSession, onCheckout,
  onOpenCash, onCorrectOpening, onCashEntry, onCloseCash, transactions, stornos, stornoStatus, stornoError, stornoServiceReady, testMode, onCommitStorno, onMoveProduct,
  headerAction, onHeaderActionConsumed, loginRequest, selectedLocation, pfandSettings, staffUsers, currentStaff, online, onStaffAuthenticated, onSetInitialCredentials, onConfigureStaffSecurity, onResetStaffPassword, lastStaffId, onDiscardEmptySession, onHome, openingBalanceSuggestions,
}: Props) {
  const [activeCat, setActiveCat] = useState<string>(categories[0]?.id ?? '');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [showCheckout, setShowCheckout] = useState(false);
  // Der Dialog wird beim ersten Laden passend zum Sitzungsstatus geöffnet.
  // Danach darf nur ein tatsächlich bestätigter Tagesabschluss ihn erneut öffnen.
  // Kurzzeitige Leerstände während Import oder Cloud-Abgleich sind kein Abschluss.
  const [showOpenDialog, setShowOpenDialog] = useState(() => !activeSession || !currentStaff);
  // One shared header control handles both logout and return login. Logging
  // out must not spawn another login button or automatically reopen the modal.
  const previousLoginRequest = useRef(loginRequest);
  useEffect(() => {
    if (loginRequest === previousLoginRequest.current) return;
    previousLoginRequest.current = loginRequest;
    if (!activeSession || !currentStaff) setShowOpenDialog(true);
  }, [loginRequest, activeSession, currentStaff]);
  const openDialogAfterConfirmedClose = useRef(false);
  const [showCorrection, setShowCorrection] = useState(false);
  const [cashEntryType, setCashEntryType] = useState<'deposit' | 'withdrawal' | null>(null);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [shotProduct, setShotProduct] = useState<Product | null>(null);
  const [shotCartIndex, setShotCartIndex] = useState<number | null>(null);
  const [showPfandRetoure, setShowPfandRetoure] = useState(false);
  const [showBonliste, setShowBonliste] = useState(false);
  const [priceEntryProduct, setPriceEntryProduct] = useState<Product | null>(null);
  const [dragMode, setDragMode] = useState(false);
  const [sortMode, setSortMode] = useState<'manual' | 'asc' | 'desc'>('manual');
  const [dragSource, setDragSource] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const currentCashBalance = useMemo(() => {
    if (!activeSession) return 0;
    const cashSales = sessionTransactions(transactions, activeSession)
      .filter(tx => tx.paymentMethod === 'cash')
      .reduce((sum, tx) => sum + tx.total, 0);
    const entries = activeSession.entries.reduce((sum, entry) => sum + (entry.type === 'deposit' ? entry.amount : -entry.amount), 0);
    const stornoCash = stornos.filter((entry) => entry.cashSessionId === activeSession.id)
      .reduce((sum, entry) => sum + entry.cashEffect, 0);
    return Math.round((activeSession.openingBalance + cashSales + entries + stornoCash) * 100) / 100;
  }, [activeSession, transactions, stornos]);

  const requestDailyClose = useCallback(async () => {
    if (!activeSession) return;
    const unused = !activeSession.entries.length && !activeSession.corrections.length &&
      !transactions.some((tx) => tx.location === activeSession.location && tx.timestamp >= activeSession.openedAt);
    // Preserve the original rule: no official close for an empty, unfunded till.
    if (!unused || activeSession.openingBalance !== 0) {
      setShowCloseDialog(true);
      return;
    }
    alert(`Sie haben in dieser Kassensitzung keine Buchungen oder Kassenbewegungen getätigt. Ihr Anfangsbestand beträgt ${activeSession.openingBalance.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}. Es wird kein Tagesabschluss erstellt.`);
    try {
      await onDiscardEmptySession();
      setShowOpenDialog(true);
    } catch (error) {
      alert((error as { message?: string }).message ?? 'Die unbenutzte Kasse konnte nicht in der Cloud verworfen werden. Bitte Verbindung prüfen.');
    }
  }, [activeSession, transactions, onDiscardEmptySession]);

  useEffect(() => {
    // Der Öffnungsdialog wird ausschließlich nach einem wirklich bestätigten
    // Tagesabschluss erneut angezeigt. Änderungen der Sitzung durch Import
    // oder Synchronisierung dürfen einen bereits geöffneten Dialog weder
    // schließen noch erneut auslösen.
    if (!activeSession && openDialogAfterConfirmedClose.current) {
      openDialogAfterConfirmedClose.current = false;
      setShowOpenDialog(true);
    }
  }, [activeSession?.id]);

  useEffect(() => {
    if (!headerAction || !activeSession || !currentStaff) return;
    if (headerAction === 'deposit' || headerAction === 'withdrawal') {
      setCashEntryType(headerAction);
    } else if (headerAction === 'pfand') {
      setShowPfandRetoure(true);
    } else if (headerAction === 'correction') {
      if (currentCashBalance > 0) setShowCorrection(true);
    } else if (headerAction === 'close') {
      void requestDailyClose();
    }
    onHeaderActionConsumed?.();
  }, [headerAction, activeSession, currentStaff, onHeaderActionConsumed, currentCashBalance, requestDailyClose]);

  const currentLocation: Location = activeSession?.location ?? (selectedLocation ?? 'Friedrichshafen');

  const visibleProducts = useMemo(() => {
    let list = products.filter((p) => p.available);
    if (search.trim()) {
      list = list.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));
    } else if (activeCat) {
      list = list.filter((p) => p.categoryId === activeCat);
    }
    return [...list].sort(sortMode === 'asc'
      ? (a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' })
      : sortMode === 'desc'
        ? (a, b) => b.name.localeCompare(a.name, 'de', { sensitivity: 'base' })
        : (a, b) => a.sortOrder - b.sortOrder);
  }, [products, activeCat, search, sortMode]);

  function addToCart(product: Product, shot: ShotOption | null = null, customPrice?: number) {
    const basePrice = customPrice !== undefined ? customPrice : product.prices[currentLocation];
    const unitPrice = basePrice + (shot?.price ?? 0);
    const unitPfand = product.pfand[currentLocation];

    setCart((prev) => {
      const existingIdx = prev.findIndex((c) =>
        c.product.id === product.id &&
        ((c.shot?.id ?? 'none') === (shot?.id ?? 'none')) &&
        c.unitPrice === unitPrice
      );
      if (existingIdx >= 0) {
        return prev.map((c, i) => i === existingIdx ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { product, quantity: 1, shot, unitPrice, unitPfand }];
    });
  }

  function addPfandRetoureToCart(amount: number, count: number) {
    const perUnit = count > 0 ? amount / count : amount;
    const item: CartItem = {
      product: { ...PFAND_RETOURE_PRODUCT, name: `Pfand-Retoure` },
      quantity: count,
      shot: null,
      unitPrice: -perUnit,
      unitPfand: 0,
      isPfandRetoure: true,
    };
    setCart((prev) => [...prev.filter((c) => !c.isPfandRetoure), item]);
  }

  function handleProductTap(product: Product) {
    if (product.hasIndividualPrice) {
      setPriceEntryProduct(product);
    } else {
      addToCart(product);
    }
  }

  function handleShotSelect(shot: ShotOption) {
    if (shotCartIndex !== null) {
      setCart((prev) => prev.flatMap((item, index) => {
        if (index !== shotCartIndex || item.isPfandRetoure) return [item];
        const oldShotPrice = item.shot?.price ?? 0;
        const nextShot = shot.id === 'none' ? null : shot;
        const updated = { ...item, quantity: 1, shot: nextShot, unitPrice: Math.round((item.unitPrice - oldShotPrice + (nextShot?.price ?? 0)) * 100) / 100 };
        return item.quantity > 1 ? [{ ...item, quantity: item.quantity - 1 }, updated] : [updated];
      }));
    }
    setShotProduct(null);
    setShotCartIndex(null);
  }

  function inc(index: number) {
    setCart((prev) => prev.map((c, i) => i === index ? { ...c, quantity: c.quantity + 1 } : c));
  }
  function dec(index: number) {
    setCart((prev) =>
      prev
        .map((c, i) => i === index ? { ...c, quantity: c.quantity - 1 } : c)
        .filter((c) => c.quantity > 0),
    );
  }
  function removeItem(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }
  function clearCart() {
    setCart([]);
  }

  const cartCount = cart.reduce((sum, c) => sum + c.quantity, 0);

  function handleCheckoutComplete(tx: Transaction) {
    onCheckout(tx);
    setCart([]);
  }

  return (
    <div className="flex h-full flex-col gap-2 sm:gap-3">
      {/* Portrait tablet: roughly 65% product area / 35% persistent cart.
          Small phones stack because a 200px-wide cart would be unusable. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-[minmax(0,1.85fr)_minmax(220px,1fr)] sm:overflow-hidden lg:grid-cols-[minmax(0,2.15fr)_minmax(250px,1fr)] lg:gap-3">
        {/* Left: products area */}
        <div className="flex min-h-0 min-w-0 flex-col sm:overflow-hidden">
          {/* Categories always visible as readable labeled touch targets. */}
          <div className="mb-1 flex shrink-0 items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Warengruppen</h2>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Tippen zum Wechseln</span>
          </div>
          <div className="mb-2 grid max-h-[min(27dvh,13.5rem)] shrink-0 grid-cols-2 gap-1.5 overflow-y-auto overscroll-contain pr-1 lg:grid-cols-3 2xl:grid-cols-4">
            {[...categories].filter((c) => c.id !== SHOT_CATEGORY_ID).sort((a, b) => a.sortOrder - b.sortOrder).map((cat) => (
              <button
                key={cat.id}
                type="button"
                aria-pressed={activeCat === cat.id && !search}
                onClick={() => { setActiveCat(cat.id); setSearch(''); }}
                style={cat.color.startsWith('linear-gradient(') ? { background: cat.color } : cat.color.startsWith('#') ? { backgroundColor: cat.color } : undefined}
                className={`flex min-h-12 min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-bold leading-tight text-white shadow-sm transition hover:brightness-110 active:scale-[0.98] sm:text-sm bg-gradient-to-r ${cat.color.startsWith('linear-gradient(') || cat.color.startsWith('#') ? '' : cat.color} ${activeCat === cat.id && !search ? 'border-emerald-300 ring-2 ring-emerald-400/70' : 'border-transparent opacity-90'}`}
              >
                <DynamicIcon name={cat.icon} className="h-4 w-4 shrink-0" />
                <span className="min-w-0 break-words text-center">{cat.name}</span>
              </button>
            ))}
          </div>

          {/* Active category heading */}
          <div className="mb-2 flex items-center gap-2">
            {(() => {
              const cat = categories.find((c) => c.id === activeCat);
              if (search.trim()) {
                return <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Suchergebnisse für "{search}"</h2>;
              }
              if (cat) {
                return (
                  <h2 className="flex items-center gap-2 text-lg font-bold">
                    <span style={cat.color.startsWith("linear-gradient(") ? { background: cat.color } : cat.color.startsWith("#") ? { backgroundColor: cat.color } : undefined} className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${cat.color.startsWith("linear-gradient(") || cat.color.startsWith("#") ? "" : cat.color} text-white`}>
                      <DynamicIcon name={cat.icon} className="h-4 w-4" />
                    </span>
                    <span className="text-gray-900 dark:text-gray-100">{cat.name}</span>
                    <span className="text-sm font-normal text-gray-400">
                      ({visibleProducts.length} {visibleProducts.length === 1 ? 'Artikel' : 'Artikel'})
                    </span>
                  </h2>
                );
              }
              return null;
            })()}
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
                Sortierung:
                <select aria-label="Kassenartikel sortieren" value={sortMode}
                  onChange={event => { setSortMode(event.target.value as 'manual' | 'asc' | 'desc'); setDragMode(false); }}
                  className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs font-semibold text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                  <option value="manual">Eigene Reihenfolge</option>
                  <option value="asc">Aufsteigend (A–Z)</option>
                  <option value="desc">Absteigend (Z–A)</option>
                </select>
              </label>
              {visibleProducts.length > 1 && !search.trim() && (
                <button type="button" aria-pressed={dragMode}
                  onClick={() => { if (!dragMode) setSortMode('manual'); setDragMode(v => !v); }}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    dragMode
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}>
                  <Move className="h-3.5 w-3.5" /> {dragMode ? '✓ Verschieben aktiv' : 'Kacheln verschieben'}
                </button>
              )}
            </div>
          </div>

          {/* Search bar: sales tools are grouped with the cart header. */}
          <div className="relative mb-2 shrink-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Artikel suchen..."
              className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-base text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 sm:py-2.5 sm:text-sm" />
          </div>

          {/* Product grid */}
          <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {visibleProducts.length === 0 ? (
              <div className="flex h-full items-center justify-center text-gray-400 dark:text-gray-500">
                <p className="text-sm">Keine Artikel gefunden</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 min-[1040px]:grid-cols-3 min-[1420px]:grid-cols-4 min-[1740px]:grid-cols-5">
                {visibleProducts.map((product) => (
                  <ProductTile
                    key={product.id}
                    product={product}
                    location={currentLocation}
                    onAdd={handleProductTap}
                    disabled={!activeSession || !currentStaff}
                    dragMode={dragMode}
                    onDragStart={(id) => setDragSource(id)}
                    onDragOver={(id) => setDragOver(id)}
                    onDrop={() => {
                      if (dragSource && dragOver && dragSource !== dragOver) {
                        onMoveProduct?.(dragSource, dragOver);
                      }
                      setDragSource(null);
                      setDragOver(null);
                    }}
                    isDraggedOver={dragOver === product.id}
                    isDragging={dragSource === product.id}
                  />
                ))}
              </div>
            )}
            {(!activeSession || !currentStaff) && visibleProducts.length > 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-8">
                <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-black/80 px-4 py-2.5 text-sm font-semibold text-white shadow-lg backdrop-blur">
                  <Lock className="h-4 w-4" />
                  {!activeSession ? 'Bitte zuerst Kasse eröffnen, um Artikel zu verkaufen' : 'Bitte zuerst als Mitarbeiter anmelden'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: cart */}
        <div className="flex min-h-56 min-w-0 flex-col rounded-2xl border border-emerald-700/20 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:h-full sm:min-h-0">
          <div className="shrink-0 border-b border-gray-200 p-2.5 dark:border-gray-700 sm:p-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <ShoppingCart className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
                <h2 className="font-bold text-gray-900 dark:text-gray-100">Warenkorb</h2>
                {cartCount > 0 && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-bold text-white">{cartCount}</span>}
              </div>
              {cart.length > 0 && (
                <button type="button" onClick={clearCart}
                  className="flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30">
                  <Trash2 className="h-3.5 w-3.5" /> Leeren
                </button>
              )}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button"
                onClick={() => setShowPfandRetoure(true)}
                disabled={!activeSession || !currentStaff}
                aria-label="Pfand-Retoure erfassen"
                title="Pfand-Retoure direkt während des Verkaufs erfassen"
                className="flex min-h-12 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-teal-400/70 bg-teal-700 px-2 py-2 text-center text-xs font-bold leading-tight text-white shadow-sm transition hover:bg-teal-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm">
                <Recycle className="h-4 w-4 shrink-0" />
                <span>Pfand-Retoure</span>
              </button>
              <button type="button"
                onClick={() => setShowBonliste(true)}
                disabled={!activeSession || !currentStaff}
                aria-label="Bonliste öffnen und Bon stornieren"
                title="Letzte fünf Originalbons ansehen und Bar- oder Kartenbuchung begründet stornieren"
                className="flex min-h-12 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-sky-400/70 bg-sky-700 px-2 py-2 text-center text-xs font-bold leading-tight text-white shadow-sm transition hover:bg-sky-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm">
                <ClipboardList className="h-4 w-4 shrink-0" />
                <span>Bonliste / Storno</span>
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1 sm:px-3">
            {cart.length === 0 && (
              <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">Noch keine Artikel im Warenkorb</p>
            )}
            {cart.map((item, index) => (
              <CartItemRow key={index} item={item} location={currentLocation} onInc={() => inc(index)} onDec={() => dec(index)} onRemove={() => removeItem(index)} onEditShot={item.product.isPfandArticle || item.product.hasShot ? () => { setShotCartIndex(index); setShotProduct(item.product); } : undefined} />
            ))}
          </div>

          <div className="shrink-0 border-t border-gray-200 p-2 dark:border-gray-700 sm:p-3">
            {cart.length > 0 && <div className="max-h-[min(25dvh,11rem)] overflow-y-auto"><CartSummary items={cart} location={currentLocation} /></div>}
            {cart.length > 0 && (
              <button
                onClick={() => activeSession && currentStaff && setShowCheckout(true)}
                disabled={!activeSession || !currentStaff}
                className={`mt-2 min-h-11 w-full rounded-xl px-3 py-2.5 text-sm font-bold text-white shadow-lg transition active:scale-95 ${activeSession && currentStaff ? 'bg-green-600 hover:bg-green-700' : 'cursor-not-allowed bg-gray-400 dark:bg-gray-600'}`}
              >
                {activeSession && currentStaff ? 'Bezahlen' : 'Bezahlen (Anmeldung erforderlich)'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Dialogs */}
      {showOpenDialog && (
        <CashOpeningDialog existingSession={activeSession} onSave={async (loc, bal) => { if (!activeSession) { const ok = await onOpenCash(loc, bal); if (!ok) return false; } setShowOpenDialog(false); return true; }} onClose={() => { setShowOpenDialog(false); onHome?.(); }} defaultLocation={currentLocation} staffUsers={staffUsers} currentStaff={currentStaff} online={online} lastStaffId={lastStaffId} onStaffAuthenticated={onStaffAuthenticated} onSetInitialCredentials={onSetInitialCredentials} onConfigureSecurity={onConfigureStaffSecurity} onResetStaffPassword={onResetStaffPassword} openingBalanceSuggestions={openingBalanceSuggestions} />
      )}
      {showCorrection && activeSession && (
        <CashCorrectionDialog session={activeSession} currentCashBalance={currentCashBalance} onSave={(amt, reason) => { onCorrectOpening(amt, reason); setShowCorrection(false); }} onClose={() => setShowCorrection(false)} />
      )}
      {cashEntryType && activeSession && (
        <CashEntryDialog session={activeSession} currentCashBalance={currentCashBalance} type={cashEntryType} onSave={(amt, reason) => { onCashEntry(cashEntryType, amt, reason); setCashEntryType(null); }} onClose={() => setCashEntryType(null)} />
      )}
      {showBonliste && activeSession && currentStaff && (
        <BonlisteDialog
          session={activeSession}
          transactions={transactions}
          stornos={stornos}
          staff={currentStaff}
          currentCashBalance={currentCashBalance}
          online={online}
          testMode={testMode}
          cloudReady={stornoStatus === 'ready' && stornoServiceReady}
          cloudError={stornoError}
          onClose={() => setShowBonliste(false)}
          onCommit={onCommitStorno}
        />
      )}
      {showPfandRetoure && activeSession && currentStaff && (
        <PfandRetoureDialog
          session={activeSession}
          pfandSettings={pfandSettings}
          onSave={(amount, count) => {
            addPfandRetoureToCart(amount, count);
            setShowPfandRetoure(false);
          }}
          onClose={() => setShowPfandRetoure(false)}
        />
      )}
      {showCloseDialog && activeSession && (
        <DailyCloseDialog session={activeSession} transactions={transactions} stornos={stornos} currentStaff={currentStaff} onClose={async (bal, closingWithdrawalAmount) => {
          const result = await onCloseCash(bal, closingWithdrawalAmount);
          if (result.ok) {
            openDialogAfterConfirmedClose.current = true;
            setShowCloseDialog(false);
          }
          return result;
        }} onCancel={() => setShowCloseDialog(false)} />
      )}
      {shotProduct && (
        <ShotSelectionDialog product={shotProduct} options={shotOptions} location={currentLocation} onSelect={handleShotSelect} onCancel={() => { setShotProduct(null); setShotCartIndex(null); }} />
      )}
      {priceEntryProduct && (
        <IndividualPriceDialog
          product={priceEntryProduct}
          onConfirm={(price) => {
            addToCart(priceEntryProduct, null, price);
            setPriceEntryProduct(null);
          }}
          onCancel={() => setPriceEntryProduct(null)}
        />
      )}
      {showCheckout && cart.length > 0 && (
        <CheckoutModal items={cart} location={currentLocation} onComplete={handleCheckoutComplete} onCancel={() => setShowCheckout(false)} />
      )}
    </div>
  );
}

function IndividualPriceDialog({ product, onConfirm, onCancel }: {
  product: Product;
  onConfirm: (price: number) => void;
  onCancel: () => void;
}) {
  const [priceInput, setPriceInput] = useState('');

  function confirm() {
    const val = parseFloat(priceInput.replace(',', '.')) || 0;
    if (val <= 0) return;
    onConfirm(val);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-2">
          <Euro className="h-5 w-5 text-amber-500" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Individueller Preis</h3>
        </div>
        <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">{product.name}</p>
        <input
          autoFocus
          value={priceInput}
          onChange={(e) => setPriceInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && confirm()}
          placeholder="Preis eingeben"
          inputMode="decimal"
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-lg text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <div className="mt-4 flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600">
            Abbrechen
          </button>
          <button onClick={confirm} disabled={!priceInput.trim()} className="flex-1 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-amber-600 active:scale-95 disabled:opacity-50">
            Bestätigen
          </button>
        </div>
      </div>
    </div>
  );
}
