import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WoodmoHome } from '../src/components/WoodmoHome.tsx';

const open = renderToStaticMarkup(React.createElement(WoodmoHome, {
  onCash: () => {}, onAdmin: () => {}, sessionOpen: false,
  location: 'Friedrichshafen', status: 'ok', testMode: true,
}));
const resumed = renderToStaticMarkup(React.createElement(WoodmoHome, {
  onCash: () => {}, onAdmin: () => {}, sessionOpen: true,
  location: 'Bregenz', status: 'error', testMode: false,
}));
assert.equal((open.match(/<button\b/g) ?? []).length, 2, 'Home offers exactly two main tiles');
assert.match(open, /Kasse eröffnen/);
assert.match(open, /Verwaltung/);
assert.match(open, /Administrator/);
assert.match(resumed, /Kasse fortsetzen/);
assert.match(resumed, /Bregenz/);
assert.match(resumed, /Cloud \/ Abgleich prüfen/);

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
