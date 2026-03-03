import React, { useState, useMemo } from 'react';
import { useERP } from '../context/ERPContext';
import { Layout } from '../components/Layout';
import { Card, CardHeader, CardContent } from '../components/ui/Elements';
import { PageFilters, DateRange, FilterSection } from '../components/ui/PageFilters';
import { Transaction, TransactionType } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Cell } from 'recharts';
import { TrendingUp, TrendingDown, ReceiptText, User, CreditCard, Wallet as WalletIcon, Scale, FileText, Download } from 'lucide-react';
import { exportToCSV } from '../lib/export';
import { Button } from '../components/ui/Elements';

type ReportTab = 'overview' | 'balance-sheet' | 'pl' | 'transactions' | 'card' | 'wallet' | 'customer';

const CARD_NETWORK_OPTIONS = [
  { value: 'all', label: 'All Networks' },
  { value: 'visa', label: 'Visa' },
  { value: 'master', label: 'Master' },
  { value: 'amex', label: 'Amex' },
  { value: 'rupay', label: 'Rupay' },
];

export const Reports: React.FC = () => {
  const { transactions, wallets, customers, formatCurrency, generateBalanceSheet, generateProfitAndLoss } = useERP();
  const [activeTab, setActiveTab] = useState<ReportTab>('overview');
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '', preset: 'allTime' });
  const [cardNetworkFilter, setCardNetworkFilter] = useState('all');
  const [txnCustomerFilter, setTxnCustomerFilter] = useState('all');
  const [txnWalletFilter, setTxnWalletFilter] = useState('all');
  const [txnSortBy, setTxnSortBy] = useState<'date' | 'profit' | 'revenue' | 'cost'>('date');

  const filteredTransactions = useMemo(() => {
    let result = transactions;
    if (dateRange.from) {
      result = result.filter(t => new Date(t.date) >= new Date(dateRange.from));
    }
    if (dateRange.to) {
      const to = new Date(dateRange.to);
      to.setHours(23, 59, 59, 999);
      result = result.filter(t => new Date(t.date) <= to);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(t => {
        const cust = customers.find(c => c.id === t.metadata?.customerId);
        const wallet = wallets.find(w => w.id === t.metadata?.walletId);
        return (
          t.description.toLowerCase().includes(q) ||
          (cust?.name.toLowerCase().includes(q)) ||
          (wallet?.name.toLowerCase().includes(q))
        );
      });
    }
    if (cardNetworkFilter !== 'all') {
      result = result.filter(t => t.metadata?.cardType === cardNetworkFilter);
    }
    return result;
  }, [transactions, dateRange, search, cardNetworkFilter, customers, wallets]);

  const balanceSheet = generateBalanceSheet();
  const plReport = generateProfitAndLoss();

  // --- Aggregation Logic (uses filtered transactions) ---
  const calculatePL = (txns: Transaction[]) => {
    let income = 0;
    let expense = 0;
    txns.forEach(t => {
      t.entries.forEach(e => {
        if (e.accountId === 'I001' || e.accountId === 'I002') income += e.credit;
        if (['E001', 'E002', 'E003'].includes(e.accountId)) expense += e.debit;
      });
    });
    return { income, expense, profit: income - expense };
  };

  const cardStats = ['visa', 'master', 'amex', 'rupay'].map(type => {
    const subset = filteredTransactions.filter(t => t.metadata?.cardType === type);
    const { income, expense, profit } = calculatePL(subset);
    return { name: type.toUpperCase(), income, expense, profit, count: subset.length };
  });

  const walletStats = wallets.map(w => {
    const subset = filteredTransactions.filter(t => t.metadata?.walletId === w.id);
    const { income, expense, profit } = calculatePL(subset);
    return { name: w.name, income, expense, profit, count: subset.length };
  });

  const customerStats = customers.map(c => {
    const subset = filteredTransactions.filter(t => t.metadata?.customerId === c.id);
    const { income, expense, profit } = calculatePL(subset);
    return { 
      id: c.id, 
      name: c.name, 
      profit, 
      count: subset.filter((t: Transaction) => t.type === TransactionType.SWIPE_PAY).length 
    };
  }).sort((a, b) => b.profit - a.profit).slice(0, 10);

  const txnPL = useMemo(() => {
    let data = filteredTransactions
      .filter(t => t.type === TransactionType.SWIPE_PAY && t.metadata?.walletId)
      .map(t => {
        const customer = customers.find(c => c.id === t.metadata?.customerId);
        const { income, expense, profit } = calculatePL([t]);
        return { 
          id: t.id,
          date: t.date,
          customerId: t.metadata?.customerId,
          customer: customer?.name || 'Unknown',
          walletId: t.metadata?.walletId,
          wallet: wallets.find(w => w.id === t.metadata?.walletId)?.name || 'N/A',
          card: t.metadata?.cardType?.toUpperCase() || 'N/A',
          revenue: income,
          cost: expense,
          profit: profit
        };
      });
    if (txnCustomerFilter !== 'all') {
      data = data.filter(r => r.customerId === txnCustomerFilter);
    }
    if (txnWalletFilter !== 'all') {
      data = data.filter(r => r.walletId === txnWalletFilter);
    }
    data = [...data].sort((a, b) => {
      if (txnSortBy === 'date') return new Date(b.date).getTime() - new Date(a.date).getTime();
      if (txnSortBy === 'profit') return b.profit - a.profit;
      if (txnSortBy === 'revenue') return b.revenue - a.revenue;
      if (txnSortBy === 'cost') return b.cost - a.cost;
      return 0;
    });
    return data;
  }, [filteredTransactions, customers, wallets, txnCustomerFilter, txnWalletFilter, txnSortBy]);

  const totalPL = calculatePL(filteredTransactions);

  const exportPL = () => {
    const rows = [
      ...plReport.income.map(i => [i.account.name, formatCurrency(i.balance)]),
      ['Total Income', formatCurrency(plReport.totalIncome)],
      [],
      ...plReport.expenses.map(e => [e.account.name, formatCurrency(e.balance)]),
      ['Total Expenses', formatCurrency(plReport.totalExpenses)],
      [],
      ['Net Profit / (Loss)', formatCurrency(plReport.netProfit)],
    ];
    exportToCSV('profit-loss', ['Account', 'Amount'], rows);
  };

  const exportBalanceSheet = () => {
    const rows = [
      ...balanceSheet.assets.map(a => ['Asset', a.account.name, formatCurrency(a.balance)]),
      ['Asset', 'Total Assets', formatCurrency(balanceSheet.totalAssets)],
      [],
      ...balanceSheet.liabilities.map(l => ['Liability', l.account.name, formatCurrency(l.balance)]),
      ...balanceSheet.equity.map(e => ['Equity', e.account.name, formatCurrency(e.balance)]),
      ['Total', 'Liabilities + Equity', formatCurrency(balanceSheet.totalLiabilities + balanceSheet.totalEquity)],
    ];
    exportToCSV('balance-sheet', ['Type', 'Account', 'Balance'], rows);
  };

  const exportTxnPL = () => {
    const headers = ['Date', 'Customer', 'Wallet', 'Card', 'Revenue', 'Cost', 'Profit'];
    const rows = txnPL.map(r => [
      new Date(r.date).toLocaleDateString(),
      r.customer,
      r.wallet,
      r.card,
      formatCurrency(r.revenue),
      formatCurrency(r.cost),
      formatCurrency(r.profit),
    ]);
    exportToCSV('transaction-pl', headers, rows);
  };

  return (
    <Layout title="Business Analytics & P&L Engine">
      <PageFilters
        sectionTitle="Data Filters"
        searchPlaceholder="Search by customer, wallet or description..."
        searchValue={search}
        onSearchChange={setSearch}
        showDateRange
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        categoryOptions={CARD_NETWORK_OPTIONS}
        categoryValue={cardNetworkFilter}
        onCategoryChange={setCardNetworkFilter}
        categoryLabel="Card Network"
      />
      
      <FilterSection title="Report Type">
      <div className="flex gap-2 bg-white/90 backdrop-blur-md p-2 rounded-2xl border-2 border-slate-100 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.06)] overflow-x-auto">
        <TabButton id="overview" label="Performance" icon={TrendingUp} active={activeTab} onClick={setActiveTab} />
        <TabButton id="pl" label="Profit & Loss" icon={FileText} active={activeTab} onClick={setActiveTab} />
        <TabButton id="balance-sheet" label="Balance Sheet" icon={Scale} active={activeTab} onClick={setActiveTab} />
        <TabButton id="transactions" label="Transaction P&L" icon={ReceiptText} active={activeTab} onClick={setActiveTab} />
        <TabButton id="card" label="By Network" icon={CreditCard} active={activeTab} onClick={setActiveTab} />
        <TabButton id="wallet" label="By Wallet" icon={WalletIcon} active={activeTab} onClick={setActiveTab} />
        <TabButton id="customer" label="Top Customers" icon={User} active={activeTab} onClick={setActiveTab} />
      </div>
      </FilterSection>

      <div className="animate-fade-in space-y-6">
        
        {activeTab === 'pl' && (
          <div className="grid grid-cols-1 gap-6">
            <Card>
              <CardHeader title="Profit & Loss Statement" subtitle="For the current period" action={<Button size="sm" variant="outline" onClick={exportPL}><Download size={14} /> Export CSV</Button>} />
              <div className="p-6 space-y-8">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">Income</h3>
                  <DataTable 
                    headers={['Account', 'Amount']}
                    rows={plReport.income.map(i => [i.account.name, formatCurrency(i.balance)])}
                  />
                  <div className="flex justify-between p-4 bg-slate-50 font-bold text-slate-900">
                    <span>Total Income</span>
                    <span>{formatCurrency(plReport.totalIncome)}</span>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">Expenses</h3>
                  <DataTable 
                    headers={['Account', 'Amount']}
                    rows={plReport.expenses.map(e => [e.account.name, formatCurrency(e.balance)])}
                  />
                  <div className="flex justify-between p-4 bg-slate-50 font-bold text-slate-900">
                    <span>Total Expenses</span>
                    <span>{formatCurrency(plReport.totalExpenses)}</span>
                  </div>
                </div>

                <div className={`flex justify-between p-6 rounded-xl font-black text-xl ${plReport.netProfit >= 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                  <span>Net Profit / (Loss)</span>
                  <span>{formatCurrency(plReport.netProfit)}</span>
                </div>
              </div>
            </Card>
          </div>
        )}

        {activeTab === 'balance-sheet' && (
          <div className="grid grid-cols-1 gap-6">
            <Card>
              <CardHeader title="Balance Sheet" subtitle="As of today" action={<Button size="sm" variant="outline" onClick={exportBalanceSheet}><Download size={14} /> Export CSV</Button>} />
              <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-stretch">
                {/* Assets column */}
                <div className="flex flex-col">
                  <h3 className="text-xl font-black text-slate-900 border-b-2 border-slate-900 pb-2 mb-4">Assets</h3>
                  <DataTable 
                    headers={['Account', 'Balance']}
                    rows={balanceSheet.assets.map(a => [a.account.name, formatCurrency(a.balance)])}
                    rightAlignColumns={[1]}
                  />
                  <div className="mt-auto pt-4">
                    <div className="flex justify-between items-center p-4 bg-slate-900 text-white font-bold rounded-xl">
                      <span>Total Assets</span>
                      <span className="tabular-nums">{formatCurrency(balanceSheet.totalAssets)}</span>
                    </div>
                  </div>
                </div>

                {/* Liabilities & Equity column */}
                <div className="flex flex-col">
                  <h3 className="text-xl font-black text-slate-900 border-b-2 border-slate-900 pb-2 mb-4">Liabilities</h3>
                  <DataTable 
                    headers={['Account', 'Balance']}
                    rows={balanceSheet.liabilities.map(l => [l.account.name, formatCurrency(l.balance)])}
                    rightAlignColumns={[1]}
                  />
                  <div className="flex justify-between items-center p-4 bg-slate-100 text-slate-900 font-bold rounded-xl mt-2">
                    <span>Total Liabilities</span>
                    <span className="tabular-nums">{formatCurrency(balanceSheet.totalLiabilities)}</span>
                  </div>

                  <h3 className="text-xl font-black text-slate-900 border-b-2 border-slate-900 pb-2 mt-8 mb-4">Equity</h3>
                  <DataTable 
                    headers={['Account', 'Balance']}
                    rows={balanceSheet.equity.map(e => [e.account.name, formatCurrency(e.balance)])}
                    rightAlignColumns={[1]}
                  />
                  <div className="flex justify-between items-center p-4 bg-slate-100 text-slate-900 font-bold rounded-xl mt-2">
                    <span>Total Equity</span>
                    <span className="tabular-nums">{formatCurrency(balanceSheet.totalEquity)}</span>
                  </div>

                  <div className="mt-auto pt-4">
                    <div className="flex justify-between items-center p-4 bg-slate-900 text-white font-bold rounded-xl">
                      <span>Total Liabilities & Equity</span>
                      <span className="tabular-nums">{formatCurrency(balanceSheet.totalLiabilities + balanceSheet.totalEquity)}</span>
                    </div>
                  </div>
                  
                  {Math.abs(balanceSheet.totalAssets - (balanceSheet.totalLiabilities + balanceSheet.totalEquity)) > 0.01 && (
                    <div className="p-4 bg-rose-100 text-rose-700 rounded-xl font-bold text-center border border-rose-200 mt-4">
                      Warning: Balance Sheet is not in equilibrium!
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </div>
        )}
        {activeTab === 'overview' && (
           <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <KPICard title="Gross Operating Revenue" value={formatCurrency(totalPL.income)} icon={<TrendingUp className="text-emerald-500"/>} color="text-emerald-600" gradient="from-emerald-500/10 to-emerald-600/5" />
                <KPICard title="Total Direct Costs (MDR)" value={formatCurrency(totalPL.expense)} icon={<TrendingDown className="text-rose-500"/>} color="text-rose-600" gradient="from-rose-500/10 to-rose-600/5" />
                <KPICard title="Net Net Profit" value={formatCurrency(totalPL.profit)} icon={<TrendingUp className="text-indigo-500"/>} color="text-indigo-600" bg="bg-indigo-50/50" gradient="from-indigo-500/10 to-indigo-600/5" />
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader title="Network Profitability Breakdown" />
                  <CardContent className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={cardStats}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" fontSize={11} axisLine={false} tickLine={false} />
                        <YAxis fontSize={11} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{borderRadius:'8px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Bar dataKey="profit" name="Net Profit" fill="#6366f1" radius={[6,6,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader title="Top 10 Profitable Clients" />
                  <CardContent className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={customerStats} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" fontSize={11} axisLine={false} />
                        <YAxis type="category" dataKey="name" fontSize={11} width={80} axisLine={false} />
                        <Tooltip />
                        <Bar dataKey="profit" fill="#10b981" radius={[0,6,6,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
           </>
        )}

        {activeTab === 'transactions' && (
          <>
            <FilterSection title="Transaction Filters">
              <div className="flex flex-wrap gap-4 items-center bg-white/95 backdrop-blur-md p-6 rounded-3xl border-2 border-slate-100/80 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.06)]">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Customer</label>
                  <select
                    value={txnCustomerFilter}
                    onChange={e => setTxnCustomerFilter(e.target.value)}
                    className="px-4 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-semibold focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 min-w-[180px]"
                  >
                    <option value="all">All Customers</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Wallet</label>
                  <select
                    value={txnWalletFilter}
                    onChange={e => setTxnWalletFilter(e.target.value)}
                    className="px-4 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-semibold focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 min-w-[180px]"
                  >
                    <option value="all">All Wallets</option>
                    {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Sort By</label>
                  <select
                    value={txnSortBy}
                    onChange={e => setTxnSortBy(e.target.value as typeof txnSortBy)}
                    className="px-4 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-semibold focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 min-w-[160px]"
                  >
                    <option value="date">Date (newest first)</option>
                    <option value="profit">Net Profit (high to low)</option>
                    <option value="revenue">Revenue (high to low)</option>
                    <option value="cost">Cost (high to low)</option>
                  </select>
                </div>
                {(txnCustomerFilter !== 'all' || txnWalletFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => { setTxnCustomerFilter('all'); setTxnWalletFilter('all'); }}
                    className="self-end text-sm font-semibold text-slate-500 hover:text-indigo-600 px-3 py-2"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </FilterSection>
            <Card>
            <CardHeader title="Individual Transaction Profitability" subtitle="Real-time margin analysis per swipe" action={<Button size="sm" variant="outline" onClick={exportTxnPL}><Download size={14} /> Export CSV</Button>} />
            <DataTable 
              headers={['Date', 'Customer', 'Card/Wallet', 'Revenue', 'Cost', 'Net Profit']}
              rows={txnPL.map(t => [
                new Date(t.date).toLocaleDateString(),
                t.customer,
                <div className="text-xs"><span className="font-bold">{t.card}</span> • {t.wallet}</div>,
                formatCurrency(t.revenue),
                formatCurrency(t.cost),
                <span className={`font-bold ${t.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(t.profit)}</span>
              ])}
            />
          </Card>
          </>
        )}

        {activeTab === 'card' && (
          <Card>
            <CardHeader title="P&L by Card Network" />
            <DataTable 
              headers={['Network', 'Total Swipes', 'Gross Revenue', 'Network Cost', 'Net Contribution']}
              rows={cardStats.map(s => [
                <span className="font-bold">{s.name}</span>,
                s.count,
                formatCurrency(s.income),
                formatCurrency(s.expense),
                <span className="font-bold text-indigo-600">{formatCurrency(s.profit)}</span>
              ])}
            />
          </Card>
        )}

        {activeTab === 'wallet' && (
          <Card>
            <CardHeader title="P&L by Provider/Wallet" />
            <DataTable 
              headers={['Wallet', 'Total Volume', 'MDR Expense', 'Margin']}
              rows={walletStats.map(s => [
                <span className="font-bold">{s.name}</span>,
                formatCurrency(s.income),
                formatCurrency(s.expense),
                <span className="font-bold text-emerald-600">{formatCurrency(s.profit)}</span>
              ])}
            />
          </Card>
        )}
      </div>
    </Layout>
  );
};

