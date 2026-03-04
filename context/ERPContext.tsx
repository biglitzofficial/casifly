import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import { 
  Account, AccountType, Customer, Wallet, Transaction, LedgerEntry, TransactionType,
  CreateCustomerDTO, CreateWalletDTO, PGConfig, TransactionMetadata
} from '../types';
import { INITIAL_ACCOUNTS, INITIAL_CUSTOMERS, INITIAL_WALLETS } from '../constants';
import { formatCurrency, generateId } from '../lib/utils';
import { useToast } from './ToastContext';
import { useAuth } from './AuthContext';
import { api, USE_API } from '../lib/api';

interface ERPContextType {
  accounts: Account[];
  customers: Customer[];
  wallets: Wallet[];
  transactions: Transaction[];
  
  // Actions
  postTransaction: (description: string, type: TransactionType, entries: LedgerEntry[], metadata?: TransactionMetadata, date?: string) => void;
  reconcileWallet: (walletId: string, actualBalance: number) => void;
  
  // Masters CRUD
  addCustomer: (data: CreateCustomerDTO) => Promise<string>; // Returns ID
  updateCustomer: (id: string, data: Partial<Customer>) => void;
  deleteCustomer: (id: string) => void;
  addWallet: (data: CreateWalletDTO) => void;
  updateWallet: (id: string, data: Partial<Pick<Wallet, 'name'>>) => void;
  deleteWallet: (id: string) => void;
  addWalletPG: (walletId: string, pgConfig: PGConfig) => void;
  updateWalletPG: (walletId: string, oldPgName: string, pgConfig: PGConfig) => void;
  addAccount: (data: { name: string; category: 'Bank' | 'Cash' }) => void;

  // Getters
  getAccountBalance: (accountId: string) => number;
  getLedger: (accountId: string) => Transaction[];
  generateBalanceSheet: () => BalanceSheet;
  generateProfitAndLoss: () => ProfitAndLoss;
  
  // Utils
  formatCurrency: (amount: number) => string;

  // Backup/Restore
  exportBackup: () => string;
  restoreBackup: (json: string) => { success: boolean; error?: string };
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
  const [transactions, setTransactions] = useState<Transaction[]>(stored?.transactions || []);

  const refreshFromApi = useCallback(async () => {
    if (!USE_API || !api.getToken()) return;
    try {
      const [accs, custs, wals, txns] = await Promise.all([
        api.getAccounts(),
        api.getCustomers(),
        api.getWallets(),
        api.getTransactions(),
      ]);
      setAccounts((accs as any[]).map(a => ({ id: a.id, name: a.name, type: a.type, category: a.category, balance: a.balance ?? 0 })));
      setCustomers((custs as any[]).map(c => ({ id: c.id, name: c.name, phone: c.phone, commissionRates: c.commissionRates, ledgerAccountId: c.ledgerAccountId, joinedAt: c.joinedAt, storeId: c.storeId })));
      setWallets((wals as any[]).map(w => ({ id: w.id, name: w.name, ledgerAccountId: w.ledgerAccountId, pgs: w.pgs, storeId: w.storeId })));
      setTransactions((txns as any[]).map(t => ({ id: t.id, date: t.date, description: t.description, type: t.type, entries: t.entries, status: t.status ?? 'COMPLETED', metadata: t.metadata, referenceId: t.referenceId })));
    } catch (e) {
      console.error('ERP fetch failed', e);
    }
  }, []);

  useEffect(() => {
    refreshFromApi();
  }, [user?.id, refreshFromApi]);

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

