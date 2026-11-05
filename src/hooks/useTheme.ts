import { useEffect, useState } from 'react';
import { loadJSON, saveJSON, STORAGE_KEYS } from '@/lib/storage';

type Theme = 'light' | 'dark';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = loadJSON<Theme | null>(STORAGE_KEYS.theme, null);
    if (stored) return stored;
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    saveJSON(STORAGE_KEYS.theme, theme);
  }, [theme]);

  return { theme, setTheme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) };
}
