import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync('src/App.tsx','utf8');
const pos = readFileSync('src/components/POS/POSScreen.tsx','utf8');
const open = readFileSync('src/components/POS/CashOpeningDialog.tsx','utf8');

const header = app.slice(app.indexOf('<header className='), app.indexOf('</header>'));
const menu = app.slice(app.indexOf('aria-label="Kassenmenü"'), app.indexOf('</nav>',app.indexOf('aria-label="Kassenmenü"')));
const toolbar = pos.slice(pos.indexOf('Small operational strip'),pos.indexOf('Portrait tablet:'));
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
assert(!toolbar.includes('>Mitarbeiter anmelden</button>'),
  'No additional employee login button in POS strip');
assert(toolbar.includes('Oben Anmelden wählen'),
  'Cashier login is delegated to the shared header control');
assert(toolbar.includes('Kasse eröffnen'),
  'Opening an unstarted register remains possible for an authenticated cashier');
assert(!toolbar.includes('onClick={() => void requestDailyClose()}'),
  'Day close must live in menu only');
assert(!toolbar.includes('Tagesabschluss'));
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
  'The centred Startseite button is first in the menu');
assert(menu.indexOf('> Kasse') < menu.indexOf('> Journal') &&
       menu.indexOf('> Journal') < menu.indexOf('> Verwaltung'),
  'The menu navigation is Kasse, Journal, Verwaltung');
assert(menu.includes("currentStaff?.role === 'administrator'") && menu.includes("adminUnlocked"),
  'Journal and administration remain access restricted');
assert(!menu.includes('Pfand-Retoure'), 'Deposit return is not in the popup menu');
assert(menu.includes('> Bestandskorrektur'));
assert(!menu.includes('> Anfangsbestand'));
assert(menu.includes('LockKeyhole') && menu.includes('<span>Tagesabschluss</span>') &&
  menu.includes('Nach Bestätigung unwiderruflich'),
  'Irreversible day close has a visible locked warning in the popup');
assert(menu.includes("chooseCashAction('close')") && pos.includes('requestDailyClose()'),
  'Day close still uses the existing confirmation dialog');
assert(pos.includes('<DailyCloseDialog') && app.includes('persistFinalizedCashSession(closed)'),
  'Cloud-confirmed final close path stays untouched');

assert(open.includes('if (selectedStaff && staffAuthenticated) onSave(location, parsedOpeningBalance)'),
  'Re-login resumes the active cash session without jumping to Home');
assert(pos.includes('onSave={(loc, bal) => { if (!activeSession) onOpenCash(loc, bal); setShowOpenDialog(false); }}'),
  'Re-login never reopens or overwrites the existing cash session');
assert(open.includes("existingSession ? 'Mitarbeiter anmelden' : 'Kasseneröffnung'"));
console.log('V3-KASSENMENUE: Einzelner Login/Logout-Knopf, Pfand im Verkauf, Startseite oben, Navigation, Bestandskorrektur und gesicherter Tagesabschluss geprüft.');
