import { canDiscardCashSession, openingBalanceForLocation } from '@/lib/cashBalanceCarry';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useStore } from '@/hooks/useStore';
import { useCloudSync } from '@/hooks/useCloudSync';
import { useCatalogSync } from '@/hooks/useCatalogSync';
import { useAuthUser } from '@/hooks/useAuthUser';
import { useStaffDirectory } from '@/hooks/useStaffDirectory';
import { StaffLoginDialog } from '@/components/StaffLoginDialog';
import { RootPasswordWarning } from '@/components/RootPasswordWarning';
import { CloudPasswordPanel } from '@/components/Admin/CloudPasswordPanel';
import { ManagerPasswordPanel } from '@/components/Admin/ManagerPasswordPanel';
import { changeManagerPassword, loadManagerCredential, resetManagerPassword, restoreManagerCredential, type ManagerCredential } from '@/lib/managerAuth';
import { supabase } from '@/lib/supabaseClient';
import type { Location, StaffUser } from '@/types';
import { POSScreen } from '@/components/POS/POSScreen';
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
import { isTestMode, setTestMode, clearBookings, loadJSON, saveJSON, STORAGE_KEYS } from '@/lib/storage';
import { formatDateISO } from '@/lib/format';
import { exportRecoveryMetadata, restoreBackupSafely, type CompleteBackup } from '@/lib/backupRecovery';
import {
  ShoppingCart, Settings, Receipt, Sun, Moon, Lock,
  ArrowDownCircle, ArrowUpCircle, Recycle, MonitorDot,
  FlaskConical, CheckCircle2, AlertTriangle, RefreshCw, Cloud,
} from 'lucide-react';

type Tab = 'pos' | 'admin' | 'journal';
type HeaderAction = 'deposit' | 'withdrawal' | 'pfand' | null;
type OpeningManagementAccess =
  | { kind: 'manager-only' }
  | { kind: 'selected-administrator'; administrator: StaffUser }
  | { kind: 'employee-denied' }
  | null;

