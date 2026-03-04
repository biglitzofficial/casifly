import React, { useState, useMemo, useEffect } from 'react';
import { useERP } from '../context/ERPContext';
import { Layout } from '../components/Layout';
import { Transaction, TransactionType } from '../types';
import { PageFilters, DateRange } from '../components/ui/PageFilters';
import { X, Info, Download, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
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

const ALL_ACCOUNTS = '__all__';
const PAGE_SIZE = 15;

export const Ledgers: React.FC = () => {
  const { accounts, wallets, transactions, getAccountBalance, formatCurrency } = useERP();
  const [selectedAccount, setSelectedAccount] = useState(ALL_ACCOUNTS);
  const [viewingTxn, setViewingTxn] = useState<Transaction | null>(null);
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '', preset: 'allTime' });
  const [txnTypeFilter, setTxnTypeFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  const hasActiveFilters = search.trim() !== '' || dateRange.preset !== 'allTime' || (dateRange.from || dateRange.to) || txnTypeFilter !== 'all';
  const resetFilters = () => {
    setSearch('');
    setDateRange({ from: '', to: '', preset: 'allTime' });
    setTxnTypeFilter('all');
    setPage(1);
  };

  useEffect(() => setPage(1), [search, dateRange, txnTypeFilter]);

  const account = accounts.find(a => a.id === selectedAccount);
  const showAllAccounts = selectedAccount === ALL_ACCOUNTS;

  const cashAccounts = accounts.filter(a => a.category === 'Cash');
  const bankAccounts = accounts.filter(a => a.category === 'Bank');
  const totalLiquidity = cashAccounts.reduce((s, a) => s + getAccountBalance(a.id), 0)
    + bankAccounts.reduce((s, a) => s + getAccountBalance(a.id), 0)
    + wallets.reduce((s, w) => s + getAccountBalance(w.ledgerAccountId), 0);

  const filteredTxns = useMemo(() => {
    let result = showAllAccounts
      ? [...transactions]
      : transactions.filter(t => t.entries.some(e => e.accountId === selectedAccount));
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(t =>
        t.description.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)
      );
    }
    if (dateRange.from || dateRange.to) {
      if (dateRange.from) {
        result = result.filter(t => new Date(t.date) >= new Date(dateRange.from));
      }
      if (dateRange.to) {
        const to = new Date(dateRange.to);
        to.setHours(23, 59, 59, 999);
        result = result.filter(t => new Date(t.date) <= to);
      }
    }
    if (txnTypeFilter !== 'all') {
      result = result.filter(t => t.type === txnTypeFilter);
    }
    return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, selectedAccount, search, dateRange, txnTypeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredTxns.length / PAGE_SIZE));
  const effectivePage = Math.min(Math.max(1, page), totalPages);
  const paginatedTxns = filteredTxns.slice((effectivePage - 1) * PAGE_SIZE, effectivePage * PAGE_SIZE);

  const { totalDebit, totalCredit } = useMemo(() => {
    if (showAllAccounts) {
      const entries = filteredTxns.flatMap(t => t.entries);
      return {
        totalDebit: entries.reduce((s, e) => s + (e.debit || 0), 0),
        totalCredit: entries.reduce((s, e) => s + (e.credit || 0), 0),
      };
    }
    return filteredTxns.reduce(
      (acc, t) => {
        const e = t.entries.find(x => x.accountId === selectedAccount);
        return {
          totalDebit: acc.totalDebit + (e?.debit || 0),
          totalCredit: acc.totalCredit + (e?.credit || 0),
        };
      },
      { totalDebit: 0, totalCredit: 0 }
    );
  }, [filteredTxns, showAllAccounts, selectedAccount]);

  const exportLedger = () => {
    if (showAllAccounts) {
      const headers = ['Date', 'Description', 'Type', 'Account', 'Debit', 'Credit'];
      const rows = filteredTxns.flatMap(t =>
        t.entries.map(e => {
          const acc = accounts.find(a => a.id === e.accountId);
          return [
            new Date(t.date).toLocaleDateString(),
            t.description,
            t.type,
            acc?.name || e.accountId,
            e.debit > 0 ? formatCurrency(e.debit) : '',
            e.credit > 0 ? formatCurrency(e.credit) : '',
          ];
        })
      );
      exportToCSV('ledger-all-accounts', headers, rows);
    } else {
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
    }
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
        >
          {hasActiveFilters && (
            <Button size="sm" variant="outline" onClick={resetFilters} className="shrink-0">
              <RotateCcw size={14} /> Reset to all
            </Button>
          )}
        </PageFilters>

        {/* Account section - on top, full width */}
        <div className="bg-white/95 backdrop-blur-md p-6 rounded-3xl border-2 border-slate-100/80 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.06)] flex flex-col sm:flex-row gap-6 items-stretch">
          <div className="sm:w-80 shrink-0">
            <label className="block text-sm font-bold text-slate-700 mb-3">Select Account</label>
            <select 
              className="w-full p-3.5 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all outline-none"
              value={selectedAccount}
              onChange={(e) => { setSelectedAccount(e.target.value); setPage(1); }}
            >
              <option value={ALL_ACCOUNTS}>All Accounts</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.category})</option>)}
            </select>
          </div>

          <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:justify-end gap-4">
            <Button size="sm" variant="outline" onClick={exportLedger} className="shrink-0">
              <Download size={14} /> Export CSV
            </Button>
            <div className="p-6 bg-gradient-to-br from-indigo-50 to-violet-50/50 rounded-2xl border-2 border-indigo-100/80 text-right min-w-0 flex-1 sm:flex-initial sm:min-w-[280px]">
              <p className="text-sm font-semibold text-slate-500 mb-1">Current Balance</p>
              {showAllAccounts ? (
                <>
                  <p 
                    className="font-extrabold text-slate-900 min-w-0 break-words tabular-nums"
                    style={{ fontSize: 'clamp(1.25rem, 4vw + 0.5rem, 2.25rem)' }}
                  >
                    {formatCurrency(totalLiquidity)}
                  </p>
                  <p className="text-xs text-slate-400 mt-2 font-medium">Total Liquidity (Cash + Bank + Wallet)</p>
                </>
              ) : (
                <>
                  <p 
                    className="font-extrabold text-slate-900 min-w-0 break-words tabular-nums"
                    style={{ fontSize: 'clamp(1.25rem, 4vw + 0.5rem, 2.25rem)' }}
                    title={formatCurrency(getAccountBalance(selectedAccount))}
                  >
                    {formatCurrency(getAccountBalance(selectedAccount))}
                  </p>
                  <p className="text-xs text-slate-400 mt-2 font-medium">{account?.type}</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Totals summary */}
        {filteredTxns.length > 0 && (
          <div className="flex flex-wrap gap-4 p-4 rounded-2xl bg-gradient-to-r from-indigo-50 to-violet-50/50 border border-indigo-100">
            <div className="px-6 py-3 rounded-xl bg-white/80 border border-indigo-100">
              <p className="text-xs font-bold text-slate-500 uppercase">Total Out (Debit)</p>
              <p className="text-lg font-bold text-slate-800 tabular-nums">{formatCurrency(totalDebit)}</p>
            </div>
            <div className="px-6 py-3 rounded-xl bg-white/80 border border-indigo-100">
              <p className="text-xs font-bold text-slate-500 uppercase">Total In (Credit)</p>
              <p className="text-lg font-bold text-slate-800 tabular-nums">{formatCurrency(totalCredit)}</p>
            </div>
            <div className="px-6 py-3 rounded-xl bg-indigo-100/80 border border-indigo-200">
              <p className="text-xs font-bold text-slate-500 uppercase">Total Transactions</p>
              <p className="text-lg font-bold text-indigo-800 tabular-nums">{filteredTxns.length}</p>
            </div>
          </div>
        )}

        {/* Ledger table - below account */}
        <div className="bg-white/95 backdrop-blur-md rounded-3xl border-2 border-slate-100/80 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Date</th>
                  <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Description</th>
                  <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Type</th>
                  {showAllAccounts && (
                    <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Account</th>
                  )}
                  <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-right">Debit</th>
                  <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-right">Credit</th>
                  <th className="p-4 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedTxns.length === 0 ? (
                  <tr>
                    <td colSpan={showAllAccounts ? 7 : 6} className="p-12 text-center text-slate-500 font-medium">
                      No transactions found{showAllAccounts ? '.' : ' for this account.'}
                    </td>
                  </tr>
                ) : showAllAccounts ? (
                  paginatedTxns.flatMap((txn, tIdx) =>
                    txn.entries.map((entry, eIdx) => {
                      const acc = accounts.find(a => a.id === entry.accountId);
                      return (
                        <tr key={`${txn.id}-${eIdx}`} className={`hover:bg-indigo-50/30 transition-colors duration-150 group ${(tIdx + eIdx) % 2 === 1 ? 'bg-slate-50/50' : ''}`}>
                          <td className="p-4 text-sm text-slate-600 font-medium">{new Date(txn.date).toLocaleDateString()}</td>
                          <td className="p-4 text-sm font-semibold text-slate-800">{txn.description}</td>
                          <td className="p-4 text-xs">
                            <span className="px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 font-semibold">{txn.type}</span>
                          </td>
                          <td className="p-4 text-sm font-medium text-slate-600">{acc?.name || entry.accountId}</td>
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
                  )
                ) : (
                  paginatedTxns.map((txn, idx) => {
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
              {paginatedTxns.length > 0 && (
                <tfoot className="bg-slate-100 dark:bg-slate-800/80 border-t-2 border-slate-200">
                  <tr>
                    <td colSpan={showAllAccounts ? 4 : 3} className="p-4 text-sm font-bold text-slate-700">
                      Total (In / Out)
                    </td>
                    <td className="p-4 text-right font-bold text-slate-800 tabular-nums">
                      {formatCurrency(totalDebit)}
                    </td>
                    <td className="p-4 text-right font-bold text-slate-800 tabular-nums">
                      {formatCurrency(totalCredit)}
                    </td>
                    <td className="p-4 w-12"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {filteredTxns.length > PAGE_SIZE && (
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-4 bg-slate-50/50">
              <p className="text-sm text-slate-600 font-medium">
                Page {effectivePage} of {totalPages} • Showing {paginatedTxns.length} of {filteredTxns.length} transactions
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={effectivePage <= 1}
                  className="p-2 rounded-xl border border-slate-200 hover:bg-white hover:border-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold text-slate-700"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={effectivePage >= totalPages}
                  className="p-2 rounded-xl border border-slate-200 hover:bg-white hover:border-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold text-slate-700"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}
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
