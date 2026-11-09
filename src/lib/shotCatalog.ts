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
  return Array.isArray(value) && value.every((s) => s && typeof s.id === 'string' && s.id !== 'none' &&
    typeof s.name === 'string' && typeof s.price === 'number' && Number.isFinite(s.price) && s.price >= 0);
}
