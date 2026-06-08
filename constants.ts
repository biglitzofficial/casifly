import { Account, AccountType, Customer, Wallet } from './types';

// Initial Chart of Accounts
export const INITIAL_ACCOUNTS: Account[] = [
  // Assets
  { id: 'A001', name: 'Cash on Hand', type: AccountType.ASSET, category: 'Cash', balance: 500000 },
  { id: 'A002', name: 'HDFC Bank Main', type: AccountType.ASSET, category: 'Bank', balance: 1200000 },
  { id: 'A003', name: 'ICICI Bank Ops', type: AccountType.ASSET, category: 'Bank', balance: 800000 },
  { id: 'A004', name: 'Wallet A (Razorpay)', type: AccountType.ASSET, category: 'Wallet', balance: 0 },
  { id: 'A005', name: 'Wallet B (Paytm)', type: AccountType.ASSET, category: 'Wallet', balance: 0 },
  { id: 'A006', name: 'Customer Receivables', type: AccountType.ASSET, category: 'Customer', balance: 0 },

  // Liabilities
  { id: 'L001', name: 'Customer Paid To', type: AccountType.LIABILITY, category: 'Customer', balance: 0 },
  /** Swipe commission held until payout outflow links the inflow (then Dr L003 / Cr I001). */
  { id: 'L003', name: 'Swipe margin pending settlement', type: AccountType.LIABILITY, category: 'Customer', balance: 0 },
  { id: 'L002', name: 'Duties & Taxes', type: AccountType.LIABILITY, category: 'Revenue', balance: 0 },

  // Equity
  { id: 'Q001', name: 'Owner\'s Equity', type: AccountType.LIABILITY, category: 'Equity', balance: 1000000 },
  { id: 'Q002', name: 'Retained Earnings', type: AccountType.LIABILITY, category: 'Equity', balance: 1500000 },

  // Income
  { id: 'I001', name: 'Service Charges', type: AccountType.INCOME, category: 'Revenue', balance: 0 },
  { id: 'I002', name: 'Wallet Surplus', type: AccountType.INCOME, category: 'Revenue', balance: 0 },

  // Expense
  { id: 'E001', name: 'Wallet MDR Charges', type: AccountType.EXPENSE, category: 'Expense', balance: 0 },
  { id: 'E002', name: 'Wallet Deficit', type: AccountType.EXPENSE, category: 'Expense', balance: 0 },
  { id: 'E003', name: 'Office Rent', type: AccountType.EXPENSE, category: 'Expense', balance: 0 },
  { id: 'E004', name: 'Mediator / Franchise Payout', type: AccountType.EXPENSE, category: 'Expense', balance: 0 },
];

export const INITIAL_CUSTOMERS: Customer[] = [
  { 
    id: 'C001', 
    name: 'Rahul Sharma', 
    phone: '9876543210', 
    commissionRates: { visa: 2.0, master: 2.0, amex: 3.0, rupay: 1.5 },
    ledgerAccountId: 'L001' 
  },
  { 
    id: 'C002', 
    name: 'Priya Verma', 
    phone: '9988776655', 
    commissionRates: { visa: 1.8, master: 1.8, amex: 2.8, rupay: 1.2 },
    ledgerAccountId: 'L001' 
  },
  { 
    id: 'C003', 
    name: 'Enterprises Ltd', 
    phone: '8877665544', 
    commissionRates: { visa: 1.5, master: 1.5, amex: 2.5, rupay: 1.0 },
    ledgerAccountId: 'L001' 
  },
];

export const INITIAL_WALLETS: Wallet[] = [
  {
    id: 'W001',
    name: 'Wallet A (Razorpay)',
    ledgerAccountId: 'A004',
    pgs: [
      { name: 'Standard', charges: { visa: 1.2, master: 1.2, amex: 2.5, rupay: 0.5 } },
      { name: 'Premium', charges: { visa: 1.5, master: 1.5, amex: 2.8, rupay: 0.8 } },
    ],
  },
  {
    id: 'W002',
    name: 'Wallet B (Paytm)',
    ledgerAccountId: 'A005',
    pgs: [
      { name: 'Business', charges: { visa: 1.1, master: 1.1, amex: 2.4, rupay: 0.5 } },
    ],
  },
];

export const DEFAULT_COMMISSION_RATES = {
  visa: 2.0,
  master: 2.0,
  amex: 3.5,
  rupay: 1.0
};
