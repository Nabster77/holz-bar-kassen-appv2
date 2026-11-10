import { register } from 'tsx/esm/api';
const unregister = register({tsconfig: new URL('../tsconfig.app.json',import.meta.url).pathname});
try { await import('./check-catalog-transfer.ts'); } finally { await unregister(); }
