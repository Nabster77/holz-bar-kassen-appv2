import { register } from 'tsx/esm/api';
import { fileURLToPath } from 'node:url';

// URL.pathname is not a valid native path on Windows (e.g. /C:/... -> C:\C:\...).
// fileURLToPath converts file: URLs correctly on Windows, Linux and macOS.
const tsconfig = fileURLToPath(new URL('../tsconfig.app.json', import.meta.url));
const unregister = register({ tsconfig });
try {
  await import('./check-catalog-transfer.ts');
} finally {
  unregister();
}
