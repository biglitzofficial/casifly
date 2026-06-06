import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Customer, Transaction, TransactionMetadata, Wallet } from '../types';
import { Button, Input, Select } from './ui/Elements';
import { useToast } from '../context/ToastContext';
import { safeParseFloat, roundCurrency } from '../lib/utils';
import {
  isSwipePayInflow,
  isSwipePayOutflow,
  parseSwipeInflowEconomics,
  swipeInflowPendingMarginAmount,
} from '../lib/swipeTxnEconomics';
import {
  buildSwipeInflowEntries,
  buildSwipeInflowMetadata,
  buildSwipeOutflowEntries,
  buildSwipeOutflowMetadata,
  parseSwipeInflowTransaction,
  parseSwipeOutflowTransaction,
  portalPctFromPg,
} from '../lib/swipeTxnBuild';

type SavePatch = {
  description: string;
  date: string;
  entries: ReturnType<typeof buildSwipeInflowEntries>;
  metadata?: TransactionMetadata;
};

type Props = {
  transaction: Transaction;
  customers: Customer[];
  wallets: Wallet[];
  transactions: Transaction[];
  formatCurrency: (n: number) => string;
  onClose: () => void;
  onSave: (id: string, patch: SavePatch) => void | Promise<void>;
};

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SwipePayEditModal({
  transaction,
  customers,
  wallets,
  transactions,
  formatCurrency,
  onClose,
  onSave,
}: Props) {
  const toast = useToast();
  const isInflow = isSwipePayInflow(transaction);
  const isOutflow = isSwipePayOutflow(transaction);

  const [dateLocal, setDateLocal] = useState(() => toDatetimeLocalValue(transaction.date));
  const [saving, setSaving] = useState(false);

  const parsedInflow = useMemo(
    () => (isInflow ? parseSwipeInflowTransaction(transaction) : null),
    [transaction, isInflow],
  );
  const parsedOutflow = useMemo(
    () => (isOutflow ? parseSwipeOutflowTransaction(transaction, transactions) : null),
    [transaction, transactions, isOutflow],
  );

  const [walletId, setWalletId] = useState('');
  const [pgName, setPgName] = useState('');
  const [cardType, setCardType] = useState('visa');
  const [amount, setAmount] = useState('');
  const [customerChargePct, setCustomerChargePct] = useState('');
  const [ourChargePct, setOurChargePct] = useState('');

  const [payoutAmount, setPayoutAmount] = useState('');
  const [transferFee, setTransferFee] = useState('');
  const [extraCharges, setExtraCharges] = useState('');
  const [linkedInflowId, setLinkedInflowId] = useState('');
  const [outflowWalletId, setOutflowWalletId] = useState('');

  useEffect(() => {
    setDateLocal(toDatetimeLocalValue(transaction.date));
    if (parsedInflow) {
      setWalletId(parsedInflow.walletId);
      setPgName(parsedInflow.pgName);
      setCardType(parsedInflow.cardType);
      setAmount(String(parsedInflow.amount));
      setCustomerChargePct(String(parsedInflow.customerChargePct));
      setOurChargePct(String(parsedInflow.ourChargePct));
    }
    if (parsedOutflow) {
      setPayoutAmount(String(parsedOutflow.payoutAmount));
      setTransferFee(String(parsedOutflow.transferFee));
      setExtraCharges(String(parsedOutflow.extraCharges));
      setLinkedInflowId(parsedOutflow.linkedInflowId ?? '');
      setOutflowWalletId(parsedOutflow.walletId);
    }
  }, [transaction, parsedInflow, parsedOutflow]);

  const customer = customers.find(
    (c) => c.id === (parsedInflow?.customerId ?? parsedOutflow?.customerId),
  );
  const customerLabel = customer?.name ?? '—';

  const selectedWallet = wallets.find((w) => w.id === walletId);
  const selectedPG = selectedWallet?.pgs?.find((p) => p.name === pgName) ?? selectedWallet?.pgs?.[0];
  const portalPct = portalPctFromPg(selectedPG, cardType);

  const amountVal = safeParseFloat(amount);
  const custPctVal = safeParseFloat(customerChargePct);
  const ourPctVal = safeParseFloat(ourChargePct);
  const portalFee = roundCurrency((amountVal * portalPct) / 100);
  const customerFee = roundCurrency((amountVal * custPctVal) / 100);
  const ourFee = roundCurrency((amountVal * ourPctVal) / 100);
  const inflowEstimate = roundCurrency(ourFee - portalFee);

  const payVal = safeParseFloat(payoutAmount);
  const transVal = safeParseFloat(transferFee);
  const extraVal = safeParseFloat(extraCharges);

  const linkableInflows = useMemo(() => {
    const cid = parsedOutflow?.customerId;
    if (!cid) return transactions.filter(isSwipePayInflow);
    return transactions.filter((t) => isSwipePayInflow(t) && t.metadata?.customerId === cid);
  }, [transactions, parsedOutflow?.customerId]);

  const marginOnSave = useMemo(() => {
    if (!isOutflow) return 0;
    if (parsedOutflow && parsedOutflow.marginRecognized > 0.005) {
      return parsedOutflow.marginRecognized;
    }
    if (linkedInflowId) {
      const linked = transactions.find((t) => t.id === linkedInflowId);
      if (linked) return swipeInflowPendingMarginAmount(linked);
    }
    return 0;
  }, [isOutflow, parsedOutflow, linkedInflowId, transactions]);

  const save = async () => {
    const dParsed = new Date(dateLocal);
    if (Number.isNaN(dParsed.getTime())) {
      toast.error('Invalid date or time.');
      return;
    }
    const iso = dParsed.toISOString();

    if (isInflow && parsedInflow) {
      const wallet = wallets.find((w) => w.id === walletId);
      const pg = wallet?.pgs?.find((p) => p.name === pgName);
      if (!wallet || !pg) {
        toast.error('Select wallet and payment gateway.');
        return;
      }
      if (amountVal <= 0) {
        toast.error('Swipe amount must be greater than 0.');
        return;
      }
      const entries = buildSwipeInflowEntries(wallet, pg, cardType, amountVal, custPctVal);
      const metadata = buildSwipeInflowMetadata(
        transaction.metadata,
        wallet.id,
        pg.name,
        cardType,
        custPctVal,
        ourPctVal,
      );
      const desc = `Swipe Inflow: ${customerLabel} (${cardType.toUpperCase()})`;
      setSaving(true);
      try {
        await Promise.resolve(onSave(transaction.id, { description: desc, date: iso, entries, metadata }));
        onClose();
      } catch {
        /* toast from context */
      } finally {
        setSaving(false);
      }
      return;
    }

    if (isOutflow && parsedOutflow) {
      const wallet = wallets.find((w) => w.id === outflowWalletId);
      if (!wallet) {
        toast.error('Select pay-from wallet.');
        return;
      }
      if (payVal <= 0) {
        toast.error('Settlement amount must be greater than 0.');
        return;
      }
      if (transVal < 0 || extraVal < 0) {
        toast.error('Fees cannot be negative.');
        return;
      }
      const entries = buildSwipeOutflowEntries(wallet, payVal, transVal, marginOnSave, extraVal);
      const metadata = buildSwipeOutflowMetadata(
        transaction.metadata,
        wallet.id,
        parsedOutflow.customerId,
        linkedInflowId || undefined,
        transVal,
        extraVal,
      );
      const desc = `Payout Outflow: ${customerLabel}${extraVal > 0.005 ? ` (+${extraVal} extra)` : ''}`;
      setSaving(true);
      try {
        await Promise.resolve(onSave(transaction.id, { description: desc, date: iso, entries, metadata }));
        onClose();
      } catch {
        /* toast from context */
      } finally {
        setSaving(false);
      }
    }
  };

  if (!isInflow && !isOutflow) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border-2 border-white/20 animate-fade-in">
        <div
          className={`p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-start text-white shrink-0 ${
            isInflow
              ? 'bg-gradient-to-r from-indigo-900/90 via-slate-900 to-violet-900/90'
              : 'bg-gradient-to-r from-emerald-900/90 via-slate-900 to-teal-900/90'
          }`}
        >
          <div>
            <h3 className="text-lg font-bold">
              {isInflow ? 'Edit Swipe Inflow' : 'Edit Payout Outflow'}
            </h3>
            <p className="text-xs text-slate-300 mt-1">Customer: {customerLabel}</p>
            <p className="text-xs text-slate-400 mt-0.5">Same fields as entry screen — journal rebuilds on save.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/10">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <Input
            label="Date & time"
            type="datetime-local"
            value={dateLocal}
            onChange={(e) => setDateLocal(e.target.value)}
          />

          {isInflow && parsedInflow && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select
                  label="Inflow Wallet"
                  value={walletId}
                  onChange={(e) => setWalletId(e.target.value)}
                  options={wallets.map((w) => ({ label: w.name, value: w.id }))}
                />
                <div className="space-y-2">
                  <Select
                    label="Payment gateway"
                    value={pgName}
                    onChange={(e) => setPgName(e.target.value)}
                    options={
                      (selectedWallet?.pgs?.length ?? 0) > 0
                        ? selectedWallet!.pgs.map((p) => ({ label: p.name, value: p.name }))
                        : [{ label: '—', value: '' }]
                    }
                  />
                  <div className="flex justify-between rounded-xl border-2 border-slate-200 px-4 py-2.5 text-sm">
                    <span className="text-slate-500 font-bold uppercase text-xs">PG % · {cardType}</span>
                    <span className="font-black tabular-nums">{portalPct}%</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select
                  label="Card Type"
                  value={cardType}
                  onChange={(e) => setCardType(e.target.value)}
                  options={[
                    { label: 'Visa', value: 'visa' },
                    { label: 'Master', value: 'master' },
                    { label: 'Amex', value: 'amex' },
                    { label: 'Rupay', value: 'rupay' },
                  ]}
                />
                <Input
                  label="Swipe Amount (₹)"
                  type="number"
                  className="text-xl font-bold"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Customer charge %"
                  type="number"
                  step="0.1"
                  value={customerChargePct}
                  onChange={(e) => setCustomerChargePct(e.target.value)}
                />
                <Input
                  label="Our charge %"
                  type="number"
                  step="0.1"
                  value={ourChargePct}
                  onChange={(e) => setOurChargePct(e.target.value)}
                />
              </div>
              <div className="rounded-2xl bg-slate-900 text-white p-5 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>PG charge ({portalPct}%)</span>
                  <span>-{formatCurrency(portalFee)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Customer charge ({custPctVal}%)</span>
                  <span>{formatCurrency(customerFee)}</span>
                </div>
                <div className="flex justify-between font-bold text-amber-300 pt-2 border-t border-slate-600">
                  <span>Pre-settlement estimate</span>
                  <span>+{formatCurrency(inflowEstimate)}</span>
                </div>
              </div>
            </>
          )}

          {isOutflow && parsedOutflow && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input
                  label="Settlement Amount (₹)"
                  type="number"
                  className="font-bold"
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(e.target.value)}
                />
                <Input
                  label="Wallet Transfer Fee (₹)"
                  type="number"
                  value={transferFee}
                  onChange={(e) => setTransferFee(e.target.value)}
                  title="Deducted from Transaction P&L net profit on linked inflow"
                />
                <Input
                  label="Extra charges (₹)"
                  type="number"
                  value={extraCharges}
                  onChange={(e) => setExtraCharges(e.target.value)}
                />
              </div>
              <Select
                label="Pay From Wallet"
                value={outflowWalletId}
                onChange={(e) => setOutflowWalletId(e.target.value)}
                options={wallets.map((w) => ({ label: w.name, value: w.id }))}
              />
              <Select
                label="Link swipe inflow"
                value={linkedInflowId}
                onChange={(e) => setLinkedInflowId(e.target.value)}
                options={[
                  { label: '— Select inflow —', value: '' },
                  ...linkableInflows.map((t) => {
                    const econ = parseSwipeInflowEconomics(t)!;
                    return {
                      value: t.id,
                      label: `${new Date(t.date).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })} · ${formatCurrency(econ.actualAmount)}`,
                    };
                  }),
                ]}
              />
              {marginOnSave > 0.005 && (
                <p className="text-xs text-slate-500">
                  Margin recognised on save: {formatCurrency(marginOnSave)} (L003 → I001)
                </p>
              )}
              <div className="rounded-2xl bg-slate-900 text-white p-5 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Liability settle</span>
                  <span>{formatCurrency(payVal)}</span>
                </div>
                <div className="flex justify-between text-rose-300">
                  <span>Transfer fee (→ reduces P&L profit)</span>
                  <span>-{formatCurrency(transVal)}</span>
                </div>
                {extraVal > 0.005 && (
                  <div className="flex justify-between text-amber-300">
                    <span>Extra charges (→ adds to P&L profit)</span>
                    <span>+{formatCurrency(extraVal)}</span>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={save} loading={saving}>
              Save changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
