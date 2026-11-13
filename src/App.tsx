import { canDiscardCashSession, openingBalanceForLocation } from '@/lib/cashBalanceCarry';
import { sessionTransactions } from '@/lib/sessionTransactions';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useStore } from '@/hooks/useStore';
import { useCloudSync } from '@/hooks/useCloudSync';
import { useCatalogSync } from '@/hooks/useCatalogSync';
import { useAuthUser } from '@/hooks/useAuthUser';
import { useStaffDirectory } from '@/hooks/useStaffDirectory';
import { StaffLoginDialog } from '@/components/StaffLoginDialog';
import { DeviceSetupDialog } from '@/components/DeviceSetupDialog';
import { readDeviceSetup } from '@/lib/deviceSetup';
import { PDF_ARCHIVE_SETUP_EVENT } from '@/lib/pdfArchiveSetup';
import { RootPasswordWarning } from '@/components/RootPasswordWarning';
import { CloudPasswordPanel } from '@/components/Admin/CloudPasswordPanel';
import { ManagerPasswordPanel } from '@/components/Admin/ManagerPasswordPanel';
import { changeManagerPassword, loadManagerCredential, restoreManagerCredential, type ManagerCredential } from '@/lib/managerAuth';
import { supabase } from '@/lib/supabaseClient';
import { fetchCatalogRows } from '@/lib/catalogCloud';
import { pfandCloudMatches } from '@/lib/pfandValidation';
import type { PfandSettings } from '@/types';
import type { Location, StaffUser } from '@/types';
import { POSScreen } from '@/components/POS/POSScreen';
import { WoodmoHome } from '@/components/WoodmoHome';
import { WoodmoBrand } from '@/components/WoodmoBrand';
import { AdminScreen } from '@/components/Admin/AdminScreen';
import { JournalScreen } from '@/components/Journal/JournalScreen';
import { PasswordGate } from '@/components/PasswordGate';
import { InstallPrompt } from '@/components/InstallPrompt';
import { SyncToast } from '@/components/SyncToast';
import { SyncDialog } from '@/components/SyncDialog';
import { CatalogConflictDialog } from '@/components/CatalogConflictDialog';
import { rememberBookingReset, resetCloudBookings } from '@/lib/bookingReset';
import { discardEntriesBeforeGeneration } from '@/lib/outbox';
import { saveJournalPdf } from '@/lib/journalPdfFile';
import { closedSessionReport } from '@/lib/dailyReport';
import { issueDailyCloseReceipt } from '@/lib/dailyCloseReceipt';
import { buildFinalizedCashSession } from '@/lib/finalizedCashSession';
import { persistFinalizedCashSession } from '@/lib/finalizedCashCloud';
import { isTestMode, setTestMode, clearBookings, loadJSON, saveJSON, STORAGE_KEYS } from '@/lib/storage';
import { formatDateISO } from '@/lib/format';
import { exportRecoveryMetadata, restoreBackupSafely, type CompleteBackup } from '@/lib/backupRecovery';
import {
  ShoppingCart, Settings, Receipt, Sun, Moon,
  ArrowDownCircle, ArrowUpCircle,
  FlaskConical, CheckCircle2, AlertTriangle, RefreshCw, Cloud, LayoutGrid, X, Home, LogOut, LogIn, LockKeyhole,
} from 'lucide-react';

type Tab = 'pos' | 'admin' | 'journal';
type HeaderAction = 'deposit' | 'withdrawal' | 'pfand' | 'correction' | 'close' | null;
type OpeningManagementAccess =
  | { kind: 'manager-only' }
  | { kind: 'selected-administrator'; administrator: StaffUser }
  | { kind: 'employee-denied' }
  | null;

