import { getFirestore } from './firestore.js';

function fs() {
  const f = getFirestore();
  if (!f) throw new Error('Firestore not initialized');
  return f;
}

// Collection names
const C = {
  master_admin: 'master_admin',
  product_users: 'product_users',
  products: 'products',
  accounts: 'accounts',
  customers: 'customers',
  wallets: 'wallets',
  transactions: 'transactions',
} as const;

export const firestoreDb = {
  // Auth
  async getMasterAdmin(email: string) {
    const snap = await fs().collection(C.master_admin).where('email', '==', email).limit(1).get();
    return snap.empty ? null : { ...snap.docs[0].data(), id: snap.docs[0].id };
  },

  async getProductUserByEmail(email: string, status = 'active') {
    const snap = await fs().collection(C.product_users).where('email', '==', email).where('status', '==', status).limit(1).get();
    return snap.empty ? null : { ...snap.docs[0].data(), id: snap.docs[0].id };
  },

  // Products
  async getProducts() {
    const snap = await fs().collection(C.products).orderBy('created_at').get();
    return snap.docs.map((d: { id: string; data: () => any }) => ({ ...d.data(), id: d.id, created_at: d.data().created_at }));
  },

  async getProduct(id: string) {
    const doc = await fs().collection(C.products).doc(id).get();
    return doc.exists ? { ...doc.data(), id: doc.id } : null;
  },

  async addProduct(data: { id: string; name: string; slug: string; description?: string; status: string; store_type: string; created_at: string }) {
    const ref = fs().collection(C.products).doc(data.id);
    await ref.set(data);
    return data;
  },

  async updateProduct(id: string, updates: Record<string, unknown>) {
    const u: Record<string, unknown> = {};
    if (updates.name !== undefined) u.name = updates.name;
    if (updates.slug !== undefined) u.slug = updates.slug;
    if (updates.description !== undefined) u.description = updates.description;
    if (updates.status !== undefined) u.status = updates.status;
    if (updates.storeType !== undefined) u.store_type = updates.storeType;
    if (Object.keys(u).length > 0) {
      const ref = fs().collection(C.products).doc(id);
      await ref.update(u);
    }
    const doc = await fs().collection(C.products).doc(id).get();
    return doc.exists ? { ...doc.data(), id: doc.id } : null;
  },

  async deleteProduct(id: string) {
    const f = fs();
    const batch = f.batch();
    const users = await f.collection(C.product_users).where('product_id', '==', id).get();
    users.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(f.collection(C.products).doc(id));
    await batch.commit();
    return { ok: true };
  },

  // Product users
  async getProductUsers(productId: string) {
    const snap = await fs().collection(C.product_users).where('product_id', '==', productId).get();
    return snap.docs.map((d: { id: string; data: () => any }) => ({ ...d.data(), id: d.id, product_id: d.data().product_id }));
  },

  async getProductUserByUserId(userId: string) {
    const doc = await fs().collection(C.product_users).doc(userId).get();
    return doc.exists ? { ...doc.data(), id: doc.id } : null;
  },

  async getProductUserByEmailAndProduct(email: string, productId: string) {
    const snap = await fs().collection(C.product_users).where('email', '==', email).where('product_id', '==', productId).limit(1).get();
    return snap.empty ? null : { ...snap.docs[0].data(), id: snap.docs[0].id };
  },

  async addProductUser(data: { id: string; product_id: string; email: string; password_hash: string; name: string; role: string; status: string; created_at: string }) {
    const ref = fs().collection(C.product_users).doc(data.id);
    await ref.set(data);
    return data;
  },

  async updateProductUser(userId: string, updates: Record<string, unknown>) {
    const ref = fs().collection(C.product_users).doc(userId);
    await ref.update(updates);
    const doc = await ref.get();
    return doc.exists ? { ...doc.data(), id: doc.id } : null;
  },

  async deleteProductUser(userId: string) {
    await fs().collection(C.product_users).doc(userId).delete();
    return { ok: true };
  },

  // Accounts
  async getAccounts(storeId?: string) {
    const snap = await fs().collection(C.accounts).get();
    let rows = snap.docs.map((d: { id: string; data: () => any }) => ({ ...d.data(), id: d.id }));
    if (storeId) {
      rows = rows.filter((r: any) => r.store_id == null || r.store_id === storeId);
    }
    return rows;
  },

  async getAccount(id: string) {
    const doc = await fs().collection(C.accounts).doc(id).get();
    return doc.exists ? { ...doc.data(), id: doc.id } : null;
  },

  async addAccount(data: { id: string; name: string; type: string; category: string; balance: number; store_id?: string | null }) {
    await fs().collection(C.accounts).doc(data.id).set({ ...data, store_id: data.store_id ?? null });
  },

  async updateAccount(id: string, updates: Record<string, unknown>) {
    await fs().collection(C.accounts).doc(id).update(updates);
  },

  async deleteAccount(id: string) {
    await fs().collection(C.accounts).doc(id).delete();
  },

  // Customers
  async getCustomers(storeId?: string) {
    const col = fs().collection(C.customers);
    let snap;
    if (storeId) {
      snap = await col.where('store_id', '==', storeId).get();
    } else {
      snap = await col.get();
    }
    const rows = snap.docs.map((d: { id: string; data: () => any }) => ({ ...d.data(), id: d.id }));
    return rows.sort((a: any, b: any) => (b.joined_at || '').localeCompare(a.joined_at || ''));
  },

  async getCustomerByPhone(phone: string, storeId?: string | null) {
    const col = fs().collection(C.customers);
    const snap = storeId != null
      ? await col.where('phone', '==', phone).where('store_id', '==', storeId).limit(1).get()
      : await col.where('phone', '==', phone).where('store_id', '==', null).limit(1).get();
    return snap.empty ? null : { ...snap.docs[0].data(), id: snap.docs[0].id };
  },

  async addCustomer(data: { id: string; name: string; phone: string; commission_rates: string; ledger_account_id: string; store_id: string | null; joined_at: string }) {
    const ref = fs().collection(C.customers).doc(data.id);
    await ref.set(data);
    return data;
  },

  async updateCustomer(id: string, updates: Record<string, unknown>) {
    const u: Record<string, unknown> = {};
    if (updates.name !== undefined) u.name = updates.name;
    if (updates.phone !== undefined) u.phone = updates.phone;
    if (updates.commission_rates !== undefined) u.commission_rates = updates.commission_rates;
    if (updates.commissionRates !== undefined) u.commission_rates = typeof updates.commissionRates === 'object' ? JSON.stringify(updates.commissionRates) : updates.commissionRates;
    if (Object.keys(u).length > 0) await fs().collection(C.customers).doc(id).update(u);
  },

  async getCustomerById(id: string) {
    const doc = await fs().collection(C.customers).doc(id).get();
    return doc.exists ? { ...doc.data(), id: doc.id } : null;
  },

  async deleteCustomer(id: string) {
    const doc = await fs().collection(C.customers).doc(id).get();
    if (doc.exists) {
      const d = doc.data();
      if (d?.ledger_account_id && d.ledger_account_id !== 'L001') {
        await fs().collection(C.accounts).doc(d.ledger_account_id).delete();
      }
      await fs().collection(C.customers).doc(id).delete();
    }
    return { ok: true };
  },

  // Wallets
  async getWallets(storeId?: string) {
    const snap = await fs().collection(C.wallets).get();
    const rows = snap.docs.map((d: { id: string; data: () => any }) => ({ ...d.data(), id: d.id }));
    if (storeId) {
      return rows.filter((r: any) => r.store_id == null || r.store_id === storeId);
    }
    return rows;
  },

  async getWallet(id: string) {
    const doc = await fs().collection(C.wallets).doc(id).get();
    return doc.exists ? { ...doc.data(), id: doc.id } : null;
  },

  async addWallet(data: { id: string; name: string; ledger_account_id: string; pgs: string; store_id: string | null }) {
    await fs().collection(C.wallets).doc(data.id).set(data);
    return data;
  },

  async updateWallet(id: string, updates: Record<string, unknown>) {
    const u: Record<string, unknown> = {};
    if (updates.name !== undefined) {
      u.name = updates.name;
      const w = await fs().collection(C.wallets).doc(id).get();
      if (w.exists && w.data()?.ledger_account_id) {
        await fs().collection(C.accounts).doc(w.data()!.ledger_account_id).update({ name: updates.name });
      }
    }
    if (updates.pgs !== undefined) u.pgs = typeof updates.pgs === 'string' ? updates.pgs : JSON.stringify(updates.pgs);
    if (Object.keys(u).length > 0) await fs().collection(C.wallets).doc(id).update(u);
  },

  async deleteWallet(id: string) {
    const doc = await fs().collection(C.wallets).doc(id).get();
    if (doc.exists) {
      const d = doc.data();
      if (d?.ledger_account_id) {
        await fs().collection(C.accounts).doc(d.ledger_account_id).delete();
      }
      await fs().collection(C.wallets).doc(id).delete();
    }
    return { ok: true };
  },

  // Transactions
  async getTransactions(storeId?: string) {
    const snap = await fs().collection(C.transactions).orderBy('date', 'desc').get();
    let rows = snap.docs.map((d: { id: string; data: () => any }) => ({ ...d.data(), id: d.id }));
    if (storeId) {
      rows = rows.filter((r: any) => {
        const meta = r.metadata ? (typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : r.metadata) : {};
        return meta.storeId === storeId;
      });
    }
    return rows;
  },

  async addTransaction(data: { id: string; date: string; description: string; type: string; entries: string; status: string; metadata: string | null; reference_id: string | null }) {
    await fs().collection(C.transactions).doc(data.id).set(data);
    return data;
  },

  async deleteTransaction(id: string) {
    await fs().collection(C.transactions).doc(id).delete();
    return { ok: true };
  },

  // Staff Targets
  async getStaffTargets(storeId: string, month?: string) {
    let snap = fs().collection('staff_targets').where('store_id', '==', storeId);
    if (month) snap = snap.where('month', '==', month);
    const result = await snap.get();
    return result.docs.map((d: { id: string; data: () => any }) => ({ ...d.data(), id: d.id }));
  },

  async setStaffTarget(storeId: string, staffId: string, month: string, target: number) {
    const id = `${storeId}_${staffId}_${month}`;
    await fs().collection('staff_targets').doc(id).set({ store_id: storeId, staff_id: staffId, month, target });
    return { storeId, staffId, month, target };
  },

  async resetErpData() {
    const f = fs();
    const DEFAULT_STORE_ID = 'P0001';
    const INITIAL_ACCOUNTS = [
      { id: 'A001', name: 'Cash on Hand', type: 'ASSET', category: 'Cash', balance: 500000, store_id: null },
      { id: 'A002', name: 'HDFC Bank Main', type: 'ASSET', category: 'Bank', balance: 1200000, store_id: DEFAULT_STORE_ID },
      { id: 'A003', name: 'ICICI Bank Ops', type: 'ASSET', category: 'Bank', balance: 800000, store_id: DEFAULT_STORE_ID },
      { id: 'A004', name: 'Wallet A (Razorpay)', type: 'ASSET', category: 'Wallet', balance: 0, store_id: null },
      { id: 'A005', name: 'Wallet B (Paytm)', type: 'ASSET', category: 'Wallet', balance: 0, store_id: null },
      { id: 'A006', name: 'Customer Receivables', type: 'ASSET', category: 'Customer', balance: 0, store_id: null },
      { id: 'L001', name: 'Customer Payables', type: 'LIABILITY', category: 'Customer', balance: 0, store_id: null },
      { id: 'L002', name: 'Duties & Taxes', type: 'LIABILITY', category: 'Revenue', balance: 0, store_id: null },
      { id: 'Q001', name: "Owner's Equity", type: 'LIABILITY', category: 'Equity', balance: 1000000, store_id: null },
      { id: 'Q002', name: 'Retained Earnings', type: 'LIABILITY', category: 'Equity', balance: 1500000, store_id: null },
      { id: 'I001', name: 'Service Charges', type: 'INCOME', category: 'Revenue', balance: 0, store_id: null },
      { id: 'I002', name: 'Wallet Surplus', type: 'INCOME', category: 'Revenue', balance: 0, store_id: null },
      { id: 'E001', name: 'Wallet MDR Charges', type: 'EXPENSE', category: 'Expense', balance: 0, store_id: null },
      { id: 'E002', name: 'Wallet Deficit', type: 'EXPENSE', category: 'Expense', balance: 0, store_id: null },
      { id: 'E003', name: 'Office Rent', type: 'EXPENSE', category: 'Expense', balance: 0, store_id: null },
    ];
    const INITIAL_CUSTOMERS = [
      { id: 'C001', name: 'Rahul Sharma', phone: '9876543210', commission_rates: JSON.stringify({ visa: 2.0, master: 2.0, amex: 3.0, rupay: 1.5 }), ledger_account_id: 'L001', store_id: null, joined_at: new Date().toISOString() },
      { id: 'C002', name: 'Priya Verma', phone: '9988776655', commission_rates: JSON.stringify({ visa: 1.8, master: 1.8, amex: 2.8, rupay: 1.2 }), ledger_account_id: 'L001', store_id: null, joined_at: new Date().toISOString() },
      { id: 'C003', name: 'Enterprises Ltd', phone: '8877665544', commission_rates: JSON.stringify({ visa: 1.5, master: 1.5, amex: 2.5, rupay: 1.0 }), ledger_account_id: 'L001', store_id: null, joined_at: new Date().toISOString() },
    ];
    const INITIAL_WALLETS = [
      { id: 'W001', name: 'Wallet A (Razorpay)', ledger_account_id: 'A004', pgs: JSON.stringify([{ name: 'Standard', charges: { visa: 1.2, master: 1.2, amex: 2.5, rupay: 0.5 } }, { name: 'Premium', charges: { visa: 1.5, master: 1.5, amex: 2.8, rupay: 0.8 } }]), store_id: null },
      { id: 'W002', name: 'Wallet B (Paytm)', ledger_account_id: 'A005', pgs: JSON.stringify([{ name: 'Business', charges: { visa: 1.1, master: 1.1, amex: 2.4, rupay: 0.0 } }]), store_id: null },
    ];
    const batchDelete = async (coll: string) => {
      const snap = await f.collection(coll).get();
      const batch = f.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      if (snap.size > 0) await batch.commit();
    };
    await batchDelete(C.transactions);
    await batchDelete(C.customers);
    await batchDelete(C.wallets);
    await batchDelete(C.accounts);
    const batch = f.batch();
    for (const a of INITIAL_ACCOUNTS) {
      batch.set(f.collection(C.accounts).doc(a.id), a);
    }
    for (const c of INITIAL_CUSTOMERS) {
      batch.set(f.collection(C.customers).doc(c.id), c);
    }
    for (const w of INITIAL_WALLETS) {
      batch.set(f.collection(C.wallets).doc(w.id), w);
    }
    await batch.commit();
    return { ok: true };
  },
};
