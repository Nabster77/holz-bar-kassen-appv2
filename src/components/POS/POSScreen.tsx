import { useEffect, useMemo, useState } from 'react';
import type { CartItem, Category, CashSession, Product, Transaction, ShotOption, Location, PfandSettings } from '@/types';
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
import { DynamicIcon } from '@/components/DynamicIcon';
import { formatDateLong } from '@/lib/format';
import { SHOT_OPTIONS } from '@/lib/seed';
import {
  ShoppingCart, Trash2, Search, Lock, MapPin, Move, Euro, LogIn, LogOut, UserRound,
} from 'lucide-react';

type HeaderAction = 'deposit' | 'withdrawal' | 'pfand' | null;

interface Props {
  categories: Category[];
  products: Product[];
  activeSession: CashSession | null;
  onCheckout: (tx: Transaction) => void;
  onOpenCash: (location: Location, openingBalance: number, employeeCode: string) => void;
  onCorrectOpening: (newAmount: number, reason: string, employeeCode: string) => void;
  onCashEntry: (type: 'deposit' | 'withdrawal', amount: number, reason: string, employeeCode: string, isPfandRetoure?: boolean) => void;
  onCloseCash: (closingBalance: number, employeeCode?: string) => void;
  onEmployeeLogout: () => void;
  onEmployeeLogin: (employeeCode: string) => void;
  transactions: Transaction[];
  onEnterAdmin?: () => void;
  onMoveProduct?: (sourceId: string, targetId: string) => void;
  headerAction?: HeaderAction;
  onHeaderActionConsumed?: () => void;
  selectedLocation?: Location;
  pfandSettings: PfandSettings;
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
  onOpenCash, onCorrectOpening, onCashEntry, onCloseCash, onEmployeeLogout, onEmployeeLogin, transactions, onEnterAdmin, onMoveProduct,
  headerAction, onHeaderActionConsumed, selectedLocation, pfandSettings,
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
  const [showEmployeeLogin, setShowEmployeeLogin] = useState(false);
  const [priceEntryProduct, setPriceEntryProduct] = useState<Product | null>(null);
  const [dragMode, setDragMode] = useState(false);
  const [dragSource, setDragSource] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  // Undefined is legacy data: its opening employee remains active. null means
  // explicitly logged out, so the open till is locked until another login.
  const currentEmployeeCode = activeSession?.activeEmployeeCode === undefined
    ? activeSession?.employeeCode
    : activeSession?.activeEmployeeCode;
  const employeeIsLoggedIn = Boolean(currentEmployeeCode);

  useEffect(() => {
    // When the session reaches this device asynchronously through cloud sync,
    // replace the opening dialog with the resumed cash register immediately.
    setShowOpenDialog(!activeSession);
  }, [activeSession]);