export default function App() {
  const { theme, toggle } = useTheme();
  const store = useStore();
  const [tab, setTab] = useState<Tab>('pos');
  // A cash register remains mounted when navigating Home/Admin/Journal: the
  // active unsaved cart must not disappear merely because its view is hidden.
  const [homeVisible, setHomeVisible] = useState(true);
  const [posVisited, setPosVisited] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [adminShotDirty, setAdminShotDirty] = useState(false);
  const [adminSection, setAdminSection] = useState('Kassen-Übersicht');
  const [deviceSetupOpen, setDeviceSetupOpen] = useState(() => readDeviceSetup() === null);
  const [pdfArchiveWarning, setPdfArchiveWarning] = useState<string | null>(null);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [headerAction, setHeaderAction] = useState<HeaderAction>(null);
  const [cashierLoginRequest, setCashierLoginRequest] = useState(0);
  const [testMode] = useState<boolean>(isTestMode());
  const [modeConfirm, setModeConfirm] = useState<null | 'to-test' | 'to-active'>(null);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const closeSyncToast = useCallback(() => setSyncedAt(null), []);
  const [syncOpen, setSyncOpen] = useState(false);
  const [currentStaff, setCurrentStaff] = useState<StaffUser | null>(null);
  const [openingManagementAccess, setOpeningManagementAccess] = useState<OpeningManagementAccess>(null);
  // This is deliberately separate from `currentStaff`: opening Verwaltung
  // must never replace the person currently working at the cash register.
  const [managementAdministrator, setManagementAdministrator] = useState<StaffUser | null>(null);
  const [lastStaffId, setLastStaffId] = useState<string | null>(() => loadJSON<string | null>(STORAGE_KEYS.lastStaffId, null));
  const [staffAdminLoginOpen, setStaffAdminLoginOpen] = useState(false);
  const [rootWarningOpen, setRootWarningOpen] = useState(() => !loadJSON<boolean>(STORAGE_KEYS.rootPasswordChanged, false) && !loadJSON<boolean>(STORAGE_KEYS.rootPasswordNoticeDismissed, false));
  const signedInUser = useAuthUser();
  const staff = useStaffDirectory();
  const catalog = useCatalogSync({
    categories: store.categories,
    products: store.products,
    pfandSettings: store.pfandSettings,
    shotOptions: store.shotOptions,
    testMode,
    applyRows: store.applyCatalogRows,
  });
  const { online, syncNow, pauseSyncForRestore, resumeSyncAfterRestore } = useCloudSync(
    store.transactions,
    store.cashSessions,
    testMode,
    () => setSyncedAt(Date.now()),
    store.mergeCloudData,
    catalog.syncCatalog,
    store.applyCloudBookingReset,
  );

  /** Explicit admin save with truthful read-after-write proof in V3 cloud. */
  async function savePfandAndVerify(settings: PfandSettings): Promise<'cloud' | 'local'> {
    // Update only the V3 local catalog; the existing catalog engine handles its
    // versioning, conflict detection, offline queue and cloud write.
    store.updatePfandSettings(settings);
    if (testMode) return 'local';

    // React must commit the updated store before the engine snapshots it.
    // Wait past the existing 700 ms catalog debounce, then synchronize and
    // compare against a fresh server read. Never report success based on state.
    let problem = 'Cloud hat die eingegebenen Pfandwerte noch nicht bestätigt.';
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, attempt === 0 ? 900 : 550));
      const result = await catalog.syncCatalog(false);
      if (!result.ok) {
        problem = result.error || problem;
        // Conflict dialogs and offline errors need explicit resolution, not
        // another blind write attempt.
        break;
      }
      try {
        if (pfandCloudMatches(await fetchCatalogRows(), settings)) return 'cloud';
        problem = 'Abgleich durchgeführt, aber der Pfandwert stimmt noch nicht mit der Cloud überein.';
      } catch (error) {
        problem = error instanceof Error ? error.message : 'Cloud-Rücklesen fehlgeschlagen.';
        break;
      }
    }
    throw new Error(problem);
  }

  // Any PDF export on this device can request reconfiguration. This includes
  // journal exports from another computer restoring a cloud booking history.
  useEffect(() => {
    const showSetup = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setPdfArchiveWarning(detail?.message || 'Der lokale PDF-Speicherordner muss erneut eingerichtet werden.');
      setDeviceSetupOpen(true);
    };
    window.addEventListener(PDF_ARCHIVE_SETUP_EVENT, showSetup);
    return () => window.removeEventListener(PDF_ARCHIVE_SETUP_EVENT, showSetup);
  }, []);

  // The last finalized balance per location is a suggestion only. It is not
  // copied until the user actually opens the next cash session.
  const openingBalanceSuggestions = useMemo<Record<Location, number | null>>(() => {
    const latestFor = (location: Location) => openingBalanceForLocation(store.cashSessions, store.transactions, location);
    return { Friedrichshafen: latestFor('Friedrichshafen'), Bregenz: latestFor('Bregenz') };
  }, [store.cashSessions, store.transactions, store.categories]);

  // The browser profile may be new while the personnel list already exists in
  // the cloud. Load it again once the cloud session is definitely available.
  useEffect(() => {
    if (signedInUser && online) void staff.sync().catch(() => undefined);
  }, [online, signedInUser, staff.sync]);

  const syncEverything = useCallback(async () => {
    const result = await syncNow();
    try {
      await staff.sync();
      return result;
    } catch (cause) {
      return { ok: false, error: readableSyncError(cause) };
    }
  }, [staff.sync, syncNow]);

  // The store reads test-mode at module init; switching requires a reload.
  function applyModeChange() {
    if (modeConfirm === 'to-test') {
      // Going into test mode: any bookings already saved from an earlier active
      // session would show up in test too. That's fine — they stay read-only in
      // localStorage and test bookings simply aren't written back. But to give
      // the user a clean test slate, we clear persisted bookings on entering test.
      clearBookings();
      setTestMode(true);
    } else if (modeConfirm === 'to-active') {
      // Entering active mode: discard any test bookings (they were never
      // persisted anyway) and turn on persistence for future bookings.
      clearBookings();
      setTestMode(false);
    }
    setModeConfirm(null);
    // Reload so useStore re-initializes with the new mode's data source.
    window.location.reload();
  }

  async function resetBookings() {
    // Reset only booking/cash-session data. Credentials, staff identities,
    // device preferences, local document archives and catalog remain unchanged.
    // In test mode the reset is local only, exactly like test bookings.
    if (!testMode) {
      const reset = await resetCloudBookings();
      // Prevent queued entries from a previous booking generation being
      // re-uploaded by a device that was offline during the reset.
      await discardEntriesBeforeGeneration(reset.generation);
      rememberBookingReset(reset);
    }
    store.resetAllData();
  }

  function navigateTo(nextTab: Tab) {
    setTab(nextTab);
    setHomeVisible(false);
    if (nextTab === 'pos') setPosVisited(true);
    setMenuOpen(false);
  }

  function goHome() {
    // The administration's unsaved SCHUSS draft must not silently disappear.
    if (tab === 'admin' && adminShotDirty && !homeVisible &&
      !window.confirm('Ungespeicherte SCHUSS-Änderungen verwerfen und zur Startseite wechseln?')) return;
    setAdminShotDirty(false);
    setMenuOpen(false);
    setHomeVisible(true);
  }

  function navigateToProtected(nextTab: 'admin' | 'journal') {
    if (currentStaff?.role === 'administrator') {
      setManagementAdministrator(currentStaff);
      setAdminUnlocked(true);
    }
    navigateTo(nextTab);
  }

  function chooseCashAction(action: Exclude<HeaderAction, null>) {
    navigateTo('pos');
    setHeaderAction(action);
  }

  function openManagementFromCashOpening(selectedStaff: StaffUser | null) {
    setHomeVisible(false);
    setMenuOpen(false);
    if (selectedStaff?.role === 'employee') return;
    if (selectedStaff?.role === 'administrator' && currentStaff?.id === selectedStaff.id && currentStaff.role === 'administrator') {
      setManagementAdministrator(currentStaff);
      setAdminUnlocked(true);
      setOpeningManagementAccess(null);
      setTab('admin');
      return;
    }
    setAdminUnlocked(false);
    setManagementAdministrator(null);
    if (!selectedStaff) {
      // Home login accepts a personal administrator password or the existing
      // manager gate, never logs the cashier out or weakens role checks.
      setOpeningManagementAccess(null);
    } else if (selectedStaff.role === 'administrator') {
      setOpeningManagementAccess({ kind: 'selected-administrator', administrator: selectedStaff });
    } else {
      setOpeningManagementAccess({ kind: 'employee-denied' });
    }
    setTab('admin');
  }

  function recordStaff(type: 'login' | 'logout', user: StaffUser) {
    if (!store.activeSession) return;
    store.recordStaffActivity(store.activeSession.id, {
      id: `activity-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      staffId: user.id,
      staffName: user.name,
      timestamp: Date.now(),
    });
  }

  function handleStaffAuthenticated(user: StaffUser) {
    setAdminUnlocked(user.role === 'administrator');
    setManagementAdministrator(user.role === 'administrator' ? user : null);
    setCurrentStaff(user);
    setLastStaffId(user.id);
    saveJSON(STORAGE_KEYS.lastStaffId, user.id);
    recordStaff('login', user);
  }

  async function discardUnusedSession() {
    const session = store.activeSession;
    if (!session) return;
    if (!canDiscardCashSession(session, store.transactions)) throw new Error('Eine Kasse mit Bestand oder Bewegungen darf nicht verworfen werden. Bitte den Tagesabschluss verwenden.');
    if (!testMode) {
      const sync = await syncEverything();
      if (!sync.ok) throw new Error(sync.error ?? 'Cloud-Abgleich fehlgeschlagen.');
      await pauseSyncForRestore();
      try {
        if (!supabase) throw new Error('Cloud ist nicht konfiguriert.');
        const { error } = await supabase.rpc('discard_empty_pos_cash_session', { p_session_id: session.id });
        if (error) throw error;
        store.discardEmptySession(session.id);
      } finally { resumeSyncAfterRestore(); }
    } else store.discardEmptySession(session.id);
  }

  async function handleStaffLogout() {
    const session = store.activeSession;
    if (session && canDiscardCashSession(session, store.transactions)) {
      try { await discardUnusedSession(); } catch (error) { alert(readableSyncError(error)); return; }
    } else {
    if (currentStaff) recordStaff('logout', currentStaff);
    }
    setCurrentStaff(null);
    // A cashier logout closes an administrator's direct workspace access as
    // well. The next person must authenticate with their own credentials.
    setManagementAdministrator(null);
    setAdminUnlocked(false);
  }

  // Keep the current action visible in the heading even when it opens a
  // top-level dialog instead of an AdminScreen-internal modal.
  const activeAdminSectionTitle = deviceSetupOpen && tab === 'admin'
    ? 'Setup / PDF-Ordner'
    : modeConfirm && tab === 'admin'
      ? modeConfirm === 'to-test' ? 'Auf Testmodus wechseln' : 'Auf aktiven Modus wechseln'
      : adminSection;

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-gray-100 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      {/* Compact toolbar: Home never closes the register or clears its cart. */}
      {!homeVisible && (
        <>
          <header className="relative z-20 flex min-h-14 shrink-0 items-center gap-2 border-b border-emerald-900/50 bg-[#0d1628] px-2 py-1.5 text-white shadow-sm sm:px-3">
            <WoodmoBrand status={!online || catalog.syncStatus === 'error' ? 'error' : !testMode && catalog.syncStatus !== 'saved' ? 'pending' : 'ok'} />
            <h1 className={`min-w-0 shrink-0 truncate text-base font-bold sm:text-lg ${!online ? 'woodmo-heading-offline text-red-400' : 'text-white'}`}
              aria-live="polite">
              {tab === 'pos' ? 'Kasse' : tab === 'admin' ? 'Verwaltung' : 'Journal'}
            </h1>
            {tab === 'admin' && adminUnlocked && (
              <span className="min-w-0 max-w-[35vw] truncate border-l border-emerald-500/50 pl-2 text-xs font-semibold text-emerald-200 sm:text-sm"
                role="status" aria-live="polite"
                title={`Verwaltung · ${activeAdminSectionTitle}`}>
                {activeAdminSectionTitle}
              </span>
            )}
            <button type="button" aria-label="Zur Startseite" title="Zur Startseite" onClick={goHome}
              className="flex h-10 shrink-0 items-center justify-center gap-1 rounded-xl border border-sky-600/80 bg-sky-900/35 px-2.5 text-sky-100 shadow-[0_0_10px_rgba(56,189,248,.12)] transition hover:border-sky-400 hover:bg-sky-700/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
              <Home className="h-5 w-5" />
              <span className="hidden min-[1040px]:inline text-xs font-semibold">Home</span>
            </button>
            {(tab !== 'admin' || adminUnlocked) && (
              <button type="button" aria-label={tab === 'admin' ? 'Verwaltungsmenü öffnen' : tab === 'journal' ? 'Journalmenü öffnen' : 'Kassenmenü öffnen'}
                title="Menü" aria-expanded={menuOpen} aria-haspopup="dialog"
                onClick={() => setMenuOpen((wasOpen) => !wasOpen)}
                className={`flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-2.5 font-semibold text-white transition hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ${menuOpen ? 'border-emerald-400 bg-emerald-900/40' : 'border-slate-600 bg-slate-800/65'}`}>
                <LayoutGrid className="h-5 w-5" />
                <span className="hidden min-[740px]:inline text-xs">Menü</span>
              </button>
            )}
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              {tab === 'pos' && (
                <button type="button"
                  aria-label={currentStaff ? 'Mitarbeiter abmelden' : 'Mitarbeiter anmelden'}
                  title={currentStaff ? `${currentStaff.name} abmelden` : 'Mitarbeiter anmelden'}
                  onClick={() => currentStaff ? void handleStaffLogout() : setCashierLoginRequest((n) => n + 1)}
                  className={`flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-2.5 text-xs font-bold transition focus-visible:outline focus-visible:outline-2 ${currentStaff
                    ? 'border-red-500/80 bg-red-950/30 text-red-200 hover:bg-red-900/40 focus-visible:outline-red-400'
                    : 'border-emerald-500/80 bg-emerald-950/30 text-emerald-200 hover:bg-emerald-900/40 focus-visible:outline-emerald-400'}`}>
                  {currentStaff ? <LogOut className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
                  <span className="hidden min-[970px]:inline">{currentStaff ? 'Abmelden' : 'Anmelden'}</span>
                </button>
              )}
              <button type="button" aria-label="Cloud synchronisieren" title="Cloud synchronisieren"
                onClick={() => setSyncOpen(true)}
                className="flex h-10 items-center gap-1 rounded-xl border border-emerald-500/60 px-2 text-emerald-300 hover:bg-emerald-900/30">
                <RefreshCw className="h-4 w-4" />
                <span className="hidden min-[1080px]:inline text-xs font-semibold">Sync Cloud</span>
              </button>
              <span role="status" title={!online ? 'Cloud nicht erreichbar' : catalog.syncStatus === 'error' ? 'Artikel-Abgleich fehlgeschlagen' : 'Cloud verbunden'}
                className={`flex h-10 items-center gap-1 rounded-xl border px-2 text-xs font-bold ${!online || catalog.syncStatus === 'error' ? 'border-red-500/80 bg-red-950/35 text-red-300' : 'border-emerald-500/60 bg-emerald-950/20 text-emerald-300'}`}>
                <Cloud className="h-4 w-4" />
                <span className="hidden min-[1100px]:inline">{!online ? 'Offline' : 'Cloud'}</span>
                <span className="text-[10px]">{testMode ? 'TEST' : 'AKTIV'}</span>
              </span>

              <button type="button" aria-label="Darstellung wechseln" title="Hell/Dunkel" onClick={toggle}
                className="hidden h-10 w-10 items-center justify-center rounded-xl border border-slate-600 text-slate-100 hover:bg-slate-700 min-[780px]:flex">
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            </div>
          </header>
          {menuOpen && (tab !== 'admin' || !adminUnlocked) && (
            <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/65 px-3 pb-4 pt-16"
              onClick={() => setMenuOpen(false)}
              onKeyDown={(event) => { if (event.key === 'Escape') setMenuOpen(false); }}>
              <nav role="dialog" aria-modal="true" aria-label="Kassenmenü"
                className="w-full max-w-xl rounded-2xl border border-emerald-700/30 bg-white p-3 shadow-2xl dark:bg-slate-900"
                onClick={(event) => event.stopPropagation()}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-bold text-slate-900 dark:text-white">Kassenmenü</h2>
                  <button type="button" aria-label="Menü schließen" onClick={() => setMenuOpen(false)}
                    className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
                </div>

                <div className="mb-3 flex justify-center">
                  <button type="button" onClick={goHome}
                    className="flex min-h-16 w-full max-w-[12rem] flex-col items-center justify-center gap-1 rounded-xl border border-sky-500/45 bg-sky-100 px-3 py-2 text-sm font-bold text-sky-900 hover:bg-sky-200 dark:bg-sky-900/40 dark:text-sky-100 dark:hover:bg-sky-900/65">
                    <Home className="h-5 w-5" /> Startseite
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button type="button" onClick={() => navigateTo('pos')} className="flex min-h-20 min-w-0 flex-col items-center justify-center gap-2 rounded-xl bg-slate-100 p-2 text-center text-sm font-bold dark:bg-slate-800">
                    <ShoppingCart className="h-5 w-5" /> Kasse
                  </button>
                  {(currentStaff?.role === 'administrator' || (adminUnlocked && currentStaff?.role !== 'employee')) && (
                    <>
                      <button type="button" onClick={() => navigateToProtected('journal')} className="flex min-h-20 min-w-0 flex-col items-center justify-center gap-2 rounded-xl bg-slate-100 p-2 text-center text-sm font-bold dark:bg-slate-800">
                        <Receipt className="h-5 w-5" /> Journal
                      </button>
                      <button type="button" onClick={() => navigateToProtected('admin')} className="flex min-h-20 min-w-0 flex-col items-center justify-center gap-2 rounded-xl bg-slate-100 p-2 text-center text-sm font-bold dark:bg-slate-800">
                        <Settings className="h-5 w-5" /> Verwaltung
                      </button>
                    </>
                  )}
                </div>

                {store.activeSession && currentStaff && (
                  <>
                    <h3 className="mt-4 mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Kassenbewegungen</h3>
                    <div className="grid grid-cols-3 gap-2">
                      <button type="button" onClick={() => chooseCashAction('deposit')} className="flex min-h-20 min-w-0 flex-col items-center justify-center gap-2 rounded-xl bg-emerald-50 p-2 text-center text-xs font-bold text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
                        <ArrowDownCircle className="h-5 w-5" /> Einlage
                      </button>
                      <button type="button" onClick={() => chooseCashAction('withdrawal')} className="flex min-h-20 min-w-0 flex-col items-center justify-center gap-2 rounded-xl bg-slate-100 p-2 text-center text-xs font-bold dark:bg-slate-800">
                        <ArrowUpCircle className="h-5 w-5" /> Ausgabe
                      </button>
                      <button type="button" onClick={() => chooseCashAction('correction')} className="flex min-h-20 min-w-0 flex-col items-center justify-center gap-2 rounded-xl bg-slate-100 p-2 text-center text-xs font-bold dark:bg-slate-800">
                        <Settings className="h-5 w-5" /> Bestandskorrektur
                      </button>
                    </div>
                    <button type="button" onClick={() => chooseCashAction('close')}
                      className="mt-3 flex min-h-16 w-full items-center justify-center gap-3 rounded-xl border border-amber-500/50 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-950/50">
                      <LockKeyhole className="h-6 w-6 shrink-0" />
                      <span className="flex flex-col items-start gap-0.5">
                        <span>Tagesabschluss</span>
                        <span className="text-xs font-normal">Nach Bestätigung unwiderruflich</span>
                      </span>
                    </button>
                  </>
                )}
              </nav>
            </div>
          )}
        </>
      )}

      {/* Test mode banner */}
      {!homeVisible && testMode && (
        <div className="flex items-center justify-center gap-2 bg-amber-50 px-4 py-1.5 text-center text-xs font-medium text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5" />
          Testmodus aktiv — Artikel, Warengruppen und Bilder werden gespeichert und in den aktiven Modus übernommen. Nur Verkäufe und Kassenabschlüsse werden nicht gespeichert.
        </div>
      )}

      {/* Content */}
      <main className="min-h-0 flex-1 overflow-hidden p-2 sm:p-3">
        {homeVisible && (
          <WoodmoHome
            onCash={() => navigateTo('pos')}
            onAdmin={() => openManagementFromCashOpening(currentStaff?.role === 'administrator' ? currentStaff : null)}
            sessionOpen={Boolean(store.activeSession)}
            location={store.activeSession?.location ?? store.selectedLocation}
            status={!online || catalog.syncStatus === 'error' ? 'error' : !testMode && catalog.syncStatus !== 'saved' ? 'pending' : 'ok'}
            testMode={testMode}
          />
        )}
        {posVisited && (
          <div className={homeVisible || tab !== 'pos' ? 'hidden' : 'h-full min-h-0'}>
          <POSScreen
            shotOptions={store.shotOptions}
            categories={store.categories}
            products={store.products}
            activeSession={store.activeSession}
            transactions={store.transactions}
            onCheckout={(tx) => {
              if (!currentStaff || !store.activeSession) return;
              store.addTransaction({ ...tx, cashSessionId: store.activeSession.id, employeeId: currentStaff.id, employeeName: currentStaff.name });
              if (store.activeSession) store.recordStaffActivity(store.activeSession.id, { id: `activity-${Date.now().toString(36)}`, type: 'sale', staffId: currentStaff.id, staffName: currentStaff.name, timestamp: tx.timestamp, amount: tx.total });
            }}
            onOpenCash={(location, balance) => currentStaff && store.openCashSession(location, balance, currentStaff)}
            onCorrectOpening={(amt, reason) => {
              if (store.activeSession && currentStaff) store.correctOpeningBalance(store.activeSession.id, amt, reason, currentStaff);
            }}
            onCashEntry={(type, amt, reason, isPfandRetoure = false) => {
              if (store.activeSession && currentStaff) store.addCashEntry(store.activeSession.id, type, amt, reason, isPfandRetoure, currentStaff);
            }}
            onCloseCash={async (bal, closingWithdrawalAmount) => {
              const session = store.activeSession;
              if (!session || !currentStaff) return { ok: false, error: 'Es ist keine aktive Kasse oder kein angemeldeter Mitarbeiter vorhanden.' };
              if (testMode) {
                // Test mode is a simulation only: no Cloud receipt number,
                // final Cloud write, or official persisted close/PDF.
                store.closeCashSession(session.id, bal, currentStaff, closingWithdrawalAmount);
                return { ok: true };
              }
              if (!online || !navigator.onLine) {
                return { ok: false, error: 'Beleg konnte nicht erstellt werden, da keine Internetverbindung besteht. Bitte Internetverbindung prüfen und erneut versuchen.' };
              }
              const finalizedAt = Date.now();
              const finalizedIntervals = (session.staffLoginIntervals ?? []).map((interval) => interval.logoutAt ? interval : { ...interval, logoutAt: finalizedAt });
              try {
                const sync = await syncEverything();
                if (!sync.ok) throw new Error(sync.error ?? 'Kassensitzung konnte nicht mit der Cloud abgeglichen werden.');
                // A final close without the cloud-wide, immutable receipt
                // number is not allowed. The RPC is idempotent per session.
                const receipt = await issueDailyCloseReceipt(session.id, currentStaff.name, session.location, finalizedAt);
                const frozenTransactions = sessionTransactions(store.transactions, session, finalizedAt);
                const snapshot = {
                  transactions: frozenTransactions.map((tx) => structuredClone(tx)),
                  finalizedAt, finalizedById: currentStaff.id, finalizedByName: currentStaff.name,
                  staffLoginIntervals: finalizedIntervals,
                };
                const closed = buildFinalizedCashSession(
                  session, store.transactions, bal, currentStaff, closingWithdrawalAmount,
                  { closedAt: finalizedAt, receipt, snapshot },
                );
                // An issued receipt number alone does NOT mean the close is saved.
                // First store and read back the closed snapshot in Supabase;
                // only then reflect the irreversible result in the local UI.
                await persistFinalizedCashSession(closed);
                store.commitFinalizedSession(closed);
                try {
                  await saveJournalPdf(closedSessionReport(closed, store.transactions, store.categories, currentStaff.name));
                } catch (pdfError) {
                  console.warn('Kasse abgeschlossen; PDF-Export fehlgeschlagen.', pdfError);
                  alert('Der Tagesabschluss wurde in Supabase bestätigt. Das PDF konnte auf diesem Gerät nicht gespeichert werden. Bitte im Geräte-Setup den Speicherordner prüfen und das PDF im Journal erneut erzeugen. Die Kasse nicht erneut abschließen.');
                }
                return { ok: true };
              } catch (error) {
                console.warn('Tagesabschluss ohne Belegnummer abgelehnt.', error);
                return { ok: false, error: `Tagesabschluss konnte nicht sicher bestätigt werden: ${readableSyncError(error)} Bitte vor weiteren Buchungen den Cloud-Status prüfen und erneut synchronisieren; keine zweite Abschlussbuchung erzwingen.` };
              }
            }}
            onMoveProduct={(sourceId, targetId) => store.moveProductTo(sourceId, targetId)}
            headerAction={headerAction}
            onHeaderActionConsumed={() => setHeaderAction(null)}
            loginRequest={cashierLoginRequest}
            selectedLocation={store.selectedLocation}
            pfandSettings={store.pfandSettings}
            staffUsers={staff.users}
            currentStaff={currentStaff}
            online={online}
            onStaffAuthenticated={handleStaffAuthenticated}
            onSetInitialCredentials={staff.setInitialCredentials}
            onConfigureStaffSecurity={staff.configureSecurity}
            onResetStaffPassword={staff.resetPassword}
            lastStaffId={lastStaffId}
            onDiscardEmptySession={discardUnusedSession}
            onHome={goHome}
            openingBalanceSuggestions={openingBalanceSuggestions}
          />
          </div>
        )}
        {!homeVisible && tab === 'admin' && (
          adminUnlocked ? (
            <AdminScreen
              menuOpen={menuOpen}
              onCloseMenu={() => setMenuOpen(false)}
              onOpenJournal={() => navigateToProtected('journal')}
              onAdminSectionChange={setAdminSection}
              onShotDraftDirtyChange={setAdminShotDirty}
              onPrepareCatalogImport={catalog.prepareImport}
              onCommitCatalogImport={catalog.commitImport}
              shotOptions={store.shotOptions}
              onUpdateShotOptions={store.updateShotOptions}
              categories={store.categories}
              products={store.products}
              transactions={store.transactions}
              cashSessions={store.cashSessions}
              activeSession={store.activeSession}
              selectedLocation={store.selectedLocation}
              onSwitchLocation={store.switchLocation}
              onAddCategory={store.addCategory}
              onUpdateCategory={store.updateCategory}
              onDeleteCategory={store.deleteCategory}
              onReorderCategory={store.reorderCategory}
              onMoveCategoryTo={store.moveCategoryTo}
              onAddProduct={store.addProduct}
              onUpdateProduct={store.updateProduct}
              onDeleteProduct={store.deleteProduct}
              onReorderProduct={store.reorderProduct}
              onMoveProductTo={store.moveProductTo}
              onResetAllData={resetBookings}
              onDeviceSetup={() => setDeviceSetupOpen(true)}
              pfandSettings={store.pfandSettings}
              onUpdatePfandSettings={savePfandAndVerify}
              getProductPfand={store.getProductPfand}
              staffUsers={staff.users}
              staffOnline={online}
              onCreateStaff={staff.create}
              onUpdateStaff={staff.update}
              onSetStaffPassword={staff.setPassword}
              onDeleteStaff={staff.remove}
              currentStaff={currentStaff}
              onChangeManagerPassword={(currentPassword, nextPassword) => changeManagerPassword(currentPassword, nextPassword, staff.users.some((user) => user.role === 'administrator' && user.active && !!user.passwordHash))}
              administratorTools={managementAdministrator ? <><ManagerPasswordPanel online={online} hasAdministrator={staff.users.some((user) => user.role === 'administrator' && user.active && !!user.passwordHash)} onChange={(currentPassword, nextPassword) => changeManagerPassword(currentPassword, nextPassword, true)} /><CloudPasswordPanel onChanged={() => { saveJSON(STORAGE_KEYS.rootPasswordChanged, true); saveJSON(STORAGE_KEYS.rootPasswordNoticeDismissed, true); }} /></> : undefined}
              testMode={testMode}
              onToggleMode={() => setModeConfirm(testMode ? 'to-active' : 'to-test')}
              onExportBackup={async () => {
                try {
                const recoveryMetadata = await exportRecoveryMetadata();
                const coreBackup = store.exportBackup();
                // A backup represents this installation as a whole. Passwords are
                // stored only as protected proofs; no readable password is exported.
                const payload: CompleteBackup = {
                  ...coreBackup,
                  version: 5,
                  data: {
                    ...coreBackup.data,
                    ...recoveryMetadata,
                    staffUsers: staff.users,
                    managerCredential: loadManagerCredential(),
                    lastStaffId,
                    theme,
                    rootPasswordChanged: loadJSON(STORAGE_KEYS.rootPasswordChanged, false),
                    rootPasswordNoticeDismissed: loadJSON(STORAGE_KEYS.rootPasswordNoticeDismissed, false),
                  },
                };
                const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `kasse-backup-${formatDateISO(Date.now())}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                } catch (error) {
                  alert(error instanceof Error ? error.message : 'Die vollständige Sicherung konnte nicht erstellt werden.');
                }
              }}
              onImportBackup={async (file) => {
                let restoreSyncPaused = false;
                try {
                  const text = await file.text();
                  const parsed = JSON.parse(text);
                  if (!parsed || typeof parsed !== 'object' || !parsed.data) {
                    alert('Ungültige Backup-Datei: Format nicht erkannt.');
                    return;
                  }

                  // Der Wiederherstellungsdienst gleicht die Daten bereits
                  // gezielt mit der Cloud ab. Die normale Hintergrund-
                  // synchronisation darf dabei nicht parallel weitere
                  // Änderungen einreihen.
                  await pauseSyncForRestore();
                  restoreSyncPaused = true;
                  const restored = await restoreBackupSafely(parsed as CompleteBackup);
                  store.importBackup(restored);
                  staff.replaceLocal(restored.staffUsers);

                  const restoredData = restored.data;
                  if ('managerCredential' in restoredData) {
                    restoreManagerCredential((restoredData.managerCredential as ManagerCredential | null) ?? null);
                  }
                  // Ein eventuell noch lokaler Name darf nicht aus einer alten
                  // Sitzung in die gerade wiederhergestellten Daten hineinragen.
                  const restoredStaffId = typeof restoredData.lastStaffId === 'string' ? restoredData.lastStaffId : null;
                  saveJSON(STORAGE_KEYS.lastStaffId, restoredStaffId);
                  setLastStaffId(restoredStaffId);
                  if ('theme' in restoredData && typeof restoredData.theme === 'string') {
                    saveJSON(STORAGE_KEYS.theme, restoredData.theme);
                  }
                  if ('rootPasswordChanged' in restoredData) {
                    saveJSON(STORAGE_KEYS.rootPasswordChanged, Boolean(restoredData.rootPasswordChanged));
                  }
                  if ('rootPasswordNoticeDismissed' in restoredData) {
                    saveJSON(STORAGE_KEYS.rootPasswordNoticeDismissed, Boolean(restoredData.rootPasswordNoticeDismissed));
                  }

                  // Kein Seiten-Neuladen: Während der Cloud-Abgleich die
                  // wiederhergestellten Sitzungen übernimmt, würde dies die
                  // Kasseneröffnung mehrfach öffnen und schließen lassen.
                  // Der Nutzer bleibt deshalb stabil in der Verwaltung.
                  setCurrentStaff(null);
                  setManagementAdministrator(null);
                  setOpeningManagementAccess(null);
                  setAdminUnlocked(true);
                  setTab('admin');
                  alert('Backup sicher wiederhergestellt. Die Daten sind verfügbar; Sie bleiben in der Verwaltung.');
                } catch (error) {
                  alert(error instanceof Error ? error.message : 'Backup-Datei konnte nicht gelesen werden.');
                } finally {
                  if (restoreSyncPaused) {
                    resumeSyncAfterRestore();
                  }
                }
              }}
            />
          ) : (
            <AdminAccessGate
              onManagerSuccess={(administrator) => {
                const selectedAdministrator = openingManagementAccess?.kind === 'selected-administrator' ? openingManagementAccess.administrator : null;
                setManagementAdministrator(selectedAdministrator ?? administrator ?? null);
                setAdminUnlocked(true);
              }}
              onCancel={() => {
                setOpeningManagementAccess(null);
                setManagementAdministrator(null);
                setAdminUnlocked(false);
                goHome();
              }}
              staffUsers={staff.users}
              title="Verwaltung"
              access={openingManagementAccess}
            />
          )
        )}
        {modeConfirm && (
          <ModeConfirmDialog
            toTestMode={modeConfirm === 'to-test'}
            onCancel={() => setModeConfirm(null)}
            onConfirm={applyModeChange}
          />
        )}
        {!homeVisible && tab === 'journal' && (
          adminUnlocked ? (
            <JournalScreen
              transactions={store.transactions}
              categories={store.categories}
              cashSessions={store.cashSessions}
              defaultLocation={store.selectedLocation}
              currentStaff={currentStaff}
            />
          ) : (
            <AdminAccessGate onManagerSuccess={(administrator) => { setManagementAdministrator(administrator ?? null); setAdminUnlocked(true); }} onStaffLogin={() => setStaffAdminLoginOpen(true)} staffUsers={staff.users} title="Journal" />
          )
        )}
      </main>
      {syncedAt !== null && <SyncToast key={syncedAt} onClose={closeSyncToast} />}
      {syncOpen && <SyncDialog syncNow={syncEverything} onClose={() => setSyncOpen(false)} />}
      {catalog.conflict && <CatalogConflictDialog onChoose={catalog.resolveConflict} />}
      {staffAdminLoginOpen && (
        <StaffLoginDialog
          users={staff.users}
          allowedRoles={['administrator']}
          online={online}
          title="Administrator anmelden"
          onAuthenticated={(administrator) => { setManagementAdministrator(administrator); setAdminUnlocked(true); setStaffAdminLoginOpen(false); }}
          onSetInitialCredentials={staff.setInitialCredentials}
          onConfigureSecurity={staff.configureSecurity}
          onResetPassword={staff.resetPassword}
          initialStaffId={lastStaffId}
          onCancel={() => setStaffAdminLoginOpen(false)}
        />
      )}
      {deviceSetupOpen && <DeviceSetupDialog warning={pdfArchiveWarning} onComplete={() => { setPdfArchiveWarning(null); setDeviceSetupOpen(false); }} onCancel={readDeviceSetup() ? () => { setPdfArchiveWarning(null); setDeviceSetupOpen(false); } : undefined} />}
      <InstallPrompt />
      <RootPasswordWarning visible={signedInUser === 'admin' && rootWarningOpen} onClose={() => { saveJSON(STORAGE_KEYS.rootPasswordNoticeDismissed, true); setRootWarningOpen(false); }} />
    </div>
  );
}

