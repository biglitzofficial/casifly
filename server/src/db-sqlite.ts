import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'casifly.db');

export const rawDb = new Database(dbPath);
const sqlite = rawDb;

sqlite.exec(`CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, description TEXT, status TEXT DEFAULT 'active', store_type TEXT DEFAULT 'other', created_at TEXT NOT NULL)`);
sqlite.exec(`CREATE TABLE IF NOT EXISTS product_users (id TEXT PRIMARY KEY, product_id TEXT NOT NULL, email TEXT NOT NULL, password_hash TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, status TEXT DEFAULT 'active', created_at TEXT NOT NULL, FOREIGN KEY (product_id) REFERENCES products(id))`);
sqlite.exec(`CREATE TABLE IF NOT EXISTS master_admin (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, name TEXT NOT NULL)`);
sqlite.exec(`CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, category TEXT NOT NULL, balance REAL DEFAULT 0, store_id TEXT)`);
(() => {
  try {
    const cols = (sqlite.prepare('PRAGMA table_info(accounts)').all() as { name: string }[]);
    if (!cols.some((c) => c.name === 'store_id')) {
      sqlite.exec('ALTER TABLE accounts ADD COLUMN store_id TEXT');
      sqlite.exec(`UPDATE accounts SET store_id = 'P0001' WHERE category IN ('Bank','Cash') AND id != 'A001' AND (store_id IS NULL OR store_id = '')`);
    }
    /** Template seed banks must be visible to every store (same as cash/wallets); otherwise Pay & Swipe “collected into bank” posts fail client validation for non-P0001 users. */
    sqlite.prepare(`UPDATE accounts SET store_id = NULL WHERE id IN ('A002','A003')`).run();
  } catch (_) {}
})();
sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_accounts_store ON accounts(store_id)`);
(() => {
  try {
    const row = sqlite.prepare(`SELECT 1 AS ok FROM accounts WHERE id = 'L003'`).get() as { ok?: number } | undefined;
    if (!row) {
      sqlite
        .prepare(
          `INSERT INTO accounts (id, name, type, category, balance, store_id) VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run('L003', 'Swipe margin pending settlement', 'LIABILITY', 'Customer', 0, null);
    }
  } catch (_) {}
})();
(() => {
  try {
    sqlite.prepare(`UPDATE accounts SET name = 'Customer Paid To' WHERE id = 'L001'`).run();
    sqlite
      .prepare(
        `UPDATE accounts SET name = REPLACE(name, ' Payable', ' Paid To') WHERE category = 'Customer' AND name LIKE '% Payable'`
      )
      .run();
  } catch (_) {}
})();
sqlite.exec(`CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, commission_rates TEXT NOT NULL, ledger_account_id TEXT NOT NULL, store_id TEXT, joined_at TEXT, FOREIGN KEY (ledger_account_id) REFERENCES accounts(id))`);
sqlite.exec(`CREATE TABLE IF NOT EXISTS wallets (id TEXT PRIMARY KEY, name TEXT NOT NULL, ledger_account_id TEXT NOT NULL, pgs TEXT NOT NULL, store_id TEXT, FOREIGN KEY (ledger_account_id) REFERENCES accounts(id))`);
(() => {
  try {
    const cols = sqlite.prepare('PRAGMA table_info(wallets)').all() as { name: string }[];
    if (!cols.some((c) => c.name === 'wallet_kind')) {
      sqlite.exec(`ALTER TABLE wallets ADD COLUMN wallet_kind TEXT DEFAULT 'payment'`);
    }
  } catch (_) {}
})();
sqlite.exec(`CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, date TEXT NOT NULL, description TEXT NOT NULL, type TEXT NOT NULL, entries TEXT NOT NULL, status TEXT DEFAULT 'COMPLETED', metadata TEXT, reference_id TEXT)`);
sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)`);
sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_customers_store ON customers(store_id)`);
sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_wallets_store ON wallets(store_id)`);
sqlite.exec(`CREATE TABLE IF NOT EXISTS staff_targets (store_id TEXT NOT NULL, staff_id TEXT NOT NULL, month TEXT NOT NULL, target REAL NOT NULL, PRIMARY KEY (store_id, staff_id, month))`);

// Async adapter - wraps sync SQLite in Promises for unified interface
export const sqliteDb = {
  getMasterAdmin: (email: string) =>
    Promise.resolve(sqlite.prepare('SELECT * FROM master_admin WHERE email = ?').get(email) as any),

  getProductUserByEmail: (email: string, status = 'active') =>
    Promise.resolve(sqlite.prepare('SELECT * FROM product_users WHERE email = ? AND status = ?').get(email, status) as any),

  getProducts: () => Promise.resolve(sqlite.prepare('SELECT * FROM products ORDER BY created_at').all() as any[]),
  getProduct: (id: string) => Promise.resolve(sqlite.prepare('SELECT * FROM products WHERE id = ?').get(id) as any),
  addProduct: (data: any) => {
    sqlite.prepare('INSERT INTO products (id, name, slug, description, status, store_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(data.id, data.name, data.slug, data.description, data.status, data.store_type, data.created_at);
    return Promise.resolve(data);
  },
  updateProduct: (id: string, updates: any) => {
    const existing = sqlite.prepare('SELECT * FROM products WHERE id = ?').get(id) as any;
    if (!existing) return null;
    if (updates.name !== undefined) sqlite.prepare('UPDATE products SET name = ?, slug = ? WHERE id = ?').run(updates.name, (updates.slug || updates.name).toLowerCase().replace(/\s+/g, '-'), id);
    if (updates.description !== undefined) sqlite.prepare('UPDATE products SET description = ? WHERE id = ?').run(updates.description, id);
    if (updates.status !== undefined) sqlite.prepare('UPDATE products SET status = ? WHERE id = ?').run(updates.status, id);
    if (updates.storeType !== undefined) sqlite.prepare('UPDATE products SET store_type = ? WHERE id = ?').run(updates.storeType, id);
    return Promise.resolve(sqlite.prepare('SELECT * FROM products WHERE id = ?').get(id) as any);
  },
  deleteProduct: (id: string) => {
    sqlite.prepare('DELETE FROM product_users WHERE product_id = ?').run(id);
    sqlite.prepare('DELETE FROM products WHERE id = ?').run(id);
    return Promise.resolve({ ok: true });
  },

  getProductUsers: (productId: string) =>
    Promise.resolve(sqlite.prepare('SELECT id, product_id, email, name, role, status, created_at FROM product_users WHERE product_id = ?').all(productId) as any[]),
  getProductUserByUserId: (userId: string) =>
    Promise.resolve(sqlite.prepare('SELECT * FROM product_users WHERE id = ?').get(userId) as any),
  getProductUserByEmailAndProduct: (email: string, productId: string) =>
    Promise.resolve(sqlite.prepare('SELECT * FROM product_users WHERE email = ? AND product_id = ?').get(email, productId) as any),
  addProductUser: (data: any) => {
    sqlite.prepare('INSERT INTO product_users (id, product_id, email, password_hash, name, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(data.id, data.product_id, data.email, data.password_hash, data.name, data.role, data.status, data.created_at);
    return Promise.resolve(data);
  },
  updateProductUser: (userId: string, updates: any) => {
    const existing = sqlite.prepare('SELECT * FROM product_users WHERE id = ?').get(userId) as any;
    if (!existing) return Promise.resolve(null);
    if (updates.name !== undefined) sqlite.prepare('UPDATE product_users SET name = ? WHERE id = ?').run(updates.name, userId);
    if (updates.role !== undefined) sqlite.prepare('UPDATE product_users SET role = ? WHERE id = ?').run(updates.role, userId);
    if (updates.status !== undefined) sqlite.prepare('UPDATE product_users SET status = ? WHERE id = ?').run(updates.status, userId);
    return Promise.resolve(sqlite.prepare('SELECT * FROM product_users WHERE id = ?').get(userId) as any);
  },
  deleteProductUser: (userId: string) => {
    sqlite.prepare('DELETE FROM product_users WHERE id = ?').run(userId);
    return Promise.resolve({ ok: true });
  },

  getAccounts: (storeId?: string) => {
    const rows = sqlite.prepare('SELECT * FROM accounts').all() as any[];
    if (!storeId) return Promise.resolve(rows);
    return Promise.resolve(rows.filter((r) => r.store_id == null || r.store_id === storeId));
  },
  getAccount: (id: string) => Promise.resolve(sqlite.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as any),
  addAccount: (data: any) => {
    sqlite.prepare('INSERT INTO accounts (id, name, type, category, balance, store_id) VALUES (?, ?, ?, ?, ?, ?)').run(data.id, data.name, data.type, data.category, data.balance ?? 0, data.store_id ?? null);
    return Promise.resolve();
  },
  updateAccount: (id: string, updates: any) => {
    if (updates.name !== undefined) sqlite.prepare('UPDATE accounts SET name = ? WHERE id = ?').run(updates.name, id);
    return Promise.resolve();
  },
  deleteAccount: (id: string) => {
    sqlite.prepare('DELETE FROM accounts WHERE id = ?').run(id);
    return Promise.resolve();
  },

  getCustomers: (storeId?: string) => {
    const rows = storeId
      ? sqlite.prepare('SELECT * FROM customers WHERE store_id IS NULL OR store_id = ?').all(storeId)
      : sqlite.prepare('SELECT * FROM customers').all();
    return Promise.resolve((rows as any[]).sort((a, b) => (b.joined_at || '').localeCompare(a.joined_at || '')));
  },
  getCustomerByPhone: (phone: string, storeId?: string | null) => {
    const row = storeId != null
      ? sqlite.prepare('SELECT * FROM customers WHERE phone = ? AND store_id = ?').get(phone, storeId)
      : sqlite.prepare('SELECT * FROM customers WHERE phone = ? AND store_id IS NULL').get(phone);
    return Promise.resolve(row as any);
  },
  addCustomer: (data: any) => {
    sqlite.prepare('INSERT INTO customers (id, name, phone, commission_rates, ledger_account_id, store_id, joined_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(data.id, data.name, data.phone, data.commission_rates, data.ledger_account_id, data.store_id, data.joined_at);
    return Promise.resolve(data);
  },
  getCustomerById: (id: string) => Promise.resolve(sqlite.prepare('SELECT * FROM customers WHERE id = ?').get(id) as any),
  updateCustomer: (id: string, updates: any) => {
    if (updates.name !== undefined) sqlite.prepare('UPDATE customers SET name = ? WHERE id = ?').run(updates.name, id);
    if (updates.phone !== undefined) sqlite.prepare('UPDATE customers SET phone = ? WHERE id = ?').run(updates.phone, id);
    if (updates.commissionRates !== undefined) sqlite.prepare('UPDATE customers SET commission_rates = ? WHERE id = ?').run(JSON.stringify(updates.commissionRates), id);
    return Promise.resolve();
  },
  deleteCustomer: (id: string) => {
    const c = sqlite.prepare('SELECT * FROM customers WHERE id = ?').get(id) as any;
    if (c && c.ledger_account_id !== 'L001') sqlite.prepare('DELETE FROM accounts WHERE id = ?').run(c.ledger_account_id);
    sqlite.prepare('DELETE FROM customers WHERE id = ?').run(id);
    return Promise.resolve({ ok: true });
  },

  getWallets: (storeId?: string) => {
    const rows = storeId
      ? (sqlite.prepare('SELECT * FROM wallets WHERE store_id IS NULL OR store_id = ?').all(storeId) as any[])
      : (sqlite.prepare('SELECT * FROM wallets').all() as any[]);
    return Promise.resolve(rows);
  },
  getWallet: (id: string) => Promise.resolve(sqlite.prepare('SELECT * FROM wallets WHERE id = ?').get(id) as any),
  addWallet: (data: any) => {
    sqlite.prepare('INSERT INTO wallets (id, name, ledger_account_id, pgs, store_id, wallet_kind) VALUES (?, ?, ?, ?, ?, ?)').run(data.id, data.name, data.ledger_account_id, data.pgs, data.store_id, data.wallet_kind ?? 'payment');
    return Promise.resolve(data);
  },
  updateWallet: (id: string, updates: any) => {
    const w = sqlite.prepare('SELECT * FROM wallets WHERE id = ?').get(id) as any;
    if (!w) return Promise.resolve();
    if (updates.name !== undefined) {
      sqlite.prepare('UPDATE wallets SET name = ? WHERE id = ?').run(updates.name, id);
      sqlite.prepare('UPDATE accounts SET name = ? WHERE id = ?').run(updates.name, w.ledger_account_id);
    }
    if (updates.wallet_kind !== undefined) sqlite.prepare('UPDATE wallets SET wallet_kind = ? WHERE id = ?').run(updates.wallet_kind, id);
    if (updates.pgs !== undefined) sqlite.prepare('UPDATE wallets SET pgs = ? WHERE id = ?').run(typeof updates.pgs === 'string' ? updates.pgs : JSON.stringify(updates.pgs), id);
    return Promise.resolve();
  },
  deleteWallet: (id: string) => {
    const w = sqlite.prepare('SELECT * FROM wallets WHERE id = ?').get(id) as any;
    if (w) {
      sqlite.prepare('DELETE FROM wallets WHERE id = ?').run(id);
      sqlite.prepare('DELETE FROM accounts WHERE id = ?').run(w.ledger_account_id);
    }
    return Promise.resolve({ ok: true });
  },

  getTransactions: (storeId?: string) => {
    let rows = sqlite.prepare('SELECT * FROM transactions ORDER BY date DESC').all() as any[];
    if (storeId) {
      rows = rows.filter((t) => {
        const m = t.metadata ? JSON.parse(t.metadata) : {};
        return m.storeId === storeId;
      });
    }
    return Promise.resolve(rows);
  },
  addTransaction: (data: any) => {
    sqlite.prepare('INSERT INTO transactions (id, date, description, type, entries, status, metadata, reference_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(data.id, data.date, data.description, data.type, data.entries, data.status, data.metadata, data.reference_id);
    return Promise.resolve(data);
  },
  deleteTransaction: (id: string) => {
    sqlite.prepare('DELETE FROM transactions WHERE id = ?').run(id);
    return Promise.resolve({ ok: true });
  },

  updateTransaction: (id: string, data: { date: string; description: string; type: string; entries: string; status: string; metadata: string | null; reference_id: string | null }) => {
    sqlite
      .prepare(
        'UPDATE transactions SET date = ?, description = ?, type = ?, entries = ?, status = ?, metadata = ?, reference_id = ? WHERE id = ?',
      )
      .run(
        data.date,
        data.description,
        data.type,
        data.entries,
        data.status,
        data.metadata,
        data.reference_id,
        id,
      );
    return Promise.resolve({ ok: true });
  },

  getStaffTargets: (storeId: string, month?: string) => {
    const rows = month
      ? sqlite.prepare('SELECT * FROM staff_targets WHERE store_id = ? AND month = ?').all(storeId, month)
      : sqlite.prepare('SELECT * FROM staff_targets WHERE store_id = ?').all(storeId);
    return Promise.resolve((rows as any[]).map(r => ({ store_id: r.store_id, staff_id: r.staff_id, month: r.month, target: r.target })));
  },

  setStaffTarget: (storeId: string, staffId: string, month: string, target: number) => {
    sqlite.prepare('INSERT OR REPLACE INTO staff_targets (store_id, staff_id, month, target) VALUES (?, ?, ?, ?)').run(storeId, staffId, month, target);
    return Promise.resolve({ storeId, staffId, month, target });
  },

  async resetErpData() {
    const INITIAL_ACCOUNTS = [
      { id: 'A001', name: 'Cash on Hand', type: 'ASSET', category: 'Cash', balance: 500000, store_id: null },
      { id: 'A002', name: 'HDFC Bank Main', type: 'ASSET', category: 'Bank', balance: 1200000, store_id: null },
      { id: 'A003', name: 'ICICI Bank Ops', type: 'ASSET', category: 'Bank', balance: 800000, store_id: null },
      { id: 'A004', name: 'Wallet A (Razorpay)', type: 'ASSET', category: 'Wallet', balance: 0, store_id: null },
      { id: 'A005', name: 'Wallet B (Paytm)', type: 'ASSET', category: 'Wallet', balance: 0, store_id: null },
      { id: 'A006', name: 'Customer Receivables', type: 'ASSET', category: 'Customer', balance: 0, store_id: null },
      { id: 'L001', name: 'Customer Paid To', type: 'LIABILITY', category: 'Customer', balance: 0, store_id: null },
      { id: 'L002', name: 'Duties & Taxes', type: 'LIABILITY', category: 'Revenue', balance: 0, store_id: null },
      { id: 'Q001', name: "Owner's Equity", type: 'LIABILITY', category: 'Equity', balance: 1000000, store_id: null },
      { id: 'Q002', name: 'Retained Earnings', type: 'LIABILITY', category: 'Equity', balance: 1500000, store_id: null },
      { id: 'I001', name: 'Service Charges', type: 'INCOME', category: 'Revenue', balance: 0, store_id: null },
      { id: 'I002', name: 'Wallet Surplus', type: 'INCOME', category: 'Revenue', balance: 0, store_id: null },
      { id: 'E001', name: 'Wallet MDR Charges', type: 'EXPENSE', category: 'Expense', balance: 0, store_id: null },
      { id: 'E002', name: 'Wallet Deficit', type: 'EXPENSE', category: 'Expense', balance: 0, store_id: null },
      { id: 'E003', name: 'Office Rent', type: 'EXPENSE', category: 'Expense', balance: 0, store_id: null },
      { id: 'E004', name: 'Mediator / Franchise Payout', type: 'EXPENSE', category: 'Expense', balance: 0, store_id: null },
    ];
    const INITIAL_CUSTOMERS = [
      { id: 'C001', name: 'Rahul Sharma', phone: '9876543210', commission_rates: JSON.stringify({ visa: 2.0, master: 2.0, amex: 3.0, rupay: 1.5 }), ledger_account_id: 'L001', store_id: null, joined_at: null },
      { id: 'C002', name: 'Priya Verma', phone: '9988776655', commission_rates: JSON.stringify({ visa: 1.8, master: 1.8, amex: 2.8, rupay: 1.2 }), ledger_account_id: 'L001', store_id: null, joined_at: null },
      { id: 'C003', name: 'Enterprises Ltd', phone: '8877665544', commission_rates: JSON.stringify({ visa: 1.5, master: 1.5, amex: 2.5, rupay: 1.0 }), ledger_account_id: 'L001', store_id: null, joined_at: null },
    ];
    const INITIAL_WALLETS = [
      { id: 'W001', name: 'Wallet A (Razorpay)', ledger_account_id: 'A004', pgs: JSON.stringify([{ name: 'Standard', charges: { visa: 1.2, master: 1.2, amex: 2.5, rupay: 0.5 } }, { name: 'Premium', charges: { visa: 1.5, master: 1.5, amex: 2.8, rupay: 0.8 } }]), store_id: null },
      { id: 'W002', name: 'Wallet B (Paytm)', ledger_account_id: 'A005', pgs: JSON.stringify([{ name: 'Business', charges: { visa: 1.1, master: 1.1, amex: 2.4, rupay: 0.5 } }]), store_id: null },
    ];
    sqlite.exec('DELETE FROM transactions');
    sqlite.exec('DELETE FROM customers');
    sqlite.exec('DELETE FROM wallets');
    sqlite.exec('DELETE FROM accounts');
    const insAccount = sqlite.prepare('INSERT INTO accounts (id, name, type, category, balance, store_id) VALUES (?, ?, ?, ?, ?, ?)');
    for (const a of INITIAL_ACCOUNTS) {
      insAccount.run(a.id, a.name, a.type, a.category, a.balance, (a as any).store_id ?? null);
    }
    const insCustomer = sqlite.prepare('INSERT INTO customers (id, name, phone, commission_rates, ledger_account_id, store_id, joined_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const c of INITIAL_CUSTOMERS) {
      insCustomer.run(c.id, c.name, c.phone, c.commission_rates, c.ledger_account_id, c.store_id, c.joined_at);
    }
    const insWallet = sqlite.prepare('INSERT INTO wallets (id, name, ledger_account_id, pgs, store_id) VALUES (?, ?, ?, ?, ?)');
    for (const w of INITIAL_WALLETS) {
      insWallet.run(w.id, w.name, w.ledger_account_id, w.pgs, w.store_id);
    }
    return Promise.resolve({ ok: true });
  },

  /** Dev: clear all transactions, reset wallets to seed, remove extra wallet accounts; keep customers & COA. */
  async resetWalletData() {
    const INITIAL_WALLETS = [
      { id: 'W001', name: 'Wallet A (Razorpay)', ledger_account_id: 'A004', pgs: JSON.stringify([{ name: 'Standard', charges: { visa: 1.2, master: 1.2, amex: 2.5, rupay: 0.5 } }, { name: 'Premium', charges: { visa: 1.5, master: 1.5, amex: 2.8, rupay: 0.8 } }]), store_id: null },
      { id: 'W002', name: 'Wallet B (Paytm)', ledger_account_id: 'A005', pgs: JSON.stringify([{ name: 'Business', charges: { visa: 1.1, master: 1.1, amex: 2.4, rupay: 0.5 } }]), store_id: null },
    ];
    sqlite.exec('DELETE FROM transactions');
    sqlite.prepare("DELETE FROM accounts WHERE category = 'Wallet' AND id NOT IN ('A004', 'A005')").run();
    sqlite.exec('DELETE FROM wallets');
    const insWallet = sqlite.prepare('INSERT INTO wallets (id, name, ledger_account_id, pgs, store_id) VALUES (?, ?, ?, ?, ?)');
    for (const w of INITIAL_WALLETS) {
      insWallet.run(w.id, w.name, w.ledger_account_id, w.pgs, w.store_id);
    }
    sqlite.prepare("UPDATE accounts SET balance = 0 WHERE id IN ('A004','A005','A006','I001','I002','E001','E002','E003','E004','L001','L003')").run();
    sqlite.prepare("UPDATE accounts SET balance = 0 WHERE type = 'LIABILITY' AND category = 'Customer'").run();
    sqlite.prepare("UPDATE accounts SET name = 'Wallet A (Razorpay)' WHERE id = 'A004'").run();
    sqlite.prepare("UPDATE accounts SET name = 'Wallet B (Paytm)' WHERE id = 'A005'").run();
    return Promise.resolve({ ok: true });
  },

  close: () => sqlite.close(),
};
