import React, { useState } from 'react';
import { Account } from '../types';
import { TransactionType } from '../types';
import { Button, Input } from './ui/Elements';
import { roundCurrency, safeParseFloat } from '../lib/utils';
import { useToast } from '../context/ToastContext';

type Line = { accountId: string; debit: string; credit: string };

type Props = {
  accounts: Account[];
  postTransaction: (
    description: string,
    type: TransactionType,
    entries: { accountId: string; debit: number; credit: number }[],
    metadata?: undefined,
    date?: string,
  ) => void | Promise<void>;
};

export function TempManualJournalForm({ accounts, postTransaction }: Props) {
  const toast = useToast();
  const [memo, setMemo] = useState('P&L adjustment (temp)');
  const [dateLocal, setDateLocal] = useState(() =>
    new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
  );
  const [lines, setLines] = useState<Line[]>([
    { accountId: 'I001', debit: '', credit: '' },
    { accountId: 'E001', debit: '', credit: '' },
  ]);

  const setLine = (i: number, patch: Partial<Line>) => {
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  };

  const addLine = () => {
    setLines((prev) => [...prev, { accountId: accounts[0]?.id || 'I001', debit: '', credit: '' }]);
  };

  const removeLine = (i: number) => {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((_, j) => j !== i));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const entries = lines.map((l) => ({
      accountId: l.accountId,
      debit: roundCurrency(safeParseFloat(l.debit)),
      credit: roundCurrency(safeParseFloat(l.credit)),
    }));
    const totalDr = entries.reduce((s, x) => s + x.debit, 0);
    const totalCr = entries.reduce((s, x) => s + x.credit, 0);
    if (Math.abs(totalDr - totalCr) > 0.01) {
      toast.error('Journal must balance (total debit = total credit).');
      return;
    }
    if (entries.length < 2) {
      toast.error('Need at least two lines.');
      return;
    }
    if (entries.every((x) => x.debit === 0 && x.credit === 0)) {
      toast.error('Enter at least one amount.');
      return;
    }
    const invalid = entries.filter((x) => !accounts.some((a) => a.id === x.accountId));
    if (invalid.length) {
      toast.error('Invalid account selection.');
      return;
    }
    const iso = new Date(dateLocal).toISOString();
    void Promise.resolve(
      postTransaction(memo.trim() || 'Manual journal', TransactionType.JOURNAL, entries, undefined, iso),
    ).then(() => {
      toast.success('Journal posted');
      setLines([
        { accountId: 'I001', debit: '', credit: '' },
        { accountId: 'E001', debit: '', credit: '' },
      ]);
    });
  };

  const totalDr = lines.reduce((s, l) => s + safeParseFloat(l.debit), 0);
  const totalCr = lines.reduce((s, l) => s + safeParseFloat(l.credit), 0);
  const balanced = Math.abs(totalDr - totalCr) < 0.01;

  return (
    <form onSubmit={submit} className="p-6 space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Posts a balanced <strong>Journal</strong> to income/expense accounts so the P&amp;L statement updates. Remove this block when done.
      </p>
      <Input label="Memo / description" value={memo} onChange={(e) => setMemo(e.target.value)} />
      <div>
        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Date</label>
        <input
          type="datetime-local"
          value={dateLocal}
          onChange={(e) => setDateLocal(e.target.value)}
          className="w-full px-4 py-3.5 rounded-2xl border-2 border-slate-200 dark:border-slate-600 font-semibold bg-white dark:bg-slate-800 dark:text-slate-100"
        />
      </div>
      <div className="space-y-2">
        {lines.map((line, i) => (
          <div key={i} className="flex flex-wrap gap-2 items-end">
            <select
              value={line.accountId}
              onChange={(e) => setLine(i, { accountId: e.target.value })}
              className="flex-1 min-w-[200px] p-3 rounded-xl border-2 border-slate-200 dark:border-slate-600 text-sm font-semibold dark:bg-slate-800 dark:text-slate-100"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <Input
              label="Debit"
              type="number"
              className="w-28"
              value={line.debit}
              onChange={(e) => setLine(i, { debit: e.target.value, credit: '' })}
            />
            <Input
              label="Credit"
              type="number"
              className="w-28"
              value={line.credit}
              onChange={(e) => setLine(i, { credit: e.target.value, debit: '' })}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => removeLine(i)} disabled={lines.length <= 2}>
              Remove
            </Button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" size="sm" onClick={addLine}>
          Add line
        </Button>
        <span className={`text-sm font-bold ${balanced ? 'text-emerald-600' : 'text-rose-600'}`}>
          Σ Dr {totalDr.toFixed(2)} · Σ Cr {totalCr.toFixed(2)}
        </span>
      </div>
      <Button type="submit" disabled={!balanced}>
        Post journal
      </Button>
    </form>
  );
}
