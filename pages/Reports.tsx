import React, { useState, useMemo } from 'react';
import { useERP } from '../context/ERPContext';
import { Layout } from '../components/Layout';
import { Card, CardHeader, CardContent } from '../components/ui/Elements';
import { PageFilters, DateRange, FilterSection } from '../components/ui/PageFilters';
import { Transaction, TransactionType } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  ReceiptText,
  User,
  CreditCard,
  Wallet as WalletIcon,
  Scale,
  FileText,
  Download,
  Pencil,
} from 'lucide-react';
import { exportToCSV } from '../lib/export';
import { roundCurrency } from '../lib/utils';
import { Button } from '../components/ui/Elements';
import { useAuth } from '../context/AuthContext';
import {
  isSwipePayInflow,
  parseSwipeInflowEconomics,
  inferPgName,
  buildTransferExpensePerInflowId,
  deferredSwipePortalExpenseInSubset,
} from '../lib/swipeTxnEconomics';
import { buildPaySwipePLRows } from '../lib/paySwipeTxnReport';
import { TransactionEditModal } from '../components/TransactionEditModal';
import { TempManualJournalForm } from '../components/TempManualJournalForm';
import { TEMP_ALLOW_LEDGER_REPORT_PL_EDIT } from '../lib/tempUiFlags';

type ReportTab = 'overview' | 'balance-sheet' | 'pl' | 'transactions' | 'card' | 'wallet' | 'customer';
type TxnPlMode = 'swipe-inflow' | 'pay-swipe';

function localYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const CARD_NETWORK_OPTIONS = [
  { value: 'all', label: 'All Networks' },
  { value: 'visa', label: 'Visa' },
  { value: 'master', label: 'Master' },
  { value: 'amex', label: 'Amex' },
  { value: 'rupay', label: 'Rupay' },
];

/** Workbook-style rate column (no % suffix), e.g. 1.6, 3.3 */
const formatWorkbookPct = (n: number) => (Number.isFinite(n) ? n : 0).toFixed(1);

function formatSwipeCardLabel(cardRaw: string): string {
  const u = cardRaw.toUpperCase();
  if (u === 'VISA') return 'Visa';
  if (u === 'MASTER' || u === 'MASTERCARD') return 'Master';
  if (u === 'AMEX') return 'Amex';
  if (u === 'RUPAY') return 'Rupay';
  return cardRaw.charAt(0).toUpperCase() + cardRaw.slice(1).toLowerCase();
}

