import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tile = readFileSync('src/components/POS/ProductTile.tsx', 'utf8');

// The confirmed WOODMO visual: a square card where the square source photo
// fills the entire tile. On 800×800 source photos aspect-square+cover does NOT
// crop the subject. A dark caption overlays the lower part of the SAME image.
assert.match(tile, /aspect-square/);
assert.match(tile, /className="absolute inset-0 h-full w-full object-cover object-center"/);
assert.doesNotMatch(tile, /object-contain|bg-gray-50 p-2/);
assert.match(tile, /absolute inset-x-0 bottom-0/);
assert.match(tile, /bg-slate-950\/85/);
assert.match(tile, /text-white backdrop-blur/);
assert.match(tile, /text-sm font-bold leading-tight text-white sm:text-base/);
assert.match(tile, /text-blue-400 sm:text-base/);
assert.match(tile, /text-xs font-medium leading-tight text-slate-200/);
assert.match(tile, /product\.hasShot/);
assert.match(tile, /product\.isPfandArticle/);
assert.match(tile, /taxRateForProduct\(product, location\)/);
assert.match(tile, /alt=\{product.name\}/);
assert.match(tile, /formatCurrency\(price\)/);
assert.match(tile, /disabled=\{isDisabled\}/);
assert.match(tile, /dragMode/);
console.log('ARTIKELBILDER: quadratisches Vollbild, randlos, kontrastreiche Preis/Pfand-Texte und Touch-/Drag-Funktionen geprüft.');
