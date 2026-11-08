import { useEffect, useMemo, useState } from 'react';
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
import { StaffLoginDialog } from '@/components/StaffLoginDialog';
import { DynamicIcon } from '@/components/DynamicIcon';
import { formatDateLong } from '@/lib/format';
import { SHOT_OPTIONS } from '@/lib/seed';
import {
  ShoppingCart, Trash2, Search, Lock, MapPin, Move, Euro,
} from 'lucide-react';

type HeaderAction = 'deposit' | 'withdrawal' | 'pfand' | null;

interface Props {
  categories: Category[];
  products: Product[];
  activeSession: CashSession | null;
  onCheckout: (tx: Transaction) => void;
  onOpenCash: (location: Location, openingBalance: number) => void;
  onCorrectOpening: (newAmount: number, reason: string) => void;
  onCashEntry: (type: 'deposit' | 'withdrawal', amount: number, reason: string, isPfandRetoure?: boolean) => void;
  onCloseCash: (closingBalance: number, closingWithdrawalAmount: number) => Promise<{ ok: boolean; error?: string }>;
  transactions: Transaction[];
  onEnterAdmin?: (selectedStaff: StaffUser | null) => void;
  onMoveProduct?: (sourceId: string, targetId: string) => void;
  headerAction?: HeaderAction;
  onHeaderActionConsumed?: () => void;
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
  onStaffLogout: () => void;
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
  categories, products, activeSession, onCheckout,
  onOpenCash, onCorrectOpening, onCashEntry, onCloseCash, transactions, onEnterAdmin, onMoveProduct,
  headerAction, onHeaderActionConsumed, selectedLocation, pfandSettings, staffUsers, currentStaff, online, onStaffAuthenticated, onSetInitialCredentials, onConfigureStaffSecurity, onResetStaffPassword, lastStaffId, onStaffLogout, openingBalanceSuggestions,
}: Props) {
  const [activeCat, setActiveCat] = useState<string>(categories[0]?.id ?? '');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [showCheckout, setShowCheckout] = useState(false);
  const [showOpenDialog, setShowOpenDialog] = useState(false);
  const [showCorrection, setShowCorrection] = useState(false);
  const [cashEntryType, setCashEntryType] = useState<'deposit' | 'withdrawal' | null>(null);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [shotProduct, setShotProduct] = useState<Product | null>(null);
  const [showPfandRetoure, setShowPfandRetoure] = useState(false);
  const [priceEntryProduct, setPriceEntryProduct] = useState<Product | null>(null);
  const [dragMode, setDragMode] = useState(false);
  const [dragSource, setDragSource] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  useEffect(() => {
    // When the session reaches this device asynchronously through cloud sync,
    // replace the opening dialog with the resumed cash register immediately.
    setShowOpenDialog(!activeSession);
  }, [activeSession]);

  useEffect(() => {
    if (!headerAction || !activeSession || !currentStaff) return;
    if (headerAction === 'deposit' || headerAction === 'withdrawal') {
      setCashEntryType(headerAction);
    } else if (headerAction === 'pfand') {
      setShowPfandRetoure(true);
    }
    onHeaderActionConsumed?.();
  }, [headerAction, activeSession, currentStaff, onHeaderActionConsumed]);

  const currentLocation: Location = activeSession?.location ?? (selectedLocation ?? 'Friedrichshafen');

  const visibleProducts = useMemo(() => {
    let list = products.filter((p) => p.available);
    if (search.trim()) {
      list = list.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));
    } else if (activeCat) {
      list = list.filter((p) => p.categoryId === activeCat);
    }
    return [...list].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [products, activeCat, search]);

  function addToCart(product: Product, shot: ShotOption | null = null, customPrice?: number) {
    const basePrice = customPrice !== undefined ? customPrice : product.prices[currentLocation];
    const unitPrice = basePrice + (shot?.price ?? 0);
    const unitPfand = product.pfand[currentLocation];
    const cartKey = shot ? `${product.id}-${shot.id}` : product.id;

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
    } else if (product.hasShot) {
      setShotProduct(product);
    } else {
      addToCart(product);
    }
  }

  function handleShotSelect(shot: ShotOption) {
    if (shotProduct) {
      if (shot.id === 'none') {
        addToCart(shotProduct);
      } else {
        addToCart(shotProduct, shot);
      }
    }
    setShotProduct(null);
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
      {/* Cash info bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        {activeSession ? (
          <>
            <div className="flex items-center gap-1.5 text-sm">
              <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="font-semibold text-gray-900 dark:text-gray-100">{activeSession.location}</span>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {formatDateLong(activeSession.openedAt)}
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              {currentStaff ? <>
              <span className="rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5 text-sm font-bold text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200">{currentStaff.name}</span>
              <button onClick={onStaffLogout}
                className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700">
                Abmelden
              </button>
              <button onClick={() => setShowCorrection(true)}
                className="flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50">
                Korrektur
              </button>
              <button onClick={() => setShowCloseDialog(true)}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700">
                <Lock className="h-3.5 w-3.5" /> Tagesabschluss
              </button>
              </> : <span className="rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-bold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">Mitarbeiter anmelden</span>}
            </div>
          </>
        ) : (
          <>
            <div className="text-sm text-gray-500 dark:text-gray-400">Kasse noch nicht eröffnet</div>
            <button onClick={() => setShowOpenDialog(true)}
              className="ml-auto flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700">
              <Lock className="h-3.5 w-3.5" /> Kasse eröffnen
            </button>
          </>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto xl:flex-row xl:overflow-hidden">
        {/* Left: products area */}
        <div className="flex flex-1 flex-col xl:overflow-hidden">
          {/* Category tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {[...categories].sort((a, b) => a.sortOrder - b.sortOrder).map((cat) => (
              <button
                key={cat.id}
                onClick={() => { setActiveCat(cat.id); setSearch(''); }}
                className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-95 ${
                  activeCat === cat.id && !search
                    ? `bg-gradient-to-r ${cat.color} text-white shadow-md`
                    : 'bg-white text-gray-600 shadow-sm hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                <DynamicIcon name={cat.icon} className="h-4 w-4" />
                {cat.name}
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
                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${cat.color} text-white`}>
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
            {visibleProducts.length > 1 && !search.trim() && (
              <button
                onClick={() => setDragMode((v) => !v)}
                className={`ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  dragMode
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                <Move className="h-3.5 w-3.5" /> {dragMode ? 'Sortieren beenden' : 'Kacheln sortieren'}
              </button>
            )}
            {dragMode && (
              <div className="ml-2 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                Kachel antippen und ziehen, um neu anzuordnen
              </div>
            )}
          </div>

          {/* Search bar */}
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Artikel suchen..."
              className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-base text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 sm:py-2.5 sm:text-sm" />
          </div>

          {/* Product grid */}
          <div className="relative xl:flex-1 xl:overflow-y-auto">
            {visibleProducts.length === 0 ? (
              <div className="flex h-full items-center justify-center text-gray-400 dark:text-gray-500">
                <p className="text-sm">Keine Artikel gefunden</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7">
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
        <div className="flex w-full shrink-0 flex-col rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 xl:w-96">
          <div className="flex items-center justify-between border-b border-gray-200 p-3 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h2 className="font-bold text-gray-900 dark:text-gray-100">Warenkorb</h2>
              {cartCount > 0 && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-bold text-white">{cartCount}</span>}
            </div>
            {cart.length > 0 && (
              <button onClick={clearCart} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30">
                <Trash2 className="h-3.5 w-3.5" /> Leeren
              </button>
            )}
          </div>

          <div className="px-3 xl:flex-1 xl:overflow-y-auto">
            {cart.map((item, index) => (
              <CartItemRow key={index} item={item} location={currentLocation} onInc={() => inc(index)} onDec={() => dec(index)} onRemove={() => removeItem(index)} />
            ))}
          </div>

          <div className="border-t border-gray-200 p-3 dark:border-gray-700">
            <CartSummary items={cart} location={currentLocation} />
            {cart.length > 0 && (
              <button
                onClick={() => activeSession && currentStaff && setShowCheckout(true)}
                disabled={!activeSession || !currentStaff}
                className={`mt-3 w-full rounded-xl py-4 text-lg font-bold text-white shadow-lg transition active:scale-95 ${activeSession && currentStaff ? 'bg-green-600 hover:bg-green-700' : 'cursor-not-allowed bg-gray-400 dark:bg-gray-600'}`}
              >
                {activeSession && currentStaff ? 'Bezahlen / Kassiervorgang abschließen' : 'Mitarbeiter anmelden'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Dialogs */}
      {showOpenDialog && (
        <CashOpeningDialog onSave={(loc, bal) => { onOpenCash(loc, bal); setShowOpenDialog(false); }} onClose={() => setShowOpenDialog(false)} onEnterAdmin={onEnterAdmin} defaultLocation={currentLocation} staffUsers={staffUsers} currentStaff={currentStaff} online={online} lastStaffId={lastStaffId} onStaffAuthenticated={onStaffAuthenticated} onSetInitialCredentials={onSetInitialCredentials} onConfigureSecurity={onConfigureStaffSecurity} onResetStaffPassword={onResetStaffPassword} openingBalanceSuggestions={openingBalanceSuggestions} />
      )}
      {!currentStaff && staffUsers.length > 0 && activeSession && (
        <StaffLoginDialog
          users={staffUsers}
          allowedRoles={['employee', 'administrator']}
          online={online}
          title={activeSession ? 'Mitarbeiter anmelden' : 'Mitarbeiter für die Kasseneröffnung'}
          onAuthenticated={onStaffAuthenticated}
          onSetInitialCredentials={onSetInitialCredentials}
          onConfigureSecurity={onConfigureStaffSecurity}
          onResetPassword={onResetStaffPassword}
          initialStaffId={lastStaffId}
        />
      )}
      {showCorrection && activeSession && (
        <CashCorrectionDialog session={activeSession} onSave={(amt, reason) => { onCorrectOpening(amt, reason); setShowCorrection(false); }} onClose={() => setShowCorrection(false)} />
      )}
      {cashEntryType && activeSession && (
        <CashEntryDialog session={activeSession} type={cashEntryType} onSave={(amt, reason) => { onCashEntry(cashEntryType, amt, reason); setCashEntryType(null); }} onClose={() => setCashEntryType(null)} />
      )}
      {showPfandRetoure && activeSession && (
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
        <DailyCloseDialog session={activeSession} transactions={transactions} currentStaff={currentStaff} onClose={async (bal, closingWithdrawalAmount) => {
          const result = await onCloseCash(bal, closingWithdrawalAmount);
          if (result.ok) setShowCloseDialog(false);
          return result;
        }} onCancel={() => setShowCloseDialog(false)} />
      )}
      {shotProduct && (
        <ShotSelectionDialog product={shotProduct} onSelect={handleShotSelect} onCancel={() => setShotProduct(null)} />
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
