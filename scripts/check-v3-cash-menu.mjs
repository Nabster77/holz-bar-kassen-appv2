import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync('src/App.tsx','utf8');
const pos = readFileSync('src/components/POS/POSScreen.tsx','utf8');
const open = readFileSync('src/components/POS/CashOpeningDialog.tsx','utf8');

const header = app.slice(app.indexOf('<header className='), app.indexOf('</header>'));
const menu = app.slice(app.indexOf('aria-label="Kassenmenü"'), app.indexOf('</nav>',app.indexOf('aria-label="Kassenmenü"')));
const cartActions = pos.slice(pos.indexOf('{/* Right: cart */}'),pos.indexOf('{/* Dialogs */}'));

assert(header.includes('setCashierLoginRequest((n) => n + 1)'),
  'Shared header control triggers staff login');
assert(header.includes("currentStaff ? void handleStaffLogout() : setCashierLoginRequest"),
  'One button toggles between login and the original secure logout');
assert(header.includes("'Mitarbeiter abmelden' : 'Mitarbeiter anmelden'"));
assert(header.includes("currentStaff ? <LogOut") && header.includes(": <LogIn"));
assert(header.indexOf("aria-label={currentStaff ? 'Mitarbeiter abmelden'") <
  header.indexOf('aria-label="Cloud synchronisieren"'),
  'Login/logout control is immediately left of green Cloud buttons');
assert(pos.includes('loginRequest: number') && pos.includes('loginRequest={cashierLoginRequest}') === false);
assert(app.includes('loginRequest={cashierLoginRequest}'));
assert(app.includes('if (!store.activeSession || !currentStaff) setCashierLoginRequest((n) => n + 1)'), 'Home tile reopens cashier login');
assert(pos.includes('if (!activeSession || !currentStaff) setShowOpenDialog(true)'),
  'Header login must open existing protected login dialog');
assert(!pos.includes('Small operational strip') &&
  !pos.includes('formatDateLong(activeSession.openedAt)'),
  'Redundant POS location/date/staff strip must be removed');
assert(header.includes('headerDateLong(headerNow)') &&
  header.includes('headerDateShort(headerNow)') &&
  header.includes('store.activeSession?.location ?? store.selectedLocation'),
  'POS toolbar shows current local shop date and correct active location');
assert(header.includes('min-[1500px]:inline') &&
  header.includes('min-[1100px]:inline min-[1500px]:hidden') &&
  header.includes('min-[1100px]:hidden') &&
  header.includes('min-[700px]:flex-1'),
  'Long German date becomes shorter based on viewport width, never clipped over controls');
assert(header.includes('Angemeldeter Mitarbeiter:') &&
  header.includes('currentStaff.name') && header.includes('<UserRound') &&
  header.indexOf('aria-label={currentStaff ? \'Mitarbeiter abmelden\'') <
    header.indexOf('Angemeldeter Mitarbeiter:'),
  'Operator label is clear, beside the existing logout control');
assert(header.includes('aria-label="Kasse eröffnen"') &&
  header.includes("tab === 'pos' && !store.activeSession") &&
  header.includes('setCashierLoginRequest((request) => request + 1)'),
  'Compact opening shortcut beside menu appears only without an open till');
assert(pos.includes('{showOpenDialog && (') && !pos.includes('{(showOpenDialog || !activeSession) && ('),
  'Logout must not automatically summon the login modal');

assert(cartActions.includes('<span>Pfand-Retoure</span>'),
  'Deposit return must be a persistent touch action in the cart header');
assert(cartActions.includes('onClick={() => setShowPfandRetoure(true)}'));
assert(cartActions.includes('disabled={!activeSession || !currentStaff}'));
assert(cartActions.includes('Bonliste / Storno'),'Storno button must be visible next to deposit return');
assert(pos.includes('showPfandRetoure && activeSession && currentStaff'),
  'The old protected deposit-return dialog is only open during authorized sales');
assert(pos.includes('<PfandRetoureDialog') && pos.includes('addPfandRetoureToCart(amount, count)'),
  'Deposit return still enters existing cart accounting path');

assert(menu.indexOf('Startseite') < menu.indexOf('> Kasse'),
  'Startseite appears first alongside Kasse in the menu');
assert(menu.indexOf('> Kasse') < menu.indexOf('> Journal') &&
       menu.indexOf('> Journal') < menu.indexOf('> Verwaltung'),
  'The menu navigation is Kasse, Journal, Verwaltung');
assert(menu.includes("currentStaff?.role === 'administrator'") && menu.includes("adminUnlocked"),
  'Journal and administration remain access restricted');
assert(!menu.includes('Pfand-Retoure'), 'Deposit return is not in the popup menu');
assert(menu.includes('> Bestandskorrektur'));
assert(!menu.includes('> Anfangsbestand'));
assert(menu.includes('LockKeyhole') && menu.includes('Tagesabschlussbuchung vornehmen') &&
  !menu.includes('Nach Bestätigung unwiderruflich') && menu.includes('min-h-24 w-full'),
  'Day-close menu tile is larger with approachable text; actual confirmation still applies');
assert(menu.includes('grid-cols-2 sm:grid-cols-4') && menu.includes('<Home className="h-6 w-6" />'),
  'Employee menu shows balanced Home and Kasse tiles; administrator sees all four');
assert(menu.includes("chooseCashAction('close')") && pos.includes('requestDailyClose()'),
  'Day close still uses the existing confirmation dialog');
assert(pos.includes('<DailyCloseDialog') && app.includes('persistFinalizedCashSession(closed)'),
  'Cloud-confirmed final close path stays untouched');

assert(open.includes('if (openingBusy || !selectedStaff || !staffAuthenticated) return;') &&
  open.includes('if (!existingSession && !canOpenWithBalance) return;') &&
  open.includes('await onSave(location, parsedOpeningBalance);'),
  'Re-login and cash opening await the confirmed handler without jumping Home');
assert(pos.includes('if (!activeSession) { const ok = await onOpenCash(loc, bal); if (!ok) return false; }') &&
  pos.includes('setShowOpenDialog(false); return true;'),
  'Re-login does not open a new session; failed cloud preflight keeps login dialog open');
assert(open.includes("existingSession ? 'Mitarbeiter anmelden' : 'Kasseneröffnung'"));
console.log('V3-KASSENMENUE: Einzelner Login/Logout-Knopf, Pfand im Verkauf, Startseite/Kasse nebeneinander, Navigation, Bestandskorrektur und gesicherter Tagesabschluss geprüft.');
