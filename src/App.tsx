import { useCallback, useEffect, useState } from 'react';
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
import { changeManagerPassword, resetManagerPassword } from '@/lib/managerAuth';
import { supabase } from '@/lib/supabaseClient';
import type { StaffUser } from '@/types';
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
import { isTestMode, setTestMode, clearBookings, loadJSON, saveJSON, STORAGE_KEYS } from '@/lib/storage';
import { formatDateISO } from '@/lib/format';
import {
  ShoppingCart, Settings, Receipt, Sun, Moon, Lock,
  ArrowDownCircle, ArrowUpCircle, Recycle, MonitorDot,
  FlaskConical, CheckCircle2, AlertTriangle, RefreshCw, UserCheck,
} from 'lucide-react';

type Tab = 'pos' | 'admin' | 'journal';
type HeaderAction = 'deposit' | 'withdrawal' | 'pfand' | null;

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
    testMode,
    applyRows: store.applyCatalogRows,
  });
  const { online, syncNow } = useCloudSync(
    store.transactions,
    store.cashSessions,
    testMode,
    () => setSyncedAt(Date.now()),
    store.mergeCloudData,
    catalog.syncCatalog,
    store.applyCloudBookingReset,
  );

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
    await staff.resetAll();
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
    if (nextTab === 'pos') {
      setAdminUnlocked(false);
      setManagementAdministrator(null);
    }
    setTab(nextTab);
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
    setCurrentStaff(user);
    setLastStaffId(user.id);
    saveJSON(STORAGE_KEYS.lastStaffId, user.id);
    recordStaff('login', user);
  }

  function handleStaffLogout() {
    if (currentStaff) recordStaff('logout', currentStaff);
    setCurrentStaff(null);
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-gray-100 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2.5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
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

        <div className="h-7 w-px bg-gray-200 dark:bg-gray-700" />

        {/* Tabs + Cash actions */}
        <nav className="flex items-center gap-1">
          <TabButton active={tab === 'pos'} onClick={() => navigateTo('pos')} icon={<ShoppingCart className="h-4 w-4" />} label="Kasse" />

          {/* Cash management buttons - only when on POS tab and session is open */}
          {tab === 'pos' && store.activeSession && currentStaff && (
            <>
              <div className="mx-1 h-7 w-px bg-gray-200 dark:bg-gray-700" />
              <CashActionButton
                onClick={() => setHeaderAction('deposit')}
                icon={<ArrowDownCircle className="h-4 w-4" />}
                label="Einlage"
                color="green"
              />
              <CashActionButton
                onClick={() => setHeaderAction('withdrawal')}
                icon={<ArrowUpCircle className="h-4 w-4" />}
                label="Ausgabe"
                color="orange"
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

          <div className="mx-1 h-7 w-px bg-gray-200 dark:bg-gray-700" />

          <TabButton active={tab === 'journal'} onClick={() => navigateTo('journal')} icon={<Receipt className="h-4 w-4" />} label="Journale" locked={!adminUnlocked} />
          <TabButton active={tab === 'admin'} onClick={() => navigateTo('admin')} icon={<Settings className="h-4 w-4" />} label="Verwaltung" locked={!adminUnlocked} />
        </nav>

        {/* Test/Active mode badge */}
        <div className="ml-auto flex items-center gap-2">
          {signedInUser && (
            <div
              title={`Angemeldet als ${signedInUser}`}
              className="flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400"
            >
              <UserCheck className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{signedInUser}</span>
            </div>
          )}
          <button
            onClick={() => setSyncOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 active:scale-95 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/40"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Synchronisieren</span>
          </button>
          <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${testMode ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
            {testMode ? <FlaskConical className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{testMode ? 'TESTMODUS' : 'AKTIV'}</span>
          </div>
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
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
      <main className="min-h-0 flex-1 overflow-hidden p-3">
        {tab === 'pos' && (
          <POSScreen
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
            onCloseCash={(bal) => {
              const session = store.activeSession;
              if (!session || !currentStaff) return;
              store.closeCashSession(session.id, bal, currentStaff);
              void saveJournalPdf(closedSessionReport({ ...session, closed: true, closedAt: Date.now() }, store.transactions, store.categories, currentStaff.name)).catch(() =>
                alert('Der Tagesbericht-PDF konnte nicht erstellt werden. Er kann im Journal nachträglich exportiert werden.'),
              );
            }}
            onEnterAdmin={() => navigateTo('admin')}
            onMoveProduct={(sourceId, targetId) => store.moveProductTo(sourceId, targetId)}
            headerAction={headerAction}
            onHeaderActionConsumed={() => setHeaderAction(null)}
            selectedLocation={store.selectedLocation}
            pfandSettings={store.pfandSettings}
            staffUsers={staff.users}
            currentStaff={currentStaff}
            online={online}
            onStaffAuthenticated={handleStaffAuthenticated}
            onSetStaffPassword={staff.setPassword}
            onResetStaffPassword={staff.resetPassword}
            lastStaffId={lastStaffId}
            onStaffLogout={handleStaffLogout}
          />
        )}
        {tab === 'admin' && (
          adminUnlocked ? (
            <AdminScreen
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
              onAddProduct={store.addProduct}
              onUpdateProduct={store.updateProduct}
              onDeleteProduct={store.deleteProduct}
              onReorderProduct={store.reorderProduct}
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
              onExportBackup={() => {
                const payload = store.exportBackup();
                const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `kasse-backup-${formatDateISO(Date.now())}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
              onImportBackup={async (file) => {
                try {
                  const text = await file.text();
                  const parsed = JSON.parse(text);
                  if (!parsed || typeof parsed !== 'object' || !parsed.data) {
                    alert('Ungültige Backup-Datei: Format nicht erkannt.');
                    return;
                  }
                  store.importBackup(parsed);
                  alert('Backup erfolgreich importiert. Die Daten wurden ergänzt.');
                } catch {
                  alert('Backup-Datei konnte nicht gelesen werden.');
                }
              }}
            />
          ) : (
            <AdminAccessGate onManagerSuccess={(administrator) => { setManagementAdministrator(administrator ?? null); setAdminUnlocked(true); }} onStaffLogin={() => setStaffAdminLoginOpen(true)} staffUsers={staff.users} title="Verwaltung" />
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
          onSetPassword={staff.setPassword}
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

function AdminAccessGate({ onManagerSuccess, onStaffLogin, staffUsers, title }: { onManagerSuccess: (administrator?: StaffUser) => void; onStaffLogin: () => void; staffUsers: StaffUser[]; title: string }) {
  return <PasswordGate onSuccess={onManagerSuccess} onStaffLogin={onStaffLogin} administrators={staffUsers} title={title} />;
}

function TabButton({ active, onClick, icon, label, locked }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; locked?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition active:scale-95 ${
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
  color: 'green' | 'orange' | 'teal';
  prominent?: boolean;
}) {
  const colorClasses = {
    green: 'bg-green-600 text-white hover:bg-green-700',
    orange: 'bg-orange-500 text-white hover:bg-orange-600',
    teal: 'bg-teal-600 text-white hover:bg-teal-700',
  };
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition active:scale-95 ${colorClasses[color]} ${prominent ? 'shadow-md ring-2 ring-teal-300/50' : 'shadow-sm'}`}
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
