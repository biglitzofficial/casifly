import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import { 
  Account, AccountType, Customer, Wallet, Transaction, LedgerEntry, TransactionType,
  CreateCustomerDTO, CreateWalletDTO, PGConfig, TransactionMetadata,
  BalanceSheet, ProfitAndLoss,
} from '../types';
import { INITIAL_ACCOUNTS, INITIAL_CUSTOMERS, INITIAL_WALLETS } from '../constants';
import { formatCurrency, generateId, roundCurrency, txnOnOrBeforeLocalDay, normalizeLedgerEntries } from '../lib/utils';
import { deferredSwipePortalExpenseExcludedFromPl, totalSwipeFranchiseOtherValue } from '../lib/swipeTxnEconomics';
import { useToast } from './ToastContext';
import { useAuth } from './AuthContext';
import { api, USE_API } from '../lib/api';
import { canDeleteBankCashAccount } from '../lib/chartOfAccounts';

interface ERPContextType {
  accounts: Account[];
  customers: Customer[];
  wallets: Wallet[];
  transactions: Transaction[];
  
  // Actions
  postTransaction: (description: string, type: TransactionType, entries: LedgerEntry[], metadata?: TransactionMetadata, date?: string) => void | Promise<void>;
  deleteTransaction: (id: string) => void;
  /** Replace fields on an existing transaction (balanced entries). Works with API (PUT) or local state. */
  updateTransaction: (id: string, updates: Partial<Pick<Transaction, 'description' | 'date' | 'entries' | 'type' | 'metadata' | 'status'>>) => Promise<void>;
  reconcileWallet: (walletId: string, actualBalance: number) => void;
  
  // Masters CRUD
  addCustomer: (data: CreateCustomerDTO) => Promise<string>; // Returns ID
  updateCustomer: (id: string, data: Partial<Customer>) => void;
  deleteCustomer: (id: string) => void;
  addWallet: (data: CreateWalletDTO) => void;
  updateWallet: (id: string, data: Partial<Pick<Wallet, 'name' | 'walletKind'>>) => void;
  deleteWallet: (id: string) => void;
  addWalletPG: (walletId: string, pgConfig: PGConfig) => void;
  updateWalletPG: (walletId: string, oldPgName: string, pgConfig: PGConfig) => void;
  removeWalletPG: (walletId: string, pgName: string) => void;
  addAccount: (data: { name: string; category: 'Bank' | 'Cash' }) => void;
  updateAccount: (id: string, data: { name: string }) => void | Promise<void>;
  deleteAccount: (id: string) => void | Promise<void>;
  /**
   * Opening / retained-earnings adjustment on wallet ledger.
   * Positive: Dr wallet / Cr Q002. Negative: Dr Q002 / Cr wallet (reduces opening).
   */
  recordWalletOpeningBalance: (walletId: string, amount: number) => void | Promise<void>;

  // Getters
  getAccountBalance: (accountId: string) => number;
  /** Balance as of end of given instant (ISO). Uses only COMPLETED transactions with date <= asOfDateIso. */
  getAccountBalanceAsOf: (accountId: string, asOfDateIso: string) => number;
  /** Ledger balances after all COMPLETED transactions on or before end of `dayStr` (YYYY-MM-DD, local). */
  getAccountBalancesAsOf: (dayStr: string) => Record<string, number>;
  getLedger: (accountId: string) => Transaction[];
  generateBalanceSheet: () => BalanceSheet;
  generateProfitAndLoss: () => ProfitAndLoss;
  
  // Utils
  formatCurrency: (amount: number) => string;

  // Backup/Restore
  exportBackup: () => string;
  restoreBackup: (json: string) => { success: boolean; error?: string };

  // Development
  clearWalletData: () => Promise<void>;
  clearAllData: () => Promise<void>;
}

const ERPContext = createContext<ERPContextType | undefined>(undefined);
const ERP_STORAGE_KEY = 'casifly_erp_data';

const loadERPFromStorage = () => {
  try {
    const raw = localStorage.getItem(ERP_STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.accounts?.length && data.customers?.length >= 0 && data.wallets?.length >= 0 && Array.isArray(data.transactions)) {
        return data;
      }
    }
  } catch (_) {}
  return null;
};