  useEffect(() => {
    if (!headerAction || !activeSession || !employeeIsLoggedIn) return;
    if (headerAction === 'deposit' || headerAction === 'withdrawal') {
      setCashEntryType(headerAction);
    } else if (headerAction === 'pfand') {
      setShowPfandRetoure(true);
    }
    onHeaderActionConsumed?.();
  }, [headerAction, activeSession, employeeIsLoggedIn, onHeaderActionConsumed]);

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
    if (!currentEmployeeCode) return;
    onCheckout({ ...tx, employeeCode: currentEmployeeCode });
    setCart([]);
  }

  return (
    <div className="flex h-full flex-col gap-2">
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
            <div className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold uppercase ${employeeIsLoggedIn ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
              <UserRound className="h-3.5 w-3.5" /> {employeeIsLoggedIn ? currentEmployeeCode : 'Kein Mitarbeiter angemeldet'}
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <button onClick={() => {
                if (employeeIsLoggedIn) {
                  // An uncompleted cart must never silently pass to the next employee.
                  setCart([]);
                  setShowCheckout(false);
                  onEmployeeLogout();
                } else {
                  setShowEmployeeLogin(true);
                }
              }}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${employeeIsLoggedIn ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                {employeeIsLoggedIn ? <><LogOut className="h-3.5 w-3.5" /> Mitarbeiter abmelden</> : <><LogIn className="h-3.5 w-3.5" /> Mitarbeiter anmelden</>}
              </button>
              {employeeIsLoggedIn && <button onClick={() => setShowCorrection(true)}
                className="flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50">
                Korrektur
              </button>}
              <button onClick={() => setShowCloseDialog(true)}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700">
                <Lock className="h-3.5 w-3.5" /> Tagesabschluss
              </button>
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

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto lg:flex-row lg:overflow-hidden">
        {/* Left: products area */}
        <div className="flex flex-1 flex-col lg:overflow-hidden">
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
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
          </div>

          {/* Product grid */}
          <div className="relative lg:flex-1 lg:overflow-y-auto">
            {visibleProducts.length === 0 ? (
              <div className="flex h-full items-center justify-center text-gray-400 dark:text-gray-500">
                <p className="text-sm">Keine Artikel gefunden</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
                {visibleProducts.map((product) => (
                  <ProductTile
                    key={product.id}
                    product={product}
                    location={currentLocation}
                    onAdd={handleProductTap}
                    disabled={!activeSession || !employeeIsLoggedIn}
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
            {(!activeSession || !employeeIsLoggedIn) && visibleProducts.length > 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-8">
                <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-black/80 px-4 py-2.5 text-sm font-semibold text-white shadow-lg backdrop-blur">
                  <Lock className="h-4 w-4" />
                  {activeSession ? 'Bitte Mitarbeiter anmelden, um Artikel zu verkaufen' : 'Bitte zuerst Kasse eröffnen, um Artikel zu verkaufen'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: cart */}
        <div className="flex w-full shrink-0 flex-col rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 lg:w-96">
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

          <div className="px-3 lg:flex-1 lg:overflow-y-auto">
            {cart.map((item, index) => (
              <CartItemRow key={index} item={item} location={currentLocation} onInc={() => inc(index)} onDec={() => dec(index)} onRemove={() => removeItem(index)} />
            ))}
          </div>

          <div className="border-t border-gray-200 p-3 dark:border-gray-700">
            <CartSummary items={cart} location={currentLocation} />
            {cart.length > 0 && (
              <button
                onClick={() => activeSession && employeeIsLoggedIn && setShowCheckout(true)}
                disabled={!activeSession || !employeeIsLoggedIn}
                className={`mt-3 w-full rounded-xl py-4 text-lg font-bold text-white shadow-lg transition active:scale-95 ${activeSession && employeeIsLoggedIn ? 'bg-green-600 hover:bg-green-700' : 'cursor-not-allowed bg-gray-400 dark:bg-gray-600'}`}
              >
                {activeSession ? employeeIsLoggedIn ? 'Bezahlen / Kassiervorgang abschließen' : 'Mitarbeiter anmelden' : 'Kasse erst eröffnen'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Dialogs */}
      {showOpenDialog && (
        <CashOpeningDialog onSave={(loc, bal, code) => { onOpenCash(loc, bal, code); setShowOpenDialog(false); }} onClose={() => setShowOpenDialog(false)} onEnterAdmin={onEnterAdmin} defaultLocation={currentLocation} />
      )}
      {showEmployeeLogin && activeSession && !employeeIsLoggedIn && (
        <EmployeeLoginDialog onConfirm={(code) => { onEmployeeLogin(code); setShowEmployeeLogin(false); }} onCancel={() => setShowEmployeeLogin(false)} />
      )}
      {showCorrection && activeSession && (
        <CashCorrectionDialog session={activeSession} onSave={(amt, reason, code) => { onCorrectOpening(amt, reason, code); setShowCorrection(false); }} onClose={() => setShowCorrection(false)} />
      )}
      {cashEntryType && activeSession && (
        <CashEntryDialog session={activeSession} type={cashEntryType} onSave={(amt, reason, code) => { onCashEntry(cashEntryType, amt, reason, code); setCashEntryType(null); }} onClose={() => setCashEntryType(null)} />
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
        <DailyCloseDialog session={activeSession} transactions={transactions} onClose={(bal, code) => { if (bal !== undefined) { onCloseCash(bal, code); setShowCloseDialog(false); } }} onCancel={() => setShowCloseDialog(false)} />
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

function EmployeeLoginDialog({ onConfirm, onCancel }: { onConfirm: (code: string) => void; onCancel: () => void }) {
  const [code, setCode] = useState('');
  const confirm = () => {
    const normalized = code.trim().toUpperCase();
    if (normalized) onConfirm(normalized);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2 text-gray-900 dark:text-gray-100"><LogIn className="h-5 w-5 text-green-600" /><h3 className="text-lg font-bold">Mitarbeiter anmelden</h3></div>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">Die Kasse bleibt offen. Bitte das eigene Kürzel eingeben, bevor neue Buchungen erfolgen.</p>
        <input autoFocus value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && confirm()} placeholder="z.B. AB" maxLength={8} autoCapitalize="characters"
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-lg font-bold uppercase text-gray-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/30 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100" />
        <div className="mt-4 flex gap-2"><button onClick={onCancel} className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-200">Abbrechen</button><button onClick={confirm} disabled={!code.trim()} className="flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-bold text-white disabled:opacity-50">Anmelden</button></div>
      </div>
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
