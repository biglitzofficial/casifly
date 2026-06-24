import { Account, LedgerEntry, Transaction, TransactionType, Wallet } from '../types';
import { roundCurrency } from './utils';

export type VoucherKind = 'receipt' | 'payment';

export function isVoucherTransaction(t: Transaction): boolean {
  const k = t.metadata?.voucherType;
  return (k === 'receipt' || k === 'payment') && t.type === TransactionType.JOURNAL;
}

export function voucherKindLabel(t: Transaction): string {
  return t.metadata?.voucherType === 'payment' ? 'Payment Voucher' : 'Receipt Voucher';
}

export function nextVoucherNo(kind: VoucherKind, transactions: Transaction[]): string {
  const prefix = kind === 'receipt' ? 'RV' : 'PV';
  const today = new Date();
  const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  const sameDay = transactions.filter(
    (t) =>
      isVoucherTransaction(t) &&
      t.metadata?.voucherType === kind &&
      t.metadata?.voucherNo?.startsWith(`${prefix}-${ymd}`)
  ).length;
  return `${prefix}-${ymd}-${String(sameDay + 1).padStart(3, '0')}`;
}

export function liquidAccountOptions(
  accounts: Account[],
  wallets: Wallet[]
): { id: string; label: string }[] {
  const walletLedgerIds = new Set(wallets.map((w) => w.ledgerAccountId));
  const opts: { id: string; label: string }[] = [];
  for (const a of accounts) {
    if (a.category === 'Cash' || a.category === 'Bank') {
      opts.push({ id: a.id, label: `${a.category} · ${a.name}` });
    }
  }
  for (const w of wallets) {
    opts.push({ id: w.ledgerAccountId, label: `Wallet · ${w.name}` });
  }
  return opts.sort((a, b) => a.label.localeCompare(b.label));
}

export function counterAccountOptions(accounts: Account[], kind: VoucherKind): { id: string; label: string }[] {
  return accounts
    .filter((a) => {
      if (kind === 'receipt') {
        return a.type === 'INCOME' || a.category === 'Equity' || a.category === 'Customer' || a.category === 'Revenue';
      }
      return a.type === 'EXPENSE' || a.category === 'Expense';
    })
    .map((a) => ({ id: a.id, label: `${a.name} (${a.id})` }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function buildVoucherEntries(
  kind: VoucherKind,
  amount: number,
  liquidAccountId: string,
  counterAccountId: string
): LedgerEntry[] {
  const amt = roundCurrency(amount);
  if (kind === 'receipt') {
    return [
      { accountId: liquidAccountId, debit: amt, credit: 0 },
      { accountId: counterAccountId, debit: 0, credit: amt },
    ];
  }
  return [
    { accountId: counterAccountId, debit: amt, credit: 0 },
    { accountId: liquidAccountId, debit: 0, credit: amt },
  ];
}

export function voucherMainAmount(t: Transaction): number {
  const liquidDr = t.entries.reduce((m, e) => Math.max(m, e.debit), 0);
  const liquidCr = t.entries.reduce((m, e) => Math.max(m, e.credit), 0);
  return roundCurrency(Math.max(liquidDr, liquidCr));
}

export function accountName(accounts: Account[], id: string): string {
  return accounts.find((a) => a.id === id)?.name ?? id;
}
