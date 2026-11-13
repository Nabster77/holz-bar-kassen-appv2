import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pos = readFileSync('src/components/POS/POSScreen.tsx','utf8');
const search = pos.slice(pos.indexOf('{/* Search bar:'), pos.indexOf('{/* Product grid */}'));
const cart = pos.slice(pos.indexOf('{/* Right: cart */}'),pos.indexOf('{/* Dialogs */}'));
assert(search.includes('Artikel suchen...'));
assert(!search.includes('setShowPfandRetoure(true)') && !search.includes('setShowBonliste(true)'),
  'Pfand and Storno actions must not take space away from product search');
assert(cart.includes('<h2 className="font-bold text-gray-900 dark:text-gray-100">Warenkorb</h2>'));
assert(cart.indexOf('Warenkorb</h2>')<cart.indexOf('setShowPfandRetoure(true)'));
assert(cart.indexOf('setShowPfandRetoure(true)')<cart.indexOf('setShowBonliste(true)'));
assert(cart.includes('Pfand-Retoure'));
assert(cart.includes('Bonliste / Storno'));
assert(cart.includes('grid grid-cols-2 gap-2'),'Always display both touch actions side by side');
assert((cart.match(/min-h-12 min-w-0/g)||[]).length>=2,'Both buttons need generous touch targets');
assert((cart.match(/disabled=\{!activeSession \|\| !currentStaff\}/g)||[]).length>=2);
assert(pos.includes('<PfandRetoureDialog'));
assert(pos.includes('<BonlisteDialog'));
assert(pos.includes('onCommit={onCommitStorno}'));
console.log('Warenkorb: Pfand-Retoure und Bonliste/Storno sichtbar, gut erreichbar, sicher gesperrt ohne Kasse und weiterhin korrekt verdrahtet.');
