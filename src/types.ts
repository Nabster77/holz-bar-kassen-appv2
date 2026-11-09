export type TaxClass = 'reduced' | 'standard' | 'zero';

export type TaxRate = number;

export type Location = 'Friedrichshafen' | 'Bregenz';

export type StaffRole = 'administrator' | 'employee';

export type StaffSecurityQuestion = 'Lieblingstier' | 'Lieblingsessen' | 'Lieblingsfarbe';

export interface StaffUser {
  id: string;
  name: string;
  role: StaffRole;
  active: boolean;
  passwordSalt: string | null;
  passwordHash: string | null;
  securityQuestion: StaffSecurityQuestion | null;
  securityConfigured: boolean;
  updatedAt: number;
}

export type StaffActivityType = 'login' | 'logout' | 'cash_opened' | 'cash_closed' | 'sale' | 'deposit' | 'withdrawal' | 'correction';

export interface StaffActivity {
  id: string;
  type: StaffActivityType;
  staffId: string;
  staffName: string;
  timestamp: number;
  amount?: number;
  reason?: string;
}

/** One continuous, authenticated work period at an active cash register. */
export interface StaffLoginInterval {
  id: string;
  staffId: string;
  staffName: string;
  loginAt: number;
  logoutAt?: number;
}

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
  /** Globally valid fallback price in EUR. */
  price: number;
  /** Optional branch-specific prices; undefined means use price. */
  locationPrices?: Partial<Record<Location, number>>;
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
  employeeId?: string;
  employeeName?: string;
}

export type CashEntryType = 'deposit' | 'withdrawal';

export interface CashEntry {
  id: string;
  type: CashEntryType;
  amount: number;
  reason: string;
  timestamp: number;
  isPfandRetoure?: boolean;
  /** A withdrawal entered as part of the final daily close, without a reason prompt. */
  isClosingWithdrawal?: boolean;
  employeeId?: string;
  employeeName?: string;
}

export interface CashCorrection {
  id: string;
  oldAmount: number;
  newAmount: number;
  reason: string;
  timestamp: number;
  employeeId?: string;
  employeeName?: string;
}

export interface CashSession {
  discarded?: boolean;
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
  /** Amount physically removed while completing the daily close. */
  closingWithdrawalAmount?: number;
  openedById?: string;
  openedByName?: string;
  closedById?: string;
  closedByName?: string;
  /** Central, immutable receipt number assigned when the day is finalized. */
  dailyCloseReceiptNumber?: number;
  /** Location and calendar year are stored with the number so that the
   * printable number remains stable even after a later year/location change. */
  dailyCloseReceiptLocation?: Location;
  dailyCloseReceiptYear?: number;
  dailyCloseFinalizedAt?: number;
  dailyCloseFinalizedById?: string;
  dailyCloseFinalizedByName?: string;
  activities?: StaffActivity[];
  /** Precise employee login periods, synchronized as part of the cash session. */
  staffLoginIntervals?: StaffLoginInterval[];
  /** Immutable data basis of a finalized daily close. */
  dailyCloseSnapshot?: {
    transactions: Transaction[];
    finalizedAt: number;
    finalizedById?: string;
    finalizedByName?: string;
    /** Login periods frozen with the close so later exports remain auditable. */
    staffLoginIntervals?: StaffLoginInterval[];
  };
}
