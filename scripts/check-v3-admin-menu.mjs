import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync('src/App.tsx', 'utf8');
const admin = readFileSync('src/components/Admin/AdminScreen.tsx', 'utf8');
const brand = readFileSync('src/components/WoodmoBrand.tsx', 'utf8');
const style = readFileSync('src/index.css', 'utf8');

const header = app.slice(app.indexOf('<header className='), app.indexOf('</header>'));
const logoIndex = header.indexOf('<WoodmoBrand');
const titleIndex = header.indexOf('<h1');
const homeIndex = header.indexOf('aria-label="Zur Startseite"');
const menuIndex = header.indexOf("aria-label={tab === 'admin'");
const syncIndex = header.indexOf('aria-label="Cloud synchronisieren"');
const statusIndex = header.indexOf('title={!online ?');
assert(logoIndex >= 0 && logoIndex < titleIndex && titleIndex < homeIndex &&
  homeIndex < menuIndex && menuIndex < syncIndex && syncIndex < statusIndex,
  'Brand/title/Home/menu must be on left; Sync and Cloud remain on right.');
assert.match(header, /tab === 'pos' \? 'Kasse' : tab === 'admin' \? 'Verwaltung' : 'Journal'/);
assert.match(header, /!online \? 'woodmo-heading-offline text-red-400' : 'text-white'/);
assert.match(app, /menuOpen=\{menuOpen\}/);
assert.match(app, /onCloseMenu=\{\(\) => setMenuOpen\(false\)\}/);
assert.match(app, /onOpenJournal=\{\(\) => navigateToProtected\('journal'\)\}/);
assert.match(app, /menuOpen && \(tab !== 'admin' \|\| !adminUnlocked\)/,
  'Original cash register menu must not overlay the admin menu.');
assert.match(app, /adminUnlocked \? \(/,
  'Menu actions must remain protected behind the administrator login.');

assert.match(admin, /useState<'sessions' \| 'categories' \| 'products' \| 'shots' \| 'staff'>\('sessions'\)/,
  'The administrative entry view must remain cash overview.');
for (const item of [
  'Verwaltungsbereiche','Kassen-Übersicht','Warengruppen','Artikel','SCHUSS','Benutzer','Journal',
  'App-Einstellungen','Setup / PDF-Ordner','Auf Testmodus wechseln',
  'Import / Export','Excel-Import / Export','Backup importieren','Backup exportieren','Buchungen zurücksetzen'
]) assert(admin.includes(item), `Missing existing administrative action: ${item}`);
assert(!admin.includes('className="mb-3 flex flex-wrap items-center justify-between gap-2"'),
  'The old admin tab/action bar must not take vertical space.');
assert.match(admin, /\{menuOpen && \(/);
assert.match(admin, /<ResetConfirmDialog/,
  'Reset remains behind its original safety confirmation.');
assert.match(admin, /if \(tab !== 'shots' \|\| !shotDraftDirty\) return true/,
  'SCHUSS draft guard must remain in place.');
assert.match(admin, /if \(!window.confirm\('Ungespeicherte SCHUSS-/,
  'Leaving SCHUSS requires confirmation.');
assert.match(admin, /if \(tab === 'shots' && shotDraftDirty\)/,
  'Modal actions must not silently lose SCHUSS drafts.');

assert.match(style, /\.woodmo-brand-ok \{ animation:/);
assert.match(style, /\.woodmo-brand-error \{/);
assert.match(style, /rgba\(255,70,70,1\)/);
assert.match(style, /rgba\(110,255,188,1\)/);
assert.match(style, /prefers-reduced-motion: reduce/);
assert.match(brand, /woodmo-brand-ok/);
assert.match(brand, /woodmo-brand-error/);

console.log('V3-VERWALTUNG: kompaktes Header-Menue, Rollenfreigabe, Bereiche, App-Einstellungen, Import/Export, sichere Bestaetigungen und Cloud-Halo kontrolliert.');
