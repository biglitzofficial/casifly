import bcrypt from 'bcryptjs';
import { rawDb } from './db.js';

const MASTER_EMAIL = 'admin@finledger.com';
const MASTER_PASSWORD = 'Admin@123';

const INITIAL_ACCOUNTS = [
  { id: 'A001', name: 'Cash on Hand', type: 'ASSET', category: 'Cash', balance: 500000 },
  { id: 'A002', name: 'HDFC Bank Main', type: 'ASSET', category: 'Bank', balance: 1200000 },
  { id: 'A003', name: 'ICICI Bank Ops', type: 'ASSET', category: 'Bank', balance: 800000 },
  { id: 'A004', name: 'Wallet A (Razorpay)', type: 'ASSET', category: 'Wallet', balance: 0 },
  { id: 'A005', name: 'Wallet B (Paytm)', type: 'ASSET', category: 'Wallet', balance: 0 },
  { id: 'A006', name: 'Customer Receivables', type: 'ASSET', category: 'Customer', balance: 0 },
  { id: 'L001', name: 'Customer Payables', type: 'LIABILITY', category: 'Customer', balance: 0 },
  { id: 'L002', name: 'Duties & Taxes', type: 'LIABILITY', category: 'Revenue', balance: 0 },
  { id: 'Q001', name: "Owner's Equity", type: 'LIABILITY', category: 'Equity', balance: 1000000 },
  { id: 'Q002', name: 'Retained Earnings', type: 'LIABILITY', category: 'Equity', balance: 1500000 },
  { id: 'I001', name: 'Service Charges', type: 'INCOME', category: 'Revenue', balance: 0 },
  { id: 'I002', name: 'Wallet Surplus', type: 'INCOME', category: 'Revenue', balance: 0 },
  { id: 'E001', name: 'Wallet MDR Charges', type: 'EXPENSE', category: 'Expense', balance: 0 },
  { id: 'E002', name: 'Wallet Deficit', type: 'EXPENSE', category: 'Expense', balance: 0 },
  { id: 'E003', name: 'Office Rent', type: 'EXPENSE', category: 'Expense', balance: 0 },
];

const INITIAL_CUSTOMERS = [
  { id: 'C001', name: 'Rahul Sharma', phone: '9876543210', commission_rates: JSON.stringify({ visa: 2.0, master: 2.0, amex: 3.0, rupay: 1.5 }), ledger_account_id: 'L001', store_id: null, joined_at: null },
  { id: 'C002', name: 'Priya Verma', phone: '9988776655', commission_rates: JSON.stringify({ visa: 1.8, master: 1.8, amex: 2.8, rupay: 1.2 }), ledger_account_id: 'L001', store_id: null, joined_at: null },
  { id: 'C003', name: 'Enterprises Ltd', phone: '8877665544', commission_rates: JSON.stringify({ visa: 1.5, master: 1.5, amex: 2.5, rupay: 1.0 }), ledger_account_id: 'L001', store_id: null, joined_at: null },
];

const INITIAL_WALLETS = [
  { id: 'W001', name: 'Wallet A (Razorpay)', ledger_account_id: 'A004', pgs: JSON.stringify([{ name: 'Standard', charges: { visa: 1.2, master: 1.2, amex: 2.5, rupay: 0.5 } }, { name: 'Premium', charges: { visa: 1.5, master: 1.5, amex: 2.8, rupay: 0.8 } }]), store_id: null },
  { id: 'W002', name: 'Wallet B (Paytm)', ledger_account_id: 'A005', pgs: JSON.stringify([{ name: 'Business', charges: { visa: 1.1, master: 1.1, amex: 2.4, rupay: 0.0 } }]), store_id: null },
];

async function seed() {
  const hash = await bcrypt.hash(MASTER_PASSWORD, 10);

  rawDb.exec('DELETE FROM master_admin');
  rawDb.prepare('INSERT INTO master_admin (id, email, password_hash, name) VALUES (?, ?, ?, ?)').run('master', MASTER_EMAIL, hash, 'Master Admin');

  rawDb.exec('DELETE FROM accounts');
  const insAccount = rawDb.prepare('INSERT INTO accounts (id, name, type, category, balance) VALUES (?, ?, ?, ?, ?)');
  for (const a of INITIAL_ACCOUNTS) {
    insAccount.run(a.id, a.name, a.type, a.category, a.balance);
  }

  rawDb.exec('DELETE FROM customers');
  const insCustomer = rawDb.prepare('INSERT INTO customers (id, name, phone, commission_rates, ledger_account_id, store_id, joined_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const c of INITIAL_CUSTOMERS) {
    insCustomer.run(c.id, c.name, c.phone, c.commission_rates, c.ledger_account_id, c.store_id, c.joined_at);
  }

  rawDb.exec('DELETE FROM wallets');
  const insWallet = rawDb.prepare('INSERT INTO wallets (id, name, ledger_account_id, pgs, store_id) VALUES (?, ?, ?, ?, ?)');
  for (const w of INITIAL_WALLETS) {
    insWallet.run(w.id, w.name, w.ledger_account_id, w.pgs, w.store_id);
  }

  rawDb.exec('DELETE FROM transactions');

  console.log('Seed complete. Master Admin:', MASTER_EMAIL, '/', MASTER_PASSWORD);
}

seed().catch(console.error).finally(() => rawDb.close());
