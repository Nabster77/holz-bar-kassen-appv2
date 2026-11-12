/**
 * Per-browser installation preferences. No cash transactions, staff records,
 * Supabase credentials or filesystem handles are stored in localStorage.
 */
export type ArchiveMode = 'folder' | 'downloads';
export interface DeviceSetup {
  version: 1;
  archiveMode: ArchiveMode;
  folderLabel?: string;
  configuredAt: number;
}
const KEY = 'woodmo_v3_device_setup_v1';

export function readDeviceSetup(): DeviceSetup | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const value = parsed as Partial<DeviceSetup>;
    if (value.version !== 1 || (value.archiveMode !== 'folder' && value.archiveMode !== 'downloads') ||
      typeof value.configuredAt !== 'number' || !Number.isFinite(value.configuredAt)) return null;
    return { version: 1, archiveMode: value.archiveMode, configuredAt: value.configuredAt,
      folderLabel: typeof value.folderLabel === 'string' ? value.folderLabel : undefined };
  } catch {
    return null;
  }
}

export function saveDeviceSetup(mode: ArchiveMode, folderLabel?: string): DeviceSetup {
  const setup: DeviceSetup = { version: 1, archiveMode: mode, configuredAt: Date.now(),
    folderLabel: mode === 'folder' ? folderLabel : undefined };
  localStorage.setItem(KEY, JSON.stringify(setup));
  return setup;
}
