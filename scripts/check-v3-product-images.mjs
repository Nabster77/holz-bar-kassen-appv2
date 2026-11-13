import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tile = readFileSync('src/components/POS/ProductTile.tsx','utf8');
assert.match(tile, /className="h-full w-full object-contain"/,
  'Product pictures must be entirely visible, not cropped.');
assert.doesNotMatch(tile, /object-cover/,
  'Cropping square uploaded product photos is not allowed.');
assert.match(tile, /bg-gray-50 p-2/,
  'Protect photo edges against overlaid badges and borders.');
assert.match(tile, /lg:h-32/,
  'Photo area needs enough height for a complete 800 × 800 image.');
assert.match(tile, /alt=\{product.name\}/);
assert.match(tile, /formatCurrency\(price\)/);
assert.match(tile, /disabled=\{isDisabled\}/);
assert.match(tile, /product\.isPfandArticle/);
console.log('ARTIKELBILDER: vollständig skaliert, kein Abschneiden, Pfand- und Preisangaben sowie Touchkachel bleiben erhalten.');
