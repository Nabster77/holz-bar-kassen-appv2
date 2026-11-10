import type { Category, ShotOption } from '@/types';
import { SHOT_OPTIONS } from '@/lib/seed';

export const SHOT_CATEGORY_ID = 'cat-system-schuss';
export const SHOT_SETTING_ID = 'schuss-options';
export const SHOT_CATEGORY: Category = {
  id: SHOT_CATEGORY_ID, name: 'SCHUSS', icon: 'Wine',
  color: 'from-violet-500 to-purple-700', sortOrder: 900000,
};
export const DEFAULT_SHOTS: ShotOption[] = SHOT_OPTIONS.filter((s) => s.id !== 'none');

export function normalizeCategories(categories: Category[]): Category[] {
  return [...categories.filter((c) => c.id !== SHOT_CATEGORY_ID && c.name.trim().toUpperCase() !== 'SCHUSS'), SHOT_CATEGORY]
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
export function validShots(value: unknown): value is ShotOption[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  const names = new Set<string>();
  return value.every((s) => {
    if (!s || typeof s !== 'object' || Array.isArray(s) || typeof s.id !== 'string' || !s.id.trim() || s.id === 'none' ||
      typeof s.name !== 'string' || !s.name.trim() || typeof s.price !== 'number' || !Number.isFinite(s.price) || s.price < 0) return false;
    const name = s.name.trim().toLocaleLowerCase('de-DE');
    if (ids.has(s.id) || names.has(name)) return false;
    ids.add(s.id); names.add(name);
    return s.locationPrices === undefined || (s.locationPrices !== null && typeof s.locationPrices === 'object' && !Array.isArray(s.locationPrices) &&
      (['Friedrichshafen', 'Bregenz'] as const).every(location => {
        const override = s.locationPrices[location];
        return override === undefined || (typeof override === 'number' && Number.isFinite(override) && override >= 0);
      }));
  });
}

/** A missing location override always falls back to the shared price. */
export function shotPriceForLocation(shot: ShotOption, location: 'Friedrichshafen' | 'Bregenz'): number {
  return shot.locationPrices?.[location] ?? shot.price;
}
