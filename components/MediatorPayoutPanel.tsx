import React, { useMemo, useState } from 'react';
import { Account, Customer, Transaction, TransactionType, Wallet } from '../types';
import { Button, Card, CardContent, CardHeader, Input, Select } from './ui/Elements';
import { useToast } from '../context/ToastContext';
import { safeParseFloat, roundCurrency } from '../lib/utils';
import {
  isSwipePayInflow,
  mediatorDueForInflow,
  parseSwipeInflowEconomics,
} from '../lib/swipeTxnEconomics';

type Props = {
  transactions: Transaction[];
  customers: Customer[];
  wallets: Wallet[];
  accounts: Account[];
  formatCurrency: (n: number) => string;
  postTransaction: (
    description: string,
    type: TransactionType,
    entries: { accountId: string; debit: number; credit: number }[],
    metadata?: Transaction['metadata'],
  ) => void | Promise<unknown>;
};

export function MediatorPayoutPanel({
  transactions,
  customers,
  wallets,
  accounts,
  formatCurrency,
  postTransaction,
}: Props) {
  const toast = useToast();
  const [linkedInflowId, setLinkedInflowId] = useState('');
  const [payFromAccountId, setPayFromAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const inflowsWithDue = useMemo(() => {
    return transactions
      .filter(isSwipePayInflow)
      .map((t) => ({ t, due: mediatorDueForInflow(t, transactions) }))
      .filter((x) => x.due > 0.005)
      .sort((a, b) => new Date(b.t.date).getTime() - new Date(a.t.date).getTime());
  }, [transactions]);

  const payFromOptions = useMemo(() => {
    const opts: { label: string; value: string }[] = [];
    for (const w of wallets) {
      opts.push({ label: `Wallet · ${w.name}`, value: w.ledgerAccountId });
    }
    for (const a of accounts) {
      if (a.category === 'Cash' || a.category === 'Bank') {
        opts.push({ label: `${a.category} · ${a.name}`, value: a.id });
      }
    }
    return opts;
  }, [wallets, accounts]);

  const selectedInflow = linkedInflowId
    ? transactions.find((t) => t.id === linkedInflowId)
    : undefined;
  const dueAmount = selectedInflow ? mediatorDueForInflow(selectedInflow, transactions) : 0;
  const customerName =
    selectedInflow?.metadata?.customerId
      ? customers.find((c) => c.id === selectedInflow.metadata!.customerId)?.name ?? '—'
      : '—';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    const amt = safeParseFloat(amount);
    if (!linkedInflowId.trim()) err.inflow = 'Select the swipe inflow';
    if (!payFromAccountId) err.payFrom = 'Select pay-from account';
    if (!amount.trim() || amt <= 0) err.amount = 'Enter a valid amount';
    else if (selectedInflow && amt > dueAmount + 0.01) {
      err.amount = `Cannot exceed mediator due (${formatCurrency(dueAmount)})`;
    }
    if (!remarks.trim()) err.remarks = 'Remarks required (mediator name / UTR / note)';
    setErrors(err);
    if (Object.keys(err).length > 0 || !selectedInflow) return;

    setLoading(true);
    try {
      const econ = parseSwipeInflowEconomics(selectedInflow, transactions)!;
      const desc = `Mediator payout: ${customerName} (${formatCurrency(amt)})`;
      const entries = [
        { accountId: 'E004', debit: amt, credit: 0 },
        { accountId: payFromAccountId, debit: 0, credit: amt },
      ];
      const wallet = wallets.find((w) => w.ledgerAccountId === payFromAccountId);
      const p = postTransaction(desc, TransactionType.JOURNAL, entries, {
        customerId: selectedInflow.metadata?.customerId,
        walletId: wallet?.id,
        relatedInflowId: selectedInflow.id,
        mediatorPayout: amt,
        mediatorRemarks: remarks.trim(),
      });
      if (p && typeof (p as Promise<unknown>).then === 'function') await p;
      toast.success('Mediator payout recorded');
      setAmount('');
      setRemarks('');
      setLinkedInflowId('');
      setErrors({});
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-t-4 border-t-violet-500">
      <CardHeader
        title="Mediator Payout"
        subtitle="Pay franchise / mediator share (other value) linked to a swipe inflow — shows in Transaction P&L with remarks"
      />
      <CardContent>
        {inflowsWithDue.length === 0 ? (
          <p className="text-sm text-slate-600 font-medium py-4">
            No pending mediator share. Other value appears when customer charge % is higher than your charge % on a swipe inflow.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <Select
              label="Link swipe inflow"
              value={linkedInflowId}
              onChange={(e) => {
                setLinkedInflowId(e.target.value);
                const t = transactions.find((x) => x.id === e.target.value);
                if (t) {
                  const due = mediatorDueForInflow(t, transactions);
                  setAmount(String(due));
                }
                setErrors((p) => ({ ...p, inflow: '' }));
              }}
              options={[
                { label: '— Select inflow with mediator due —', value: '' },
                ...inflowsWithDue.map(({ t, due }) => {
                  const cust = t.metadata?.customerId
                    ? customers.find((c) => c.id === t.metadata!.customerId)?.name
                    : 'Unknown';
                  const econ = parseSwipeInflowEconomics(t, transactions)!;
                  return {
                    value: t.id,
                    label: `${new Date(t.date).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })} · ${cust} · due ${formatCurrency(due)} / ${formatCurrency(econ.actualAmount)} swipe`,
                  };
                }),
              ]}
              error={errors.inflow}
            />
            {selectedInflow && dueAmount > 0.005 && (
              <div className="rounded-xl border-2 border-violet-100 bg-violet-50/80 px-4 py-3 text-sm text-violet-950">
                <strong>{customerName}</strong> — mediator due:{' '}
                <span className="font-black tabular-nums">{formatCurrency(dueAmount)}</span>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Amount (₹)"
                type="number"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setErrors((p) => ({ ...p, amount: '' }));
                }}
                error={errors.amount}
                className="font-bold"
              />
              <Select
                label="Pay from"
                value={payFromAccountId}
                onChange={(e) => {
                  setPayFromAccountId(e.target.value);
                  setErrors((p) => ({ ...p, payFrom: '' }));
                }}
                options={[{ label: '— Select —', value: '' }, ...payFromOptions]}
                error={errors.payFrom}
              />
            </div>
            <Input
              label="Remarks"
              placeholder="Mediator name, UTR / IMPS ref, deal note…"
              value={remarks}
              onChange={(e) => {
                setRemarks(e.target.value);
                setErrors((p) => ({ ...p, remarks: '' }));
              }}
              error={errors.remarks}
            />
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
              Record mediator payout
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
