import React, { useRef } from 'react';
import { Account, Transaction } from '../types';
import { Button } from './ui/Elements';
import { X, Printer } from 'lucide-react';
import { voucherKindLabel, voucherMainAmount, accountName } from '../lib/voucherUtils';

type Props = {
  txn: Transaction;
  accounts: Account[];
  storeName?: string;
  formatCurrency: (n: number) => string;
  onClose: () => void;
};

export const VoucherPrintModal: React.FC<Props> = ({ txn, accounts, storeName, formatCurrency, onClose }) => {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const html = printRef.current?.innerHTML;
    if (!html) return;
    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) return;
    w.document.write(`
      <!DOCTYPE html><html><head><title>${txn.metadata?.voucherNo ?? 'Voucher'}</title>
      <style>
        body { font-family: system-ui, sans-serif; padding: 24px; color: #0f172a; }
        .box { border: 2px solid #334155; border-radius: 12px; padding: 24px; max-width: 640px; margin: 0 auto; }
        h1 { font-size: 1.25rem; margin: 0 0 4px; }
        .meta { font-size: 0.85rem; color: #64748b; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; font-size: 0.9rem; }
        th { background: #f8fafc; }
        .amt { font-size: 1.5rem; font-weight: 800; text-align: right; margin-top: 12px; }
        .sign { margin-top: 48px; display: flex; justify-content: space-between; font-size: 0.8rem; }
      </style></head><body>${html}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const kind = voucherKindLabel(txn);
  const amount = voucherMainAmount(txn);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="font-bold text-slate-900 dark:text-white">Print voucher</h2>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={handlePrint}>
              <Printer size={16} /> Print
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              <X size={16} />
            </Button>
          </div>
        </div>
        <div ref={printRef} className="p-6">
          <div className="box border-2 border-slate-300 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <img src="/logo.png" alt="CASIFLY" className="h-12 w-auto object-contain" />
              <div>
                <h1 className="text-lg font-black text-slate-900">CASIFLY</h1>
                {storeName ? <p className="text-sm text-slate-600">{storeName}</p> : null}
              </div>
            </div>
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-700">{kind}</p>
            <p className="meta">
              No. <strong>{txn.metadata?.voucherNo ?? '—'}</strong> ·{' '}
              {new Date(txn.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
            {txn.metadata?.voucherParty ? (
              <p className="text-sm mb-2">
                <span className="text-slate-500">{txn.metadata.voucherType === 'receipt' ? 'Received from' : 'Paid to'}:</span>{' '}
                <strong>{txn.metadata.voucherParty}</strong>
              </p>
            ) : null}
            {txn.metadata?.voucherRemarks ? (
              <p className="text-sm text-slate-600 mb-3">Remarks: {txn.metadata.voucherRemarks}</p>
            ) : null}
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Debit (₹)</th>
                  <th>Credit (₹)</th>
                </tr>
              </thead>
              <tbody>
                {txn.entries.map((e, i) => (
                  <tr key={i}>
                    <td>{accountName(accounts, e.accountId)}</td>
                    <td>{e.debit > 0.005 ? formatCurrency(e.debit) : '—'}</td>
                    <td>{e.credit > 0.005 ? formatCurrency(e.credit) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="amt">Amount: {formatCurrency(amount)}</p>
            <p className="text-xs text-slate-500 mt-2">{txn.description}</p>
            <div className="sign">
              <span>Prepared by</span>
              <span>Authorised signatory</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
