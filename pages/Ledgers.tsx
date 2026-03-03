import React, { useState, useMemo } from 'react';
import { useERP } from '../context/ERPContext';
import { Layout } from '../components/Layout';
import { Transaction, TransactionType } from '../types';
import { PageFilters, DateRange } from '../components/ui/PageFilters';
import { X, Info, Download } from 'lucide-react';
import { exportToCSV } from '../lib/export';
import { Button } from '../components/ui/Elements';

const TXN_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All Types' },
  { value: TransactionType.SWIPE_PAY, label: 'Swipe & Pay' },
  { value: TransactionType.PAY_SWIPE, label: 'Pay & Swipe' },
  { value: TransactionType.MONEY_TRANSFER, label: 'Money Transfer' },
  { value: TransactionType.JOURNAL, label: 'Journal' },
  { value: TransactionType.RECONCILIATION, label: 'Reconciliation' },
];

export const Ledgers: React.FC = () => {
  const { accounts, transactions, getAccountBalance, formatCurrency } = useERP();
  const [selectedAccount, setSelectedAccount] = useState(accounts[0]?.id || '');
  const [viewingTxn, setViewingTxn] = useState<Transaction | null>(null);
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '', preset: 'allTime' });
  const [txnTypeFilter, setTxnTypeFilter] = useState<string>('all');

  const account = accounts.find(a => a.id === selectedAccount);
  
  const filteredTxns = useMemo(() => {
    let result = transactions.filter(t => t.entries.some(e => e.accountId === selectedAccount));
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(t =>
        t.description.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)
      );
    }
    if (dateRange.from) {
      result = result.filter(t => new Date(t.date) >= new Date(dateRange.from));
    }
    if (dateRange.to) {
      const to = new Date(dateRange.to);
      to.setHours(23, 59, 59, 999);
      result = result.filter(t => new Date(t.date) <= to);
    }
    if (txnTypeFilter !== 'all') {
      result = result.filter(t => t.type === txnTypeFilter);
    }
    return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, selectedAccount, search, dateRange, txnTypeFilter]);

  const exportLedger = () => {
    const headers = ['Date', 'Description', 'Type', 'Debit', 'Credit'];
    const rows = filteredTxns.flatMap(t => {
      return t.entries.filter(e => e.accountId === selectedAccount).map(e => [
        new Date(t.date).toLocaleDateString(),
        t.description,
        t.type,
        e.debit > 0 ? formatCurrency(e.debit) : '',
        e.credit > 0 ? formatCurrency(e.credit) : '',
      ]);
    });
    exportToCSV(`ledger-${account?.name || selectedAccount}`, headers, rows);
  };

  return (
    <Layout title="Account Ledgers">
      <div className="flex flex-col gap-6">
        {/* Filters */}
        <PageFilters
          sectionTitle="Data Filters"
          searchPlaceholder="Search by description or transaction ID..."
          searchValue={search}
          onSearchChange={setSearch}
          showDateRange
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          categoryOptions={TXN_TYPE_OPTIONS}
          categoryValue={txnTypeFilter}
          onCategoryChange={setTxnTypeFilter}
          categoryLabel="Transaction Type"
        />

        {/* Account section - on top, full width */}
        <div className="bg-white/95 backdrop-blur-md p-6 rounded-3xl border-2 border-slate-100/80 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.06)] flex flex-col sm:flex-row gap-6 items-stretch">
          <div className="sm:w-80 shrink-0">
            <label className="block text-sm font-bold text-slate-700 mb-3">Select Account</label>
            <select 
              className="w-full p-3.5 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all outline-none"
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
            >
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.category})</option>)}
            </select>
          </div>

          <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:justify-end gap-4">
            <Button size="sm" variant="outline" onClick={exportLedger} className="shrink-0">
              <Download size={14} /> Export CSV
            </Button>
            <div className="p-6 bg-gradient-to-br from-indigo-50 to-violet-50/50 rounded-2xl border-2 border-indigo-100/80 text-right min-w-0 flex-1 sm:flex-initial sm:min-w-[280px]">
              <p className="text-sm font-semibold text-slate-500 mb-1">Current Balance</p>
              <p 
                className="font-extrabold text-slate-900 min-w-0 break-words tabular-nums"
                style={{ fontSize: 'clamp(1.25rem, 4vw + 0.5rem, 2.25rem)' }}
                title={formatCurrency(getAccountBalance(selectedAccount))}
              >
                {formatCurrency(getAccountBalance(selectedAccount))}
              </p>
              <p className="text-xs text-slate-400 mt-2 font-medium">{account?.type}</p>
            </div>
          </div>
        </div>

        {/* Ledger table - below account */}
        <div className="bg-white/95 backdrop-blur-md rounded-3xl border-2 border-slate-100/80 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Date</th>
                  <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Description</th>
                  <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Type</th>
                  <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-right">Debit</th>
                  <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-right">Credit</th>
                  <th className="p-4 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTxns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-500 font-medium">No transactions found for this account.</td>
                  </tr>
                ) : (
                  filteredTxns.map((txn, idx) => {
                    const entry = txn.entries.find(e => e.accountId === selectedAccount);
                    if (!entry) return null;
                    return (
                      <tr key={txn.id} className={`hover:bg-indigo-50/30 transition-colors duration-150 group ${idx % 2 === 1 ? 'bg-slate-50/50' : ''}`}>
                        <td className="p-4 text-sm text-slate-600 font-medium">{new Date(txn.date).toLocaleDateString()}</td>
                        <td className="p-4 text-sm font-semibold text-slate-800">{txn.description}</td>
                        <td className="p-4 text-xs">
                          <span className="px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 font-semibold">{txn.type}</span>
                        </td>
                        <td className="p-4 text-sm text-right font-medium text-slate-600">{entry.debit > 0 ? formatCurrency(entry.debit) : '-'}</td>
                        <td className="p-4 text-sm text-right font-medium text-slate-600">{entry.credit > 0 ? formatCurrency(entry.credit) : '-'}</td>
                        <td className="p-4 text-right">
                          <button 
                            onClick={() => setViewingTxn(txn)}
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all duration-200 opacity-0 group-hover:opacity-100"
                          >
                            <Info size={18} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Transaction Detail Modal */}
      {viewingTxn && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-fade-in border-2 border-white/20">
            <div className="p-8 border-b border-white/10 flex justify-between items-center bg-gradient-to-r from-slate-900 via-indigo-900/50 to-slate-900 text-white">
              <div>
                <h3 className="text-xl font-bold">Journal Entry Details</h3>
                <p className="text-xs text-slate-400 mt-1">ID: {viewingTxn.id}</p>
              </div>
              <button onClick={() => setViewingTxn(null)} className="p-2 hover:bg-slate-700/50 rounded-xl transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mb-1">Description</p>
                  <p className="font-semibold text-slate-800">{viewingTxn.description}</p>
                </div>
                <div>
                  <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mb-1">Date</p>
                  <p className="font-semibold text-slate-800">{new Date(viewingTxn.date).toLocaleString()}</p>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="p-4 font-bold text-slate-600">Account</th>
                      <th className="p-4 font-bold text-slate-600 text-right">Debit</th>
                      <th className="p-4 font-bold text-slate-600 text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {viewingTxn.entries.map((entry, i) => {
                      const acc = accounts.find(a => a.id === entry.accountId);
                      return (
                        <tr key={i} className="hover:bg-slate-50/50">
                          <td className="p-4">
                            <p className="font-semibold text-slate-800">{acc?.name}</p>
                            <p className="text-[10px] text-slate-400 uppercase font-medium">{acc?.type} • {acc?.id}</p>
                          </td>
                          <td className="p-4 text-right font-mono font-medium text-slate-700">{entry.debit > 0 ? formatCurrency(entry.debit) : '-'}</td>
                          <td className="p-4 text-right font-mono font-medium text-slate-700">{entry.credit > 0 ? formatCurrency(entry.credit) : '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-200">
                    <tr>
                      <td className="p-4">Total</td>
                      <td className="p-4 text-right font-mono">{formatCurrency(viewingTxn.entries.reduce((s, e) => s + e.debit, 0))}</td>
                      <td className="p-4 text-right font-mono">{formatCurrency(viewingTxn.entries.reduce((s, e) => s + e.credit, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            <div className="p-6 bg-slate-50 border-t flex justify-end">
              <button 
                onClick={() => setViewingTxn(null)}
                className="px-6 py-3 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800 transition-all duration-200 active:scale-[0.98]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};
