import type { Category, Product, ShotOption, PfandSettings } from '@/types';

export const DEFAULT_PFAND_SETTINGS: PfandSettings = {
  Friedrichshafen: 0.25,
  Bregenz: 0.20,
};

export const SHOT_OPTIONS: ShotOption[] = [
  { id: 'none', name: 'Nein', price: 0 },
  { id: 'rum', name: 'Rum', price: 1.50 },
  { id: 'whiskey', name: 'Whiskey', price: 1.80 },
  { id: 'amaretto', name: 'Amaretto', price: 1.50 },
  { id: 'amaretto_af', name: 'Amaretto alkoholfrei', price: 1.30 },
];

export const seedCategories: Category[] = [
  { id: 'cat-drinks', name: 'Getränke', icon: 'CupSoda', color: 'from-cyan-500 to-blue-600', sortOrder: 0 },
  { id: 'cat-snacks', name: 'Snacks', icon: 'Cookie', color: 'from-amber-500 to-orange-600', sortOrder: 1 },
  { id: 'cat-misc', name: 'Sonstiges', icon: 'Package', color: 'from-emerald-500 to-green-600', sortOrder: 2 },
];

export const seedProducts: Product[] = [
  // Getränke — Standard-Steuersatz
  { id: 'p-cola', name: 'Cola 0,5l', categoryId: 'cat-drinks', imageUrl: '/cola.webp', taxClass: 'standard', available: true, sortOrder: 0, hasShot: false,
    prices: { Friedrichshafen: 2.50, Bregenz: 2.70 }, isPfandArticle: true, pfand: { Friedrichshafen: 0.25, Bregenz: 0.20 } },
  { id: 'p-water', name: 'Wasser 0,5l', categoryId: 'cat-drinks', imageUrl: '/wasser.webp', taxClass: 'standard', available: true, sortOrder: 1, hasShot: false,
    prices: { Friedrichshafen: 1.80, Bregenz: 2.00 }, isPfandArticle: true, pfand: { Friedrichshafen: 0.25, Bregenz: 0.20 } },
  { id: 'p-orange', name: 'Orangensaft 0,3l', categoryId: 'cat-drinks', imageUrl: '/orangensaft.webp', taxClass: 'standard', available: true, sortOrder: 2, hasShot: false,
    prices: { Friedrichshafen: 2.80, Bregenz: 3.00 }, isPfandArticle: false, pfand: { Friedrichshafen: 0, Bregenz: 0 } },
  { id: 'p-coffee', name: 'Kaffee', categoryId: 'cat-drinks', imageUrl: '/kaffee.webp', taxClass: 'standard', available: true, sortOrder: 3, hasShot: false,
    prices: { Friedrichshafen: 2.20, Bregenz: 2.40 }, isPfandArticle: false, pfand: { Friedrichshafen: 0, Bregenz: 0 } },
  { id: 'p-beer', name: 'Bier 0,33l', categoryId: 'cat-drinks', imageUrl: '/bier.webp', taxClass: 'standard', available: true, sortOrder: 4, hasShot: false,
    prices: { Friedrichshafen: 3.20, Bregenz: 3.50 }, isPfandArticle: true, pfand: { Friedrichshafen: 0.25, Bregenz: 0.20 } },
  { id: 'p-white-wine', name: 'Weißwein', categoryId: 'cat-drinks', imageUrl: '/weisswein.webp', taxClass: 'standard', available: true, sortOrder: 5, hasShot: true,
    shotPrices: { rum: 1.50, whiskey: 1.80, amaretto: 1.50, amaretto_af: 1.30 },
    prices: { Friedrichshafen: 4.50, Bregenz: 4.80 }, isPfandArticle: false, pfand: { Friedrichshafen: 0, Bregenz: 0 } },
  // Snacks — Reduzierter Steuersatz
  { id: 'p-chips', name: 'Chips', categoryId: 'cat-snacks', imageUrl: '/chips.webp', taxClass: 'reduced', available: true, sortOrder: 0, hasShot: false,
    prices: { Friedrichshafen: 1.50, Bregenz: 1.60 }, isPfandArticle: false, pfand: { Friedrichshafen: 0, Bregenz: 0 } },
  { id: 'p-choc', name: 'Schokoriegel', categoryId: 'cat-snacks', imageUrl: '/schokoriegel.webp', taxClass: 'reduced', available: true, sortOrder: 1, hasShot: false,
    prices: { Friedrichshafen: 1.20, Bregenz: 1.30 }, isPfandArticle: false, pfand: { Friedrichshafen: 0, Bregenz: 0 } },
  { id: 'p-pretzels', name: 'Brezel', categoryId: 'cat-snacks', imageUrl: '/brezel.webp', taxClass: 'reduced', available: true, sortOrder: 2, hasShot: false,
    prices: { Friedrichshafen: 1.80, Bregenz: 2.00 }, isPfandArticle: false, pfand: { Friedrichshafen: 0, Bregenz: 0 } },
  { id: 'p-croissant', name: 'Croissant', categoryId: 'cat-snacks', imageUrl: '/croissant.webp', taxClass: 'reduced', available: true, sortOrder: 3, hasShot: false,
    prices: { Friedrichshafen: 2.00, Bregenz: 2.20 }, isPfandArticle: false, pfand: { Friedrichshafen: 0, Bregenz: 0 } },
  // Sonstiges — gemischt
  { id: 'p-newspaper', name: 'Zeitung', categoryId: 'cat-misc', imageUrl: '/zeitung.webp', taxClass: 'reduced', available: true, sortOrder: 0, hasShot: false,
    prices: { Friedrichshafen: 2.50, Bregenz: 2.70 }, isPfandArticle: false, pfand: { Friedrichshafen: 0, Bregenz: 0 } },
  { id: 'p-battery', name: 'Batterie AA', categoryId: 'cat-misc', imageUrl: '/batterie.webp', taxClass: 'standard', available: true, sortOrder: 1, hasShot: false,
    prices: { Friedrichshafen: 3.50, Bregenz: 3.80 }, isPfandArticle: false, pfand: { Friedrichshafen: 0, Bregenz: 0 } },
  { id: 'p-tissues', name: 'Taschentücher', categoryId: 'cat-misc', imageUrl: '/taschentuecher.webp', taxClass: 'standard', available: true, sortOrder: 2, hasShot: false,
    prices: { Friedrichshafen: 1.50, Bregenz: 1.60 }, isPfandArticle: false, pfand: { Friedrichshafen: 0, Bregenz: 0 } },
];
