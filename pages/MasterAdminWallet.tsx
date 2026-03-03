import React, { useState, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardHeader, CardContent, Input, Button } from '../components/ui/Elements';
import { Wallet, Plus, Trash2, Edit2, Globe, Store, X } from 'lucide-react';
import { Wallet as WalletType, Account, AccountType } from '../types';
import { formatCurrency, generateId } from '../lib/utils';
import { safeParseFloat } from '../lib/utils';
import { useConfirm } from '../context/ConfirmContext';

const ERP_STORAGE_KEY = 'finledger_erp_data';

interface ERPData {
  accounts: Account[];
  customers: { id: string }[];
  wallets: WalletType[];
  transactions: unknown[];
}

const loadERP = (): ERPData => {
  try {
    const raw = localStorage.getItem(ERP_STORAGE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      return {
        accounts: d.accounts || [],
        customers: d.customers || [],
        wallets: d.wallets || [],
        transactions: d.transactions || [],
      };
    }
  } catch (_) {}
  return { accounts: [], customers: [], wallets: [], transactions: [] };
};

const saveERP = (data: ERPData) => {
  localStorage.setItem(ERP_STORAGE_KEY, JSON.stringify(data));
};

export const MasterAdminWallet: React.FC = () => {
  const { products } = useAuth();
  const { confirm } = useConfirm();
  const [refreshKey, setRefreshKey] = useState(0);
  const [showAddForm, setShowAddForm] = useState(false);
  const [walletScope, setWalletScope] = useState<'global' | 'store'>('global');
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [form, setForm] = useState({
    name: '',
    pgName: 'Default PG',
    visa: '1.2',
    master: '1.2',
    amex: '2.5',
    rupay: '0.5',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const erp = useMemo(() => loadERP(), [refreshKey]);
  const productMap = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products]);

  type TxnWithMeta = { status: string; entries: { accountId: string; debit: number; credit: number }[]; metadata?: { storeId?: string } };

  const getBalance = useCallback((ledgerAccountId: string) => {
    const acc = erp.accounts.find(a => a.id === ledgerAccountId);
    if (!acc) return 0;
    const txns = (erp.transactions as TxnWithMeta[]) || [];
    let bal = acc.balance || 0;
    txns.filter(t => t.status === 'COMPLETED').forEach(t => {
      t.entries?.forEach(e => {
        if (e.accountId === ledgerAccountId) {
          if (acc.type === AccountType.ASSET || acc.type === AccountType.EXPENSE) {
            bal += e.debit - e.credit;
          } else {
            bal += e.credit - e.debit;
          }
        }
      });
    });
    return bal;
  }, [erp]);

  // Store-specific balance: only count transactions for this store (each store sees only their own wallet balance)
  const getBalanceForStore = useCallback((ledgerAccountId: string, storeId: string) => {
    const acc = erp.accounts.find(a => a.id === ledgerAccountId);
    if (!acc) return 0;
    const txns = (erp.transactions as TxnWithMeta[]) || [];
    let bal = 0;
    txns.filter(t => t.status === 'COMPLETED' && (t.metadata?.storeId ?? '') === storeId).forEach(t => {
      t.entries?.forEach(e => {
        if (e.accountId === ledgerAccountId) {
          if (acc.type === AccountType.ASSET || acc.type === AccountType.EXPENSE) {
            bal += e.debit - e.credit;
          } else {
            bal += e.credit - e.debit;
          }
        }
      });
    });
    return bal;
  }, [erp]);

  const handleAddWallet = (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!form.name?.trim()) err.name = 'Wallet name is required';
    else if (form.name.trim().length < 2) err.name = 'Name must be at least 2 characters';
    if (walletScope === 'store' && !selectedStoreId) err.store = 'Please select a store';
    (['visa', 'master', 'amex', 'rupay'] as const).forEach(k => {
      const v = safeParseFloat(form[k]);
      if (isNaN(v) || v < 0 || v > 100) err[k] = 'Must be 0–100%';
    });
    setErrors(err);
    if (Object.keys(err).length > 0) return;

    const ledgerId = generateId('A');
    const walletId = generateId('W');
    const newAccount: Account = {
      id: ledgerId,
      name: form.name.trim(),
      type: AccountType.ASSET,
      category: 'Wallet',
      balance: 0,
    };
    const newWallet: WalletType = {
      id: walletId,
      name: form.name.trim(),
      ledgerAccountId: ledgerId,
      pgs: [{ name: form.pgName.trim(), charges: { visa: safeParseFloat(form.visa), master: safeParseFloat(form.master), amex: safeParseFloat(form.amex), rupay: safeParseFloat(form.rupay) } }],
      storeId: walletScope === 'store' ? selectedStoreId : undefined,
    };

    const updated = {
      ...erp,
      accounts: [...erp.accounts, newAccount],
      wallets: [...erp.wallets, newWallet],
    };
    saveERP(updated);
    setShowAddForm(false);
    setForm({ name: '', pgName: 'Default PG', visa: '1.2', master: '1.2', amex: '2.5', rupay: '0.5' });
    setRefreshKey(k => k + 1);
  };

  const handleDeleteWallet = async (w: WalletType) => {
    const ok = await confirm({
      title: 'Delete Wallet',
      message: `Delete wallet "${w.name}"? This will remove its ledger account.`,
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    const updated = {
      ...erp,
      accounts: erp.accounts.filter(a => a.id !== w.ledgerAccountId),
      wallets: erp.wallets.filter(wl => wl.id !== w.id),
    };
    saveERP(updated);
    setRefreshKey(k => k + 1);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    const name = editName.trim();
    if (!name || name.length < 2) {
      setErrors({ name: 'Name must be at least 2 characters' });
      return;
    }
    const wallet = erp.wallets.find(w => w.id === editingId);
    if (!wallet) return;
    const updated = {
      ...erp,
      wallets: erp.wallets.map(w => (w.id === editingId ? { ...w, name } : w)),
      accounts: erp.accounts.map(a => (a.id === wallet.ledgerAccountId ? { ...a, name } : a)),
    };
    saveERP(updated);
    setEditingId(null);
    setRefreshKey(k => k + 1);
  };

  const globalWallets = erp.wallets.filter(w => !w.storeId);
  const storeWallets = erp.wallets.filter(w => w.storeId);

  // Per-store: global wallets + store-specific wallets for each store
  const walletsByStore = useMemo(() => {
    return products.map(store => ({
      store,
      wallets: [
        ...globalWallets,
        ...storeWallets.filter(w => w.storeId === store.id),
      ],
    }));
  }, [products, globalWallets, storeWallets]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Wallets"
          subtitle="Create global wallets (all stores) or store-specific wallets. Store users can edit wallet details but cannot create new wallets."
          action={
            <Button size="sm" onClick={() => setShowAddForm(true)}>
              <Plus size={16} />
              Add Wallet
            </Button>
          }
        />
        <CardContent>
          {showAddForm && (
            <form onSubmit={handleAddWallet} className="mb-6 p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-slate-800 dark:text-slate-200">Create New Wallet</h3>
                <button type="button" onClick={() => setShowAddForm(false)} className="p-2 text-slate-400 hover:text-slate-600">
                  <X size={20} />
                </button>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Wallet Scope</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={walletScope === 'global'} onChange={() => setWalletScope('global')} />
                    <Globe size={18} /> All Stores (Global)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={walletScope === 'store'} onChange={() => setWalletScope('store')} />
                    <Store size={18} /> Store-specific
                  </label>
                </div>
              </div>
              {walletScope === 'store' && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Select Store</label>
                  <select
                    className="w-full px-4 py-3 rounded-2xl border-2 border-slate-200 dark:border-slate-600 dark:bg-slate-800"
                    value={selectedStoreId}
                    onChange={(e) => setSelectedStoreId(e.target.value)}
                  >
                    <option value="">— Select store —</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
                    ))}
                  </select>
                  {errors.store && <p className="text-sm text-rose-600 mt-1">{errors.store}</p>}
                </div>
              )}
              <Input label="Wallet Name" value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors({}); }} error={errors.name} placeholder="e.g. Razorpay" />
              <Input label="PG Name" value={form.pgName} onChange={(e) => setForm({ ...form, pgName: e.target.value })} placeholder="Default PG" />
              <div className="grid grid-cols-4 gap-4">
                <Input label="Visa %" type="number" step="0.1" value={form.visa} onChange={(e) => setForm({ ...form, visa: e.target.value })} error={errors.visa} />
                <Input label="Master %" type="number" step="0.1" value={form.master} onChange={(e) => setForm({ ...form, master: e.target.value })} error={errors.master} />
                <Input label="Amex %" type="number" step="0.1" value={form.amex} onChange={(e) => setForm({ ...form, amex: e.target.value })} error={errors.amex} />
                <Input label="Rupay %" type="number" step="0.1" value={form.rupay} onChange={(e) => setForm({ ...form, rupay: e.target.value })} error={errors.rupay} />
              </div>
              <div className="flex gap-3">
                <Button type="submit">Create Wallet</Button>
                <Button type="button" variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
              </div>
            </form>
          )}

          {erp.wallets.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Wallet className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="font-semibold">No wallets yet</p>
              <p className="text-sm mt-1">Create a global wallet (all stores) or a store-specific wallet.</p>
              <Button className="mt-4" onClick={() => setShowAddForm(true)}>
                <Plus size={16} />
                Add First Wallet
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {globalWallets.length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                    <Globe size={18} /> Global Wallets (All Stores)
                  </h4>
                  <div className="space-y-2">
                    {globalWallets.map(w => (
                      <div key={w.id} className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                        <div>
                          <p className="font-bold text-slate-900 dark:text-slate-100">{w.name}</p>
                          <p className="text-xs text-slate-500">{w.ledgerAccountId} • {w.pgs.map(pg => pg.name).join(', ')}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-semibold text-indigo-600">{formatCurrency(getBalance(w.ledgerAccountId))}</span>
                          {editingId === w.id ? (
                            <form onSubmit={handleSaveEdit} className="flex gap-2">
                              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="px-3 py-2 rounded-lg border dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100" />
                              <Button size="sm" type="submit">Save</Button>
                              <Button size="sm" variant="outline" type="button" onClick={() => setEditingId(null)}>Cancel</Button>
                            </form>
                          ) : (
                            <>
                              <button onClick={() => { setEditingId(w.id); setEditName(w.name); }} className="p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg"><Edit2 size={16} /></button>
                              <button onClick={() => handleDeleteWallet(w)} className="p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg"><Trash2 size={16} /></button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {storeWallets.length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                    <Store size={18} /> Store-specific Wallets
                  </h4>
                  <div className="space-y-2">
                    {storeWallets.map(w => (
                      <div key={w.id} className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                        <div>
                          <p className="font-bold text-slate-900 dark:text-slate-100">{w.name}</p>
                          <p className="text-xs text-slate-500">
                            {productMap[w.storeId!]?.name || w.storeId} • {w.ledgerAccountId}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-semibold text-indigo-600">{formatCurrency(getBalance(w.ledgerAccountId))}</span>
                          {editingId === w.id ? (
                            <form onSubmit={handleSaveEdit} className="flex gap-2">
                              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="px-3 py-2 rounded-lg border dark:bg-slate-800 dark:border-slate-600" />
                              <Button size="sm" type="submit">Save</Button>
                              <Button size="sm" variant="outline" type="button" onClick={() => setEditingId(null)}>Cancel</Button>
                            </form>
                          ) : (
                            <>
                              <button onClick={() => { setEditingId(w.id); setEditName(w.name); }} className="p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg"><Edit2 size={16} /></button>
                              <button onClick={() => handleDeleteWallet(w)} className="p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg"><Trash2 size={16} /></button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Store-wise View: What each store sees */}
              <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
                <h4 className="font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                  <Store size={18} /> Store-wise: Wallets per Store
                </h4>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                  Each store sees only their own balances—transactions are filtered by store. Global wallets show per-store balance; store-specific wallets show that store&apos;s balance only.
                </p>
                <div className="space-y-4">
                  {walletsByStore.map(({ store, wallets }) => (
                    <div key={store.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                      <div className="px-4 py-3 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
                        <p className="font-bold text-slate-800 dark:text-slate-200">{store.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{store.id} • {store.storeType === 'casifly' ? 'Casifly' : 'Other'}</p>
                      </div>
                      <div className="p-4 space-y-2">
                        {wallets.length === 0 ? (
                          <p className="text-sm text-slate-500 dark:text-slate-400 py-2">No wallets for this store.</p>
                        ) : (
                          wallets.map(w => (
                            <div key={w.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-white dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                              <div>
                                <span className="font-semibold text-slate-800 dark:text-slate-200">{w.name}</span>
                                <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                                  {!w.storeId ? '(global)' : '(store-specific)'} • {w.ledgerAccountId}
                                </span>
                              </div>
                              <span className="font-mono text-sm font-semibold text-indigo-600 dark:text-indigo-400">{formatCurrency(getBalanceForStore(w.ledgerAccountId, store.id))}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
