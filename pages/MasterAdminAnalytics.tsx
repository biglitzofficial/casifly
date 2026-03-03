import React, { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardHeader, CardContent, Input, Button } from '../components/ui/Elements';
import { BarChart3, TrendingUp, Wallet, Store, Filter, Trophy, Award } from 'lucide-react';
import { Product, Transaction, TransactionMetadata } from '../types';
import { formatCurrency } from '../lib/utils';

const ERP_STORAGE_KEY = 'finledger_erp_data';
const INCOME_ACCOUNTS = ['I001', 'I002']; // Service Charges, Wallet Surplus

interface ERPData {
  accounts?: { id: string }[];
  wallets?: { id: string; name: string }[];
  transactions?: Transaction[];
}

const loadERPData = (): ERPData => {
  try {
    const raw = localStorage.getItem(ERP_STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      return {
        accounts: data.accounts || [],
        wallets: data.wallets || [],
        transactions: data.transactions || [],
      };
    }
  } catch (_) {}
  return { accounts: [], wallets: [], transactions: [] };
};

const getRevenueFromTransaction = (txn: Transaction): number => {
  if (txn.status !== 'COMPLETED') return 0;
  return txn.entries.reduce((sum, e) => {
    if (INCOME_ACCOUNTS.includes(e.accountId)) return sum + e.credit;
    return sum;
  }, 0);
};

