import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// The application uses Vite's automatic JSX runtime. Inspect source directly
// instead of mounting JSX under Node's different default loader.
const home = readFileSync('src/components/WoodmoHome.tsx','utf8');
assert.equal((home.match(/<button type="button" onClick=/g) ?? []).length, 2,
  'Home has exactly two main tiles.');
for (const label of ['Kasse eröffnen', 'Kasse fortsetzen', 'Verwaltung',
  'Administrator', 'Cloud / Abgleich prüfen']) {
  assert.ok(home.includes(label), `Home text missing: ${label}`);
}

const app = readFileSync('src/App.tsx', 'utf8');
const pos = readFileSync('src/components/POS/POSScreen.tsx', 'utf8');
const cashOpen = readFileSync('src/components/POS/CashOpeningDialog.tsx','utf8');
const cart = readFileSync('src/components/POS/CartItemRow.tsx','utf8');

assert.match(app, /const \[homeVisible, setHomeVisible\] = useState\(true\)/,
  'Start screen must be the initial route');
assert.match(app, /posVisited && \(/, 'POS stays mounted once it has been entered');
assert.match(app, /homeVisible \|\| tab !== 'pos' \? 'hidden' : 'h-full min-h-0'/,
  'The POS is hidden, not unmounted, when navigating Home/Admin');
assert.match(app, /onHome=\{goHome\}/);
assert.match(cashOpen, /onClick=\{onClose\}/,
  'Cash opening has a way back Home');
assert.match(cashOpen, /Zur Startseite/);
assert.match(app, /onAdmin=\{\(\) => openManagementFromCashOpening/,
  'Admin tile must enter original credential gate');
assert.match(app, /setOpeningManagementAccess\(null\)/,
  'Personal admin passwords must be possible');
assert.match(app, /persistFinalizedCashSession\(closed\)/,
  'Finalized close remains cloud-confirmed');
assert.match(app, /await saveJournalPdf\(/,
  'Local close PDF retention remains enabled');
assert.match(pos, /sm:grid-cols-\[minmax\(0,1\.85fr\)_minmax\(220px,1fr\)\]/,
  'Portrait tablet left/right split must be defined');
assert.match(pos, /Warengruppen<\/h2>/);
assert.match(pos, /aria-pressed=\{activeCat === cat.id && !search\}/,
  'Category selection must remain visible');
assert.match(pos, /requestDailyClose\(\)/,
  'The original daily-close confirmation path must stay wired');
assert.match(cart, /onEditShot/);
assert.match(cart, /onInc/);
assert.match(cart, /onDec/);
assert.match(cart, /onRemove/);
console.log('V3-LAYOUT: Home mit zwei Kacheln, Login/Home, Warenkorb-Erhalt bei Navigation, 65/35-Aufteilung und Kassenfunktionen geprüft.');