  // Filter customers for store user: only their store's customers
  const customersForUser = useMemo(() => {
    if (!productId) return customers;
    return customers.filter(c => c.storeId === productId);
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
    const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0);
    const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      toast.error(`Transaction Unbalanced! Dr: ${totalDebit.toFixed(2)}, Cr: ${totalCredit.toFixed(2)}`);
      return;
    }
    if (entries.length < 2) {
      toast.error("A transaction must have at least two entries (Debit and Credit).");
      return;
    }
    const invalidAccounts = entries.filter(e => !accounts.some(a => a.id === e.accountId));
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
      api.postTransaction({ description, type, entries, metadata: metadataWithStore, date: dateStr })
        .then((t: any) => {
          setTransactions(prev => [{ id: t.id, date: t.date, description: t.description, type: t.type, entries: t.entries, status: 'COMPLETED', metadata: t.metadata }, ...prev]);
        })
        .catch(err => toast.error(err?.message || 'Transaction failed'));
      return;
    }

    const newTxn: Transaction = {
      id: crypto.randomUUID(),
      date: dateStr || new Date().toISOString(),
      description,
      type,
      entries,
      status: 'COMPLETED',
      metadata: metadataWithStore
    };
    setTransactions(prev => [newTxn, ...prev]);
  };

  const addCustomer = async (data: CreateCustomerDTO): Promise<string> => {
    if (USE_API) {
      try {
        const c = await api.addCustomer({ name: data.name, phone: data.phone, commissionRates: data.commissionRates }) as any;
        setAccounts(prev => [...prev, { id: c.ledgerAccountId, name: `${c.name} Payable`, type: AccountType.LIABILITY, category: 'Customer' as const, balance: 0 }]);
        setCustomers(prev => [...prev, { id: c.id, name: c.name, phone: c.phone, commissionRates: c.commissionRates || data.commissionRates, ledgerAccountId: c.ledgerAccountId, joinedAt: c.joinedAt, storeId: c.storeId }]);
        return c.id;
      } catch (e: any) {
        toast.error(e?.message || 'Failed to add customer');
        return '';
      }
    }
    const ledgerId = generateId('L');
    const customerId = generateId('C');
    const newAccount: Account = { id: ledgerId, name: `${data.name} Payable`, type: AccountType.LIABILITY, category: 'Customer', balance: 0 };
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
    if (USE_API) {
      api.addWallet({ name: data.name, pgName: data.pgName, charges: data.charges, storeId: data.storeId })
        .then(() => refreshFromApi())
        .catch((e: any) => toast.error(e?.message || 'Failed to add wallet'));
      return;
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
    };

    setAccounts(prev => [...prev, newAccount]);
    setWallets(prev => [...prev, newWallet]);
  };

  const updateWallet = (id: string, data: Partial<Pick<Wallet, 'name'>>) => {
    const wallet = allWallets.find(w => w.id === id);
    if (!wallet) return;
    if (USE_API) {
      api.updateWallet(id, { name: data.name }).then(() => refreshFromApi()).catch((e: any) => toast.error(e?.message || 'Update failed'));
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
  const getLedger = (accountId: string) => transactionsForUser.filter(txn => txn.entries.some(e => e.accountId === accountId));

  const generateProfitAndLoss = (): ProfitAndLoss => {
    const income = accounts
      .filter(a => a.type === AccountType.INCOME)
      .map(a => ({ account: a, balance: getAccountBalance(a.id) }));
    
    const expenses = accounts
      .filter(a => a.type === AccountType.EXPENSE)
      .map(a => ({ account: a, balance: getAccountBalance(a.id) }));

    const totalIncome = income.reduce((sum, item) => sum + item.balance, 0);
    const totalExpenses = expenses.reduce((sum, item) => sum + item.balance, 0);
    const netProfit = totalIncome - totalExpenses;

    return { income, expenses, totalIncome, totalExpenses, netProfit };
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
        // Add net profit to Retained Earnings for reporting
        if (a.id === 'Q002') {
          balance += pl.netProfit;
        }
        return { account: a, balance };
      });

    const totalAssets = assets.reduce((sum, item) => sum + item.balance, 0);
    const totalLiabilities = liabilities.reduce((sum, item) => sum + item.balance, 0);
    const totalEquity = equity.reduce((sum, item) => sum + item.balance, 0);

    return { assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity };
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
        if (Array.isArray(data.erp.transactions)) setTransactions(data.erp.transactions);
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
      getAccountBalance,
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
      addAccount,
      generateBalanceSheet,
      generateProfitAndLoss,
      exportBackup,
      restoreBackup
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
