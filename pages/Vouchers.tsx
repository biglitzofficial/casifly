import React, { useMemo, useState } from 'react';
import { useERP } from '../context/ERPContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, Input, Select, Button } from '../components/ui/Elements';
import { Transaction, TransactionType } from '../types';
import { safeParseFloat, roundCurrency } from '../lib/utils';
import { ArrowDownLeft, ArrowUpRight, Printer, Receipt } from 'lucide-react';
import {
  VoucherKind,
  buildVoucherEntries,
  counterAccountOptions,
  isVoucherTransaction,
  liquidAccountOptions,
  nextVoucherNo,
  voucherMainAmount,
} from '../lib/voucherUtils';
import { VoucherPrintModal } from '../components/VoucherPrintModal';

export const Vouchers: React.FC = () => {
  const { accounts, wallets, transactions, customers, postTransaction, formatCurrency } = useERP();
  const { user, products } = useAuth();
  const toast = useToast();

  const [mode, setMode] = useState<VoucherKind>('receipt');
  const [party, setParty] = useState('');
  const [amount, setAmount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [liquidAccountId, setLiquidAccountId] = useState('');
  const [counterAccountId, setCounterAccountId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [printTxn, setPrintTxn] = useState<Transaction | null>(null);

  const storeName = user?.productId ? products.find((p) => p.id === user.productId)?.name : undefined;

  const liquidOpts = useMemo(() => liquidAccountOptions(accounts, wallets), [accounts, wallets]);
  const counterOpts = useMemo(() => counterAccountOptions(accounts, mode), [accounts, mode]);

  React.useEffect(() => {
    if (!liquidAccountId && liquidOpts[0]) setLiquidAccountId(liquidOpts[0].id);
  }, [liquidOpts, liquidAccountId]);

  React.useEffect(() => {
    if (!counterOpts.some((o) => o.id === counterAccountId)) {
      setCounterAccountId(counterOpts[0]?.id ?? '');
    }
  }, [counterOpts, counterAccountId, mode]);

  const voucherList = useMemo(
    () =>
      transactions
        .filter(isVoucherTransaction)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [transactions]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    const amt = safeParseFloat(amount);
    if (!party.trim()) err.party = 'Party name is required';
    if (!amount.trim() || amt <= 0) err.amount = 'Enter a valid amount';
    if (!liquidAccountId) err.liquid = 'Select bank / cash / wallet';
    if (!counterAccountId) err.counter = 'Select account';
    if (liquidAccountId === counterAccountId) err.counter = 'Accounts must be different';
    setErrors(err);
    if (Object.keys(err).length > 0) return;

    const voucherNo = nextVoucherNo(mode, transactions);
    const label = mode === 'receipt' ? 'Receipt Voucher' : 'Payment Voucher';
    const description = `${label} ${voucherNo}: ${party.trim()}${remarks.trim() ? ` — ${remarks.trim()}` : ''}`;
    const entries = buildVoucherEntries(mode, amt, liquidAccountId, counterAccountId);

    setLoading(true);
    try {
      const p = postTransaction(description, TransactionType.JOURNAL, entries, {
        voucherType: mode,
        voucherNo,
        voucherParty: party.trim(),
        voucherRemarks: remarks.trim() || undefined,
      });
      if (p && typeof (p as Promise<unknown>).then === 'function') await p;
      toast.success(`${label} ${voucherNo} posted`);
      setParty('');
      setAmount('');
      setRemarks('');
    } finally {
      setLoading(false);
    }
  };

  const customerName = (t: Transaction) =>
    t.metadata?.customerId ? customers.find((c) => c.id === t.metadata!.customerId)?.name : undefined;

  return (
    <Layout title="Receipt & Payment Vouchers">
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2 p-2 bg-white/90 rounded-2xl border-2 border-slate-100 shadow-sm">
          <button
            type="button"
            onClick={() => { setMode('receipt'); setErrors({}); }}
            className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm uppercase tracking-wide transition-all ${
              mode === 'receipt' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <ArrowDownLeft size={18} /> Receipt
          </button>
          <button
            type="button"
            onClick={() => { setMode('payment'); setErrors({}); }}
            className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm uppercase tracking-wide transition-all ${
              mode === 'payment' ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <ArrowUpRight size={18} /> Payment
          </button>
        </div>

        <Card className={`border-t-4 ${mode === 'receipt' ? 'border-t-emerald-500' : 'border-t-amber-500'}`}>
          <CardHeader
            title={mode === 'receipt' ? 'Receipt Voucher' : 'Payment Voucher'}
            subtitle={
              mode === 'receipt'
                ? 'Money received — debits bank/cash/wallet, credits income or other account'
                : 'Money paid — debits expense account, credits bank/cash/wallet'
            }
          />
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
              <Input
                label={mode === 'receipt' ? 'Received from (party)' : 'Paid to (party)'}
                value={party}
                onChange={(e) => { setParty(e.target.value); setErrors((p) => ({ ...p, party: '' })); }}
                error={errors.party}
                placeholder="Customer / vendor name"
              />
              <Input
                label="Amount (₹)"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setErrors((p) => ({ ...p, amount: '' })); }}
                error={errors.amount}
                placeholder="0.00"
              />
              <Select
                label={mode === 'receipt' ? 'Received in' : 'Paid from'}
                value={liquidAccountId}
                onChange={(e) => { setLiquidAccountId(e.target.value); setErrors((p) => ({ ...p, liquid: '' })); }}
                options={[{ value: '', label: '— Select —' }, ...liquidOpts.map((o) => ({ value: o.id, label: o.label }))]}
              />
              {errors.liquid ? <p className="text-sm text-rose-600 md:col-span-2">{errors.liquid}</p> : null}
              <Select
                label={mode === 'receipt' ? 'Credit to account' : 'Debit to account'}
                value={counterAccountId}
                onChange={(e) => { setCounterAccountId(e.target.value); setErrors((p) => ({ ...p, counter: '' })); }}
                options={[{ value: '', label: '— Select —' }, ...counterOpts.map((o) => ({ value: o.id, label: o.label }))]}
              />
              {errors.counter ? <p className="text-sm text-rose-600 md:col-span-2">{errors.counter}</p> : null}
              <div className="md:col-span-2">
                <Input
                  label="Remarks (optional)"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="UTR, cheque no., purpose…"
                />
              </div>
              <div className="md:col-span-2">
                <Button type="submit" size="lg" loading={loading} className="w-full sm:w-auto">
                  Post {mode === 'receipt' ? 'Receipt' : 'Payment'} Voucher
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Recent vouchers" subtitle="Print anytime — posts to ledger as journal entries" />
          <CardContent>
            {voucherList.length === 0 ? (
              <p className="text-center text-sm text-slate-500 py-8">No vouchers posted yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800 border-b">
                    <tr>
                      <th className="p-3 text-left font-bold text-xs uppercase text-slate-600">Date</th>
                      <th className="p-3 text-left font-bold text-xs uppercase text-slate-600">Voucher</th>
                      <th className="p-3 text-left font-bold text-xs uppercase text-slate-600">Party</th>
                      <th className="p-3 text-right font-bold text-xs uppercase text-slate-600">Amount</th>
                      <th className="p-3 text-center font-bold text-xs uppercase text-slate-600 w-24">Print</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {voucherList.slice(0, 50).map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="p-3 whitespace-nowrap">
                          {new Date(t.date).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td className="p-3">
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-bold uppercase px-2 py-0.5 rounded ${
                              t.metadata?.voucherType === 'payment'
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-emerald-100 text-emerald-900'
                            }`}
                          >
                            <Receipt size={12} />
                            {t.metadata?.voucherNo ?? '—'}
                          </span>
                        </td>
                        <td className="p-3 font-medium">{t.metadata?.voucherParty ?? customerName(t) ?? '—'}</td>
                        <td className="p-3 text-right font-bold tabular-nums">{formatCurrency(voucherMainAmount(t))}</td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => setPrintTxn(t)}
                            className="p-2 rounded-lg text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                            title="Print voucher"
                          >
                            <Printer size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {printTxn ? (
        <VoucherPrintModal
          txn={printTxn}
          accounts={accounts}
          storeName={storeName}
          formatCurrency={formatCurrency}
          onClose={() => setPrintTxn(null)}
        />
      ) : null}
    </Layout>
  );
};