export const ERPProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const toast = useToast();
  const { user } = useAuth();
  const stored = loadERPFromStorage();
  const [accounts, setAccounts] = useState<Account[]>(stored?.accounts || INITIAL_ACCOUNTS);
  const [customers, setCustomers] = useState<Customer[]>(stored?.customers || INITIAL_CUSTOMERS);
  const [allWallets, setWallets] = useState<Wallet[]>(stored?.wallets || INITIAL_WALLETS);
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const s = loadERPFromStorage();
    const tx = s?.transactions ?? [];
    return tx.map((t: Transaction) => ({
      ...t,
      entries: normalizeLedgerEntries(t.entries),
    }));
  });

  const refreshFromApi = useCallback(async () => {
    if (!USE_API || !api.getToken()) return;
    try {
      const [accs, custs, wals, txns] = await Promise.all([
        api.getAccounts(),
        api.getCustomers(),
        api.getWallets(),
        api.getTransactions(),
      ]);
      const mappedBase = (accs as any[]).map(a => ({ id: a.id, name: a.name, type: a.type, category: a.category, balance: a.balance ?? 0 }));
      const ids = new Set(mappedBase.map((a) => a.id));
      const mapped: typeof mappedBase = [...mappedBase];
      for (const c of custs as any[]) {
        const lid = c.ledgerAccountId as string | undefined;
        if (lid && !ids.has(lid)) {
          mapped.push({
            id: lid,
            name: `${c.name} Paid To`,
            type: AccountType.LIABILITY,
            category: 'Customer',
            balance: 0,
          });
          ids.add(lid);
        }
      }
      const missingCoa = INITIAL_ACCOUNTS.filter((a) => !ids.has(a.id));
      /** Seed banks (A002/A003) may be store-scoped in DB while UI merges full COA — without this, Pay & Swipe posts to bank IDs fail validation and never hit the ledger. */
      setAccounts(missingCoa.length ? [...mapped, ...missingCoa] : mapped);
      setCustomers((custs as any[]).map(c => ({ id: c.id, name: c.name, phone: c.phone, commissionRates: c.commissionRates, ledgerAccountId: c.ledgerAccountId, joinedAt: c.joinedAt, storeId: c.storeId })));
      setWallets((wals as any[]).map(w => ({ id: w.id, name: w.name, ledgerAccountId: w.ledgerAccountId, pgs: w.pgs, storeId: w.storeId, walletKind: w.walletKind })));
      setTransactions((txns as any[]).map(t => ({ id: t.id, date: t.date, description: t.description, type: t.type, entries: normalizeLedgerEntries(t.entries), status: t.status ?? 'COMPLETED', metadata: t.metadata, referenceId: t.referenceId })));
    } catch (e) {
      console.error('ERP fetch failed', e);
    }
  }, []);

  useEffect(() => {
    refreshFromApi();
  }, [user?.id, refreshFromApi]);

  /** Merge new COA rows (e.g. L003) into localStorage-backed books without a full reset. */
  useEffect(() => {
    if (USE_API) return;
    setAccounts((prev) => {
      const ids = new Set(prev.map((a) => a.id));
      const missing = INITIAL_ACCOUNTS.filter((a) => !ids.has(a.id));
      if (missing.length === 0) return prev;
      return [...prev, ...missing];
    });
  }, []);

  /** Rename L001 / per-customer liability labels (Payable → Paid To) in local data. */
  useEffect(() => {
    if (USE_API) return;
    setAccounts((prev) => {
      let changed = false;
      const next = prev.map((a) => {
        if (a.id === 'L001' && a.name !== 'Customer Paid To') {
          changed = true;
          return { ...a, name: 'Customer Paid To' };
        }
        if (a.category === 'Customer' && / Payable$/.test(a.name)) {
          changed = true;
          return { ...a, name: a.name.replace(/ Payable$/, ' Paid To') };
        }
        return a;
      });
      return changed ? next : prev;
    });
  }, []);

  useEffect(() => {
    if (!USE_API) {
      localStorage.setItem(ERP_STORAGE_KEY, JSON.stringify({ accounts, customers, wallets: allWallets, transactions }));
    }
  }, [USE_API, accounts, customers, allWallets, transactions]);

  const productId = user?.productId;

  // Filter wallets for store user: global (no storeId) + store-specific (storeId matches)
  const wallets = useMemo(() => {
    if (!productId) return allWallets;
    return allWallets.filter(w => !w.storeId || w.storeId === productId);
  }, [allWallets, productId]);

  // Filter transactions for store user: only their store's transactions
  const transactionsForUser = useMemo(() => {
    if (!productId) return transactions;
    return transactions.filter(t => (t.metadata?.storeId ?? '') === productId);
  }, [transactions, productId]);

  // Filter customers for store user: global (no storeId) + store-specific — same base for all processes
  const customersForUser = useMemo(() => {
    if (!productId) return customers;
    return customers.filter(c => !c.storeId || c.storeId === productId);
  }, [customers, productId]);

  // --- Derived State (Balances) ---
  // Store users see store-scoped balances; Master Admin sees global
  const accountBalances = useMemo(() => {
    const balances: Record<string, number> = {};
    const txnsToUse = productId
      ? transactions.filter(t => t.status === 'COMPLETED' && (t.metadata?.storeId ?? '') === productId)
      : transactions.filter(t => t.status === 'COMPLETED');

    accounts.forEach(acc => {
      balances[acc.id] = productId ? 0 : (acc.balance || 0);
    });

    txnsToUse.forEach(txn => {
      txn.entries.forEach(entry => {
        const acc = accounts.find(a => a.id === entry.accountId);
        if (!acc) return;

        if (acc.type === AccountType.ASSET || acc.type === AccountType.EXPENSE) {
          balances[entry.accountId] = (balances[entry.accountId] || 0) + (entry.debit - entry.credit);
        } else {
          balances[entry.accountId] = (balances[entry.accountId] || 0) + (entry.credit - entry.debit);
        }
      });
    });
    return balances;
  }, [transactions, accounts, productId]);

  // --- Actions ---

  const postTransaction = (description: string, type: TransactionType, entries: LedgerEntry[], metadata?: TransactionMetadata, dateStr?: string) => {
    const lines = normalizeLedgerEntries(entries);
    const totalDebit = lines.reduce((sum, e) => sum + e.debit, 0);
    const totalCredit = lines.reduce((sum, e) => sum + e.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      toast.error(`Transaction Unbalanced! Dr: ${totalDebit.toFixed(2)}, Cr: ${totalCredit.toFixed(2)}`);
      return;
    }
    if (lines.length < 2) {
      toast.error("A transaction must have at least two entries (Debit and Credit).");
      return;
    }
    const invalidAccounts = lines.filter(e => !accounts.some(a => a.id === e.accountId));
    if (invalidAccounts.length > 0) {
      toast.error(`Invalid Account IDs: ${invalidAccounts.map(e => e.accountId).join(', ')}`);
      return;
    }
    const metadataWithStore: TransactionMetadata = {
      ...metadata,
      storeId: user?.productId ?? metadata?.storeId,
      ...(user?.role === 'user' ? { performedByUserId: user.id } : {}),
    };

    if (USE_API) {
      return api.postTransaction({ description, type, entries: lines, metadata: metadataWithStore, date: dateStr })
        .then(async () => {
          await refreshFromApi();
        })
        .catch(err => { toast.error(err?.message || 'Transaction failed'); throw err; });
    }

    const newTxn: Transaction = {
      id: crypto.randomUUID(),
      date: dateStr || new Date().toISOString(),
      description,
      type,
      entries: lines,
      status: 'COMPLETED',
      metadata: metadataWithStore
    };
    setTransactions(prev => [newTxn, ...prev]);
    return Promise.resolve();
  };

  const deleteTransaction = (id: string) => {
    if (USE_API) {
      api.deleteTransaction(id)
        .then(() => {
          setTransactions(prev => prev.filter(t => t.id !== id));
          toast.success('Transaction deleted');
        })
        .catch((e: any) => toast.error(e?.message || 'Delete failed'));
      return;
    }
    setTransactions(prev => prev.filter(t => t.id !== id));
    toast.success('Transaction deleted');
  };

  const updateTransaction = async (
    id: string,
    patch: Partial<Pick<Transaction, 'description' | 'date' | 'entries' | 'type' | 'metadata' | 'status'>>,
  ) => {
    const existing = transactions.find((t) => t.id === id);
    if (!existing) {
      toast.error('Transaction not found');
      throw new Error('Transaction not found');
    }
    const next: Transaction = {
      ...existing,
      ...patch,
      entries: normalizeLedgerEntries(patch.entries !== undefined ? patch.entries : existing.entries),
      description: patch.description ?? existing.description,
      date: patch.date ?? existing.date,
      type: patch.type ?? existing.type,
      metadata: patch.metadata !== undefined ? patch.metadata : existing.metadata,
      status: patch.status ?? existing.status,
    };
    const { entries } = next;
    const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0);
    const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      toast.error(`Transaction must balance (Dr ${totalDebit.toFixed(2)} vs Cr ${totalCredit.toFixed(2)})`);
      throw new Error('Unbalanced');
    }
    if (entries.length < 2) {
      toast.error('At least two ledger lines required');
      throw new Error('Too few entries');
    }
    const invalid = entries.filter((e) => !accounts.some((a) => a.id === e.accountId));
    if (invalid.length > 0) {
      toast.error('Unknown account ID on transaction');
      throw new Error('Invalid account');
    }

    if (USE_API) {
      try {
        await api.updateTransaction(id, {
          description: next.description,
          date: next.date,
          type: next.type,
          entries: next.entries,
          metadata: next.metadata,
          status: next.status ?? 'COMPLETED',
        });
        await refreshFromApi();
        toast.success('Transaction updated');
      } catch (e: any) {
        toast.error(e?.message || 'Update failed');
        throw e;
      }
      return;
    }
    setTransactions((prev) => prev.map((t) => (t.id === id ? next : t)));
    toast.success('Transaction updated');
  };

  const addCustomer = async (data: CreateCustomerDTO): Promise<string> => {
    if (USE_API) {
      try {
        const c = await api.addCustomer({ name: data.name, phone: data.phone, commissionRates: data.commissionRates }) as any;
        setAccounts(prev => [...prev, { id: c.ledgerAccountId, name: `${c.name} Paid To`, type: AccountType.LIABILITY, category: 'Customer' as const, balance: 0 }]);
        setCustomers(prev => [...prev, { id: c.id, name: c.name, phone: c.phone, commissionRates: c.commissionRates || data.commissionRates, ledgerAccountId: c.ledgerAccountId, joinedAt: c.joinedAt, storeId: c.storeId }]);
        return c.id;
      } catch (e: any) {
        toast.error(e?.message || 'Failed to add customer');
        return '';
      }
    }
    const ledgerId = generateId('L');
    const customerId = generateId('C');
    const newAccount: Account = { id: ledgerId, name: `${data.name} Paid To`, type: AccountType.LIABILITY, category: 'Customer', balance: 0 };
    const newCustomer: Customer = { id: customerId, name: data.name, phone: data.phone, commissionRates: data.commissionRates!, ledgerAccountId: ledgerId, joinedAt: new Date().toISOString(), storeId: user?.productId };
    setAccounts(prev => [...prev, newAccount]);
    setCustomers(prev => [...prev, newCustomer]);
    return customerId;
  };

  const updateCustomer = (id: string, data: Partial<Customer>) => {
    if (USE_API) {
      api.updateCustomer(id, data).then(() => refreshFromApi()).catch((e: any) => toast.error(e?.message || 'Update failed'));
      return;
    }
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, ...data } : c));
  };

  const deleteCustomer = (id: string) => {
    const customer = customers.find(c => c.id === id);
    if (!customer) return;
    if (USE_API) {
      api.deleteCustomer(id).then(() => refreshFromApi()).catch((e: any) => toast.error(e?.message || 'Delete failed'));
      return;
    }
    setCustomers(prev => prev.filter(c => c.id !== id));
    if (customer.ledgerAccountId && customer.ledgerAccountId !== 'L001') {
      setAccounts(prev => prev.filter(a => a.id !== customer.ledgerAccountId));
    }
  };

  const addWallet = (data: CreateWalletDTO) => {
    const opening = roundCurrency(Math.max(0, data.openingBalance ?? 0));
    if (USE_API) {
      return api
        .addWallet({
          name: data.name,
          pgName: data.pgName,
          charges: data.charges,
          storeId: data.storeId,
          openingBalance: opening > 0 ? opening : undefined,
          walletKind: data.walletKind,
        })
        .then(() => refreshFromApi())
        .catch((e: any) => toast.error(e?.message || 'Failed to add wallet'));
    }
    const ledgerId = generateId('A');
    const walletId = generateId('W');

    const newAccount: Account = {
      id: ledgerId,
      name: data.name,
      type: AccountType.ASSET,
      category: 'Wallet',
      balance: 0
    };

    const newWallet: Wallet = {
      id: walletId,
      name: data.name,
      ledgerAccountId: ledgerId,
      pgs: [{
        name: data.pgName,
        charges: data.charges
      }],
      storeId: data.storeId,
      walletKind: data.walletKind,
    };

    setAccounts(prev => [...prev, newAccount]);
    setWallets(prev => [...prev, newWallet]);

    if (opening > 0.005) {
      window.setTimeout(() => {
        const meta: TransactionMetadata = { storeId: user?.productId ?? data.storeId };
        const p = postTransaction(
          `Opening balance: ${data.name}`,
          TransactionType.JOURNAL,
          [
            { accountId: ledgerId, debit: opening, credit: 0 },
            { accountId: 'Q002', debit: 0, credit: opening },
          ],
          meta
        );
        if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => {});
      }, 0);
    }
  };

  const recordWalletOpeningBalance = (walletId: string, amount: number) => {
    const amt = roundCurrency(amount);
    if (Math.abs(amt) < 0.005) {
      toast.error('Enter a non-zero amount (use negative to reduce opening)');
      return;
    }
    const wallet = allWallets.find((w) => w.id === walletId);
    if (!wallet) return;
    const meta: TransactionMetadata = { storeId: user?.productId ?? undefined, walletId: wallet.id };
    let entries: LedgerEntry[];
    let desc: string;
    if (amt > 0) {
      desc = `Opening balance (+): ${wallet.name}`;
      entries = [
        { accountId: wallet.ledgerAccountId, debit: amt, credit: 0 },
        { accountId: 'Q002', debit: 0, credit: amt },
      ];
    } else {
      const absAmt = Math.abs(amt);
      desc = `Opening balance (−): ${wallet.name}`;
      entries = [
        { accountId: 'Q002', debit: absAmt, credit: 0 },
        { accountId: wallet.ledgerAccountId, debit: 0, credit: absAmt },
      ];
    }
    const p = postTransaction(desc, TransactionType.JOURNAL, entries, meta);
    if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => {});
  };

  const updateWallet = (id: string, data: Partial<Pick<Wallet, 'name' | 'walletKind'>>) => {
    const wallet = allWallets.find(w => w.id === id);
    if (!wallet) return;
    if (USE_API) {
      api.updateWallet(id, { name: data.name, walletKind: data.walletKind }).then(() => refreshFromApi()).catch((e: any) => toast.error(e?.message || 'Update failed'));
      return;
    }
    setWallets(prev => prev.map(w => (w.id === id ? { ...w, ...data } : w)));
    if (data.name !== undefined) {
      setAccounts(prev => prev.map(a => 
        a.id === wallet.ledgerAccountId ? { ...a, name: data.name! } : a
      ));
    }
  };

  const deleteWallet = (id: string) => {
    const wallet = allWallets.find(w => w.id === id);
    if (!wallet) return;
    if (USE_API) {
      api.deleteWallet(id).then(() => refreshFromApi()).catch((e: any) => toast.error(e?.message || 'Delete failed'));
      return;
    }
    setWallets(prev => prev.filter(w => w.id !== id));
    setAccounts(prev => prev.filter(a => a.id !== wallet.ledgerAccountId));
  };

  const addWalletPG = (walletId: string, pgConfig: PGConfig) => {
    if (USE_API) {
      api.addWalletPG(walletId, pgConfig).then(() => refreshFromApi()).catch((e: any) => toast.error(e?.message || 'Failed to add PG'));
      return;
    }
    setWallets(prev => prev.map(w => {
      if (w.id === walletId) {
        return { ...w, pgs: [...w.pgs, pgConfig] };
      }
      return w;
    }));
  };

  const updateWalletPG = (walletId: string, oldPgName: string, pgConfig: PGConfig) => {
    if (USE_API) {
      api.updateWalletPG(walletId, oldPgName, pgConfig).then(() => refreshFromApi()).catch((e: any) => toast.error(e?.message || 'Update failed'));
      return;
    }
    setWallets(prev => prev.map(w => {
      if (w.id === walletId) {
        return { 
          ...w, 
          pgs: w.pgs.map(pg => pg.name === oldPgName ? pgConfig : pg) 
        };
      }
      return w;
    }));
  };

  const removeWalletPG = (walletId: string, pgName: string) => {
    const wallet = allWallets.find((w) => w.id === walletId);
    if (!wallet) return;
    if (wallet.pgs.length <= 1) {
      toast.error('A wallet must keep at least one payment gateway');
      return;
    }
    if (!wallet.pgs.some((pg) => pg.name === pgName)) return;
    if (USE_API) {
      api.removeWalletPG(walletId, pgName).then(() => refreshFromApi()).catch((e: any) => toast.error(e?.message || 'Remove failed'));
      return;
    }
    setWallets(prev => prev.map(w => {
      if (w.id !== walletId) return w;
      const next = w.pgs.filter((pg) => pg.name !== pgName);
      if (next.length === 0) return w;
      return { ...w, pgs: next };
    }));
  };

  const addAccount = (data: { name: string; category: 'Bank' | 'Cash' }) => {
    if (USE_API) {
      api.addAccount(data)
        .then(() => refreshFromApi())
        .catch((e: any) => toast.error(e?.message || 'Failed to add account'));
      return;
    }
    const id = generateId('A');
    const newAccount: Account = { id, name: data.name, type: AccountType.ASSET, category: data.category, balance: 0 };
    setAccounts(prev => [...prev, newAccount]);
  };

  const updateAccount = async (id: string, data: { name: string }) => {
    const name = data.name.trim();
    if (!name) {
      toast.error('Account name is required');
      return;
    }
    const acc = accounts.find((a) => a.id === id);
    if (!acc || (acc.category !== 'Bank' && acc.category !== 'Cash')) {
      toast.error('Only bank and cash accounts can be renamed here.');
      return;
    }
    if (USE_API) {
      await api.updateAccount(id, { name }).then(() => refreshFromApi()).catch((e: any) => toast.error(e?.message || 'Update failed'));
      return;
    }
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, name } : a)));
  };

  const deleteAccount = async (id: string) => {
    const acc = accounts.find((a) => a.id === id);
    if (!acc || (acc.category !== 'Bank' && acc.category !== 'Cash')) {
      toast.error('Only bank and cash accounts can be deleted here.');
      return;
    }
    const balance = getAccountBalance(id);
    const check = canDeleteBankCashAccount(id, balance, transactions);
    if (!check.ok) {
      toast.error(check.reason || 'Cannot delete this account');
      return;
    }
    if (USE_API) {
      await api.deleteAccount(id).then(() => refreshFromApi()).catch((e: any) => toast.error(e?.message || 'Delete failed'));
      return;
    }
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  };

  const reconcileWallet = (walletId: string, actualBalance: number) => {
    const wallet = allWallets.find(w => w.id === walletId);
    if (!wallet) return;

    const systemBalance = accountBalances[wallet.ledgerAccountId] || 0;
    const difference = actualBalance - systemBalance;

    if (Math.abs(difference) < 0.01) return; 

    const entries: LedgerEntry[] = [];
    
    if (difference < 0) {
      // Shortage (Expense)
      entries.push({ accountId: 'E002', debit: Math.abs(difference), credit: 0 });
      entries.push({ accountId: wallet.ledgerAccountId, debit: 0, credit: Math.abs(difference) });
      postTransaction(`Reconciliation: Shortage - ${wallet.name}`, TransactionType.RECONCILIATION, entries, { walletId });
    } else {
      // Surplus (Income)
      entries.push({ accountId: wallet.ledgerAccountId, debit: difference, credit: 0 });
      entries.push({ accountId: 'I002', debit: 0, credit: difference });
      postTransaction(`Reconciliation: Surplus - ${wallet.name}`, TransactionType.RECONCILIATION, entries, { walletId });
    }
  };

  // Getters
  const getAccountBalance = (accountId: string) => accountBalances[accountId] || 0;

  const getAccountBalanceAsOf = useCallback((accountId: string, asOfDateIso: string) => {
    const cutoff = new Date(asOfDateIso);
    if (Number.isNaN(cutoff.getTime())) return 0;
    let txnsToUse = productId
      ? transactions.filter(
          t => t.status === 'COMPLETED' && (t.metadata?.storeId ?? '') === productId && new Date(t.date) <= cutoff
        )
      : transactions.filter(t => t.status === 'COMPLETED' && new Date(t.date) <= cutoff);
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) return 0;
    let balance = productId ? 0 : (acc.balance || 0);
    txnsToUse.forEach(txn => {
      txn.entries.forEach(entry => {
        if (entry.accountId !== accountId) return;
        const a = accounts.find(x => x.id === entry.accountId);
        if (!a) return;
        if (a.type === AccountType.ASSET || a.type === AccountType.EXPENSE) {
          balance += (entry.debit || 0) - (entry.credit || 0);
        } else {
          balance += (entry.credit || 0) - (entry.debit || 0);
        }
      });
    });
    return balance;
  }, [transactions, accounts, productId]);

  const getAccountBalancesAsOf = useCallback((dayStr: string): Record<string, number> => {
    if (!dayStr || !/^\d{4}-\d{2}-\d{2}$/.test(dayStr)) return {};
    const balances: Record<string, number> = {};
    /** Local calendar-day cutoff matches date pickers; avoids UTC vs local end-of-day mismatches. */
    const txnsToUse = productId
      ? transactions.filter(
          t =>
            t.status === 'COMPLETED' &&
            (t.metadata?.storeId ?? '') === productId &&
            txnOnOrBeforeLocalDay(t.date, dayStr)
        )
      : transactions.filter(t => t.status === 'COMPLETED' && txnOnOrBeforeLocalDay(t.date, dayStr));

    accounts.forEach(acc => {
      balances[acc.id] = productId ? 0 : (acc.balance || 0);
    });

    txnsToUse.forEach(txn => {
      txn.entries.forEach(entry => {
        const acc = accounts.find(a => a.id === entry.accountId);
        if (!acc) return;

        if (acc.type === AccountType.ASSET || acc.type === AccountType.EXPENSE) {
          balances[entry.accountId] = (balances[entry.accountId] || 0) + (entry.debit - entry.credit);
        } else {
          balances[entry.accountId] = (balances[entry.accountId] || 0) + (entry.credit - entry.debit);
        }
      });
    });
    return balances;
  }, [transactions, accounts, productId]);

  const getLedger = (accountId: string) => transactionsForUser.filter(txn => txn.entries.some(e => e.accountId === accountId));

  const generateProfitAndLoss = (): ProfitAndLoss => {
    const deferredSwipePortal = deferredSwipePortalExpenseExcludedFromPl(
      transactionsForUser.filter(t => t.status === 'COMPLETED')
    );
    const income = accounts
      .filter(a => a.type === AccountType.INCOME)
      .map(a => ({ account: a, balance: getAccountBalance(a.id) }));
    
    const expenses = accounts
      .filter(a => a.type === AccountType.EXPENSE)
      .map(a => {
        let balance = getAccountBalance(a.id);
        if (a.id === 'E001' && deferredSwipePortal > 0.005) {
          balance = roundCurrency(Math.max(0, balance - deferredSwipePortal));
        }
        return { account: a, balance };
      });

    const totalIncome = income.reduce((sum, item) => sum + item.balance, 0);
    const totalExpenses = expenses.reduce((sum, item) => sum + item.balance, 0);
    const completed = transactionsForUser.filter(t => t.status === 'COMPLETED');
    const franchiseOther = totalSwipeFranchiseOtherValue(completed);
    const netProfit = roundCurrency(totalIncome - totalExpenses - franchiseOther);
    const totalExpensesLedger = accounts
      .filter(a => a.type === AccountType.EXPENSE)
      .reduce((sum, a) => sum + getAccountBalance(a.id), 0);
    const netProfitLedger = roundCurrency(totalIncome - totalExpensesLedger);

    return { income, expenses, totalIncome, totalExpenses, netProfit, netProfitLedger };
  };

  const generateBalanceSheet = (): BalanceSheet => {
    const pl = generateProfitAndLoss();
    
    const assets = accounts
      .filter(a => a.type === AccountType.ASSET)
      .map(a => ({ account: a, balance: getAccountBalance(a.id) }));
    
    const liabilities = accounts
      .filter(a => a.type === AccountType.LIABILITY && a.category !== 'Equity')
      .map(a => ({ account: a, balance: getAccountBalance(a.id) }));
    
    const equity = accounts
      .filter(a => a.category === 'Equity')
      .map(a => {
        let balance = getAccountBalance(a.id);
        // Ledger-faithful period P&L (must match assets/liabilities); not workbook-adjusted netProfit
        if (a.id === 'Q002') {
          balance += pl.netProfitLedger;
        }
        return { account: a, balance };
      });

    const totalAssets = assets.reduce((sum, item) => sum + item.balance, 0);
    const totalLiabilities = liabilities.reduce((sum, item) => sum + item.balance, 0);
    const totalEquity = equity.reduce((sum, item) => sum + item.balance, 0);

    return { assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity };
  };

  const clearWalletData = async () => {
    if (USE_API) {
      try {
        await api.resetWalletData();
        await refreshFromApi();
        toast.success('Wallet reset: transactions cleared; wallets restored to seed.');
      } catch (e: any) {
        toast.error(e?.message || 'Wallet reset failed');
      }
      return;
    }
    const seedWalletLedgerIds = new Set(INITIAL_WALLETS.map(w => w.ledgerAccountId));
    const seedById = new Map(INITIAL_ACCOUNTS.map(a => [a.id, a]));
    setTransactions([]);
    setWallets(INITIAL_WALLETS);
    setAccounts(prev => {
      const withoutExtraWallets = prev.filter(a => a.category !== 'Wallet' || seedWalletLedgerIds.has(a.id));
      return withoutExtraWallets.map(a => {
        if (a.category === 'Wallet' && seedWalletLedgerIds.has(a.id)) {
          const s = seedById.get(a.id);
          return s ? { ...s } : { ...a, balance: 0 };
        }
        if (['I001', 'I002', 'E001', 'E002', 'E003', 'E004'].includes(a.id)) {
          return { ...a, balance: 0 };
        }
        if (a.type === AccountType.LIABILITY && a.category === 'Customer') {
          return { ...a, balance: 0 };
        }
        return a;
      });
    });
    toast.success('Wallet reset: transactions cleared; wallets restored to seed.');
  };

  const clearAllData = async () => {
    if (USE_API) {
      try {
        await api.resetAllData();
        await refreshFromApi();
        toast.success('All data cleared and reset to initial state.');
      } catch (e: any) {
        toast.error(e?.message || 'Failed to clear data');
      }
      return;
    }
    localStorage.removeItem(ERP_STORAGE_KEY);
    setAccounts(INITIAL_ACCOUNTS);
    setCustomers(INITIAL_CUSTOMERS);
    setWallets(INITIAL_WALLETS);
    setTransactions([]);
    toast.success('All data cleared. Resetting to initial state.');
  };

  const exportBackup = () => {
    const erp = { accounts, customers, wallets: allWallets, transactions };
    const admin = localStorage.getItem('casifly_admin_data') || '{}';
    return JSON.stringify({ erp, admin: JSON.parse(admin), exportedAt: new Date().toISOString() }, null, 2);
  };

  const restoreBackup = (json: string): { success: boolean; error?: string } => {
    try {
      const data = JSON.parse(json);
      if (data.erp) {
        if (Array.isArray(data.erp.accounts)) setAccounts(data.erp.accounts);
        if (Array.isArray(data.erp.customers)) setCustomers(data.erp.customers);
        if (Array.isArray(data.erp.wallets)) setWallets(data.erp.wallets);
        if (Array.isArray(data.erp.transactions)) setTransactions(data.erp.transactions.map((t: Transaction) => ({ ...t, entries: normalizeLedgerEntries(t.entries) })));
      }
      if (data.admin && typeof data.admin === 'object') {
        localStorage.setItem('casifly_admin_data', JSON.stringify(data.admin));
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: 'Invalid backup file' };
    }
  };

  return (
    <ERPContext.Provider value={{
      accounts,
      customers: customersForUser,
      wallets,
      transactions: transactionsForUser,
      postTransaction,
      deleteTransaction,
      updateTransaction,
      getAccountBalance,
      getAccountBalanceAsOf,
      getAccountBalancesAsOf,
      getLedger,
      formatCurrency,
      reconcileWallet,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      addWallet,
      updateWallet,
      deleteWallet,
      addWalletPG,
      updateWalletPG,
      removeWalletPG,
      addAccount,
      updateAccount,
      deleteAccount,
      recordWalletOpeningBalance,
      generateBalanceSheet,
      generateProfitAndLoss,
      exportBackup,
      restoreBackup,
      clearWalletData,
      clearAllData
    }}>
      {children}
    </ERPContext.Provider>
  );
};

export const useERP = () => {
  const context = useContext(ERPContext);
  if (!context) throw new Error("useERP must be used within ERPProvider");
  return context;
};