function readableSyncError(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'object' && cause !== null) {
    const error = cause as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [error.message, error.details, error.hint, error.code]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0);
    if (parts.length > 0) return parts.join(' · ');
  }
  return String(cause);
}

function AdminAccessGate({ onManagerSuccess, onStaffLogin, onCancel, staffUsers, title, access = null }: { onManagerSuccess: (administrator?: StaffUser) => void; onStaffLogin?: () => void; onCancel?: () => void; staffUsers: StaffUser[]; title: string; access?: OpeningManagementAccess }) {
  const selectedAdministrator = access?.kind === 'selected-administrator' ? access.administrator : null;
  const managerOnly = access?.kind === 'manager-only';
  const employeeDenied = access?.kind === 'employee-denied';
  return <PasswordGate
    onSuccess={onManagerSuccess}
    onCancel={onCancel}
    onStaffLogin={employeeDenied || managerOnly ? undefined : onStaffLogin}
    administrators={selectedAdministrator ? [selectedAdministrator] : managerOnly || employeeDenied ? [] : staffUsers}
    allowManagerPassword={!employeeDenied}
    accessDenied={employeeDenied}
    title={title}
  />;
}

function ModeConfirmDialog({ toTestMode, onCancel, onConfirm }: { toTestMode: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/50 p-4 sm:items-center" onClick={onCancel}>
      <div className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${toTestMode ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'}`}>
            {toTestMode ? <FlaskConical className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {toTestMode ? 'In Testmodus wechseln?' : 'In aktiven Modus wechseln?'}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Modus-Wechsel — Bestätigung erforderlich</p>
          </div>
        </div>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
          {toTestMode ? (
            <>Im Testmodus können Sie die App <strong>vollständig ausprobieren</strong>: Artikel anlegen, Bilder hochladen, Warengruppen verwalten, Verkäufe und Kassenabschlüsse durchführen. <strong>Artikel, Warengruppen und Bilder werden gespeichert</strong> und automatisch in den aktiven Modus übernommen. <strong>Nur Verkäufe und Kassenabschlüsse werden nicht gespeichert</strong> — diese bleiben nur in der aktuellen Sitzung, damit keine Test-Buchungen im realen Betrieb auftauchen.</>
          ) : (
            <>Im aktiven Modus werden <strong>alle Verkäufe, Kassenabschlüsse und Änderungen dauerhaft gespeichert</strong>. Die im Testmodus angelegten Artikel, Warengruppen und Bilder bleiben erhalten und stehen voll funktionsfähig zur Verfügung. Die App wird neu geladen, danach ist der produktive Betrieb aktiv.</>
          )}
        </p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600">
            Abbrechen
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition active:scale-95 ${toTestMode ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'}`}
          >
            {toTestMode ? 'Testmodus aktivieren' : 'Aktiven Modus aktivieren'}
          </button>
        </div>
      </div>
    </div>
  );
}
