import React, { useEffect, useMemo, useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { Account, LedgerEntry, Transaction } from '../types';
import { Button, Input } from './ui/Elements';
import { roundCurrency, safeParseFloat, normalizeLedgerEntries } from '../lib/utils';
import { useToast } from '../context/ToastContext';

type Props = {
  transaction: Transaction;
  accounts: Account[];
  formatCurrency: (n: number) => string;
  onClose: () => void;
  /** Return a promise so errors can keep the modal open. */
  onSave: (
    id: string,
    patch: { description: string; date: string; entries: LedgerEntry[] },
  ) => void | Promise<void>;
};

export function TransactionEditModal({
  transaction,
  accounts,
  formatCurrency,
  onClose,
  onSave,
}: Props) {
  const toast = useToast();
  const [desc, setDesc] = useState(transaction.description);
  const [dateLocal, setDateLocal] = useState(() =>
    toDatetimeLocalValue(transaction.date),
  );
  const [rows, setRows] = useState<LedgerEntry[]>(() => cloneEntries(transaction.entries));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDesc(transaction.description);
    setDateLocal(toDatetimeLocalValue(transaction.date));
    setRows(cloneEntries(transaction.entries));
  }, [transaction]);

  /** Same normalization as submit — totals match what will be persisted. */
  const normalizedDraft = useMemo(
    () =>
      rows.map((r) => ({
        accountId: r.accountId,
        debit: roundCurrency(safeParseFloat(String(r.debit))),
        credit: roundCurrency(safeParseFloat(String(r.credit))),
      })),
    [rows],
  );

  const totalDr = normalizedDraft.reduce((s, e) => s + e.debit, 0);
  const totalCr = normalizedDraft.reduce((s, e) => s + e.credit, 0);
  const diff = Math.abs(totalDr - totalCr);
  const balanced = diff < 0.01;
  /** Which side totals less — user must add gap here (or shrink the heavier side). */
  const lighterSide =
    balanced ? null : totalDr > totalCr ? ('credit' as const) : totalDr < totalCr ? ('debit' as const) : null;

  const setRow = (idx: number, patch: Partial<LedgerEntry>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    setRows((prev) => [...prev, { accountId: accounts[0]?.id || 'I001', debit: 0, credit: 0 }]);
  };

  const removeRow = (idx: number) => {
    if (rows.length <= 2) return;
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const accountLabel = (accountId: string) =>
    accounts.find((a) => a.id === accountId)?.name ?? accountId;

  /** Swipe payout outflow often needs L003 (Dr) + I001 (Cr) as a pair — easy to miss below the fold. */
  const swipeOutflowHint = useMemo(() => {
    if (transaction.type !== 'SWIPE_PAY' || !/payout outflow/i.test(transaction.description)) return null;
    const l003 = rows.find((r) => r.accountId === 'L003' && safeParseFloat(String(r.debit)) > 0);
    const i001 = rows.find((r) => r.accountId === 'I001' && safeParseFloat(String(r.credit)) > 0);
    if (l003 && !i001) {
      return `This payout has margin on L003 (${formatCurrency(safeParseFloat(String(l003.debit)))}) but no matching Service Charges (I001) credit line — scroll down or tap “Add I001 credit line”.`;
    }
    return null;
  }, [transaction.type, transaction.description, rows, formatCurrency]);

  const addMissingMarginCreditLine = () => {
    const l003 = rows.find((r) => r.accountId === 'L003');
    const amt = l003 ? roundCurrency(safeParseFloat(String(l003.debit))) : 0;
    if (amt <= 0) {
      toast.error('No L003 debit line to pair with I001.');
      return;
    }
    if (rows.some((r) => r.accountId === 'I001' && safeParseFloat(String(r.credit)) > 0)) {
      toast.error('I001 credit line already exists.');
      return;
    }
    setRows((prev) => [...prev, { accountId: 'I001', debit: 0, credit: amt }]);
    toast.success(`Added Service Charges (I001) credit ${formatCurrency(amt)}.`);
  };

  /** Trim the largest credit (or debit) line by the current gap — typical fix for wallet vs fee typos. */
  const applyQuickBalanceFix = () => {
    if (balanced || diff < 0.01) return;
    let label = '';
    setRows((prev) => {
      const next = prev.map((r) => ({ ...r }));
      if (totalCr > totalDr) {
        let idx = 0;
        for (let i = 1; i < next.length; i++) {
          if (safeParseFloat(String(next[i].credit)) > safeParseFloat(String(next[idx].credit))) idx = i;
        }
        label = accountLabel(next[idx].accountId);
        const cur = roundCurrency(safeParseFloat(String(next[idx].credit)));
        next[idx] = { ...next[idx], credit: Math.max(0, roundCurrency(cur - diff)), debit: 0 };
      } else {
        let idx = 0;
        for (let i = 1; i < next.length; i++) {
          if (safeParseFloat(String(next[i].debit)) > safeParseFloat(String(next[idx].debit))) idx = i;
        }
        label = accountLabel(next[idx].accountId);
        const cur = roundCurrency(safeParseFloat(String(next[idx].debit)));
        next[idx] = { ...next[idx], debit: Math.max(0, roundCurrency(cur - diff)), credit: 0 };
      }
      return next;
    });
    toast.success(`Adjusted ${label} by ${formatCurrency(diff)} — review lines, then save.`);
  };

  const quickFixLabel = useMemo(() => {
    if (balanced) return null;
    if (totalCr > totalDr) {
      let idx = 0;
      for (let i = 1; i < rows.length; i++) {
        if (safeParseFloat(String(rows[i].credit)) > safeParseFloat(String(rows[idx].credit))) idx = i;
      }
      const name = accountLabel(rows[idx]?.accountId ?? '');
      return `Reduce ${name} credit by ${formatCurrency(diff)}`;
    }
    let idx = 0;
    for (let i = 1; i < rows.length; i++) {
      if (safeParseFloat(String(rows[i].debit)) > safeParseFloat(String(rows[idx].debit))) idx = i;
    }
    const name = accountLabel(rows[idx]?.accountId ?? '');
    return `Reduce ${name} debit by ${formatCurrency(diff)}`;
  }, [balanced, totalCr, totalDr, diff, rows, accounts]);

  const save = async () => {
    if (rows.length < 2) {
      toast.error('Add at least two journal lines.');
      return;
    }
    if (!balanced) {
      toast.error(
        lighterSide
          ? `Totals must match (${formatCurrency(totalDr)} debit vs ${formatCurrency(totalCr)} credit). Gap ${formatCurrency(diff)}: add ${formatCurrency(diff)} to ${lighterSide} lines or reduce the other side.`
          : `Totals must match (${formatCurrency(totalDr)} debit vs ${formatCurrency(totalCr)} credit).`,
      );
      return;
    }
    const entries = normalizedDraft;
    const invalid = entries.filter((r) => !accounts.some((a) => a.id === r.accountId));
    if (invalid.length > 0) {
      toast.error('One or more lines use unknown accounts. Pick accounts from the list.');
      return;
    }
    const dParsed = new Date(dateLocal);
    if (Number.isNaN(dParsed.getTime())) {
      toast.error('Invalid date or time.');
      return;
    }
    const iso = dParsed.toISOString();
    setSaving(true);
    try {
      await Promise.resolve(
        onSave(transaction.id, {
          description: desc.trim() || transaction.description,
          date: iso,
          entries,
        }),
      );
      onClose();
    } catch {
      /* ERPContext / API toasts failures */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col border-2 border-white/20 animate-fade-in">
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-start bg-gradient-to-r from-amber-900/90 via-slate-900 to-indigo-900/90 text-white shrink-0">
          <div>
            <h3 className="text-lg font-bold">Edit transaction (temporary)</h3>
            <p className="text-xs text-amber-100/90 mt-1">ID: {transaction.id}</p>
            <p className="text-xs text-slate-300 mt-0.5">
              Type stays <strong>{transaction.type}</strong>. Save stays off until debit total equals credit total (double-entry).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <Input label="Description" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
              Date / time
            </label>
            <input
              type="datetime-local"
              value={dateLocal}
              onChange={(e) => setDateLocal(e.target.value)}
              className="w-full px-4 py-3.5 rounded-2xl border-2 border-slate-200 dark:border-slate-600 font-semibold bg-white dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-600 overflow-hidden">
            {rows.length > 4 ? (
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 px-3 py-2 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-600">
                {rows.length} journal lines — scroll the table to see all (payout outflows often have 5 lines including Service Charges).
              </p>
            ) : null}
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-600">
                <tr>
                  <th className="p-3 text-left font-bold text-slate-600 dark:text-slate-400">Account</th>
                  <th className="p-3 text-right font-bold text-slate-600 dark:text-slate-400 w-28">Debit</th>
                  <th className="p-3 text-right font-bold text-slate-600 dark:text-slate-400 w-28">Credit</th>
                  <th className="p-3 w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {rows.map((row, idx) => (
                  <tr key={idx}>
                    <td className="p-2">
                      <select
                        value={row.accountId}
                        onChange={(e) => setRow(idx, { accountId: e.target.value })}
                        className="w-full p-2 rounded-lg border-2 border-slate-200 dark:border-slate-600 text-xs font-semibold dark:bg-slate-800 dark:text-slate-100"
                      >
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        className="py-2 text-right"
                        value={row.debit === 0 ? '' : row.debit}
                        onChange={(e) =>
                          setRow(idx, {
                            debit: safeParseFloat(e.target.value),
                            credit: 0,
                          })
                        }
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        className="py-2 text-right"
                        value={row.credit === 0 ? '' : row.credit}
                        onChange={(e) =>
                          setRow(idx, {
                            credit: safeParseFloat(e.target.value),
                            debit: 0,
                          })
                        }
                      />
                    </td>
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        disabled={rows.length <= 2}
                        className="p-2 text-slate-400 hover:text-rose-600 disabled:opacity-30 rounded-lg"
                        title="Remove line"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {swipeOutflowHint ? (
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2">
              {swipeOutflowHint}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              <Plus size={14} /> Add line
            </Button>
            <div className={`text-sm font-bold text-right ${balanced ? 'text-emerald-600' : 'text-rose-600'}`}>
              <div>Debit total {formatCurrency(totalDr)}</div>
              <div>Credit total {formatCurrency(totalCr)}</div>
              {!balanced && (
                <div className="mt-1 text-xs font-bold text-rose-700 dark:text-rose-400 max-w-[20rem]">
                  Gap {formatCurrency(diff)} — <strong>{lighterSide === 'credit' ? 'Credit' : lighterSide === 'debit' ? 'Debit' : 'One'}</strong> side needs that amount extra (or reduce the other side).
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-700 flex flex-col gap-3 shrink-0">
          {!balanced ? (
            <>
              <p className="text-xs font-semibold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl px-3 py-2">
                <strong>Save is disabled:</strong> debits {formatCurrency(totalDr)} vs credits {formatCurrency(totalCr)} — gap {formatCurrency(diff)}.
                {totalCr > totalDr && rows.some((r) => r.accountId === 'E001')
                  ? ' If you raised Wallet MDR (E001), lower the wallet credit (PEHABIT) by the same amount, or undo the MDR change.'
                  : ' Every rupee debited must equal credits elsewhere.'}
              </p>
              <div className="flex flex-wrap gap-2">
                {quickFixLabel ? (
                  <Button type="button" variant="outline" size="sm" onClick={applyQuickBalanceFix}>
                    Quick fix: {quickFixLabel}
                  </Button>
                ) : null}
                {swipeOutflowHint ? (
                  <Button type="button" variant="outline" size="sm" onClick={addMissingMarginCreditLine}>
                    Add I001 credit line
                  </Button>
                ) : null}
              </div>
            </>
          ) : rows.length < 2 ? (
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2">
              Need at least two lines for double-entry before you can save.
            </p>
          ) : null}
          <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={saving || !balanced || rows.length < 2}
            loading={saving}
            title={
              rows.length < 2
                ? 'Add another journal line first'
                : !balanced
                  ? `Totals must match (gap ${formatCurrency(diff)})`
                  : 'Save changes'
            }
            onClick={() => void save()}
          >
            Save changes
          </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 16);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function cloneEntries(entries: LedgerEntry[]): LedgerEntry[] {
  return normalizeLedgerEntries(entries);
}
