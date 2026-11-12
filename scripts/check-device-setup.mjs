import assert from 'node:assert/strict';
import { readDeviceSetup, saveDeviceSetup } from '../src/lib/deviceSetup.ts';

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.has(key) ? values.get(key) : null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
  clear: () => values.clear(),
};
assert.equal(readDeviceSetup(), null, 'Erstinstallation darf keine fertige Konfiguration vortäuschen');
const folder = saveDeviceSetup('folder', 'Mein Archiv');
assert.equal(folder.archiveMode, 'folder');
assert.equal(readDeviceSetup()?.folderLabel, 'Mein Archiv');
assert.equal(readDeviceSetup()?.version, 1);
const downloads = saveDeviceSetup('downloads');
assert.equal(downloads.archiveMode, 'downloads');
assert.equal(readDeviceSetup()?.folderLabel, undefined, 'Umstellung auf Downloads darf alten Ordnernamen nicht weiter anzeigen');
const key = 'woodmo_v3_device_setup_v1';
values.set(key, '{"version":1,"archiveMode":"folder","configuredAt":"kaputt"}');
assert.equal(readDeviceSetup(), null, 'Ungültige Einstellungen müssen erneut eingerichtet werden');
values.set(key, '{bad json}');
assert.equal(readDeviceSetup(), null);
values.set(key, JSON.stringify({version:9,archiveMode:'folder',configuredAt:123}));
assert.equal(readDeviceSetup(), null, 'Unbekannte Setup-Version muss explizit migriert werden');
console.log('GERAETE-SETUP-REGELTESTS BESTANDEN.');
