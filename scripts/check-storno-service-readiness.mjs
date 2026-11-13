import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync('src/App.tsx','utf8');
const pos = readFileSync('src/components/POS/POSScreen.tsx','utf8');
const ledger = readFileSync('src/hooks/useStornoLedger.ts','utf8');
const cloud = readFileSync('src/lib/stornoCloud.ts','utf8');
const edge = readFileSync('supabase/functions/woodmo-v3-storno/index.ts','utf8');

assert.match(edge,/input\.action === 'health'/,'Edge must answer health only without creating a storno');
assert.match(edge,/getUser\(token\)/,'Edge must verify genuine Cloud JWT in readiness check');
assert.match(edge,/from\('pos_stornos'\)/,'Health must check protected ledger read');
assert.match(edge,/ready: true, version: 'woodmo-v3-storno-health-1'/);
assert.match(cloud,/function verifyStornoService\(/);
assert.match(cloud,/body: \{ action: 'health' \}/);
assert.match(cloud,/version !== 'woodmo-v3-storno-health-1'/);
assert.match(cloud,/Storno-Serverdienst nicht verfügbar/);
assert.match(ledger,/serviceReady, serviceError/);
assert.match(ledger,/void verifyStornoService\(\)/);
assert.match(app,/stornoLedger\.status !== 'ready' \|\| !stornoLedger\.serviceReady/);
assert.match(app,/stornoServiceReady=\{stornoLedger\.serviceReady\}/);
assert.match(pos,/cloudReady=\{stornoStatus === 'ready' && stornoServiceReady\}/);
// No dependency on the unavailable writer may block a normal, complete
// cash close that has read the immutable Storno ledger successfully.
const close=app.slice(app.indexOf('onCloseCash={async'),app.indexOf('stornos={stornoLedger.records}',app.indexOf('onCloseCash={async')));
assert.match(close,/stornoLedger\.status !== 'ready'/);
assert.doesNotMatch(close,/serviceReady/);
assert.match(close,/prepareFinalCloseStornoSnapshot/);
console.log('V3-STORNO-BEREITSCHAFT: nicht erreichbarer Edge-Dienst sperrt nur echtes Storno, niemals einen ledgergeprueften normalen Tagesabschluss.');
