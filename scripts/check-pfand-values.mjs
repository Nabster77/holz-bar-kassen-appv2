import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePfandAmount, pfandCloudMatches } from '../src/lib/pfandValidation.ts';

for (const [value, result] of [['2', 2], ['2,00', 2], ['2.00', 2],
  ['0', 0], ['0,25', .25], ['12,34', 12.34], [' 5,5 ', 5.5]]) {
  assert.equal(parsePfandAmount(value), result, `Pfand ${value}`);
}
for (const invalid of ['', ' ', '-1', '-0,01', '2,001', '2.000', 'abc', '1abc',
  '1,2,3', 'Infinity', 'NaN', '1.234,56', '12345678901234567890']) {
  assert.equal(parsePfandAmount(invalid), null, `Ungueltiger Pfandwert ${invalid}`);
}
const rows = [
  {kind:'category', id:'beverages', data:{name:'Drinks'},updated_at:1,deleted:false},
  {kind:'setting', id:'pfand', data:{Bregenz:3,Friedrichshafen:3}, updated_at:2,deleted:false},
];
assert.equal(pfandCloudMatches(rows, {Friedrichshafen:2,Bregenz:2}),false);
assert.equal(pfandCloudMatches(rows, {Friedrichshafen:3,Bregenz:3}),true);
assert.equal(pfandCloudMatches([{...rows[1],deleted:true}],{Friedrichshafen:3,Bregenz:3}),false);
assert.equal(pfandCloudMatches([{...rows[1],data:{Bregenz:2,Friedrichshafen:3}}],{Friedrichshafen:3,Bregenz:3}),false);
assert.equal(pfandCloudMatches([{...rows[1],data:{Bregenz:'3',Friedrichshafen:3}}],{Friedrichshafen:3,Bregenz:3}),false);

const app=readFileSync('src/App.tsx','utf8');
const admin=readFileSync('src/components/Admin/AdminScreen.tsx','utf8');
const store=readFileSync('src/hooks/useStore.ts','utf8');
const engine=readFileSync('src/hooks/useCatalogSync.ts','utf8');
const home=readFileSync('src/components/WoodmoHome.tsx','utf8');
const watermark=readFileSync('public/woodmo-cashmark-no-text.svg','utf8');

assert.match(app, /pfandCloudMatches\(await fetchCatalogRows\(\), settings\)/, 'Only read-back confirmation counts');
assert.match(app, /if \(testMode\) return 'local'/, 'Test mode never reports cloud success');
assert.match(app, /onUpdatePfandSettings=\{savePfandAndVerify\}/);
assert.match(admin, /Cloud gespeichert und überprüft/);
assert.match(admin, /Lokal übernommen, aber nicht in der Cloud bestätigt/);
assert.match(admin, /Nicht gespeichert|Noch nicht gespeichert/);
assert.match(admin, /onKeyDown=\{\(e\) => \{ if \(e\.key === 'Enter'\)/);
assert.doesNotMatch(admin, /onBlur=\{savePfandSettings\}/, 'Blur must not silently auto-write');
assert.match(store, /saveJSON\(STORAGE_KEYS.pfandSettings, pfandSettings\)/);
assert.match(store, /if \(product.isPfandArticle\) return pfandSettings\[loc\]/);
assert.match(engine, /if \(testModeRef.current\) return \{ ok: false/);
assert.doesNotMatch(watermark, /WOODMO|Version 3\.0/i, 'Watermark asset has no text');
assert.match(home, /woodmo-cashmark-no-text\.svg/);
assert.doesNotMatch(home, /<WoodmoBrand/, 'No large logo above home tiles');
assert.match(home, /Kassen-App · Version 3\.0/);
assert.equal((home.match(/<button type="button" onClick=/g)||[]).length,2);
console.log('PFAND V3: exakte Centwerte, Fehlerfaelle, beide Standorte, Cloud-Readback, Testmodus, Enter und WOODMO-Startseite bestanden.');