export default function App() {
  const { theme, toggle } = useTheme();
  const store = useStore();
  const [tab, setTab] = useState<Tab>('pos');
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [headerAction, setHeaderAction] = useState<HeaderAction>(null);
  const [testMode, setTestModeState] = useState<boolean>(isTestMode());
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
    // This is the explicit, administrator-triggered complete operating reset.
    // Product/catalog data is intentionally not touched here.
    if (!supabase) throw new Error('Cloud ist nicht konfiguriert.');
    const { error: passwordError } = await supabase.auth.updateUser({ password: '123456' });
    // Supabase rejects a no-op password change. For the reset that simply
    // means the required default password is already in place.
    if (passwordError && !/different from the old password/i.test(passwordError.message)) throw passwordError;
    if (!testMode) {
      const reset = await resetCloudBookings();
      // Do not leave pre-reset offline uploads behind on the device that
      // initiated the reset.
      await discardEntriesBeforeGeneration(reset.generation);
      rememberBookingReset(reset);
    }
    // Personnel and personal credentials survive the booking/year reset.
    store.resetAllData();
    resetManagerPassword();
    saveJSON(STORAGE_KEYS.rootPasswordChanged, false);
    saveJSON(STORAGE_KEYS.rootPasswordNoticeDismissed, false);
    setCurrentStaff(null);
    setLastStaffId(null);
    saveJSON(STORAGE_KEYS.lastStaffId, null);
    setAdminUnlocked(false);
    // End the current cloud session so the restored Admin / 123456 access is
    // actually required on the next app start.
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
    if (signOutError) throw signOutError;
  }

  function navigateTo(nextTab: Tab) {
    setTab(nextTab);
  }

  function openManagementFromCashOpening(selectedStaff: StaffUser | null) {
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
      setOpeningManagementAccess({ kind: 'manager-only' });
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

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-gray-100 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-gray-200 bg-white px-3 py-2 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:px-4 sm:py-2.5">
        {/* Logo */}
        <div className="flex items-center gap-2" title={online ? 'Online' : 'Offline'}>
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl border-2 bg-white transition-all duration-300 dark:bg-gray-900 ${online ? 'border-green-500 text-green-600 shadow-[0_0_14px_rgba(34,197,94,0.55)] dark:text-green-400' : 'border-red-500 text-red-600 shadow-[0_0_14px_rgba(239,68,68,0.55)] dark:text-red-400'}`}>
            <ShoppingCart className="h-5 w-5" />
          </div>
          <div className="hidden sm:block">
            <h1 className={`text-base font-bold leading-tight transition-colors duration-300 ${online ? 'text-green-700 [text-shadow:0_0_10px_rgba(34,197,94,0.5)] dark:text-green-400' : 'text-red-600 [text-shadow:0_0_10px_rgba(239,68,68,0.5)] dark:text-red-400'}`}>Tablet-Kasse</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Holzbar</p>
          </div>
        </div>

        <div className="hidden h-7 w-px bg-gray-200 dark:bg-gray-700 sm:block" />

        {/* Tabs + Cash actions */}
        <nav className="order-3 flex w-full min-w-0 items-center gap-1 overflow-x-auto pb-0.5 md:order-none md:w-auto md:flex-1">
          <TabButton active={tab === 'pos'} onClick={() => navigateTo('pos')} icon={<ShoppingCart className="h-4 w-4" />} label="Kasse" />

          {/* Cash management buttons - only when on POS tab and session is open */}
          {tab === 'pos' && store.activeSession && currentStaff && (
            <>
              <div className="mx-1 h-7 w-px bg-gray-200 dark:bg-gray-700" />
              <CashActionButton
                onClick={() => setHeaderAction('deposit')}
                icon={<ArrowDownCircle className="h-4 w-4" />}
                label="Einlage"
                color="violet"
              />
              <CashActionButton
                onClick={() => setHeaderAction('withdrawal')}
                icon={<ArrowUpCircle className="h-4 w-4" />}
                label="Ausgabe"
                color="red"
              />
              <CashActionButton
                onClick={() => setHeaderAction('pfand')}
                icon={<Recycle className="h-4 w-4" />}
                label="Pfand-Retoure"
                color="teal"
                prominent
              />
            </>
          )}

          {(currentStaff?.role === 'administrator' || (adminUnlocked && currentStaff?.role !== 'employee')) && (
            <>
              <div className="mx-1 h-7 w-px bg-gray-200 dark:bg-gray-700" />
              <TabButton
                active={tab === 'journal'}
                onClick={() => {
                  if (currentStaff?.role === 'administrator') {
                    setManagementAdministrator(currentStaff);
                    setAdminUnlocked(true);
                  }
                  setTab('journal');
                }}
                icon={<Receipt className="h-4 w-4" />}
                label="Journale"
              />
              <TabButton
                active={tab === 'admin'}
                onClick={() => {
                  if (currentStaff?.role === 'administrator') {
                    setManagementAdministrator(currentStaff);
                    setAdminUnlocked(true);
                  }
                  setTab('admin');
                }}
                icon={<Settings className="h-4 w-4" />}
                label="Verwaltung"
              />
            </>
          )}
        </nav>

        {/* Test/Active mode badge */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => setSyncOpen(true)}
            className="flex min-h-10 items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 active:scale-95 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/40"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Synchronisieren</span>
          </button>
          <div role="status" title={online ? 'Cloud erreichbar' : 'Keine Verbindung zur Cloud'} className={`flex h-10 flex-col items-center justify-center rounded-xl border px-3 ${online ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300' : 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300'}`}>
            <span className="flex items-center gap-1 text-xs font-bold leading-4"><Cloud className="h-3.5 w-3.5" /> Cloud</span>
            <span className="text-[9px] font-semibold leading-3 tracking-wide">{testMode ? 'TEST' : 'AKTIV'}</span>
          </div>
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </header>

      {/* Test mode banner */}
      {testMode && (
        <div className="flex items-center justify-center gap-2 bg-amber-50 px-4 py-1.5 text-center text-xs font-medium text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5" />
          Testmodus aktiv — Artikel, Warengruppen und Bilder werden gespeichert und in den aktiven Modus übernommen. Nur Verkäufe und Kassenabschlüsse werden nicht gespeichert.
        </div>
      )}

      {/* Content */}
      <main className="min-h-0 flex-1 overflow-hidden p-2 sm:p-3">
        {tab === 'pos' && (
          <POSScreen
            shotOptions={store.shotOptions}
            categories={store.categories}
            products={store.products}
            activeSession={store.activeSession}
            transactions={store.transactions}
            onCheckout={(tx) => {
              if (!currentStaff) return;
              store.addTransaction({ ...tx, employeeId: currentStaff.id, employeeName: currentStaff.name });
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
                const closingWithdrawal = closingWithdrawalAmount > 0 ? {
                  id: `daily-close-withdrawal-${session.id}`,
                  type: 'withdrawal' as const,
                  amount: closingWithdrawalAmount,
                  reason: 'Entnahme zum Tagesabschluss',
                  timestamp: finalizedAt,
                  isClosingWithdrawal: true,
                  employeeId: currentStaff.id,
                  employeeName: currentStaff.name,
                } : null;
                const finalized = {
                  ...session, closed: true, closedAt: finalizedAt, closedById: currentStaff.id, closedByName: currentStaff.name,
                  entries: closingWithdrawal ? [...session.entries, closingWithdrawal] : session.entries,
                  closingWithdrawalAmount,
                  closingBalance: bal,
                  staffLoginIntervals: finalizedIntervals,
                  dailyCloseReceiptNumber: receipt.number, dailyCloseReceiptLocation: receipt.location, dailyCloseReceiptYear: receipt.year,
                  dailyCloseFinalizedAt: finalizedAt, dailyCloseFinalizedById: currentStaff.id, dailyCloseFinalizedByName: currentStaff.name,
                };
                const frozenTransactions = store.transactions.filter((transaction) => transaction.location === session.location && transaction.timestamp >= session.openedAt && transaction.timestamp <= finalizedAt);
                const snapshot = { transactions: frozenTransactions, finalizedAt, finalizedById: currentStaff.id, finalizedByName: currentStaff.name, staffLoginIntervals: finalizedIntervals };
                store.closeCashSession(session.id, bal, currentStaff, closingWithdrawalAmount, {
                  closedAt: finalizedAt,
                  receipt,
                  snapshot,
                });
                try {
                  await saveJournalPdf(closedSessionReport({ ...finalized, dailyCloseSnapshot: snapshot }, store.transactions, store.categories, currentStaff.name));
                } catch (pdfError) {
                  console.warn('Kasse abgeschlossen; PDF-Export fehlgeschlagen.', pdfError);
                  alert('Der Tagesabschluss wurde gespeichert. Nur der PDF-Export ist fehlgeschlagen. Bitte den Bericht in der Verwaltung erneut exportieren. Die Kasse nicht nochmals abschließen.');
                }
                return { ok: true };
              } catch (error) {
                console.warn('Tagesabschluss ohne Belegnummer abgelehnt.', error);
                return { ok: false, error: `Tagesabschluss nicht durchgeführt: ${readableSyncError(error)} Die aktive Kasse und ihr Bestand bleiben erhalten.` };
              }
            }}
            onEnterAdmin={openManagementFromCashOpening}
            onMoveProduct={(sourceId, targetId) => store.moveProductTo(sourceId, targetId)}
            headerAction={headerAction}
            onHeaderActionConsumed={() => setHeaderAction(null)}
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
            onStaffLogout={handleStaffLogout}
            onDiscardEmptySession={discardUnusedSession}
            openingBalanceSuggestions={openingBalanceSuggestions}
          />
        )}
        {tab === 'admin' && (
          adminUnlocked ? (
            <AdminScreen
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
              pfandSettings={store.pfandSettings}
              onUpdatePfandSettings={store.updatePfandSettings}
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
              onStaffLogin={() => setStaffAdminLoginOpen(true)}
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
        {tab === 'journal' && (
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

function AdminAccessGate({ onManagerSuccess, onStaffLogin, staffUsers, title, access = null }: { onManagerSuccess: (administrator?: StaffUser) => void; onStaffLogin: () => void; staffUsers: StaffUser[]; title: string; access?: OpeningManagementAccess }) {
  const selectedAdministrator = access?.kind === 'selected-administrator' ? access.administrator : null;
  const managerOnly = access?.kind === 'manager-only';
  const employeeDenied = access?.kind === 'employee-denied';
  return <PasswordGate
    onSuccess={onManagerSuccess}
    onStaffLogin={employeeDenied || managerOnly ? undefined : onStaffLogin}
    administrators={selectedAdministrator ? [selectedAdministrator] : managerOnly || employeeDenied ? [] : staffUsers}
    allowManagerPassword={!employeeDenied}
    accessDenied={employeeDenied}
    title={title}
  />;
}

function TabButton({ active, onClick, icon, label, locked }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; locked?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition active:scale-95 ${
        active
          ? 'bg-blue-600 text-white shadow-md'
          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      {locked && <Lock className="h-3 w-3 opacity-60" />}
    </button>
  );
}

function CashActionButton({ onClick, icon, label, color, prominent }: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  color: 'green' | 'orange' | 'teal' | 'violet' | 'red';
  prominent?: boolean;
}) {
  const colorClasses = {
    violet: 'bg-violet-600 text-white hover:bg-violet-700',
    red: 'bg-red-600 text-white hover:bg-red-700',
    green: 'bg-green-600 text-white hover:bg-green-700',
    orange: 'bg-orange-500 text-white hover:bg-orange-600',
    teal: 'bg-teal-600 text-white hover:bg-teal-700',
  };
  return (
    <button
      onClick={onClick}
      className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition active:scale-95 ${colorClasses[color]} ${prominent ? 'shadow-md ring-2 ring-teal-300/50' : 'shadow-sm'}`}
    >
      {icon}
      <span className="hidden md:inline">{label}</span>
    </button>
  );
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
