import { useRef, useState, useMemo } from 'react';
import type { Category, Product, TaxClass, Location, Transaction, CashSession, PfandSettings } from '@/types';
import { formatCurrency, formatDateISO, formatTime } from '@/lib/format';
import { taxRateForClass, mergeTaxByRate, sortedRateKeys, isReducedRate } from '@/lib/tax';
import { buildDailyReport } from '@/lib/dailyReport';
import { exportJournalPdf, openJournalPrintDialog } from '@/lib/journalPdfFile';
import { DynamicIcon, availableIconNames } from '@/components/DynamicIcon';
import { importFileToDataURL, isSupported, ACCEPTED_TYPES } from '@/lib/imageImport';
import { uploadArticleImage } from '@/lib/imageUpload';
import { publicAssetUrl } from '@/lib/publicAssetUrl';
import { Plus, Edit3, Trash2, X, Save, Tag, Package, Upload, Loader2, RotateCcw, ChevronUp, ChevronDown, Wine, Recycle, MonitorDot, FileDown, Printer, MapPin, TrendingUp, Euro, Receipt as ReceiptIcon, Clock, ArrowRightLeft, Check, Info, Calendar, ChevronLeft, ChevronRight, FlaskConical, CheckCircle2, Download, FileUp, ShieldCheck } from 'lucide-react';
import { SHOT_OPTIONS } from '@/lib/seed';

interface Props {
  categories: Category[];
  products: Product[];
  transactions: Transaction[];
  cashSessions: CashSession[];
  activeSession: CashSession | null;
  selectedLocation: Location;
  onSwitchLocation: (loc: Location) => void;
  onAddCategory: (data: Omit<Category, 'id'>) => void;
  onUpdateCategory: (id: string, data: Partial<Omit<Category, 'id'>>) => void;
  onDeleteCategory: (id: string) => void;
  onReorderCategory?: (id: string, direction: 'up' | 'down') => void;
  onAddProduct: (data: Omit<Product, 'id'>) => void;
  onUpdateProduct: (id: string, data: Partial<Omit<Product, 'id'>>) => void;
  onDeleteProduct: (id: string) => void;
  onReorderProduct?: (id: string, direction: 'up' | 'down') => void;
  onResetAllData?: () => Promise<void>;
  testMode?: boolean;
  onToggleMode?: () => void;
  onExportBackup?: () => void;
  onImportBackup?: (file: File) => void;
  pfandSettings: PfandSettings;
  onUpdatePfandSettings: (settings: PfandSettings) => void;
  getProductPfand: (product: Product, loc: Location) => number;
}

const COLOR_OPTIONS = [
  { label: 'Blau', value: 'from-cyan-500 to-blue-600' },
  { label: 'Orange', value: 'from-amber-500 to-orange-600' },
  { label: 'Grün', value: 'from-emerald-500 to-green-600' },
  { label: 'Rot', value: 'from-rose-500 to-red-600' },
  { label: 'Lila', value: 'from-violet-500 to-purple-600' },
  { label: 'Pink', value: 'from-pink-500 to-rose-600' },
  { label: 'Teal', value: 'from-teal-500 to-cyan-600' },
  { label: 'Indigo', value: 'from-indigo-500 to-blue-700' },
];

const LOCATIONS: Location[] = ['Friedrichshafen', 'Bregenz'];

