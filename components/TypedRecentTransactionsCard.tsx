import React, { useEffect, useMemo, useState } from 'react';
import type { LedgerEntry, Transaction } from '../types';
import { Card, CardContent, CardHeader, Button } from './ui/Elements';
import { Pencil } from 'lucide-react';
import { TEMP_ALLOW_LEDGER_REPORT_PL_EDIT } from '../lib/tempUiFlags';

const PAGE_SIZE = 12;

/** Largest single debit/credit line — useful shorthand for swipe / recovery totals. */
function txnLargestLeg(entries: LedgerEntry[]): number {
  return entries.reduce((m, e) => Math.max(m, e.debit, e.credit), 0);
}

type Props = {
  title: string;
  subtitle: string;
  items: Transaction[];
  formatCurrency: (n: number) => string;
  customerNameForTxn: (t: Transaction) => string | undefined;
  subtitleForTxn?: (t: Transaction) => string | undefined;
  onEditTxn?: (t: Transaction) => void;
};

export function TypedRecentTransactionsCard(props: Props) {
  const { title, subtitle, items, formatCurrency, customerNameForTxn, subtitleForTxn, onEditTxn } = props;
  const [page, setPage] = useState(1);

  const sorted = useMemo(
    () => [...items].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [items],
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const currentPage = Math.min(Math.max(1, page), totalPages);
  const slice = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const showEdit = TEMP_ALLOW_LEDGER_REPORT_PL_EDIT && !!onEditTxn;

  return (
    <Card className="border border-slate-200 dark:border-slate-700 shadow-sm mt-10">
      <CardHeader title={title} subtitle={subtitle} />
      <CardContent>
        {TEMP_ALLOW_LEDGER_REPORT_PL_EDIT && (
          <p className="mb-4 text-xs font-semibold text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
            Temporary edits: saving changes updates the journal entry and downstream P&amp;L (same mechanism as Ledger / Reports edit).
          </p>
        )}
        {sorted.length === 0 ? (
          <p className="text-center text-sm text-slate-500 dark:text-slate-400 py-10 font-medium">No transactions yet for this workflow.</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-700">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-600">
                  <tr>
                    <th className="p-3 font-bold text-xs text-slate-600 dark:text-slate-300 uppercase tracking-wider whitespace-nowrap">Date</th>
                    <th className="p-3 font-bold text-xs text-slate-600 dark:text-slate-300 uppercase tracking-wider">Customer</th>
                    <th className="p-3 font-bold text-xs text-slate-600 dark:text-slate-300 uppercase tracking-wider hidden sm:table-cell">Note</th>
                    <th className="p-3 font-bold text-xs text-slate-600 dark:text-slate-300 uppercase text-right whitespace-nowrap">Main amount</th>
                    <th className="p-3 font-bold text-xs text-slate-600 dark:text-slate-300 uppercase whitespace-nowrap">Status</th>
                    {showEdit ? (
                      <th className="p-3 font-bold text-xs text-slate-600 dark:text-slate-300 uppercase text-center w-14">Edit</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {slice.map((t) => {
                    const sub = subtitleForTxn?.(t);
                    return (
                      <tr key={t.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50">
                        <td className="p-3 whitespace-nowrap text-slate-700 dark:text-slate-200 font-medium">
                          {new Date(t.date).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td className="p-3 text-slate-800 dark:text-slate-100">
                          <span className="font-semibold">{customerNameForTxn(t) || '—'}</span>
                          {sub ? <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{sub}</p> : null}
                        </td>
                        <td className="p-3 text-slate-600 dark:text-slate-300 max-w-[14rem] hidden sm:table-cell">
                          <span className="line-clamp-2" title={t.description}>
                            {t.description || '—'}
                          </span>
                        </td>
                        <td className="p-3 text-right tabular-nums font-semibold text-slate-800 dark:text-slate-100">{formatCurrency(txnLargestLeg(t.entries))}</td>
                        <td className="p-3 whitespace-nowrap">
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                              t.status === 'COMPLETED'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                                : t.status === 'PENDING'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                                  : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300'
                            }`}
                          >
                            {t.status}
                          </span>
                        </td>
                        {showEdit ? (
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              title="Edit transaction (temporary)"
                              onClick={() => onEditTxn!(t)}
                              className="p-2 rounded-lg text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50"
                              aria-label={`Edit transaction ${t.id}`}
                            >
                              <Pencil size={16} />
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 ? (
              <div className="flex items-center justify-between mt-4 gap-4 flex-wrap">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, sorted.length)} of {sorted.length}
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
