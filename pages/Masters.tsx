import React, { useMemo, useState } from 'react';
import { useERP } from '../context/ERPContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { Layout } from '../components/Layout';
import { Card, CardHeader, CardContent, Input, Button, Select } from '../components/ui/Elements';
import { PageFilters } from '../components/ui/PageFilters';
import { Plus, Save, Activity, Users, Wallet as WalletIcon, Edit2, X, List, LayoutGrid, Trash2, Download, Upload, Building2, Landmark } from 'lucide-react';
import { CreateCustomerDTO, PGConfig, Rates, Wallet, Account, AccountType, ProfitAndLoss, Transaction, TransactionType } from '../types';
import { formatCurrency, safeParseFloat, roundCurrency } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { INITIAL_ACCOUNTS } from '../constants';
import { buildTransferExpensePerInflowId, isSwipePayInflow, parseSwipeInflowEconomics } from '../lib/swipeTxnEconomics';

type Tab = 'reconcile' | 'customers' | 'wallets' | 'banks' | 'data';

/**
 * Net capital from wallet opening entries only: journal Dr wallet ledger / Cr Q002 (and reversals).
 * Stays fixed unless you add a wallet with opening balance or use “Opening balance adjustment” on a wallet.
 */
function sumWalletOpeningCapitalFromTransactions(transactions: Transaction[], walletLedgerIds: Set<string>): number {
  let sum = 0;
  for (const t of transactions) {
    if (t.status !== 'COMPLETED' || t.type !== TransactionType.JOURNAL) continue;
    if (!/^Opening balance/i.test(t.description.trim())) continue;
    if (t.entries.length !== 2) continue;
    const qEntry = t.entries.find((e) => e.accountId === 'Q002');
    const wEntry = t.entries.find((e) => walletLedgerIds.has(e.accountId));
    if (!qEntry || !wEntry) continue;
    sum += qEntry.credit - qEntry.debit;
  }
  return roundCurrency(sum);
}

/** Posted opening for one wallet ledger from “Opening balance…” journals (Dr/Cr with Q002). */
function sumPerWalletOpeningFromTransactions(transactions: Transaction[], walletLedgerId: string): number {
  let sum = 0;
  for (const t of transactions) {
    if (t.status !== 'COMPLETED' || t.type !== TransactionType.JOURNAL) continue;
    if (!/^Opening balance/i.test(t.description.trim())) continue;
    if (t.entries.length !== 2) continue;
    const qEntry = t.entries.find((e) => e.accountId === 'Q002');
    const wEntry = t.entries.find((e) => e.accountId === walletLedgerId);
    if (!qEntry || !wEntry) continue;
    sum += wEntry.debit - wEntry.credit;
  }
  return roundCurrency(sum);
}

