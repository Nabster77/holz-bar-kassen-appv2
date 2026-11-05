export type TaxClass = 'reduced' | 'standard' | 'zero';

export type TaxRate = number;

export type Location = 'Friedrichshafen' | 'Bregenz';

export interface Category {
  id: string;
  name: string;
  icon: string; // lucide icon name
  color: string; // tailwind gradient classes
  sortOrder: number;
}

export interface ShotOption {
  id: string;
  name: string;
  price: number;
}

export interface PfandSettings {
  Friedrichshafen: number;
  Bregenz: number;
}

export interface Product {
  id: string;
  name: string;
  categoryId: string;
  imageUrl: string;
  taxClass: TaxClass;
  available: boolean;
  sortOrder: number;
  hasShot: boolean;
  shotPrices?: Record<string, number>;
  prices: Record<Location, number>;
  isPfandArticle?: boolean;
  hasIndividualPrice?: boolean;
  pfand: Record<Location, number>;
}

export interface CartItem {
  product: Product;
  quantity: number;
  shot?: ShotOption | null;
  unitPrice: number;
  unitPfand: number;
  isPfandRetoure?: boolean;
}

export interface TransactionItem {
  productId: string;
  name: string;
  price: number; // gross unit price incl. shot
  quantity: number;
  taxRate: TaxRate;
  netPrice: number;
  taxAmount: number;
  categoryId: string;
  pfand: number; // total pfand for this line
  shotName?: string;
  isPfandRetoure?: boolean;
}

export type PaymentMethod = 'cash' | 'card';

export interface Transaction {
  id: string;
  timestamp: number;
  items: TransactionItem[];
  subtotal: number; // sum of gross (excl pfand)
  taxByRate: Record<number, number>;
  totalNet: number;
  totalTax: number;
  totalPfand: number;
  total: number; // subtotal + pfand
  paymentMethod: PaymentMethod;
  amountPaid?: number; // cash given
  change?: number; // change returned
  location: Location;
  // Legacy fields, kept for backward compatibility with old stored transactions
  tax7?: number;
  tax19?: number;
}

export type CashEntryType = 'deposit' | 'withdrawal';

export interface CashEntry {
  id: string;
  type: CashEntryType;
  amount: number;
  reason: string;
  timestamp: number;
  isPfandRetoure?: boolean;
}

export interface CashCorrection {
  id: string;
  oldAmount: number;
  newAmount: number;
  reason: string;
  timestamp: number;
}

export interface CashSession {
  id: string;
  date: string; // ISO date string (YYYY-MM-DD)
  location: Location;
  openingBalance: number;
  openedAt: number;
  corrections: CashCorrection[];
  entries: CashEntry[];
  closed: boolean;
  closedAt?: number;
  closingBalance?: number;
  expectedBalance?: number;
  difference?: number;
}