const parseDate = (s: string) => {
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

export const MasterAdminAnalytics: React.FC = () => {
  const { products } = useAuth();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [storeTypeFilter, setStoreTypeFilter] = useState<string>('all');
  const [refreshKey, setRefreshKey] = useState(0);

  const erpData = useMemo(loadERPData, [refreshKey]);
  const transactions = erpData.transactions || [];
  const wallets = erpData.wallets || [];

  const productMap = useMemo(() => {
    const m: Record<string, Product> = {};
    products.forEach(p => { m[p.id] = p; });
    return m;
  }, [products]);

  const filteredTransactions = useMemo(() => {
    let list = transactions.filter(t => t.status === 'COMPLETED');
    if (dateFrom) {
      const from = new Date(dateFrom);
      list = list.filter(t => parseDate(t.date) && parseDate(t.date)! >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      list = list.filter(t => parseDate(t.date) && parseDate(t.date)! <= to);
    }
    if (storeFilter !== 'all') {
      list = list.filter(t => (t.metadata as TransactionMetadata)?.storeId === storeFilter);
    }
    if (storeTypeFilter !== 'all') {
      list = list.filter(t => {
        const storeId = (t.metadata as TransactionMetadata)?.storeId;
        const p = storeId ? productMap[storeId] : null;
        return p?.storeType === storeTypeFilter;
      });
    }
    return list;
  }, [transactions, dateFrom, dateTo, storeFilter, storeTypeFilter, productMap]);

  const analytics = useMemo(() => {
    const byStore: Record<string, { revenue: number; byWallet: Record<string, number> }> = {};
    const byType: Record<string, number> = { other: 0, casifly: 0 };
    const unassigned = { revenue: 0, byWallet: {} as Record<string, number> };
    let totalRevenue = 0;

    filteredTransactions.forEach(txn => {
      const rev = getRevenueFromTransaction(txn);
      if (rev <= 0) return;
      const meta = txn.metadata as TransactionMetadata | undefined;
      const storeId = meta?.storeId;
      const walletId = meta?.walletId;

      totalRevenue += rev;

      if (!storeId) {
        unassigned.revenue += rev;
        if (walletId) unassigned.byWallet[walletId] = (unassigned.byWallet[walletId] || 0) + rev;
        return;
      }

      const product = productMap[storeId];
      const storeType = product?.storeType || 'other';
      byType[storeType] = (byType[storeType] || 0) + rev;

      if (!byStore[storeId]) byStore[storeId] = { revenue: 0, byWallet: {} };
      byStore[storeId].revenue += rev;
      if (walletId) {
        byStore[storeId].byWallet[walletId] = (byStore[storeId].byWallet[walletId] || 0) + rev;
      }
    });

    // Top performers: stores ranked by revenue
    const topStores = Object.entries(byStore)
      .map(([storeId, data]) => ({ storeId, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    return {
      byStore,
      byType,
      unassigned,
      totalRevenue,
      topStores,
      walletNames: Object.fromEntries(wallets.map(w => [w.id, w.name])),
    };
  }, [filteredTransactions, productMap, wallets]);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader
          title="Filters"
          subtitle="Filter analytics by date, store, and store type"
          action={<Filter className="w-5 h-5 text-slate-400" />}
        />
        <CardContent>
          <div className="flex flex-wrap items-end gap-4 mb-4">
          <Button variant="outline" size="sm" onClick={() => setRefreshKey(k => k + 1)}>
            Refresh Data
          </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Input
              label="From Date"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <Input
              label="To Date"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Store</label>
              <select
                className="w-full px-4 py-3 rounded-2xl border-2 border-slate-200"
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
              >
                <option value="all">All Stores</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Store Type</label>
              <select
                className="w-full px-4 py-3 rounded-2xl border-2 border-slate-200"
                value={storeTypeFilter}
                onChange={(e) => setStoreTypeFilter(e.target.value)}
              >
                <option value="all">All Types</option>
                <option value="other">Other Store</option>
                <option value="casifly">Casifly Store</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top Performance */}
      {analytics.topStores.length > 0 && (
        <Card>
          <CardHeader
            title="Top Performing Stores"
            subtitle="Stores ranked by revenue (best to worst)"
            action={<Trophy className="w-5 h-5 text-amber-500" />}
          />
          <CardContent>
            <div className="space-y-3">
              {analytics.topStores.map((item, idx) => {
                const product = productMap[item.storeId];
                const rank = idx + 1;
                const rankStyle = rank === 1 ? 'bg-amber-100 text-amber-700' : rank === 2 ? 'bg-slate-200 text-slate-700' : rank === 3 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600';
                const pct = analytics.totalRevenue > 0 ? ((item.revenue / analytics.totalRevenue) * 100).toFixed(1) : '0';
                return (
                  <div key={item.storeId} className="flex items-center gap-4 p-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50/50">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg shrink-0 ${rankStyle}`}>
                      {rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900">{product?.name || item.storeId}</p>
                      <p className="text-xs text-slate-500">
                        {product?.storeType === 'casifly' ? 'Casifly' : 'Other'} • {item.storeId} • {pct}% of total
                      </p>
                    </div>
                    <p className="text-lg font-black text-indigo-600 shrink-0">{formatCurrency(item.revenue)}</p>
                    {rank <= 3 && <Award className="w-5 h-5 text-amber-500 shrink-0" />}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-500">Total Revenue</p>
                <p className="text-2xl font-black text-slate-900">{formatCurrency(analytics.totalRevenue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center">
                <Store className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-500">Other Store Revenue</p>
                <p className="text-2xl font-black text-slate-900">{formatCurrency(analytics.byType.other)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-500">Casifly Store Revenue</p>
                <p className="text-2xl font-black text-slate-900">{formatCurrency(analytics.byType.casifly)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Store Performance */}
      <Card>
        <CardHeader
          title="Store Performance"
          subtitle="Revenue and wallet-wise breakdown per store"
        />
        <CardContent>
          {Object.keys(analytics.byStore).length === 0 && analytics.unassigned.revenue === 0 ? (
            <p className="text-slate-500 py-8 text-center">No transaction revenue in selected period.</p>
          ) : (
            <div className="space-y-6">
              {Object.entries(analytics.byStore).map(([storeId, data]) => {
                const product = productMap[storeId];
                return (
                  <div key={storeId} className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50">
                    <div className="flex justify-between items-center mb-3">
                      <div>
                        <p className="font-bold text-slate-900">{product?.name || storeId}</p>
                        <p className="text-xs text-slate-500">
                          {product?.storeType === 'casifly' ? 'Casifly' : 'Other'} • {storeId}
                        </p>
                      </div>
                      <p className="text-lg font-black text-indigo-600">{formatCurrency(data.revenue)}</p>
                    </div>
                    {Object.keys(data.byWallet).length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                        {Object.entries(data.byWallet).map(([wId, amt]) => (
                          <div key={wId} className="flex items-center gap-2 p-2 bg-white rounded-xl border">
                            <Wallet className="w-4 h-4 text-slate-400" />
                            <span className="text-sm text-slate-600">{analytics.walletNames[wId] || wId}</span>
                            <span className="ml-auto font-bold text-slate-800">{formatCurrency(amt)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {analytics.unassigned.revenue > 0 && (
                <div className="border border-amber-200 rounded-2xl p-4 bg-amber-50/50">
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <p className="font-bold text-slate-900">Unassigned (no store)</p>
                      <p className="text-xs text-slate-500">Transactions before store tracking</p>
                    </div>
                    <p className="text-lg font-black text-amber-600">{formatCurrency(analytics.unassigned.revenue)}</p>
                  </div>
                  {Object.keys(analytics.unassigned.byWallet).length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                      {Object.entries(analytics.unassigned.byWallet).map(([wId, amt]) => (
                        <div key={wId} className="flex items-center gap-2 p-2 bg-white rounded-xl border">
                          <Wallet className="w-4 h-4 text-slate-400" />
                          <span className="text-sm text-slate-600">{analytics.walletNames[wId] || wId}</span>
                          <span className="ml-auto font-bold text-slate-800">{formatCurrency(amt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
