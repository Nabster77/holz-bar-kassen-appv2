const MODE_KEY = 'pos_test_mode';

// Set once at module load from localStorage so the flag is correct before
// any component (e.g. useStore) reads from storage on initial render.
let testModeActive = false;
try {
  testModeActive = localStorage.getItem(MODE_KEY) === 'true';
} catch {
  // localStorage unavailable — default to active (real) mode
}

export function isTestMode(): boolean {
  return testModeActive;
}

export function setTestMode(active: boolean): void {
  testModeActive = active;
  try {
    localStorage.setItem(MODE_KEY, String(active));
  } catch {
    // ignore
  }
}

export const STORAGE_KEYS = {
  categories: 'pos_categories',
  products: 'pos_products',
  transactions: 'pos_transactions',
  theme: 'pos_theme',
  cashSessions: 'pos_cash_sessions',
  selectedLocation: 'pos_selected_location',
  pfandSettings: 'pos_pfand_settings',
  cloudBackfilled: 'pos_cloud_backfilled',
  catalogSync: 'pos_catalog_sync',
  catalogBackupPrefix: 'pos_catalog_backup_',
  bookingResetAt: 'pos_booking_reset_at',
} as const;

// In test mode, bookings (transactions + cash sessions) are ephemeral:
// they live only in memory for the current session and are never persisted.
// Articles, categories, images and other settings ARE persisted so that
// everything configured in test mode carries over when switching to active mode.
const EPHEMERAL_KEYS: ReadonlySet<string> = new Set([
  STORAGE_KEYS.transactions,
  STORAGE_KEYS.cashSessions,
]);

export function loadJSON<T>(key: string, fallback: T): T {
  if (testModeActive && EPHEMERAL_KEYS.has(key)) return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJSON<T>(key: string, value: T): void {
  if (testModeActive && EPHEMERAL_KEYS.has(key)) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable — silently ignore
  }
}

// Clears persisted bookings so active mode starts with a clean slate.
// Called when switching from test to active mode.
export function clearBookings(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.transactions);
    localStorage.removeItem(STORAGE_KEYS.cashSessions);
  } catch {
    // ignore
  }
}