const TabButton = ({ id, label, icon: Icon, active, onClick }: any) => (
  <button
    onClick={() => onClick(id)}
    className={`flex items-center gap-2 px-5 py-3 font-bold text-sm rounded-xl transition-all duration-300 whitespace-nowrap ${
      active === id ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
    }`}
  >
    <Icon size={18} />
    {label}
  </button>
);

const KPICard = ({ title, value, icon, color, bg, gradient }: any) => (
  <div className={`p-6 rounded-2xl border border-slate-100 shadow-card transition-all duration-300 hover:shadow-card-hover flex items-center justify-between ${gradient ? `bg-gradient-to-br ${gradient}` : (bg || 'bg-white')}`}>
    <div>
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</p>
      <p className={`text-2xl font-extrabold mt-1 ${color}`}>{value}</p>
    </div>
    <div className="p-3 bg-white rounded-xl shadow-sm border border-slate-100">{icon}</div>
  </div>
);

const DataTable = ({ headers, rows, rightAlignColumns = [] }: { headers: string[], rows: any[][], rightAlignColumns?: number[] }) => (
  <div className="overflow-x-auto rounded-xl border border-slate-100 overflow-hidden">
    <table className="w-full text-sm">
      <thead className="bg-slate-50 border-b border-slate-200">
        <tr>
          {headers.map((h, i) => (
            <th 
              key={i} 
              className={`p-4 text-xs font-bold text-slate-600 uppercase tracking-wider ${rightAlignColumns.includes(i) ? 'text-right' : 'text-left'}`}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.length === 0 ? (
          <tr><td colSpan={headers.length} className="p-12 text-center text-slate-500 font-medium">No data available for this report.</td></tr>
        ) : (
          rows.map((row, i) => (
            <tr key={i} className={`hover:bg-indigo-50/30 transition-colors ${i % 2 === 1 ? 'bg-slate-50/30' : ''}`}>
              {row.map((cell, j) => (
                <td 
                  key={j} 
                  className={`p-4 text-slate-700 font-medium tabular-nums ${rightAlignColumns.includes(j) ? 'text-right' : 'text-left'}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);
