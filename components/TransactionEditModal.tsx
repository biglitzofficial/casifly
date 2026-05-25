import React, { useEffect, useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { Account, LedgerEntry, Transaction } from '../types';
import { Button, Input } from './ui/Elements';
import { roundCurrency, safeParseFloat } from '../lib/utils';

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
  const [desc, setDesc] = useState(transaction.description);
  const [dateLocal, setDateLocal] = useState(() =>
    toDatetimeLocalValue(transaction.date),
  );
  const [rows, setRows] = useState<LedgerEntry[]>(() => cloneEntries(transaction.entries));

  useEffect(() => {
    setDesc(transaction.description);
    setDateLocal(toDatetimeLocalValue(transaction.date));
    setRows(cloneEntries(transaction.entries));
  }, [transaction]);

  const totalDr = rows.reduce((s, e) => s + e.debit, 0);
  const totalCr = rows.reduce((s, e) => s + e.credit, 0);
  const balanced = Math.abs(totalDr - totalCr) < 0.01;

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

  const save = async () => {
    if (rows.length < 2) return;
    if (!balanced) return;
    const invalid = rows.filter((r) => !accounts.some((a) => a.id === r.accountId));
    if (invalid.length) return;
    const entries = rows.map((r) => ({
      accountId: r.accountId,
      debit: roundCurrency(safeParseFloat(String(r.debit))),
      credit: roundCurrency(safeParseFloat(String(r.credit))),
    }));
    const iso = new Date(dateLocal).toISOString();
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
      /* ERPContext / API already toasts errors */
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
              Type stays <strong>{transaction.type}</strong> · keep debits = credits
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

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              <Plus size={14} /> Add line
            </Button>
            <div className={`text-sm font-bold ${balanced ? 'text-emerald-600' : 'text-rose-600'}`}>
              Dr {formatCurrency(totalDr)} · Cr {formatCurrency(totalCr)}
              {!balanced && ' · Unbalanced'}
            </div>
          </div>
        </div>

        <div className="p-6 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3 shrink-0">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={!balanced || rows.length < 2} onClick={() => void save()}>
            Save changes
          </Button>
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
  return entries.map((e) => ({
    accountId: e.accountId,
    debit: roundCurrency(e.debit),
    credit: roundCurrency(e.credit),
  }));
}