function WalletCapitalBreakdown({
  wallets,
  accounts,
  transactions,
  getAccountBalance,
  formatCurrency,
  generateProfitAndLoss,
}: {
  wallets: Wallet[];
  accounts: Account[];
  transactions: Transaction[];
  getAccountBalance: (accountId: string) => number;
  formatCurrency: (amount: number) => string;
  generateProfitAndLoss: () => ProfitAndLoss;
}) {
  const transferByInflow = useMemo(() => buildTransferExpensePerInflowId(transactions), [transactions]);

  const rows = useMemo(() => {
    return [...wallets]
      .map((w) => {
        const opening = sumPerWalletOpeningFromTransactions(transactions, w.ledgerAccountId);
        let attribNet = 0;
        for (const t of transactions) {
          if (t.status !== 'COMPLETED' || t.metadata?.walletId !== w.id) continue;
          if (!isSwipePayInflow(t)) continue;
          const econ = parseSwipeInflowEconomics(t, transactions);
          if (!econ) continue;
          const te = transferByInflow.get(t.id) ?? 0;
          attribNet += econ.grossProfit - te;
        }
        attribNet = roundCurrency(attribNet);
        const openingPlusPL = roundCurrency(opening + attribNet);
        const ledger = getAccountBalance(w.ledgerAccountId);
        return { w, opening, attribNet, openingPlusPL, ledger };
      })
      .sort((a, b) => a.w.name.localeCompare(b.w.name));
  }, [wallets, transactions, transferByInflow, getAccountBalance]);

  const totalWalletAssets = rows.reduce((s, r) => s + r.ledger, 0);
  const pl = generateProfitAndLoss();
  const netProfit = pl.netProfit;
  const payablesL001 = getAccountBalance('L001');
  const l001Account = accounts.find((a) => a.id === 'L001');
  const payablesLabel = l001Account?.name ? `${l001Account.name} (L001)` : 'Customer Paid To (L001)';
  const walletLedgerIds = new Set(wallets.map((w) => w.ledgerAccountId));
  const capitalOpening = sumWalletOpeningCapitalFromTransactions(transactions, walletLedgerIds);
  const sourcesTotal = roundCurrency(capitalOpening + netProfit + payablesL001);
  const receivablesPaySwipe = getAccountBalance('A006');
  const a006Account = accounts.find((a) => a.id === 'A006');
  const receivablesShortLabel = a006Account?.name ? `${a006Account.name} (A006)` : 'Customer Receivables (A006)';
  const totalWalletsPlusReceivables = roundCurrency(totalWalletAssets + receivablesPaySwipe);

  const cashBankById = new Map<string, Account>();
  for (const a of accounts) {
    if (
      a.type === AccountType.ASSET &&
      (a.category === 'Cash' || a.category === 'Bank') &&
      !walletLedgerIds.has(a.id)
    ) {
      cashBankById.set(a.id, a);
    }
  }
  for (const a of INITIAL_ACCOUNTS) {
    if (a.type !== AccountType.ASSET || (a.category !== 'Cash' && a.category !== 'Bank')) continue;
    if (walletLedgerIds.has(a.id)) continue;
    if (!cashBankById.has(a.id)) cashBankById.set(a.id, a as Account);
  }
  const cashAndBankAccounts = [...cashBankById.values()].sort((a, b) => {
    const o = (a.category === 'Cash' ? 0 : 1) - (b.category === 'Cash' ? 0 : 1);
    return o !== 0 ? o : a.name.localeCompare(b.name);
  });
  const cashBankRows = cashAndBankAccounts.map((a) => ({
    a,
    balance: getAccountBalance(a.id),
  }));
  const totalCashBank = cashBankRows.reduce((s, r) => s + r.balance, 0);
  /** Ledger liquid assets only — same total that must equal opening + profit + payables when books tie. */
  const liquidAssetsTotal = roundCurrency(totalWalletsPlusReceivables + totalCashBank);
  const tieOk = Math.abs(sourcesTotal - liquidAssetsTotal) < 0.02;

  return (
    <Card className="border-indigo-100 dark:border-indigo-900/40 shadow-md overflow-hidden">
      <CardHeader
        title="Wallet balances, capital & payables"
        subtitle="Liquid balances (wallets + receivables + cash + bank) should equal opening + profit + payables. Net profit is not added again here — it is already in that left total."
      />
      <CardContent className="!pt-2 !pb-6">
        <div className="flex items-center gap-2 mb-4 text-indigo-700 dark:text-indigo-400">
          <Landmark size={22} className="shrink-0 opacity-90" />
          <p className="text-sm font-semibold">Live from your ledger — same as Reports / P&amp;L (workbook net profit).</p>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3 leading-snug">
          Per wallet: <strong>Posted opening</strong> is only “Opening balance…” journals for that ledger.
          <strong> Swipe net (P&amp;L)</strong> sums <strong>Transaction P&amp;L (Swipe Inflow)</strong> net profit for inflows on that wallet (margin recognised + transfer expense split like Reports).
          <strong> Opening + P&amp;L</strong> is a workbook rollforward; <strong>Ledger balance</strong> is the real balance (also includes payouts, fees, and moves) — subtotals and tie below use <strong>ledger</strong> only.
        </p>
        <div className="rounded-xl border border-slate-200 dark:border-slate-600 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-600">
                <th className="text-left p-3 font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Wallet</th>
                <th className="text-left p-3 font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider hidden sm:table-cell">Ledger</th>
                <th className="text-right p-3 font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider hidden md:table-cell">Posted opening</th>
                <th className="text-right p-3 font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider hidden md:table-cell">Swipe net (P&amp;L)</th>
                <th className="text-right p-3 font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Opening + P&amp;L</th>
                <th className="text-right p-3 font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Ledger balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-500 dark:text-slate-400">
                    No wallets in this view.
                  </td>
                </tr>
              ) : (
                rows.map(({ w, opening, attribNet, openingPlusPL, ledger }) => (
                  <tr key={w.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="p-3 font-semibold text-slate-900 dark:text-slate-100">{w.name}</td>
                    <td className="p-3 font-mono text-xs text-slate-500 dark:text-slate-400 hidden sm:table-cell">{w.ledgerAccountId}</td>
                    <td className="p-3 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums hidden md:table-cell">{formatCurrency(opening)}</td>
                    <td className="p-3 text-right font-mono text-emerald-700 dark:text-emerald-400 tabular-nums hidden md:table-cell">{formatCurrency(attribNet)}</td>
                    <td
                      className="p-3 text-right font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums"
                      title={`Posted opening (${formatCurrency(opening)}) + swipe Transaction P&L net (${formatCurrency(attribNet)}) for this wallet`}
                    >
                      {formatCurrency(openingPlusPL)}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">{formatCurrency(ledger)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 px-4 py-4">
          <span className="font-bold text-indigo-900 dark:text-indigo-200">Total wallet assets</span>
          <span className="text-xl font-black text-indigo-700 dark:text-indigo-300 tabular-nums">{formatCurrency(totalWalletAssets)}</span>
        </div>

        <div className="mt-6 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">How the columns relate</p>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            <strong>Opening capital</strong> counts only journals titled “Opening balance…” (new wallet or Edit wallet → opening adjustment). It does <strong>not</strong> change when you run Swipe &amp; Pay, Pay &amp; Swipe, or move money between wallets.
            <strong className="font-semibold"> Wallets, receivables (A006), cash, and bank</strong> are liquid ledger balances. Their <strong>sum</strong> should equal <strong>opening + profit + payables</strong> — the profit (same as Reports → Transaction P&amp;L / Dashboard workbook) is already on the <strong>left</strong>, not double-added on the right. (Swipe inflow <strong>NET PROFIT</strong> is part of that P&amp;L net.)
          </p>
          <div className="grid sm:grid-cols-2 gap-0 rounded-xl border border-slate-200 dark:border-slate-600 overflow-hidden">
            <div className="p-4 bg-slate-50/80 dark:bg-slate-800/50 border-b sm:border-b-0 sm:border-r border-slate-200 dark:border-slate-600 space-y-4">
              <div className="rounded-lg border border-indigo-200/80 dark:border-indigo-900/60 bg-indigo-50/60 dark:bg-indigo-950/25 px-3 py-3">
                <p className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-widest mb-2">Opening capital — fixed</p>
                <div className="flex justify-between gap-2 text-sm">
                  <span className="text-slate-700 dark:text-slate-300 font-medium">Posted opening only</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">{formatCurrency(capitalOpening)}</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-2 leading-snug">
                  Not affected by wallet transactions. Changes only if you post another opening balance journal in Masters.
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">Operating · P&amp;L &amp; payables</p>
                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-600 dark:text-slate-400">Profit (P&amp;L net)</span>
                    <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">{formatCurrency(netProfit)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-600 dark:text-slate-400">Payables · {payablesLabel}</span>
                    <span className="font-mono font-semibold text-amber-800 dark:text-amber-300 tabular-nums">{formatCurrency(payablesL001)}</span>
                  </div>
                  <div className="flex justify-between gap-2 pt-2.5 mt-1 border-t border-slate-200 dark:border-slate-600 font-bold">
                    <span>Opening + profit + payables</span>
                    <span className="font-mono tabular-nums">{formatCurrency(sourcesTotal)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4 bg-white dark:bg-slate-900/40">
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Wallets, receivables, cash &amp; bank</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3 leading-snug">Cash and bank from the chart of accounts. Bottom <strong>Total · liquid assets</strong> must match the left &quot;Opening + profit + payables&quot; — net profit is included in that left total, not summed again below.</p>
              <div className="space-y-2.5 text-sm">
                {rows.map(({ w, ledger, openingPlusPL }) => (
                  <div key={w.id} className="flex justify-between gap-2 items-baseline">
                    <span className="text-slate-600 dark:text-slate-400 truncate" title={`Opening + attrib. P&amp;L: ${formatCurrency(openingPlusPL)}`}>
                      Wallet · {w.name}
                    </span>
                    <span className="font-mono font-medium text-slate-900 dark:text-slate-100 tabular-nums shrink-0">{formatCurrency(ledger)}</span>
                  </div>
                ))}
                <div className="flex justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 pt-1 border-t border-dashed border-slate-200 dark:border-slate-600">
                  <span>Subtotal · payment wallets</span>
                  <span className="font-mono tabular-nums">{formatCurrency(totalWalletAssets)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-600 dark:text-slate-400" title="Pay &amp; Swipe advances (principal still owed by customer until recovery posts)">
                    Receivables · Pay &amp; Swipe · {receivablesShortLabel}
                  </span>
                  <span className="font-mono font-semibold text-violet-700 dark:text-violet-400 tabular-nums shrink-0">{formatCurrency(receivablesPaySwipe)}</span>
                </div>
                {cashBankRows.map(({ a, balance }) => (
                  <div key={a.id} className="flex justify-between gap-2">
                    <span className="text-slate-600 dark:text-slate-400 truncate">
                      {a.category === 'Cash' ? 'Cash' : 'Bank'} · {a.name} <span className="font-mono text-xs text-slate-400">({a.id})</span>
                    </span>
                    <span className="font-mono font-medium text-sky-800 dark:text-sky-300 tabular-nums shrink-0">{formatCurrency(balance)}</span>
                  </div>
                ))}
                <div className="flex justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 pt-1 border-t border-dashed border-slate-200 dark:border-slate-600">
                  <span>Subtotal · cash &amp; bank</span>
                  <span className="font-mono tabular-nums">{formatCurrency(totalCashBank)}</span>
                </div>
                <div className="flex justify-between gap-2 pt-2.5 mt-1 border-t border-slate-200 dark:border-slate-600 font-bold">
                  <span>Total · liquid assets</span>
                  <span className="font-mono tabular-nums text-indigo-700 dark:text-indigo-400">{formatCurrency(liquidAssetsTotal)}</span>
                </div>
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-600 px-3 py-2.5 space-y-1.5">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="text-slate-600 dark:text-slate-400">Net profit (P&amp;L net, same as left)</span>
                    <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">{formatCurrency(netProfit)}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
                    Same figure as <strong>Swipe Inflow → Transaction P&amp;L</strong> (net profit column) rolled into Dashboard / workbook P&amp;L. It is <strong>already part of</strong> &quot;Opening + profit + payables&quot; — do <strong>not</strong> add it to liquid assets or you double-count. Wallet ledger balances already reflect your flows; profit explains part of the gap between opening and current liquids.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div
            className={`flex items-center gap-2 text-xs font-medium rounded-lg px-3 py-2 ${
              tieOk
                ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
            }`}
          >
            {tieOk ? (
              <span>
                <strong>Opening + profit + payables</strong> matches <strong>total liquid assets</strong>. Net profit is counted once — on the left — and mirrored for reference under the liquids total (not added twice).
              </span>
            ) : (
              <span>
                Totals differ by {formatCurrency(Math.abs(sourcesTotal - liquidAssetsTotal))}. Fix by checking cash, bank, wallets, payables, or other journals — net profit belongs in the left total, not as an extra add-on to ledger balances.
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export const Masters: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('reconcile');

  return (
    <Layout title="Masters & Configuration">
      <div className="flex gap-2 mb-6 p-2 bg-white/90 dark:bg-slate-800/90 backdrop-blur-md rounded-2xl border-2 border-slate-100 dark:border-slate-700 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.06)] dark:shadow-none w-fit flex-wrap">
        <TabButton id="reconcile" active={activeTab} onClick={setActiveTab} icon={Activity} label="Reconciliation" />
        <TabButton id="customers" active={activeTab} onClick={setActiveTab} icon={Users} label="Customers" />
        <TabButton id="wallets" active={activeTab} onClick={setActiveTab} icon={WalletIcon} label="Wallets" />
        <TabButton id="banks" active={activeTab} onClick={setActiveTab} icon={Building2} label="Banks & Cash" />
        <TabButton id="data" active={activeTab} onClick={setActiveTab} icon={Save} label="Backup & Restore" />
      </div>

      <div className="animate-fade-in">
        {activeTab === 'reconcile' && <ReconciliationView />}
        {activeTab === 'customers' && <CustomersView />}
        {activeTab === 'wallets' && <WalletsView />}
        {activeTab === 'banks' && <BanksCashView />}
        {activeTab === 'data' && <DataBackupView />}
      </div>
    </Layout>
  );
};

const TabButton = ({ id, active, onClick, icon: Icon, label }: any) => (
  <button 
    onClick={() => onClick(id)}
    className={`flex items-center gap-2 px-6 py-3 font-bold text-sm transition-all duration-300 rounded-xl ${
      active === id 
        ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30' 
        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
    }`}
  >
    <Icon size={16} />
    {label}
  </button>
);

const DataBackupView = () => {
  const { exportBackup, restoreBackup } = useERP();
  const toast = useToast();
  const { confirm } = useConfirm();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const json = exportBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `casifly-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success('Backup exported successfully');
  };

  const handleImport = async () => {
    const ok = await confirm({
      title: 'Restore Backup',
      message: 'This will replace all current data. Are you sure?',
      confirmText: 'Restore',
      variant: 'danger',
    });
    if (!ok) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = restoreBackup(reader.result as string);
      if (result.success) {
        toast.success('Backup restored. Refreshing...');
        window.location.reload();
      } else {
        toast.error(result.error || 'Restore failed');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader title="Backup & Restore" subtitle="Export or restore all data (ERP + stores & users)" />
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">Export saves accounts, customers, wallets, transactions, and store/user data to a JSON file.</p>
        <div className="flex gap-3">
          <Button onClick={handleExport} variant="outline">
            <Download size={18} /> Export Backup
          </Button>
          <Button onClick={handleImport} variant="outline">
            <Upload size={18} /> Restore Backup
          </Button>
          <input type="file" accept=".json" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">After restore, the page will reload to apply changes.</p>
      </CardContent>
    </Card>
  );
};

const BanksCashView = () => {
  const { accounts, wallets, addAccount, postTransaction, getAccountBalance, formatCurrency } = useERP();
  const { user } = useAuth();
  const toast = useToast();
  const canCreateAccounts = user?.role === 'master_admin' || user?.role === 'product_admin';

  const [newBankName, setNewBankName] = useState('');
  const [newCashName, setNewCashName] = useState('');
  const [addMoneyTarget, setAddMoneyTarget] = useState('');
  const [addMoneyAmount, setAddMoneyAmount] = useState('');
  const [addMoneySource, setAddMoneySource] = useState('Q001');
  const [addMoneyError, setAddMoneyError] = useState('');

  const bankAccounts = accounts.filter(a => a.category === 'Bank');
  const cashAccounts = accounts.filter(a => a.category === 'Cash');
  const walletLedgerIds = wallets.map(w => w.ledgerAccountId);
  const walletAccounts = accounts.filter(a => a.category === 'Wallet' && walletLedgerIds.includes(a.id));

  const targetOptions = [
    ...bankAccounts.map(a => ({ id: a.id, name: `${a.name} (${formatCurrency(getAccountBalance(a.id))})`, category: 'Bank' })),
    ...cashAccounts.map(a => ({ id: a.id, name: `${a.name} (${formatCurrency(getAccountBalance(a.id))})`, category: 'Cash' })),
    ...walletAccounts.map(a => ({ id: a.id, name: `${a.name} (${formatCurrency(getAccountBalance(a.id))})`, category: 'Wallet' })),
  ];

  const sourceOptions = accounts.filter(a =>
    a.category === 'Equity' || (['Bank', 'Cash'].includes(a.category) && a.id !== addMoneyTarget)
  ).map(a => ({ id: a.id, name: `${a.name} (${formatCurrency(getAccountBalance(a.id))})` }));

  const handleCreateBank = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newBankName.trim();
    if (!name) { toast.error('Bank name required'); return; }
    addAccount({ name, category: 'Bank' });
    setNewBankName('');
    toast.success(`Bank "${name}" created`);
  };

  const handleCreateCash = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCashName.trim();
    if (!name) { toast.error('Cash account name required'); return; }
    addAccount({ name, category: 'Cash' });
    setNewCashName('');
    toast.success(`Cash account "${name}" created`);
  };

  const handleAddMoney = (e: React.FormEvent) => {
    e.preventDefault();
    setAddMoneyError('');
    const amt = safeParseFloat(addMoneyAmount);
    if (!addMoneyTarget) { setAddMoneyError('Select target account'); return; }
    if (!addMoneySource) { setAddMoneyError('Select source account'); return; }
    if (isNaN(amt) || amt <= 0) { setAddMoneyError('Enter a valid amount'); return; }
    if (addMoneyTarget === addMoneySource) { setAddMoneyError('Target and source must be different'); return; }

    const targetAcc = accounts.find(a => a.id === addMoneyTarget);
    const sourceAcc = accounts.find(a => a.id === addMoneySource);
    if (!targetAcc || !sourceAcc) { setAddMoneyError('Invalid account'); return; }

    const entries = [
      { accountId: addMoneyTarget, debit: amt, credit: 0 },
      { accountId: addMoneySource, debit: 0, credit: amt },
    ];
    const targetLabel = targetOptions.find(o => o.id === addMoneyTarget)?.name?.split(' (')[0] || addMoneyTarget;
    postTransaction(
      `Add money to ${targetLabel}`,
      TransactionType.JOURNAL,
      entries,
      undefined,
      new Date().toISOString()
    );
    setAddMoneyTarget('');
    setAddMoneyAmount('');
    setAddMoneySource('Q001');
    toast.success(`₹${amt.toLocaleString('en-IN')} added to ${targetLabel}`);
  };

  return (
    <div className="space-y-8">
      {canCreateAccounts && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader title="Create New Bank" subtitle="Add a new bank account to the chart of accounts" />
            <CardContent>
              <form onSubmit={handleCreateBank} className="flex gap-3">
                <Input
                  value={newBankName}
                  onChange={e => setNewBankName(e.target.value)}
                  placeholder="e.g. HDFC Bank Main"
                  className="flex-1"
                />
                <Button type="submit">Create Bank</Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="Create New Cash Account" subtitle="Add cash drawer or petty cash account" />
            <CardContent>
              <form onSubmit={handleCreateCash} className="flex gap-3">
                <Input
                  value={newCashName}
                  onChange={e => setNewCashName(e.target.value)}
                  placeholder="e.g. Cash on Hand"
                  className="flex-1"
                />
                <Button type="submit">Create Cash</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader 
          title="Add Money" 
          subtitle="Add money to bank, wallet, or cash. Each store sees only their own transactions and balances." 
        />
        <CardContent>
          <form onSubmit={handleAddMoney} className="space-y-4 max-w-xl">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Add to (Target)</label>
              <Select
                value={addMoneyTarget}
                onChange={e => setAddMoneyTarget(e.target.value)}
                options={[
                  { value: '', label: '– Select account –' },
                  ...targetOptions.map(o => ({ value: o.id, label: o.name })),
                ]}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Amount (₹)</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={addMoneyAmount}
                onChange={e => { setAddMoneyAmount(e.target.value); setAddMoneyError(''); }}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Source (Credit from)</label>
              <Select
                value={addMoneySource}
                onChange={e => setAddMoneySource(e.target.value)}
                options={[
                  { value: '', label: '– Select source –' },
                  ...sourceOptions.map(o => ({ value: o.id, label: o.name })),
                ]}
              />
            </div>
            {addMoneyError && <p className="text-sm text-rose-600">{addMoneyError}</p>}
            <Button type="submit">Add Money</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Current Balances" subtitle="Store-scoped: balances reflect only transactions for your store" />
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {targetOptions.map(o => (
              <div key={o.id} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">{o.category}</p>
                <p className="font-semibold text-slate-800 dark:text-slate-200">{o.name.split(' (')[0]}</p>
                <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{formatCurrency(getAccountBalance(o.id))}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const ReconciliationView = () => {
  const { wallets, getAccountBalance, formatCurrency, reconcileWallet } = useERP();
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');

  const filteredWallets = wallets.filter(w =>
    w.name.toLowerCase().includes(search.toLowerCase()) || w.ledgerAccountId.toLowerCase().includes(search.toLowerCase())
  );

  const handleAction = (id: string) => {
    const val = parseFloat(values[id]);
    if (!isNaN(val)) {
      reconcileWallet(id, val);
      setValues(p => ({...p, [id]: ''}));
      toast.success('Reconciliation posted.');
    }
  };

  return (
    <div className="space-y-6">
      <PageFilters
        sectionTitle="Filters"
        searchPlaceholder="Search by wallet name or ledger ID..."
        searchValue={search}
        onSearchChange={setSearch}
      />
    <Card>
      <CardHeader title="Daily Wallet Reconciliation" subtitle="Compare system balance with actual closing balance" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-600">
            <tr>
              <th className="p-4">Wallet</th>
              <th className="p-4 text-right">System Balance</th>
              <th className="p-4 w-48">Actual Balance</th>
              <th className="p-4 w-32">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {filteredWallets.map((w, idx) => (
              <tr key={w.id} className={`hover:bg-indigo-50/30 dark:hover:bg-indigo-900/20 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/30 dark:bg-slate-800/30' : ''}`}>
                <td className="p-4 font-semibold text-slate-800 dark:text-slate-200">{w.name}</td>
                <td className="p-4 text-right font-mono font-semibold text-indigo-600 dark:text-indigo-400">{formatCurrency(getAccountBalance(w.ledgerAccountId))}</td>
                <td className="p-4">
                  <Input 
                    type="number" 
                    placeholder="0.00" 
                    value={values[w.id] || ''} 
                    onChange={e => setValues({...values, [w.id]: e.target.value})} 
                  />
                </td>
                <td className="p-4">
                  <Button size="sm" onClick={() => handleAction(w.id)}>Reconcile</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
    </div>
  );
};

const DEFAULT_RATES = { visa: 2.0, master: 2.0, amex: 3.0, rupay: 1.5 };
/** Default PG MDR template for new wallets (matches server default). */
const NEW_WALLET_PG_RATES: Rates = { visa: 1.2, master: 1.2, amex: 2.5, rupay: 0.5 };
const toRateStrings = (r: Rates) => ({ visa: String(r.visa), master: String(r.master), amex: String(r.amex), rupay: String(r.rupay) });

const PHONE_REGEX = /^\d{0,10}$/;
const validateCustomerForm = (data: CreateCustomerDTO, isEdit: boolean, editingId: string | null, existingPhones: string[]) => {
  const errors: Record<string, string> = {};
  const name = data.name?.trim() || '';
  const phone = data.phone?.trim() || '';
  if (!name) errors.name = 'Full name is required';
  else if (name.length < 2) errors.name = 'Name must be at least 2 characters';
  if (!phone) errors.phone = 'Phone number is required';
  else if (!/^\d{10}$/.test(phone)) errors.phone = 'Phone must be exactly 10 digits';
  else if (!isEdit && existingPhones.includes(phone)) errors.phone = 'This phone number is already registered';
  const rates = data.commissionRates;
  (['visa', 'master', 'amex', 'rupay'] as const).forEach(key => {
    const v = rates[key];
    if (typeof v !== 'number' || isNaN(v) || v < 0 || v > 100) {
      errors[`rate_${key}`] = `${key.charAt(0).toUpperCase() + key.slice(1)} must be 0–100%`;
    }
  });
  return errors;
};

const CustomersView = () => {
  const { customers, addCustomer, updateCustomer, deleteCustomer } = useERP();
  const { confirm } = useConfirm();
  const [isAdding, setIsAdding] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<{ name: string; phone: string; commissionRates: Record<keyof Rates, string> }>({ 
    name: '', 
    phone: '', 
    commissionRates: toRateStrings(DEFAULT_RATES) 
  });

  const resetForm = () => {
    setFormData({ name: '', phone: '', commissionRates: toRateStrings(DEFAULT_RATES) });
    setErrors({});
    setIsAdding(false);
    setEditingId(null);
  };

  const handlePhoneChange = (value: string) => {
    if (PHONE_REGEX.test(value)) {
      setFormData(prev => ({ ...prev, phone: value }));
      setErrors(prev => (prev.phone ? { ...prev, phone: undefined } : prev));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedRates: Rates = {
      visa: safeParseFloat(formData.commissionRates.visa),
      master: safeParseFloat(formData.commissionRates.master),
      amex: safeParseFloat(formData.commissionRates.amex),
      rupay: safeParseFloat(formData.commissionRates.rupay)
    };
    const payload: CreateCustomerDTO = { 
      name: formData.name.trim(), 
      phone: formData.phone.trim(),
      commissionRates: parsedRates
    };
    const otherPhones = customers.filter(c => c.id !== editingId).map(c => c.phone);
    const validationErrors = validateCustomerForm(payload, !!editingId, editingId, otherPhones);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    if (editingId) {
      updateCustomer(editingId, payload);
      resetForm();
    } else {
      const id = await addCustomer(payload);
      if (id) resetForm();
    }
  };

  const handleEdit = (c: { id: string; name: string; phone: string; commissionRates: Rates }) => {
    setEditingId(c.id);
    setErrors({});
    setFormData({
      name: c.name,
      phone: c.phone.replace(/\D/g, '').slice(0, 10),
      commissionRates: toRateStrings(c.commissionRates)
    });
  };

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: 'Delete Customer',
      message: `Delete customer "${name}"? This cannot be undone.`,
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (ok) deleteCustomer(id);
  };

  const updateRate = (key: keyof typeof formData.commissionRates, value: string) => {
    setFormData(prev => ({
      ...prev,
      commissionRates: { ...prev.commissionRates, [key]: value }
    }));
    if (errors[`rate_${key}`]) setErrors(prev => ({ ...prev, [`rate_${key}`]: undefined }));
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search) || c.id.toLowerCase().includes(search.toLowerCase())
  );
  const isFormOpen = isAdding || editingId;

  return (
    <div className="space-y-6">
      <PageFilters
        sectionTitle="Filters"
        searchPlaceholder="Search by name, phone or ID..."
        searchValue={search}
        onSearchChange={setSearch}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">View:</span>
          <div className="flex p-1 bg-slate-100 rounded-lg">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                viewMode === 'list' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <List size={16} />
              List
            </button>
            <button
              onClick={() => setViewMode('card')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                viewMode === 'card' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <LayoutGrid size={16} />
              Card
            </button>
          </div>
        </div>
        <Button 
          onClick={() => isFormOpen ? resetForm() : setIsAdding(true)} 
          variant={isFormOpen ? 'secondary' : 'primary'}
        >
          {isFormOpen ? 'Cancel' : 'Add New Customer'}
        </Button>
      </div>

      {(isAdding || editingId) && (
        <Card className="max-w-xl mx-auto border-indigo-200">
          <CardHeader 
            title={editingId ? 'Edit Customer' : 'Create Customer'} 
            subtitle={editingId ? 'Update customer details and commission rates.' : 'Adds a customer and a corresponding payable ledger account.'} 
          />
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Full Name"
                value={formData.name}
                onChange={e => { setFormData({...formData, name: e.target.value}); if (errors.name) setErrors(p => ({...p, name: undefined})); }}
                error={errors.name}
                placeholder="Enter full name"
                maxLength={100}
                required
              />
              <Input
                label="Phone Number"
                value={formData.phone}
                onChange={e => handlePhoneChange(e.target.value)}
                error={errors.phone}
                placeholder="10 digits only"
                maxLength={10}
                inputMode="numeric"
                pattern="\d{10}"
                required
              />
              
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">Commission / Service Charges (%)</p>
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Visa" type="number" step="0.1" min={0} max={100} value={formData.commissionRates.visa} onChange={e => updateRate('visa', e.target.value)} error={errors.rate_visa} />
                  <Input label="Master" type="number" step="0.1" min={0} max={100} value={formData.commissionRates.master} onChange={e => updateRate('master', e.target.value)} error={errors.rate_master} />
                  <Input label="Amex" type="number" step="0.1" min={0} max={100} value={formData.commissionRates.amex} onChange={e => updateRate('amex', e.target.value)} error={errors.rate_amex} />
                  <Input label="Rupay" type="number" step="0.1" min={0} max={100} value={formData.commissionRates.rupay} onChange={e => updateRate('rupay', e.target.value)} error={errors.rate_rupay} />
                </div>
              </div>

              <Button type="submit" className="w-full">{editingId ? 'Save Changes' : 'Create Customer'}</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {viewMode === 'list' ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-600">
                <tr>
                  <th className="p-4 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Name</th>
                  <th className="p-4 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Phone</th>
                  <th className="p-4 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-center">Visa</th>
                  <th className="p-4 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-center">Master</th>
                  <th className="p-4 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-center">Amex</th>
                  <th className="p-4 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-center">Rupay</th>
                  <th className="p-4 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">ID</th>
                  <th className="p-4 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-right w-28">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filteredCustomers.map((c, idx) => (
                  <tr key={c.id} className={`hover:bg-indigo-50/30 dark:hover:bg-indigo-900/20 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/30 dark:bg-slate-800/30' : ''}`}>
                    <td className="p-4 font-semibold text-slate-800 dark:text-slate-200">{c.name}</td>
                    <td className="p-4 text-slate-600 dark:text-slate-400 font-medium">{c.phone}</td>
                    <td className="p-4 text-center font-semibold">{c.commissionRates.visa}%</td>
                    <td className="p-4 text-center font-semibold">{c.commissionRates.master}%</td>
                    <td className="p-4 text-center font-semibold">{c.commissionRates.amex}%</td>
                    <td className="p-4 text-center font-semibold">{c.commissionRates.rupay}%</td>
                    <td className="p-4 text-slate-500 dark:text-slate-400 font-medium">{c.id}</td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleEdit(c)}
                          className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(c.id, c.name)}
                          className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCustomers.map(c => (
            <Card key={c.id}>
              <div className="p-4 flex items-start justify-between">
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200">{c.name}</h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{c.phone}</p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleEdit(c)}
                    className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(c.id, c.name)}
                    className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-y border-slate-100 dark:border-slate-700 grid grid-cols-4 gap-2 text-center text-xs">
                <div><div className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase">Visa</div><div className="font-bold dark:text-slate-200">{c.commissionRates.visa}%</div></div>
                <div><div className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase">Master</div><div className="font-bold dark:text-slate-200">{c.commissionRates.master}%</div></div>
                <div><div className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase">Amex</div><div className="font-bold dark:text-slate-200">{c.commissionRates.amex}%</div></div>
                <div><div className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase">Rupay</div><div className="font-bold dark:text-slate-200">{c.commissionRates.rupay}%</div></div>
              </div>
              <div className="px-4 py-2 text-xs text-slate-400 dark:text-slate-500">ID: {c.id}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

const WalletsView = () => {
  const { user } = useAuth();
  const toast = useToast();
  const { confirm } = useConfirm();
  const { wallets, accounts, transactions, updateWallet, deleteWallet, addWallet, addWalletPG, updateWalletPG, removeWalletPG, getAccountBalance, formatCurrency, recordWalletOpeningBalance, generateProfitAndLoss } = useERP();
  const isStoreAdmin = user?.role === 'product_admin';
  const isMasterAdmin = user?.role === 'master_admin';
  /** Same wallets as GET /wallets: global + this store's. Master Admin can change any wallet in the system. */
  const canMutateWallet = (w: Wallet) => {
    if (isMasterAdmin) return true;
    if (!isStoreAdmin || !user?.productId) return false;
    if (!w.storeId) return true;
    return w.storeId === user.productId;
  };

  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingPG, setEditingPG] = useState<{ walletId: string, pgName: string | null } | null>(null);
  const [search, setSearch] = useState('');
  const [editWalletName, setEditWalletName] = useState('');
  const [editWalletError, setEditWalletError] = useState('');
  const [openingExtraAmount, setOpeningExtraAmount] = useState('');
  const [showAddWallet, setShowAddWallet] = useState(false);
  const [newWalletName, setNewWalletName] = useState('');
  const [newWalletPgName, setNewWalletPgName] = useState('Default PG');
  const [newWalletOpening, setNewWalletOpening] = useState('');
  const [newWalletErrors, setNewWalletErrors] = useState<Record<string, string>>({});
  const [pgForm, setPgForm] = useState({
    name: '', visa: '', master: '', amex: '', rupay: ''
  });
  const [pgErrors, setPgErrors] = useState<Record<string, string>>({});

  const openPGForm = (walletId: string, pg?: PGConfig) => {
    const w = wallets.find((x) => x.id === walletId);
    if (w && !canMutateWallet(w)) return;
    setEditingPG({ walletId, pgName: pg ? pg.name : null });
    setPgErrors({});
    if (pg) {
      setPgForm({
        name: pg.name,
        visa: pg.charges.visa.toString(),
        master: pg.charges.master.toString(),
        amex: pg.charges.amex.toString(),
        rupay: pg.charges.rupay.toString(),
      });
    } else {
      setPgForm({ name: '', visa: '', master: '', amex: '', rupay: '' });
    }
  };

  const handleEditWallet = (w: Wallet) => {
    if (!canMutateWallet(w)) return;
    setEditingId(w.id);
    setEditWalletName(w.name);
    setEditWalletError('');
    setOpeningExtraAmount('');
  };

  const resetAddWalletForm = () => {
    setNewWalletName('');
    setNewWalletPgName('Default PG');
    setNewWalletOpening('');
    setNewWalletErrors({});
    setShowAddWallet(false);
  };

  const handleAddWallet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isStoreAdmin || !user?.productId) return;
    const err: Record<string, string> = {};
    const name = newWalletName.trim();
    if (!name) err.name = 'Wallet name is required';
    else if (name.length < 2) err.name = 'Name must be at least 2 characters';
    const o = safeParseFloat(newWalletOpening);
    if (newWalletOpening.trim() !== '' && (isNaN(o) || o < 0)) err.opening = 'Opening balance must be 0 or more';
    setNewWalletErrors(err);
    if (Object.keys(err).length > 0) return;

    addWallet({
      name,
      pgName: newWalletPgName.trim() || 'Default PG',
      charges: { ...NEW_WALLET_PG_RATES },
      storeId: user.productId,
      openingBalance: newWalletOpening.trim() === '' ? 0 : o,
    });
    resetAddWalletForm();
    toast.success('Wallet created');
  };

  const handleWalletNameSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    const name = editWalletName.trim();
    if (!name) { setEditWalletError('Wallet name is required'); return; }
    if (name.length < 2) { setEditWalletError('Name must be at least 2 characters'); return; }
    setEditWalletError('');
    updateWallet(editingId, { name });
    setEditingId(null);
  };

  const handlePGSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPG) return;
    const err: Record<string, string> = {};
    if (!pgForm.name?.trim()) err.name = 'PG name is required';
    (['visa', 'master', 'amex', 'rupay'] as const).forEach(key => {
      const v = safeParseFloat(pgForm[key]);
      if (pgForm[key] !== '' && (isNaN(v) || v < 0 || v > 100)) err[key] = 'Must be 0–100%';
    });
    setPgErrors(err);
    if (Object.keys(err).length > 0) return;

    const config: PGConfig = {
      name: pgForm.name.trim(),
      charges: {
        visa: safeParseFloat(pgForm.visa) || 0,
        master: safeParseFloat(pgForm.master) || 0,
        amex: safeParseFloat(pgForm.amex) || 0,
        rupay: safeParseFloat(pgForm.rupay) || 0,
      }
    };
    if (editingPG.pgName) {
      updateWalletPG(editingPG.walletId, editingPG.pgName, config);
    } else {
      addWalletPG(editingPG.walletId, config);
    }
    setEditingPG(null);
    setPgErrors({});
  };

  const filteredWallets = wallets.filter(w =>
    w.name.toLowerCase().includes(search.toLowerCase()) || w.ledgerAccountId.toLowerCase().includes(search.toLowerCase())
  );

  const handleDeleteWallet = async (w: Wallet) => {
    if (!canMutateWallet(w)) return;
    const ok = await confirm({
      title: 'Delete wallet',
      message: `Permanently delete "${w.name}" and its ledger ${w.ledgerAccountId}? This cannot be undone. Past transactions may still reference this ledger ID in history.`,
      confirmText: 'Delete wallet',
      variant: 'danger',
    });
    if (!ok) return;
    deleteWallet(w.id);
    if (editingId === w.id) {
      setEditingId(null);
      setOpeningExtraAmount('');
    }
    toast.success('Wallet deleted');
  };

  const handleRemovePG = async (w: Wallet, pgName: string) => {
    if (!canMutateWallet(w) || w.pgs.length <= 1) return;
    const ok = await confirm({
      title: 'Remove payment gateway',
      message: `Remove "${pgName}" from ${w.name}? This cannot be undone.`,
      confirmText: 'Remove',
      variant: 'danger',
    });
    if (!ok) return;
    removeWalletPG(w.id, pgName);
    toast.success('Payment gateway removed');
  };

  return (
    <div className="space-y-6">
      <PageFilters
        sectionTitle="Filters"
        searchPlaceholder="Search by wallet name or ledger ID..."
        searchValue={search}
        onSearchChange={setSearch}
      />
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">View:</span>
          <div className="flex p-1 bg-slate-100 rounded-lg">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                viewMode === 'list' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <List size={16} />
              List
            </button>
            <button
              onClick={() => setViewMode('card')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                viewMode === 'card' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <LayoutGrid size={16} />
              Card
            </button>
          </div>
        </div>
        {isStoreAdmin && (
          <Button type="button" onClick={() => setShowAddWallet(true)}>
            <Plus size={16} /> Add wallet
          </Button>
        )}
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xl">
          {isStoreAdmin
            ? 'You can add store-owned wallets and edit any wallet you see here — including shared (global) ones — name, payment gateways, and opening balance entries. Editing a shared wallet\'s PG settings affects all stores that use it. You cannot edit another store\'s private wallets.'
            : 'View wallets and balances. Only the store admin can add or edit wallets.'}
        </p>
      </div>

      <WalletCapitalBreakdown
        wallets={wallets}
        accounts={accounts}
        transactions={transactions}
        getAccountBalance={getAccountBalance}
        formatCurrency={formatCurrency}
        generateProfitAndLoss={generateProfitAndLoss}
      />

      {showAddWallet && isStoreAdmin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader
              title="Add wallet"
              action={<Button variant="outline" size="sm" onClick={resetAddWalletForm}><X size={16} /></Button>}
            />
            <CardContent>
              <form onSubmit={handleAddWallet} className="space-y-4">
                <Input
                  label="Wallet name"
                  value={newWalletName}
                  onChange={(e) => { setNewWalletName(e.target.value); setNewWalletErrors((p) => ({ ...p, name: '' })); }}
                  error={newWalletErrors.name}
                  placeholder="e.g. Razorpay Main"
                />
                <Input
                  label="Default payment gateway name"
                  value={newWalletPgName}
                  onChange={(e) => setNewWalletPgName(e.target.value)}
                  placeholder="Default PG"
                />
                <Input
                  label="Opening balance (₹)"
                  type="number"
                  value={newWalletOpening}
                  onChange={(e) => { setNewWalletOpening(e.target.value); setNewWalletErrors((p) => ({ ...p, opening: '' })); }}
                  error={newWalletErrors.opening}
                  placeholder="0 — optional"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Opening balance books <strong>Dr</strong> this wallet / <strong>Cr</strong> Retained earnings (Q002). Default MDR % for the first PG are Visa 1.2%, Master 1.2%, Amex 2.5%, Rupay 0.5% — edit under Payment Gateways after save.
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={resetAddWalletForm}>
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1">
                    Create wallet
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {editingPG && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader 
              title={editingPG.pgName ? `Edit PG: ${editingPG.pgName}` : "Add New PG"} 
              action={<Button variant="outline" size="sm" onClick={() => setEditingPG(null)}><X size={16}/></Button>} 
            />
            <CardContent>
              <form onSubmit={handlePGSubmit} className="space-y-4">
                <Input label="PG Name" value={pgForm.name} onChange={e => { setPgForm({...pgForm, name: e.target.value}); setPgErrors(p => ({...p, name: ''})); }} error={pgErrors.name} placeholder="e.g. Razorpay PG" />
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Visa %" type="number" step="0.1" value={pgForm.visa} onChange={e => { setPgForm({...pgForm, visa: e.target.value}); setPgErrors(p => ({...p, visa: ''})); }} error={pgErrors.visa} placeholder="0" />
                  <Input label="Master %" type="number" step="0.1" value={pgForm.master} onChange={e => { setPgForm({...pgForm, master: e.target.value}); setPgErrors(p => ({...p, master: ''})); }} error={pgErrors.master} placeholder="0" />
                  <Input label="Amex %" type="number" step="0.1" value={pgForm.amex} onChange={e => { setPgForm({...pgForm, amex: e.target.value}); setPgErrors(p => ({...p, amex: ''})); }} error={pgErrors.amex} placeholder="0" />
                  <Input label="Rupay %" type="number" step="0.1" value={pgForm.rupay} onChange={e => { setPgForm({...pgForm, rupay: e.target.value}); setPgErrors(p => ({...p, rupay: ''})); }} error={pgErrors.rupay} placeholder="0" />
                </div>
                <Button type="submit" className="w-full">Save Configuration</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {editingId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader 
              title="Edit wallet" 
              action={<Button variant="outline" size="sm" onClick={() => { setEditingId(null); setOpeningExtraAmount(''); }}><X size={16}/></Button>} 
            />
            <CardContent>
              <form onSubmit={handleWalletNameSave} className="space-y-4">
                <Input label="Wallet Name" value={editWalletName} onChange={e => { setEditWalletName(e.target.value); setEditWalletError(''); }} error={editWalletError} placeholder="Wallet name" />
                <Button type="submit" className="w-full">Save name</Button>
              </form>
              {(() => {
                const ew = wallets.find((x) => x.id === editingId);
                if (!ew || !canMutateWallet(ew)) return null;
                return (
                  <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-600 space-y-3">
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Opening balance adjustment</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      <strong>Positive</strong> amount: debit wallet / credit retained earnings (Q002) — increases opening.{' '}
                      <strong>Negative</strong> (e.g. −5000): credit wallet / debit Q002 — reduces opening. You can post multiple times.
                    </p>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Current ledger balance: {formatCurrency(getAccountBalance(ew.ledgerAccountId))}
                    </p>
                    <Input
                      label="Adjustment (₹)"
                      type="number"
                      step="any"
                      value={openingExtraAmount}
                      onChange={(e) => setOpeningExtraAmount(e.target.value)}
                      placeholder="e.g. 50000 or −2500"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        const v = safeParseFloat(openingExtraAmount);
                        if (isNaN(v) || Math.abs(v) < 0.005) {
                          toast.error('Enter a non-zero amount (negative allowed)');
                          return;
                        }
                        recordWalletOpeningBalance(ew.id, v);
                        setOpeningExtraAmount('');
                        toast.success('Opening adjustment posted');
                      }}
                    >
                      Post adjustment
                    </Button>
                    <div className="pt-4 border-t border-slate-200 dark:border-slate-600">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                        onClick={() => handleDeleteWallet(ew)}
                      >
                        <Trash2 size={16} className="inline mr-2" />
                        Delete this wallet
                      </Button>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                        Removes the wallet and its ledger. Past transactions may still reference this ledger ID. Deleting a shared wallet affects every store that uses it.
                      </p>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      )}

      {viewMode === 'list' ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-600">
                <tr>
                  <th className="p-4 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Wallet</th>
                  <th className="p-4 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Ledger</th>
                  <th className="p-4 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-right">Balance</th>
                  <th className="p-4 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Payment Gateways</th>
                  <th className="p-4 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-right w-36">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredWallets.map((w, idx) => (
                  <tr key={w.id} className={`hover:bg-indigo-50/30 dark:hover:bg-indigo-900/20 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/30 dark:bg-slate-800/30' : ''}`}>
                    <td className="p-4 font-semibold text-slate-800 dark:text-slate-200">{w.name}</td>
                    <td className="p-4 text-slate-600 dark:text-slate-400 font-medium">{w.ledgerAccountId}</td>
                    <td className="p-4 text-right font-mono font-semibold text-indigo-600">{formatCurrency(getAccountBalance(w.ledgerAccountId))}</td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-2 items-center">
                        {w.pgs.map(pg => (
                          <span key={pg.name} className="inline-flex items-center gap-0.5 px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-xs font-medium group">
                            {pg.name}
                            {canMutateWallet(w) ? (
                              <>
                                <button type="button" onClick={() => openPGForm(w.id, pg)} className="p-0.5 text-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded opacity-70 group-hover:opacity-100" title="Edit PG"><Edit2 size={12}/></button>
                                {w.pgs.length > 1 ? (
                                  <button
                                    type="button"
                                    onClick={() => handleRemovePG(w, pg.name)}
                                    className="p-0.5 text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/40 rounded opacity-70 group-hover:opacity-100"
                                    title="Remove PG"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                ) : null}
                              </>
                            ) : null}
                          </span>
                        ))}
                        {canMutateWallet(w) ? (
                          <button type="button" onClick={() => openPGForm(w.id)} className="text-indigo-600 hover:underline text-xs font-semibold">+ Add PG</button>
                        ) : null}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      {canMutateWallet(w) ? (
                        <div className="inline-flex items-center gap-0.5 justify-end">
                          <button type="button" onClick={() => handleEditWallet(w)} className="p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors" title="Edit wallet"><Edit2 size={16} /></button>
                          <button
                            type="button"
                            onClick={() => handleDeleteWallet(w)}
                            className="p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors"
                            title="Delete wallet"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredWallets.map(w => (
            <Card key={w.id} className="h-full">
              <CardHeader 
                title={w.name} 
                subtitle={`Ledger: ${w.ledgerAccountId}`} 
                action={
                  <div className="flex items-center gap-1">
                    {canMutateWallet(w) ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => openPGForm(w.id)}><Plus size={14}/> Add PG</Button>
                        <button type="button" onClick={() => handleEditWallet(w)} className="p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors" title="Edit wallet"><Edit2 size={14}/></button>
                        <button type="button" onClick={() => handleDeleteWallet(w)} className="p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors" title="Delete wallet"><Trash2 size={14}/></button>
                      </>
                    ) : null}
                  </div>
                }
              />
              <CardContent className="space-y-4">
                {w.pgs.map(pg => (
                  <div key={pg.name} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
                    <div className="flex justify-between items-center mb-2">
                      <p className="font-bold text-slate-700 dark:text-slate-300">{pg.name}</p>
                      {canMutateWallet(w) ? (
                        <div className="flex items-center gap-0.5">
                          <button type="button" onClick={() => openPGForm(w.id, pg)} className="text-indigo-600 hover:text-indigo-800 dark:hover:text-indigo-300 p-1 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors" title="Edit PG"><Edit2 size={14}/></button>
                          {w.pgs.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => handleRemovePG(w, pg.name)}
                              className="text-rose-600 hover:text-rose-800 dark:hover:text-rose-400 p-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors"
                              title="Remove PG"
                            >
                              <Trash2 size={14} />
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center text-xs">
                      <div className="bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-100 dark:border-slate-600"><div className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase">Visa</div><span className="font-bold dark:text-slate-200">{pg.charges.visa}%</span></div>
                      <div className="bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-100 dark:border-slate-600"><div className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase">Master</div><span className="font-bold dark:text-slate-200">{pg.charges.master}%</span></div>
                      <div className="bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-100 dark:border-slate-600"><div className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase">Amex</div><span className="font-bold dark:text-slate-200">{pg.charges.amex}%</span></div>
                      <div className="bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-100 dark:border-slate-600"><div className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase">Rupay</div><span className="font-bold dark:text-slate-200">{pg.charges.rupay}%</span></div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
