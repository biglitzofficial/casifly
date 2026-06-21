// ---- Auth & Admin ----
export type UserRole = 'master_admin' | 'product_admin' | 'user';

export type StoreType = 'other' | 'casifly';

export interface Product {
  id: string;
  name: string;
  slug: string;
  description?: string;
  status: 'active' | 'inactive';
  storeType?: StoreType; // 'other' | 'casifly' - casifly stores use ids like c1, c2
  createdAt: string;
}

export interface ProductUser {
  id: string;
  productId: string;
  email: string;
  password: string; // In production, use hashed passwords
  name: string;
  role: 'admin' | 'user';
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  productId?: string; // For product users
}

export enum AccountType {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
}

export enum TransactionType {
  SWIPE_PAY = 'SWIPE_PAY',
  PAY_SWIPE = 'PAY_SWIPE',
  MONEY_TRANSFER = 'MONEY_TRANSFER',
  JOURNAL = 'JOURNAL',
  RECONCILIATION = 'RECONCILIATION',
}

export type AccountCategory = 'Cash' | 'Bank' | 'Wallet' | 'Customer' | 'Revenue' | 'Expense' | 'Equity';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  category: AccountCategory;
  balance: number; // Current calculated balance
}

export interface Rates {
  visa: number;
  master: number;
  amex: number;
  rupay: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  commissionRates: Rates;
  ledgerAccountId: string;
  joinedAt?: string;
  storeId?: string; // undefined = legacy (master only), set = store-specific
}

export interface PGConfig {
  name: string;
  charges: Rates;
}

/** `payment` = PG swipe wallets; `receivable` = office/field wallets shown under Receivables (e.g. Prakash OFC). */
export type WalletKind = 'payment' | 'receivable';

export interface Wallet {
  id: string;
  name: string;
  ledgerAccountId: string;
  pgs: PGConfig[];
  storeId?: string; // undefined = global (all stores), set = store-specific
  walletKind?: WalletKind;
}

export interface LedgerEntry {
  accountId: string;
  debit: number;
  credit: number;
}

export interface TransactionMetadata {
  customerId?: string;
  walletId?: string;
  /** Swipe inflow: which wallet PG (portal) was used — matches Masters wallet PG name. */
  pgName?: string;
  /** Swipe inflow: customer fee % charged on this swipe. */
  customerChargePct?: number;
  /** Swipe inflow: our margin % (may be lower than customer % on franchise deals). */
  ourChargePct?: number;
  cardType?: string;
  relatedTransactionId?: string;
  /** Swipe outflow: ledger id of the Swipe Inflow tx whose margin (L003) to recognise into I001. */
  relatedInflowId?: string;
  /** Swipe outflow: additional fee booked to income (added to linked inflow P&L net profit). */
  extraCharges?: number;
  /** Swipe outflow: wallet transfer / IMPS fee (E001) — deducted from linked inflow net profit. */
  transferFee?: number;
  /** Mediator payout linked to swipe inflow (franchise / other-value share). */
  mediatorPayout?: number;
  /** Note for mediator payout (name, UTR, deal ref, etc.). */
  mediatorRemarks?: string;
  storeId?: string; // Product/store id for analytics
  performedByUserId?: string; // Staff who executed the transaction (for analytics)
}

export interface StaffTarget {
  storeId: string;
  staffId: string;
  month: string; // YYYY-MM
  target: number; // Monthly revenue target in ₹
}

export interface StaffAnalytics {
  staffId: string;
  staffName: string;
  month: string;
  target: number;
  achieved: number; // Revenue from transactions performed by this staff
  percentage: number;
  transactionCount: number;
}

export interface Transaction {
  id: string;
  date: string; // ISO String
  description: string;
  type: TransactionType;
  entries: LedgerEntry[];
  status: 'COMPLETED' | 'PENDING' | 'FAILED';
  referenceId?: string; // e.g. Customer ID
  metadata?: TransactionMetadata;
}

// DTOs
export interface CreateCustomerDTO {
  name: string;
  phone: string;
  commissionRates: Rates;
}

export interface CreateWalletDTO {
  name: string;
  pgName: string;
  charges: Rates;
  storeId?: string; // undefined = global, set = store-specific
  /** One-time opening: Dr wallet ledger / Cr retained earnings (Q002). Ignored if ≤ 0. */
  openingBalance?: number;
  walletKind?: WalletKind;
}

export interface BalanceSheet {
  assets: { account: Account; balance: number }[];
  liabilities: { account: Account; balance: number }[];
  equity: { account: Account; balance: number }[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
}

export interface ProfitAndLoss {
  income: { account: Account; balance: number }[];
  expenses: { account: Account; balance: number }[];
  totalIncome: number;
  totalExpenses: number;
  /** Workbook-style: deferred swipe portal excluded; franchise other value (pass-through) excluded from net. */
  netProfit: number;
  /** Raw ledger income − expenses; retained earnings adjustment on balance sheet so A = L + E. */
  netProfitLedger: number;
}
