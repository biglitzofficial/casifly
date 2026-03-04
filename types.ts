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

export interface Wallet {
  id: string;
  name: string;
  ledgerAccountId: string;
  pgs: PGConfig[];
  storeId?: string; // undefined = global (all stores), set = store-specific
}

export interface LedgerEntry {
  accountId: string;
  debit: number;
  credit: number;
}

export interface TransactionMetadata {
  customerId?: string;
  walletId?: string;
  cardType?: string;
  relatedTransactionId?: string;
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
  netProfit: number;
}