export function AdminScreen({ onResetAllData, testMode = false, onToggleMode, onExportBackup, onImportBackup, ...props }: Props) {
  const [tab, setTab] = useState<'sessions' | 'categories' | 'products'>('sessions');
  const [showReset, setShowReset] = useState(false);
  const [showImport, setShowImport] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <button
            onClick={() => setTab('sessions')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              tab === 'sessions' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 shadow-sm dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            <MonitorDot className="h-4 w-4" /> Kassen-Übersicht
          </button>
          <button
            onClick={() => setTab('categories')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              tab === 'categories' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 shadow-sm dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            <Tag className="h-4 w-4" /> Warengruppen
          </button>
          <button
            onClick={() => setTab('products')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              tab === 'products' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 shadow-sm dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            <Package className="h-4 w-4" /> Artikel
          </button>
        </div>
        <div className="flex items-center gap-2">
          {onToggleMode && (
            <button
              onClick={onToggleMode}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
                testMode
                  ? 'border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-700 dark:bg-green-900/20 dark:text-green-300 dark:hover:bg-green-900/40'
                  : 'border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/40'
              }`}
            >
              {testMode ? <CheckCircle2 className="h-3.5 w-3.5" /> : <FlaskConical className="h-3.5 w-3.5" />}
              {testMode ? 'Auf aktiven Modus wechseln' : 'Auf Testmodus wechseln'}
            </button>
          )}
          {onImportBackup && (
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/40"
            >
              <FileUp className="h-3.5 w-3.5" /> Backup importieren
            </button>
          )}
          <button
            onClick={() => setShowReset(true)}
            className="flex items-center gap-1.5 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Buchungen zurücksetzen
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'sessions' ? <LiveSessionOverview transactions={props.transactions} cashSessions={props.cashSessions} categories={props.categories} activeSession={props.activeSession} selectedLocation={props.selectedLocation} onSwitchLocation={props.onSwitchLocation} />
          : tab === 'categories' ? <CategoryManager {...props} /> : <ProductManager {...props} />}
      </div>
      {showReset && (
        <ResetConfirmDialog
          onExport={onExportBackup ? () => { onExportBackup(); } : undefined}
          onCancel={() => setShowReset(false)}
          onConfirm={async () => { await onResetAllData?.(); setShowReset(false); }}
        />
      )}
      {showImport && onImportBackup && (
        <ImportDialog
          onImport={(file) => { onImportBackup(file); setShowImport(false); }}
          onCancel={() => setShowImport(false)}
        />
      )}
    </div>
  );
}

// ---- Confirm Dialog ----

function ConfirmDialog({ title, message, onConfirm, onClose }: {
  title: string;
  message: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-900/30">
            <Trash2 className="h-7 w-7 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{title}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600">
            Abbrechen
          </button>
          <button onClick={onConfirm}
            className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white shadow-md transition hover:bg-red-700 active:scale-95">
            <Trash2 className="mr-1.5 inline h-4 w-4" /> Löschen
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Category Manager ----

function CategoryManager({ categories, products, onAddCategory, onUpdateCategory, onDeleteCategory, onReorderCategory }: Props) {
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteCat, setDeleteCat] = useState<Category | null>(null);
  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Warengruppen verwalten</h3>
        <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 active:scale-95">
          <Plus className="h-4 w-4" /> Neue Gruppe
        </button>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((cat, idx) => (
          <div key={cat.id} className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => onReorderCategory?.(cat.id, 'up')}
                disabled={idx === 0}
                className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-700"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                onClick={() => onReorderCategory?.(cat.id, 'down')}
                disabled={idx === sorted.length - 1}
                className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-700"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${cat.color} text-white`}>
              <DynamicIcon name={cat.icon} className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900 dark:text-gray-100">{cat.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {products.filter((p) => p.categoryId === cat.id).length} Artikel
              </p>
            </div>
            <div className="flex gap-1">
              <button onClick={() => setEditing(cat)} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                <Edit3 className="h-4 w-4" />
              </button>
              <button onClick={() => setDeleteCat(cat)} className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {(creating || editing) && (
        <CategoryModal
          category={editing}
          categories={categories}
          onSave={(data) => {
            if (editing) onUpdateCategory(editing.id, data);
            else onAddCategory({ ...data, sortOrder: categories.length });
            setCreating(false);
            setEditing(null);
          }}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
      )}
      {deleteCat && (
        <ConfirmDialog
          title={`Gruppe "${deleteCat.name}" löschen?`}
          message="Alle Artikel dieser Gruppe werden ebenfalls gelöscht. Diese Aktion kann nicht rückgängig gemacht werden."
          onConfirm={() => { onDeleteCategory(deleteCat.id); setDeleteCat(null); }}
          onClose={() => setDeleteCat(null)}
        />
      )}
    </div>
  );
}

function CategoryModal({ category, categories, onSave, onClose }: {
  category: Category | null;
  categories: Category[];
  onSave: (data: { name: string; icon: string; color: string }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [icon, setIcon] = useState(category?.icon ?? 'Package');
  const [color, setColor] = useState(category?.color ?? COLOR_OPTIONS[0].value);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{category ? 'Gruppe bearbeiten' : 'Neue Gruppe'}</h3>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Getränke"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Icon</label>
            <div className="grid max-h-32 grid-cols-8 gap-1.5 overflow-y-auto rounded-xl border border-gray-200 p-2 dark:border-gray-700">
              {availableIconNames.map((name) => (
                <button key={name} onClick={() => setIcon(name)}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${icon === name ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                  <DynamicIcon name={name} className="h-5 w-5" />
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Farbe</label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((c) => (
                <button key={c.value} onClick={() => setColor(c.value)}
                  className={`h-10 w-10 rounded-xl bg-gradient-to-br ${c.value} transition ${color === c.value ? 'ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-gray-800' : ''}`} />
              ))}
            </div>
          </div>
          <button onClick={() => name.trim() && onSave({ name: name.trim(), icon, color })}
            disabled={!name.trim()}
            className="w-full rounded-xl bg-blue-600 py-3 text-base font-semibold text-white shadow-md transition hover:bg-blue-700 active:scale-95 disabled:opacity-50">
            <Save className="mr-1.5 inline h-4 w-4" /> Speichern
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Product Manager ----

function ProductManager({ categories, products, onAddProduct, onUpdateProduct, onDeleteProduct, onReorderProduct, pfandSettings, onUpdatePfandSettings, getProductPfand }: Props) {
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);
  const [filterCat, setFilterCat] = useState<string>('');
  const [pfandF, setPfandF] = useState(String(pfandSettings.Friedrichshafen));
  const [pfandB, setPfandB] = useState(String(pfandSettings.Bregenz));
  const [showPfandSaved, setShowPfandSaved] = useState(false);

  const sorted = [...products].sort((a, b) => a.sortOrder - b.sortOrder);
  const filtered = filterCat ? sorted.filter((p) => p.categoryId === filterCat) : sorted;

  function savePfandSettings() {
    const f = parseFloat(pfandF.replace(',', '.')) || 0;
    const b = parseFloat(pfandB.replace(',', '.')) || 0;
    onUpdatePfandSettings({ Friedrichshafen: f, Bregenz: b });
    setShowPfandSaved(true);
    setTimeout(() => setShowPfandSaved(false), 2000);
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Artikel verwalten</h3>
        <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 active:scale-95">
          <Plus className="h-4 w-4" /> Neuer Artikel
        </button>
      </div>

      {/* Global pfand settings */}
      <div className="mb-4 rounded-2xl border border-teal-200 bg-teal-50 p-4 dark:border-teal-700 dark:bg-teal-900/20">
        <div className="mb-2 flex items-center gap-2">
          <Recycle className="h-5 w-5 text-teal-600 dark:text-teal-400" />
          <p className="text-sm font-bold text-teal-800 dark:text-teal-300">Globaler Pfandbetrag</p>
        </div>
        <p className="mb-3 text-xs text-teal-700/80 dark:text-teal-400/70">Diese Beträge gelten für alle als Pfandartikel markierten Artikel. Pro Standort individuell einstellbar.</p>
        <div className="flex flex-wrap items-end gap-4">
          {LOCATIONS.map((loc) => {
            const val = loc === 'Friedrichshafen' ? pfandF : pfandB;
            const setVal = loc === 'Friedrichshafen' ? setPfandF : setPfandB;
            return (
              <div key={loc}>
                <label className="mb-1 block text-xs font-semibold text-teal-700 dark:text-teal-400">{loc}</label>
                <div className="flex items-center gap-1">
                  <input value={val} onChange={(e) => setVal(e.target.value)} onBlur={savePfandSettings} placeholder="0,00" inputMode="decimal"
                    className="w-24 rounded-lg border border-teal-300 bg-white px-2.5 py-2 text-sm text-gray-900 focus:border-teal-500 focus:outline-none dark:border-teal-700 dark:bg-gray-900 dark:text-gray-100" />
                  <span className="text-sm text-teal-600 dark:text-teal-400">€</span>
                </div>
              </div>
            );
          })}
          <button onClick={savePfandSettings} className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-700 active:scale-95">
            <Save className="h-4 w-4" /> Speichern
          </button>
          {showPfandSaved && <span className="flex items-center gap-1 text-xs font-semibold text-green-600 dark:text-green-400"><Check className="h-3.5 w-3.5" /> Gespeichert</span>}
        </div>
      </div>
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        <button onClick={() => setFilterCat('')} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition ${!filterCat ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}>Alle</button>
        {[...categories].sort((a, b) => a.sortOrder - b.sortOrder).map((cat) => (
          <button key={cat.id} onClick={() => setFilterCat(cat.id)} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition ${filterCat === cat.id ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}>{cat.name}</button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((product, idx) => {
          const cat = categories.find((c) => c.id === product.categoryId);
          return (
            <div key={product.id} className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => onReorderProduct?.(product.id, 'up')}
                  disabled={idx === 0}
                  className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-700"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onReorderProduct?.(product.id, 'down')}
                  disabled={idx === filtered.length - 1}
                  className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-700"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-700">
                {product.imageUrl ? <img src={publicAssetUrl(product.imageUrl)} alt={product.name} className="h-full w-full object-cover" /> : <Package className="h-6 w-6 text-gray-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate font-semibold text-gray-900 dark:text-gray-100">
                  {product.name}
                  {product.hasShot && <Wine className="ml-1 inline h-3.5 w-3.5 text-blue-500" />}
                  {product.isPfandArticle && <Recycle className="ml-1 inline h-3.5 w-3.5 text-teal-500" />}
                  {product.hasIndividualPrice && <Euro className="ml-1 inline h-3.5 w-3.5 text-amber-500" />}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {product.hasIndividualPrice ? 'Individueller Preis' : <>F: {formatCurrency(product.prices.Friedrichshafen)} · B: {formatCurrency(product.prices.Bregenz)}</>}
                  {' · '}{cat?.name ?? '—'}
                </p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setEditing(product)} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                  <Edit3 className="h-4 w-4" />
                </button>
                <button onClick={() => setDeleteProduct(product)} className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {(creating || editing) && (
        <ProductModal
          product={editing}
          categories={categories}
          pfandSettings={pfandSettings}
          onSave={(data) => {
            if (editing) onUpdateProduct(editing.id, data);
            else onAddProduct({ ...data, sortOrder: products.length });
            setCreating(false);
            setEditing(null);
          }}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
      )}
      {deleteProduct && (
        <ConfirmDialog
          title={`Artikel "${deleteProduct.name}" löschen?`}
          message="Dieser Artikel wird dauerhaft entfernt. Diese Aktion kann nicht rückgängig gemacht werden."
          onConfirm={() => { onDeleteProduct(deleteProduct.id); setDeleteProduct(null); }}
          onClose={() => setDeleteProduct(null)}
        />
      )}
    </div>
  );
}

function ProductModal({ product, categories, pfandSettings, onSave, onClose }: {
  product: Product | null;
  categories: Category[];
  pfandSettings: PfandSettings;
  onSave: (data: Omit<Product, 'id'>) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(product?.name ?? '');
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? categories[0]?.id ?? '');
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? '');
  const [taxClass, setTaxClass] = useState<TaxClass>(product?.taxClass ?? 'standard');
  const [available, setAvailable] = useState(product?.available ?? true);
  const [hasShot, setHasShot] = useState(product?.hasShot ?? false);
  const [isPfandArticle, setIsPfandArticle] = useState(product?.isPfandArticle ?? false);
  const [hasIndividualPrice, setHasIndividualPrice] = useState(product?.hasIndividualPrice ?? false);
  const [shotPrices, setShotPrices] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {};
    for (const s of SHOT_OPTIONS) {
      if (s.id === 'none') continue;
      defaults[s.id] = String(product?.shotPrices?.[s.id] ?? s.price);
    }
    return defaults;
  });
  const [priceF, setPriceF] = useState(String(product?.prices.Friedrichshafen ?? ''));
  const [priceB, setPriceB] = useState(String(product?.prices.Bregenz ?? ''));
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isSupported(file)) {
      setUploadError('Format nicht unterstützt. Bitte JPG, PNG, BMP oder PDF.');
      return;
    }
    setUploading(true);
    setUploadError('');
    try {
      const publicUrl = await uploadArticleImage(file);
      if (publicUrl) {
        setImageUrl(publicUrl);
      } else {
        const dataURL = await importFileToDataURL(file);
        setImageUrl(dataURL);
        setUploadError('Bild lokal gespeichert — Supabase nicht erreichbar. Auf anderen Geräten evtl. nicht sichtbar.');
      }
    } catch {
      setUploadError('Bild konnte nicht verarbeitet werden.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function handleSave() {
    const pF = parseFloat(priceF.replace(',', '.')) || 0;
    const pB = parseFloat(priceB.replace(',', '.')) || 0;
    if (!name.trim() || !categoryId) return;
    const sp: Record<string, number> = {};
    for (const s of SHOT_OPTIONS) {
      if (s.id === 'none') continue;
      sp[s.id] = parseFloat(shotPrices[s.id]?.replace(',', '.')) || 0;
    }
    const pfandF = isPfandArticle ? pfandSettings.Friedrichshafen : 0;
    const pfandB = isPfandArticle ? pfandSettings.Bregenz : 0;
    onSave({
      name: name.trim(), categoryId, imageUrl: imageUrl.trim(), taxClass, available, hasShot,
      isPfandArticle, hasIndividualPrice,
      shotPrices: hasShot ? sp : undefined,
      prices: { Friedrichshafen: pF, Bregenz: pB },
      pfand: { Friedrichshafen: pfandF, Bregenz: pfandB },
      sortOrder: product?.sortOrder ?? 0,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{product ? 'Artikel bearbeiten' : 'Neuer Artikel'}</h3>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3.5">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Cola 0,5l"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">MwSt-Satz</label>
              <div className="flex gap-1.5">
                {(['reduced', 'standard'] as TaxClass[]).map((cls) => (
                  <button key={cls} onClick={() => setTaxClass(cls)}
                    className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition ${taxClass === cls ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                    {cls === 'reduced' ? 'Reduziert' : 'Standard'}
                    <span className="ml-1 text-[10px] font-normal opacity-80">
                      (DE:{cls === 'reduced' ? '7' : '19'}% / AT:{cls === 'reduced' ? '10' : '20'}%)
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Warengruppe</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
                {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
              </select>
            </div>
          </div>

          {/* Location-based prices */}
          <div className={`rounded-xl p-3 dark:bg-gray-900/40 ${hasIndividualPrice ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-gray-50'}`}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Preise nach Standort</p>
            {hasIndividualPrice ? (
              <p className="text-sm text-amber-700 dark:text-amber-400">Der Preis wird an der Kasse individuell eingegeben — z.B. für Holzbretter oder nach Gewicht.</p>
            ) : (
              LOCATIONS.map((loc) => {
                const priceVal = loc === 'Friedrichshafen' ? priceF : priceB;
                const setPrice = loc === 'Friedrichshafen' ? setPriceF : setPriceB;
                return (
                  <div key={loc} className="mb-2 flex items-center gap-2">
                    <span className="w-28 text-xs font-semibold text-gray-600 dark:text-gray-300">{loc}</span>
                    <input value={priceVal} onChange={(e) => setPrice(e.target.value)} placeholder="Preis" inputMode="decimal"
                      className="w-24 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100" />
                    <span className="text-xs text-gray-400">€</span>
                  </div>
                );
              })
            )}
          </div>

          {/* Pfand & Individual price toggles */}
          <div className="space-y-2.5">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <Recycle className="h-4 w-4 text-teal-500" />
              <input type="checkbox" checked={isPfandArticle} onChange={(e) => setIsPfandArticle(e.target.checked)} className="h-4 w-4 rounded accent-teal-600" />
              Pfandartikel
              {isPfandArticle && <span className="text-xs text-teal-600 dark:text-teal-400">(F: {formatCurrency(pfandSettings.Friedrichshafen)} · B: {formatCurrency(pfandSettings.Bregenz)})</span>}
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <Euro className="h-4 w-4 text-amber-500" />
              <input type="checkbox" checked={hasIndividualPrice} onChange={(e) => setHasIndividualPrice(e.target.checked)} className="h-4 w-4 rounded accent-amber-600" />
              Individueller Preis an der Kasse
            </label>
          </div>

          {/* Shot toggle */}
          <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <Wine className="h-4 w-4 text-blue-500" />
              <input type="checkbox" checked={hasShot} onChange={(e) => setHasShot(e.target.checked)} className="h-4 w-4 rounded accent-blue-600" />
              Schuss-Auswahl beim Antippen anzeigen
            </label>
            {hasShot && (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Schuss-Preise (€)</p>
                {SHOT_OPTIONS.filter((s) => s.id !== 'none').map((s) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <span className="w-32 text-xs font-medium text-gray-600 dark:text-gray-300">{s.name}</span>
                    <input
                      value={shotPrices[s.id] ?? ''}
                      onChange={(e) => setShotPrices((prev) => ({ ...prev, [s.id]: e.target.value }))}
                      placeholder="0,00"
                      inputMode="decimal"
                      className="w-24 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Image */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Bild</label>
            <div className="flex items-center gap-3">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-700">
                {imageUrl ? <img src={publicAssetUrl(imageUrl)} alt="Vorschau" className="h-full w-full object-cover" /> : <Package className="h-7 w-7 text-gray-400" />}
              </div>
              <div className="flex-1 space-y-1.5">
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-3 py-2.5 text-sm font-medium text-gray-600 transition hover:border-blue-500 hover:text-blue-600 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-blue-400 dark:hover:text-blue-400">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploading ? 'Wird verarbeitet...' : 'Bild importieren (JPG, PNG, BMP, PDF)'}
                </button>
                <input ref={fileRef} type="file" accept={ACCEPTED_TYPES} onChange={handleFileChange} className="hidden" />
                <div className="flex gap-1.5">
                  <input value={imageUrl.startsWith('data:') ? '' : imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="oder Bild-URL eingeben"
                    className="flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100" />
                  {imageUrl && (
                    <button type="button" onClick={() => setImageUrl('')} className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
            {uploadError && <p className="mt-1 text-xs text-red-500">{uploadError}</p>}
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} className="h-4 w-4 rounded accent-blue-600" />
            Verfügbar
          </label>
          <button onClick={handleSave}
            className="w-full rounded-xl bg-blue-600 py-3 text-base font-semibold text-white shadow-md transition hover:bg-blue-700 active:scale-95">
            <Save className="mr-1.5 inline h-4 w-4" /> Speichern
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Live Session Overview ----

function LiveSessionOverview({ transactions, cashSessions, categories, activeSession, selectedLocation, onSwitchLocation }: {
  transactions: Transaction[];
  cashSessions: CashSession[];
  categories: Category[];
  activeSession: CashSession | null;
  selectedLocation: Location;
  onSwitchLocation: (loc: Location) => void;
}) {
  const [selectedDate, setSelectedDate] = useState<string>(formatDateISO(Date.now()));
  const [infoLocation, setInfoLocation] = useState<Location | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isToday = selectedDate === formatDateISO(Date.now());

  function handleSwitch(loc: Location) {
    if (loc === selectedLocation) return;
    onSwitchLocation(loc);
    setToast(`Zu ${loc} gewechselt`);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }

  function shiftDate(days: number) {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + days);
    setSelectedDate(formatDateISO(d.getTime()));
  }

  const locationData = useMemo(() => {
    return LOCATIONS.map((loc) => {
      const session = cashSessions.find((s) => s.date === selectedDate && s.location === loc) ?? null;
      const txToday = transactions.filter((t) => formatDateISO(t.timestamp) === selectedDate && t.location === loc);
      const taxByRateMap = mergeTaxByRate(txToday);
      let total = 0, count = 0, totalNet = 0, totalPfand = 0;
      for (const t of txToday) {
        total += t.total;
        count++;
        totalNet += t.totalNet;
        totalPfand += t.totalPfand;
      }
      const totalTax = [...taxByRateMap.values()].reduce((s, v) => s + v, 0);
      const taxByRate: Record<number, number> = {};
      for (const [k, v] of taxByRateMap) taxByRate[k] = v;

      const cashBalance = session
        ? session.openingBalance +
          session.entries.reduce((s, e) => s + (e.type === 'deposit' ? e.amount : -e.amount), 0) +
          txToday.filter((t) => t.paymentMethod === 'cash').reduce((s, t) => s + t.total, 0)
        : 0;

      return { loc, session, txToday, taxByRateMap, total, count, totalNet, totalTax, totalPfand, taxByRate, cashBalance };
    });
  }, [transactions, cashSessions, selectedDate]);

  function reportForLocation(loc: Location, txToday: Transaction[]) {
    return buildDailyReport(loc, selectedDate, txToday, categories, cashSessions.filter((session) => session.location === loc && session.date === selectedDate));
  }

  function exportLocation(loc: Location, txToday: Transaction[]) {
    void exportJournalPdf(reportForLocation(loc, txToday));
  }

  function printLocation(loc: Location, txToday: Transaction[]) {
    openJournalPrintDialog(reportForLocation(loc, txToday));
  }

  const dateLabel = new Date(selectedDate + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Kassen-Übersicht</h3>
        </div>
        {/* Date picker bar */}
        <div className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-2 py-1.5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <button onClick={() => shiftDate(-1)} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Vorheriger Tag">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-1.5 px-1">
            <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <input
              type="date"
              value={selectedDate}
              max={formatDateISO(Date.now())}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              className="bg-transparent text-sm font-semibold text-gray-900 focus:outline-none dark:text-gray-100 [&::-webkit-calendar-picker-indicator]:cursor-pointer dark:[&::-webkit-calendar-picker-indicator]:invert"
            />
          </div>
          <button onClick={() => shiftDate(1)} disabled={isToday} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-700" aria-label="Nächster Tag">
            <ChevronRight className="h-4 w-4" />
          </button>
          {!isToday && (
            <button onClick={() => setSelectedDate(formatDateISO(Date.now()))} className="ml-1 rounded-lg bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/40">
              Heute
            </button>
          )}
        </div>
      </div>
      <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">{dateLabel}{isToday ? ' · Heute' : ''}</p>
      <div className="relative grid gap-4 lg:grid-cols-2">
        {locationData.map((data) => (
          <LocationSessionCard
            key={data.loc}
            loc={data.loc}
            session={data.session}
            total={data.total}
            count={data.count}
            totalNet={data.totalNet}
            totalTax={data.totalTax}
            totalPfand={data.totalPfand}
            cashBalance={data.cashBalance}
            taxByRateMap={data.taxByRateMap}
            txToday={data.txToday}
            isActive={isToday && activeSession?.location === data.loc}
            isSelected={selectedLocation === data.loc}
            isHistoric={!isToday}
            onExport={() => exportLocation(data.loc, data.txToday)}
            onPrint={() => printLocation(data.loc, data.txToday)}
            onSwitch={() => handleSwitch(data.loc)}
            onInfo={() => setInfoLocation(data.loc)}
          />
        ))}
        {toast && (
          <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center">
            <div className="flex items-center gap-2 rounded-full bg-green-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg">
              <Check className="h-4 w-4" /> {toast}
            </div>
          </div>
        )}
      </div>
      {infoLocation && (
        <DayInfoDialog
          location={infoLocation}
          date={selectedDate}
          categories={categories}
          transactions={locationData.find((d) => d.loc === infoLocation)?.txToday ?? []}
          session={locationData.find((d) => d.loc === infoLocation)?.session ?? null}
          onClose={() => setInfoLocation(null)}
        />
      )}
    </div>
  );
}

function LocationSessionCard({ loc, session, total, count, totalNet, totalTax, totalPfand, cashBalance, taxByRateMap, txToday, isActive, isSelected, isHistoric, onExport, onPrint, onSwitch, onInfo }: {
  loc: Location;
  session: CashSession | null;
  total: number;
  count: number;
  totalNet: number;
  totalTax: number;
  totalPfand: number;
  cashBalance: number;
  taxByRateMap: Map<number, number>;
  txToday: Transaction[];
  isActive: boolean;
  isSelected: boolean;
  isHistoric: boolean;
  onExport: () => void;
  onPrint: () => void;
  onSwitch: () => void;
  onInfo: () => void;
}) {
  const rateKeys = sortedRateKeys(taxByRateMap);
  const isClosed = !!session?.closed;
  const statusLabel = isClosed ? 'ABGESCHLOSSEN' : isHistoric ? (session ? 'OFFEN' : 'KEINE KASSE') : isActive ? 'AKTIV' : session ? 'OFFEN' : 'GESPERRT';
  const statusClass = isClosed
    ? 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
    : isHistoric
      ? session ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
      : isActive ? 'bg-green-600 text-white' : session ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400';

  return (
    <div className={`overflow-hidden rounded-2xl border-2 shadow-sm transition dark:shadow-lg ${isSelected ? 'border-green-500 dark:border-green-600 ring-2 ring-green-300/40 dark:ring-green-700/30' : isActive ? 'border-green-300 dark:border-green-700' : 'border-gray-200 dark:border-gray-700'} bg-white dark:bg-gray-800`}>
      {/* Header — clickable to select this location */}
      <button
        onClick={onSwitch}
        className={`flex w-full items-center justify-between px-4 py-3 text-left transition active:scale-[0.99] ${isSelected ? 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/10' : 'bg-gray-50 hover:bg-gray-100 dark:bg-gray-900/40 dark:hover:bg-gray-900/70'}`}
      >
        <div className="flex items-center gap-2">
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${isSelected || isActive ? 'bg-green-600' : 'bg-gray-400'} text-white`}>
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{loc}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {isClosed ? 'Abgeschlossen' : isHistoric ? (session ? 'Offen' : 'Keine Kasse') : session ? (isActive ? 'Aktive Kasse' : 'Geöffnet') : 'Nicht eröffnet'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isSelected && (
            <span className="flex items-center gap-1 rounded-full bg-green-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm">
              <Check className="h-3 w-3" /> AUSGEWÄHLT
            </span>
          )}
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass}`}>
            {statusLabel}
          </span>
        </div>
      </button>

      {/* Body */}
      <div className="p-4">
        {/* Cash balance + opening */}
        {session && (
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-gray-900/40">
              <p className="text-xs text-gray-400">Anfangsbestand</p>
              <p className="text-base font-bold text-gray-900 dark:text-gray-100">{formatCurrency(session.openingBalance)}</p>
            </div>
            <div className="rounded-xl bg-blue-50 px-3 py-2 dark:bg-blue-900/20">
              <p className="text-xs text-blue-400">Kassenbestand</p>
              <p className="text-base font-bold text-blue-700 dark:text-blue-300">{formatCurrency(cashBalance)}</p>
            </div>
          </div>
        )}

        {/* Sales stats */}
        <div className="mb-3 rounded-xl border border-gray-200 bg-gradient-to-br from-green-50 to-emerald-50 p-3 dark:border-green-800 dark:from-green-900/20 dark:to-emerald-900/10">
          <div className="mb-2 flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
            <p className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">Umsatz {isHistoric ? 'dieser Tag' : 'heute'}</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-xs text-green-700/70 dark:text-green-400/70">Brutto</p>
              <p className="text-sm font-bold text-green-700 dark:text-green-400">{formatCurrency(total)}</p>
            </div>
            <div>
              <p className="text-xs text-green-700/70 dark:text-green-400/70">Netto</p>
              <p className="text-sm font-bold text-green-700 dark:text-green-400">{formatCurrency(totalNet)}</p>
            </div>
            <div>
              <p className="text-xs text-green-700/70 dark:text-green-400/70">MwSt</p>
              <p className="text-sm font-bold text-green-700 dark:text-green-400">{formatCurrency(totalTax)}</p>
            </div>
          </div>
        </div>

        {/* Tax breakdown */}
        {rateKeys.length > 0 && (
          <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {rateKeys.map((rate) => (
              <div key={rate} className="rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900/40">
                <div className="flex items-center gap-1.5">
                  <ReceiptIcon className={`h-3.5 w-3.5 ${isReducedRate(rate) ? 'text-amber-500' : 'text-rose-500'}`} />
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">MwSt {rate}%</span>
                </div>
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatCurrency(taxByRateMap.get(rate) ?? 0)}</p>
              </div>
            ))}
          </div>
        )}

        {/* Pfand + count */}
        <div className="mb-3 flex items-center gap-4 text-sm">
          {totalPfand > 0 && (
            <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
              <Recycle className="h-4 w-4 text-teal-500" />
              Pfand: <span className="font-bold">{formatCurrency(totalPfand)}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
            <ReceiptIcon className="h-4 w-4" />
            Verkäufe: <span className="font-bold">{count}</span>
          </div>
        </div>

        {/* Recent transactions */}
        {txToday.length > 0 && (
          <div className="mb-3">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Letzte Verkäufe</p>
            <div className="max-h-32 overflow-y-auto rounded-xl border border-gray-100 dark:border-gray-700">
              {txToday.slice(0, 5).map((tx) => (
                <div key={tx.id} className="flex items-center justify-between border-b border-gray-50 px-3 py-1.5 text-xs last:border-0 dark:border-gray-700/50">
                  <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                    <Clock className="h-3 w-3" />
                    {formatTime(tx.timestamp)}
                    <span className="rounded px-1.5 py-0.5 font-medium text-gray-400 dark:text-gray-500">{tx.items.length} Art.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${tx.paymentMethod === 'cash' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                      {tx.paymentMethod === 'cash' ? 'BAR' : 'KARTE'}
                    </span>
                    <span className="font-bold text-gray-900 dark:text-gray-100">{formatCurrency(tx.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info + Export buttons */}
        <div className="mb-2 flex gap-2">
          <button
            onClick={onInfo}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 active:scale-95"
          >
            <Info className="h-4 w-4" /> Info
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onPrint}
            disabled={txToday.length === 0}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <FileDown className="h-3.5 w-3.5" /> PDF-Export
          </button>
          <button
            onClick={onExport}
            disabled={txToday.length === 0}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-40"
          >
            <Printer className="h-3.5 w-3.5" /> Drucken
          </button>
        </div>

        {txToday.length === 0 && !session && (
          <p className="mt-2 text-center text-xs text-gray-400">Keine Daten für diesen Tag</p>
        )}
      </div>
    </div>
  );
}

// ---- Day Info Dialog ----

function DayInfoDialog({ location, date, categories, transactions, session, onClose }: {
  location: Location;
  date: string;
  categories: Category[];
  transactions: Transaction[];
  session: CashSession | null;
  onClose: () => void;
}) {
  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const taxByRateMap = mergeTaxByRate(transactions);
  const rateKeys = sortedRateKeys(taxByRateMap);
  const total = transactions.reduce((s, t) => s + t.total, 0);
  const totalNet = transactions.reduce((s, t) => s + t.totalNet, 0);
  const totalTax = [...taxByRateMap.values()].reduce((s, v) => s + v, 0);
  const totalPfand = transactions.reduce((s, t) => s + t.totalPfand, 0);
  const cashCount = transactions.filter((t) => t.paymentMethod === 'cash').length;
  const cardCount = transactions.filter((t) => t.paymentMethod === 'card').length;
  const cashTotal = transactions.filter((t) => t.paymentMethod === 'cash').reduce((s, t) => s + t.total, 0);
  const cardTotal = transactions.filter((t) => t.paymentMethod === 'card').reduce((s, t) => s + t.total, 0);

  // Aggregate by product
  const productAgg = useMemo(() => {
    const map = new Map<string, { name: string; categoryId: string; qty: number; gross: number; net: number; tax: number; pfand: number; taxRate: number }>();
    for (const tx of transactions) {
      for (const item of tx.items) {
        const existing = map.get(item.productId) ?? { name: item.name, categoryId: item.categoryId, qty: 0, gross: 0, net: 0, tax: 0, pfand: 0, taxRate: item.taxRate };
        existing.qty += item.quantity;
        existing.gross += item.price * item.quantity;
        existing.net += item.netPrice * item.quantity;
        existing.tax += item.taxAmount * item.quantity;
        existing.pfand += item.pfand;
        map.set(item.productId, existing);
      }
    }
    return [...map.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.gross - a.gross);
  }, [transactions]);

  // Aggregate by category
  const categoryAgg = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; gross: number; net: number; tax: number; pfand: number }>();
    for (const p of productAgg) {
      const cat = categories.find((c) => c.id === p.categoryId);
      const name = cat?.name ?? 'Ohne Gruppe';
      const existing = map.get(p.categoryId) ?? { name, qty: 0, gross: 0, net: 0, tax: 0, pfand: 0 };
      existing.qty += p.qty;
      existing.gross += p.gross;
      existing.net += p.net;
      existing.tax += p.tax;
      existing.pfand += p.pfand;
      map.set(p.categoryId, existing);
    }
    return [...map.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.gross - a.gross);
  }, [productAgg, categories]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
              <Info className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{location} · Tagesinfo</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">{dateLabel}</p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {transactions.length === 0 && !session ? (
            <p className="py-8 text-center text-sm text-gray-400">Für diesen Tag liegen keine Daten vor.</p>
          ) : (
            <>
              {/* Summary tiles */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-xl bg-green-50 px-3 py-2.5 dark:bg-green-900/20">
                  <p className="text-xs text-green-700/70 dark:text-green-400/70">Brutto</p>
                  <p className="text-base font-bold text-green-700 dark:text-green-400">{formatCurrency(total)}</p>
                </div>
                <div className="rounded-xl bg-blue-50 px-3 py-2.5 dark:bg-blue-900/20">
                  <p className="text-xs text-blue-700/70 dark:text-blue-400/70">Netto</p>
                  <p className="text-base font-bold text-blue-700 dark:text-blue-300">{formatCurrency(totalNet)}</p>
                </div>
                <div className="rounded-xl bg-rose-50 px-3 py-2.5 dark:bg-rose-900/20">
                  <p className="text-xs text-rose-700/70 dark:text-rose-400/70">MwSt</p>
                  <p className="text-base font-bold text-rose-700 dark:text-rose-300">{formatCurrency(totalTax)}</p>
                </div>
                <div className="rounded-xl bg-teal-50 px-3 py-2.5 dark:bg-teal-900/20">
                  <p className="text-xs text-teal-700/70 dark:text-teal-400/70">Pfand</p>
                  <p className="text-base font-bold text-teal-700 dark:text-teal-300">{formatCurrency(totalPfand)}</p>
                </div>
              </div>

              {/* Payment breakdown */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2 dark:border-gray-700">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-gray-300"><Euro className="h-4 w-4 text-green-600" /> Bar</span>
                  <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{cashCount}× · {formatCurrency(cashTotal)}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2 dark:border-gray-700">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-gray-300"><ReceiptIcon className="h-4 w-4 text-blue-600" /> Karte</span>
                  <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{cardCount}× · {formatCurrency(cardTotal)}</span>
                </div>
              </div>

              {/* Tax breakdown */}
              {rateKeys.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">MwSt-Aufschlüsselung</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {rateKeys.map((rate) => (
                      <div key={rate} className="rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900/40">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">MwSt {rate}%</span>
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatCurrency(taxByRateMap.get(rate) ?? 0)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cash session info */}
              {session && (
                <div className="rounded-2xl border border-gray-200 p-3 dark:border-gray-700">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Kassensitzung</p>
                  <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    <div><p className="text-xs text-gray-400">Anfangsbestand</p><p className="font-bold text-gray-900 dark:text-gray-100">{formatCurrency(session.openingBalance)}</p></div>
                    <div><p className="text-xs text-gray-400">Einzahlungen</p><p className="font-bold text-gray-900 dark:text-gray-100">{formatCurrency(session.entries.filter((e) => e.type === 'deposit').reduce((s, e) => s + e.amount, 0))}</p></div>
                    <div><p className="text-xs text-gray-400">Entnahmen</p><p className="font-bold text-gray-900 dark:text-gray-100">{formatCurrency(session.entries.filter((e) => e.type === 'withdrawal').reduce((s, e) => s + e.amount, 0))}</p></div>
                    {session.closed ? (
                      <>
                        <div><p className="text-xs text-gray-400">Endbestand</p><p className="font-bold text-gray-900 dark:text-gray-100">{formatCurrency(session.closingBalance ?? 0)}</p></div>
                        <div><p className="text-xs text-gray-400">Erwartet</p><p className="font-bold text-gray-900 dark:text-gray-100">{formatCurrency(session.expectedBalance ?? 0)}</p></div>
                        <div className="col-span-2"><p className="text-xs text-gray-400">Differenz</p><p className={`font-bold ${(session.difference ?? 0) === 0 ? 'text-green-600' : (session.difference ?? 0) > 0 ? 'text-amber-600' : 'text-red-600'}`}>{formatCurrency(session.difference ?? 0)}</p></div>
                      </>
                    ) : (
                      <div><p className="text-xs text-gray-400">Bestand</p><p className="font-bold text-gray-900 dark:text-gray-100">{formatCurrency(session.openingBalance + session.entries.reduce((s, e) => s + (e.type === 'deposit' ? e.amount : -e.amount), 0) + transactions.filter((t) => t.paymentMethod === 'cash').reduce((s, t) => s + t.total, 0))}</p></div>
                    )}
                  </div>
                </div>
              )}

              {/* Category breakdown */}
              {categoryAgg.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Warengruppen</p>
                  <div className="overflow-hidden rounded-xl border border-gray-100 dark:border-gray-700">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-400 dark:bg-gray-900/40">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">Gruppe</th>
                          <th className="px-3 py-2 text-right font-semibold">Anzahl</th>
                          <th className="px-3 py-2 text-right font-semibold">Brutto</th>
                          <th className="px-3 py-2 text-right font-semibold">Netto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categoryAgg.map((c) => (
                          <tr key={c.id} className="border-t border-gray-50 dark:border-gray-700/50">
                            <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{c.name}</td>
                            <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">{c.qty}</td>
                            <td className="px-3 py-2 text-right font-bold text-gray-900 dark:text-gray-100">{formatCurrency(c.gross)}</td>
                            <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">{formatCurrency(c.net)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Product breakdown */}
              {productAgg.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Artikel-Detail</p>
                  <div className="max-h-64 overflow-y-auto overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-700">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-gray-400 dark:bg-gray-900/40">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">Artikel</th>
                          <th className="px-3 py-2 text-right font-semibold">Anz.</th>
                          <th className="px-3 py-2 text-right font-semibold">Brutto</th>
                          <th className="px-3 py-2 text-right font-semibold">MwSt</th>
                          <th className="px-3 py-2 text-right font-semibold">Pfand</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productAgg.map((p) => (
                          <tr key={p.id} className="border-t border-gray-50 dark:border-gray-700/50">
                            <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{p.name}</td>
                            <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">{p.qty}</td>
                            <td className="px-3 py-2 text-right font-bold text-gray-900 dark:text-gray-100">{formatCurrency(p.gross)}</td>
                            <td className="px-3 py-2 text-right text-gray-500 dark:text-gray-400">{formatCurrency(p.tax)}</td>
                            <td className="px-3 py-2 text-right text-teal-600 dark:text-teal-400">{formatCurrency(p.pfand)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Transactions list */}
              {transactions.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Alle Verkäufe ({transactions.length})</p>
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-100 dark:border-gray-700">
                    {[...transactions].sort((a, b) => a.timestamp - b.timestamp).map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between border-b border-gray-50 px-3 py-1.5 text-xs last:border-0 dark:border-gray-700/50">
                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                          <Clock className="h-3 w-3" />
                          {formatTime(tx.timestamp)}
                          <span className="rounded px-1.5 py-0.5 font-medium text-gray-400 dark:text-gray-500">{tx.items.length} Art.</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${tx.paymentMethod === 'cash' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                            {tx.paymentMethod === 'cash' ? 'BAR' : 'KARTE'}
                          </span>
                          <span className="font-bold text-gray-900 dark:text-gray-100">{formatCurrency(tx.total)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Reset / Backup / Import dialogs ----

function ResetConfirmDialog({ onExport, onCancel, onConfirm }: { onExport?: () => void; onCancel: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      const detail = (e as { message?: string })?.message ?? String(e);
      setError(`Der Reset konnte nicht in der Cloud durchgeführt werden. Es wurde nichts gelöscht. Bitte Internetverbindung prüfen und erneut versuchen. (Technische Meldung: ${detail})`);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
            <RotateCcw className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Tagesbuchungen zurücksetzen?</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Verkäufe und Kassensitzungen werden gelöscht</p>
          </div>
        </div>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
          Dadurch werden <strong>alle Transaktionen und Kassensitzungen</strong> (Anfangsbestände, Einlagen, Abschlüsse) entfernt. Ihre <strong>Artikel und Warengruppen bleiben erhalten</strong>.<br /><br />
          Die Löschung gilt auch in der Cloud. Alle verbundenen Geräte entfernen ihre alten Buchungen bei der nächsten Synchronisierung.<br /><br />
          <strong>Empfehlung:</strong> Sichern Sie die Daten zuerst als Backup-Datei, damit Sie sie später jederzeit wieder importieren und auswerten können — auch noch in kommenden Jahren.
        </p>
        {error && (
          <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-2">
          {onExport && (
            <button
              onClick={() => { onExport(); }}
              disabled={busy}
              className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 active:scale-95 disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> Zuerst als Backup sichern
            </button>
          )}
          <button
            onClick={confirm}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 active:scale-95 disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" /> {busy ? 'Wird gelöscht …' : 'Buchungen jetzt löschen'}
          </button>
          <button onClick={onCancel} disabled={busy} className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600">
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportDialog({ onImport, onCancel }: { onImport: (file: File) => void; onCancel: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
            <FileUp className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Backup importieren</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Frühere Daten wiederherstellen</p>
          </div>
        </div>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
          Wählen Sie eine zuvor gesicherte Backup-Datei (JSON). Die enthaltenen Transaktionen, Kassensitzungen, Warengruppen und Artikel werden <strong>ergänzend</strong> hinzugefügt — bestehende Daten bleiben erhalten, Duplikate werden übersprungen.
        </p>
        <div
          onClick={() => inputRef.current?.click()}
          className="mb-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center transition hover:border-blue-400 hover:bg-blue-50 dark:border-gray-600 dark:bg-gray-900/40 dark:hover:border-blue-500 dark:hover:bg-blue-900/20"
        >
          <FileUp className="h-8 w-8 text-gray-400" />
          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
            {file ? file.name : 'Backup-Datei auswählen (.json)'}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }}
          />
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600">
            Abbrechen
          </button>
          <button
            onClick={() => file && onImport(file)}
            disabled={!file}
            className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 active:scale-95 disabled:opacity-40"
          >
            <ShieldCheck className="mr-1.5 inline h-4 w-4" /> Importieren
          </button>
        </div>
      </div>
    </div>
  );
}
