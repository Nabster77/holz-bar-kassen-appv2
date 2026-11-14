import { register } from 'tsx/esm/api';
import { fileURLToPath } from 'node:url';

// Use the app's TypeScript aliases for real image import/export modules.
const tsconfig=fileURLToPath(new URL('../tsconfig.app.json',import.meta.url));
const unregister=register({tsconfig});
try {
  await import('./check-v3-image-backup.mjs');
} finally {
  unregister();
}