export const Reports: React.FC = () => {
  const { user } = useAuth();
  const {
    transactions,
    wallets,
    customers,
    accounts,
    formatCurrency,
    generateProfitAndLoss,
    getAccountBalancesAsOf,
    updateTransaction,
    postTransaction,
  } = useERP();
  const [activeTab, setActiveTab] = useState<ReportTab>('overview');
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '', preset: 'allTime' });
  const [cardNetworkFilter, setCardNetworkFilter] = useState('all');
  const [txnCustomerFilter, setTxnCustomerFilter] = useState('all');
  const [txnWalletFilter, setTxnWalletFilter] = useState('all');
  const [txnSortBy, setTxnSortBy] = useState<'date' | 'profit' | 'revenue' | 'cost'>('date');
  const [txnPlMode, setTxnPlMode] = useState<TxnPlMode>('swipe-inflow');
  /** Temporary: manual edit from Transaction P&amp;L table */
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);

  const [bsCompareDayA, setBsCompareDayA] = useState(() => {
    const t = new Date();
    const day = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    day.setDate(day.getDate() - 1);
    return localYmd(day);
  });
  const [bsCompareDayB, setBsCompareDayB] = useState(() => {
    const t = new Date();
    return localYmd(new Date(t.getFullYear(), t.getMonth(), t.getDate()));
  });

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

  const plReport = generateProfitAndLoss();

  const walletBalanceCompare = useMemo(() => {
    const balA = getAccountBalancesAsOf(bsCompareDayA);
    const balB = getAccountBalancesAsOf(bsCompareDayB);
    return wallets.map(w => {
      const balanceA = balA[w.ledgerAccountId] ?? 0;
      const balanceB = balB[w.ledgerAccountId] ?? 0;
      return { id: w.id, name: w.name, balanceA, balanceB, delta: balanceB - balanceA };
    });
  }, [wallets, getAccountBalancesAsOf, bsCompareDayA, bsCompareDayB]);

  const walletCompareTotals = useMemo(() => {
    const balanceA = walletBalanceCompare.reduce((s, r) => s + r.balanceA, 0);
    const balanceB = walletBalanceCompare.reduce((s, r) => s + r.balanceB, 0);
    return { balanceA, balanceB, delta: balanceB - balanceA };
  }, [walletBalanceCompare]);

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
    const deferredPortal = deferredSwipePortalExpenseInSubset(txns, filteredTransactions);
    expense -= deferredPortal;
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
    const transferByInflow = buildTransferExpensePerInflowId(filteredTransactions);
    let data = filteredTransactions
      .filter(t => isSwipePayInflow(t))
      .map(t => {
        const econ = parseSwipeInflowEconomics(t, filteredTransactions)!;
        const customer = customers.find(c => c.id === t.metadata?.customerId);
        const wallet = wallets.find(w => w.id === t.metadata?.walletId);
        const cardRaw = (t.metadata?.cardType || 'visa').toUpperCase();
        const cardLabel = formatSwipeCardLabel(cardRaw === 'MASTERCARD' ? 'MASTER' : cardRaw);
        const appPctDisplay = inferPgName(wallet, t.metadata?.cardType, econ.appPct);
        const pgName = t.metadata?.pgName?.trim() || appPctDisplay;
        const performer = t.metadata?.performedByUserId;
        const lead =
          performer && user?.id === performer ? user?.name ?? '—'
          : performer ? performer.slice(0, 8) + '…'
          : '—';
        const transferExpense = transferByInflow.get(t.id) ?? 0;
        const ourCharge = roundCurrency(econ.shopCharges - transferExpense);
        const ourPct = econ.actualAmount > 0 ? (ourCharge / econ.actualAmount) * 100 : 0;
        const netProfit = roundCurrency(ourCharge - econ.appCharges);
        return {
          id: t.id,
          raw: t,
          date: t.date,
          customerId: t.metadata?.customerId,
          customer: customer?.name || 'Unknown',
          walletId: t.metadata?.walletId,
          walletName: wallet?.name ?? '—',
          card: cardLabel,
          pgName,
          appName: appPctDisplay,
          lead,
          actualAmount: econ.actualAmount,
          grossAmount: econ.grossAmount,
          shopPct: econ.shopPct,
          customerPct: econ.customerPct,
          appPct: econ.appPct,
          appCharges: econ.appCharges,
          shopCharges: econ.shopCharges,
          customerCharges: econ.shopCharges,
          ourCharge,
          ourPct,
          netAmount: econ.netAmount,
          grossProfit: econ.grossProfit,
          transferExpense,
          netProfit,
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
      if (txnSortBy === 'profit') return b.netProfit - a.netProfit;
      if (txnSortBy === 'revenue') return b.actualAmount - a.actualAmount;
      if (txnSortBy === 'cost') return b.appCharges - a.appCharges;
      return 0;
    });
    return data;
  }, [filteredTransactions, customers, wallets, user?.id, user?.name, txnCustomerFilter, txnWalletFilter, txnSortBy]);

  const paySwipeTxnPL = useMemo(() => {
    let data = buildPaySwipePLRows(filteredTransactions, wallets, accounts, customers, user?.id, user?.name);
    if (txnCustomerFilter !== 'all') {
      data = data.filter((r) => r.customerId === txnCustomerFilter);
    }
    if (txnWalletFilter !== 'all') {
      data = data.filter((r) => r.kind === 'recovery' && r.raw.metadata?.walletId === txnWalletFilter);
    }
    data = [...data].sort((a, b) => {
      if (txnSortBy === 'date') return new Date(b.date).getTime() - new Date(a.date).getTime();
      if (txnSortBy === 'profit') return b.netMargin - a.netMargin;
      if (txnSortBy === 'revenue') return b.principal - a.principal;
      if (txnSortBy === 'cost') return b.mdrCost - a.mdrCost;
      return 0;
    });
    return data;
  }, [filteredTransactions, wallets, accounts, customers, user?.id, user?.name, txnCustomerFilter, txnWalletFilter, txnSortBy]);

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

  const exportWalletBalanceCompare = () => {
    const rows = walletBalanceCompare.map(w => [
      w.name,
      formatCurrency(w.balanceA),
      formatCurrency(w.balanceB),
      formatCurrency(w.delta),
    ]);
    rows.push([
      'All wallets',
      formatCurrency(walletCompareTotals.balanceA),
      formatCurrency(walletCompareTotals.balanceB),
      formatCurrency(walletCompareTotals.delta),
    ]);
    exportToCSV('wallet-balance-compare', ['Wallet', `End ${bsCompareDayA}`, `End ${bsCompareDayB}`, 'Change'], rows);
  };

  const exportTxnPL = () => {
    if (txnPlMode === 'pay-swipe') {
      const headers = [
        '#', 'Date', 'Lead', 'Customer', 'Type', 'Wallet', 'Card', 'Principal', 'MDR', 'Net to wallet',
        'Charges collected', 'Collected / paid from', 'Net margin', 'Remarks',
      ];
      const rows = paySwipeTxnPL.map((r, i) => [
        String(i + 1),
        new Date(r.date).toLocaleDateString(),
        r.lead,
        r.customer,
        r.kind === 'advance' ? 'Advance' : 'Recovery',
        r.walletName,
        r.card,
        formatCurrency(r.principal),
        formatCurrency(r.mdrCost),
        formatCurrency(r.netToWallet),
        formatCurrency(r.chargesCollected),
        r.counterpartyAccount,
        formatCurrency(r.netMargin),
        r.remarks,
      ]);
      exportToCSV('transaction-pl-pay-swipe', headers, rows);
      return;
    }
    const headers = [
      '#', 'Date', 'Wallet', 'Card', 'PG', 'Amount', 'App %', 'App amount', 'Customer %', 'Charge',
      'Our %', 'Our charge', 'Profit', 'Other value',
    ];
    const rows = txnPL.map((r, i) => [
      String(i + 1),
      new Date(r.date).toLocaleDateString(),
      r.walletName,
      r.card,
      r.pgName,
      formatCurrency(r.actualAmount),
      formatWorkbookPct(r.appPct),
      formatCurrency(r.grossAmount),
      formatWorkbookPct(r.customerPct),
      formatCurrency(r.shopCharges),
      formatWorkbookPct(r.ourPct),
      formatCurrency(r.ourCharge),
      formatCurrency(r.netProfit),
      formatCurrency(r.transferExpense),
    ]);
    exportToCSV('transaction-pl-swipe-inflow', headers, rows);
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

      {TEMP_ALLOW_LEDGER_REPORT_PL_EDIT && (
        <div className="rounded-2xl border border-amber-300/80 bg-amber-50/90 dark:bg-amber-950/40 dark:border-amber-700 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          <strong>Temporary data entry:</strong> use Pencil on Ledgers / Transaction P&amp;L rows, or post a manual journal below on Profit &amp; Loss. Set <code className="rounded bg-white/70 dark:bg-black/30 px-1">TEMP_ALLOW_LEDGER_REPORT_PL_EDIT = false</code> in{' '}
          <code className="rounded bg-white/70 dark:bg-black/30 px-1">lib/tempUiFlags.ts</code> to remove later.
        </div>
      )}

      <FilterSection title="Report Type">
      <div className="flex gap-2 bg-white/90 backdrop-blur-md p-2 rounded-2xl border-2 border-slate-100 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.06)] overflow-x-auto">
        <TabButton id="overview" label="Performance" icon={TrendingUp} active={activeTab} onClick={setActiveTab} />
        <TabButton id="pl" label="Profit & Loss" icon={FileText} active={activeTab} onClick={setActiveTab} />
        <TabButton id="balance-sheet" label="Wallet balances" icon={Scale} active={activeTab} onClick={setActiveTab} />
        <TabButton id="transactions" label="Transaction P&L" icon={ReceiptText} active={activeTab} onClick={setActiveTab} />
        <TabButton id="card" label="By Network" icon={CreditCard} active={activeTab} onClick={setActiveTab} />
        <TabButton id="wallet" label="By Wallet" icon={WalletIcon} active={activeTab} onClick={setActiveTab} />
        <TabButton id="customer" label="Top Customers" icon={User} active={activeTab} onClick={setActiveTab} />
      </div>
      </FilterSection>

      <div className="animate-fade-in space-y-6">
        
        {activeTab === 'pl' && (
          <div className="grid grid-cols-1 gap-6">
            {TEMP_ALLOW_LEDGER_REPORT_PL_EDIT && (
              <Card>
                <CardHeader title="Temporary: manual journal → P&amp;L" subtitle="Balances income/expense accounts directly. Remove when masters-only posting is enforced." />
                <TempManualJournalForm accounts={accounts} postTransaction={postTransaction} />
              </Card>
            )}
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
              <CardHeader
                title="Wallet balances — two-day comparison"
                subtitle="Ledger balance for each wallet at end of day (local date), using completed transactions only."
                action={
                  <Button size="sm" variant="outline" onClick={exportWalletBalanceCompare}>
                    <Download size={14} /> Export CSV
                  </Button>
                }
              />
              <div className="p-6 space-y-6">
                <div className="flex flex-wrap gap-6 items-end">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">First day</label>
                    <input
                      type="date"
                      value={bsCompareDayA}
                      onChange={e => setBsCompareDayA(e.target.value)}
                      className="px-4 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-semibold focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Second day</label>
                    <input
                      type="date"
                      value={bsCompareDayB}
                      onChange={e => setBsCompareDayB(e.target.value)}
                      className="px-4 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-semibold focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                    />
                  </div>
                </div>
                <DataTable
                  headers={['Wallet', `End ${bsCompareDayA}`, `End ${bsCompareDayB}`, 'Change']}
                  rows={[
                    ...walletBalanceCompare.map(w => [
                      w.name,
                      formatCurrency(w.balanceA),
                      formatCurrency(w.balanceB),
                      <span className={`font-bold ${w.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(w.delta)}</span>,
                    ]),
                    [
                      <span className="font-bold text-slate-900">All wallets</span>,
                      <span className="font-bold tabular-nums">{formatCurrency(walletCompareTotals.balanceA)}</span>,
                      <span className="font-bold tabular-nums">{formatCurrency(walletCompareTotals.balanceB)}</span>,
                      <span className={`font-bold tabular-nums ${walletCompareTotals.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {formatCurrency(walletCompareTotals.delta)}
                      </span>,
                    ],
                  ]}
                  rightAlignColumns={[1, 2, 3]}
                />
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
                  <CardContent className="h-80 min-h-[320px]">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
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
                  <CardContent className="h-80 min-h-[320px]">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
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
              <div className="flex flex-col gap-4 bg-white/95 backdrop-blur-md p-6 rounded-3xl border-2 border-slate-100/80 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.06)]">
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Report source</p>
                  <div className="flex flex-wrap gap-2 p-1 bg-slate-100 rounded-xl w-fit">
                    <button
                      type="button"
                      onClick={() => setTxnPlMode('swipe-inflow')}
                      className={`px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${txnPlMode === 'swipe-inflow' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-white'}`}
                    >
                      Swipe Inflow (Swipe &amp; Pay)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTxnPlMode('pay-swipe')}
                      className={`px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${txnPlMode === 'pay-swipe' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-600 hover:bg-white'}`}
                    >
                      Pay &amp; Swipe (Advance / Recovery)
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 items-center">
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
                    title={txnPlMode === 'pay-swipe' ? 'Recovery rows only; advances have no wallet' : 'Swipe inflow wallet'}
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
                    <option value="profit">{txnPlMode === 'pay-swipe' ? 'Net margin (high to low)' : 'Net profit (high to low)'}</option>
                    <option value="revenue">{txnPlMode === 'pay-swipe' ? 'Principal (high to low)' : 'Actual amount (high to low)'}</option>
                    <option value="cost">{txnPlMode === 'pay-swipe' ? 'MDR cost (high to low)' : 'App / portal charges (high to low)'}</option>
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
              </div>
            </FilterSection>
            <Card>
            <CardHeader
              title={txnPlMode === 'swipe-inflow' ? 'Transaction P&L (Swipe Inflow)' : 'Transaction P&L (Pay & Swipe)'}
              subtitle={
                txnPlMode === 'swipe-inflow'
                  ? 'Workbook columns: Amount − app % → app amount; Charge = customer fee; Our charge = charge − other value (payout transfer); Profit = our charge − portal fee. Other value = same-day transfer expense split across linked inflows.'
                  : 'Advance = customer receivable (A006) funded from bank/cash/wallet. Recovery = swipe clears receivable, MDR to E001, net to wallet, charges collected to I001. Net margin = charges collected − MDR (recovery rows).'
              }
              action={<Button size="sm" variant="outline" onClick={exportTxnPL}><Download size={14} /> Export CSV</Button>}
            />
            <p className="px-6 -mt-2 mb-2 text-xs text-slate-500">
              {txnPlMode === 'swipe-inflow' ? (
                <>
                  <strong>Swipe &amp; Pay inflow</strong> rows only (card numbers are not stored). Customer name stays in filters/search via Data Filters above.
                </>
              ) : (
                <>
                  <strong>Pay &amp; Swipe</strong> advances and recoveries from the filtered date range / search. Wallet filter applies to <em>recovery</em> rows only.
                </>
              )}
            </p>
            {txnPlMode === 'swipe-inflow' ? (
            <DataTable 
              minTableWidth={TEMP_ALLOW_LEDGER_REPORT_PL_EDIT ? 1320 : 1280}
              headers={[
                '#', 'Date', 'Wallet', 'Card', 'PG', 'Amount', 'App %', 'App amount', 'Customer %', 'Charge',
                'Our %', 'Our charge', 'Profit', 'Other value',
                ...(TEMP_ALLOW_LEDGER_REPORT_PL_EDIT ? ['Edit'] : []),
              ]}
              rows={txnPL.map((t, idx) => [
                idx + 1,
                new Date(t.date).toLocaleDateString(),
                <span className="font-medium text-slate-800 whitespace-nowrap">{t.walletName}</span>,
                t.card,
                <span className="whitespace-nowrap">{t.pgName}</span>,
                formatCurrency(t.actualAmount),
                formatWorkbookPct(t.appPct),
                formatCurrency(t.grossAmount),
                formatWorkbookPct(t.customerPct),
                formatCurrency(t.shopCharges),
                formatWorkbookPct(t.ourPct),
                formatCurrency(t.ourCharge),
                <span className={`font-bold ${t.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(t.netProfit)}</span>,
                formatCurrency(t.transferExpense),
                ...(TEMP_ALLOW_LEDGER_REPORT_PL_EDIT
                  ? [
                      <button
                        type="button"
                        onClick={() => setEditingTxn(t.raw)}
                        className="p-2 rounded-lg text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/50"
                        title="Edit underlying transaction (temporary)"
                      >
                        <Pencil size={16} />
                      </button>,
                    ]
                  : []),
              ])}
              rightAlignColumns={[5, 6, 7, 8, 9, 10, 11, 12, 13]}
            />
            ) : (
            <DataTable
              minTableWidth={TEMP_ALLOW_LEDGER_REPORT_PL_EDIT ? 1560 : 1520}
              headers={[
                '#', 'Date', 'Lead', 'Customer', 'Type', 'Wallet', 'Card', 'Principal', 'MDR', 'Net to wlt', 'Charges coll.', 'From / into', 'Net margin', 'Remarks',
                ...(TEMP_ALLOW_LEDGER_REPORT_PL_EDIT ? ['Edit'] : []),
              ]}
              rows={paySwipeTxnPL.map((t, idx) => [
                idx + 1,
                new Date(t.date).toLocaleDateString(),
                t.lead,
                <span className="font-medium text-slate-800 whitespace-nowrap">{t.customer}</span>,
                <span className={`font-bold text-xs uppercase px-2 py-0.5 rounded-md ${t.kind === 'advance' ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-800'}`}>{t.kind === 'advance' ? 'Advance' : 'Recovery'}</span>,
                <span className="whitespace-nowrap">{t.walletName}</span>,
                t.card,
                formatCurrency(t.principal),
                formatCurrency(t.mdrCost),
                formatCurrency(t.netToWallet),
                formatCurrency(t.chargesCollected),
                <span className="whitespace-nowrap text-slate-700">{t.counterpartyAccount}</span>,
                <span className={`font-bold ${t.netMargin >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(t.netMargin)}</span>,
                <span className="max-w-[10rem] truncate block text-xs text-slate-600" title={t.raw.description}>{t.remarks}</span>,
                ...(TEMP_ALLOW_LEDGER_REPORT_PL_EDIT
                  ? [
                      <button
                        type="button"
                        onClick={() => setEditingTxn(t.raw)}
                        className="p-2 rounded-lg text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/50"
                        title="Edit underlying transaction (temporary)"
                      >
                        <Pencil size={16} />
                      </button>,
                    ]
                  : []),
              ])}
              rightAlignColumns={[7, 8, 9, 10, 11, 12]}
            />
            )}
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

        {activeTab === 'customer' && (
          <Card>
            <CardHeader
              title="Top 10 profitable customers"
              subtitle="Swipe Pay volume count and net profit for the current filters (date range, search, card network)"
            />
            <DataTable
              headers={['Customer', 'Swipe Pay count', 'Net profit']}
              rows={customerStats.map(s => [
                <span className="font-bold">{s.name}</span>,
                s.count,
                <span className={`font-bold ${s.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(s.profit)}</span>,
              ])}
              rightAlignColumns={[1, 2]}
            />
          </Card>
        )}
      </div>

      {editingTxn && TEMP_ALLOW_LEDGER_REPORT_PL_EDIT && (
        <TransactionEditModal
          transaction={editingTxn}
          accounts={accounts}
          formatCurrency={formatCurrency}
          onClose={() => setEditingTxn(null)}
          onSave={(id, patch) => updateTransaction(id, patch)}
        />
      )}
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

const DataTable = ({ headers, rows, rightAlignColumns = [], minTableWidth }: { headers: string[], rows: any[][], rightAlignColumns?: number[], minTableWidth?: number }) => (
  <div className="overflow-x-auto rounded-xl border border-slate-100 overflow-hidden">
    <table className="w-full text-sm" style={minTableWidth ? { minWidth: minTableWidth } : undefined}>
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
