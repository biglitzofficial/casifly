import { Account, Transaction, Wallet } from '../types';
import { roundCurrency } from './utils';
import {
  isSwipePayInflow,
  parseSwipeInflowEconomics,
  computeSwipeInflowFranchisePL,
  sumSwipeExtraChargesForInflow,
  buildTransferExpensePerInflowId,
  sumMediatorPayoutForInflow,
  mediatorDueForInflow,
} from './swipeTxnEconomics';

export type RpLine = {
  id: string;
  label: string;
  amount: number;
  detail?: string;
};

export type ReceivableWalletSnapshot = {
  id: string;
  label: string;
  amount: number;
};

export type ReceivablesPayablesSummary = {
  receivables: RpLine[];
  /** Office / OFC wallets with current ledger balance (includes ₹0 for display). */
  receivableWalletSnapshots: ReceivableWalletSnapshot[];
  payables: RpLine[];
  totalReceivables: number;
  totalPayables: number;
};

/** Payment gateway wallets vs office / field receivable wallets (e.g. Prakash OFC). */
export function isReceivableWallet(w: Wallet): boolean {
  if (w.walletKind === 'receivable') return true;
  const officeName = /(?:\bofc\b|\boffice\b|\breceivable\b|ofc)/i.test(w.name);
  if (w.walletKind === 'payment') return officeName;
  return officeName;
}

export function buildReceivablesPayablesSummary(
  transactions: Transaction[],
  wallets: Wallet[],
  accounts: Account[],
  customers: { id: string; name: string }[],
  getAccountBalance: (accountId: string) => number
): ReceivablesPayablesSummary {
  const receivables: RpLine[] = [];
  const payables: RpLine[] = [];
  const receivableWalletSnapshots: ReceivableWalletSnapshot[] = [];
  const snapshotIds = new Set<string>();

  const pushWalletSnapshot = (ledgerAccountId: string, label: string) => {
    if (snapshotIds.has(ledgerAccountId)) return;
    snapshotIds.add(ledgerAccountId);
    receivableWalletSnapshots.push({
      id: ledgerAccountId,
      label,
      amount: roundCurrency(getAccountBalance(ledgerAccountId)),
    });
  };

  for (const w of wallets) {
    if (!isReceivableWallet(w)) continue;
    pushWalletSnapshot(w.ledgerAccountId, w.name);
  }

  const walletLedgerIds = new Set(wallets.map((w) => w.ledgerAccountId));
  for (const a of accounts) {
    if (a.category !== 'Wallet' || walletLedgerIds.has(a.id)) continue;
    if (!/(?:\bofc\b|\boffice\b|\breceivable\b|ofc)/i.test(a.name)) continue;
    pushWalletSnapshot(a.id, a.name);
  }

  const a006 = accounts.find((a) => a.id === 'A006');
  const paySwipeBal = roundCurrency(getAccountBalance('A006'));
  if (paySwipeBal > 0.005) {
    receivables.push({
      id: 'A006',
      label: a006?.name ? `${a006.name} (A006)` : 'Pay & Swipe advances (A006)',
      amount: paySwipeBal,
      detail: 'Customer principal still to recover via Pay & Swipe',
    });
  }

  for (const snap of receivableWalletSnapshots) {
    if (snap.amount < 0.005) continue;
    receivables.push({
      id: snap.id,
      label: snap.label,
      amount: snap.amount,
      detail: 'Office / receivable wallet (e.g. Prakash OFC)',
    });
  }

  const l001 = accounts.find((a) => a.id === 'L001');
  const l001Bal = roundCurrency(getAccountBalance('L001'));
  if (l001Bal > 0.005) {
    payables.push({
      id: 'L001',
      label: l001?.name ? `${l001.name} (L001)` : 'Customer swipe payout (L001)',
      amount: l001Bal,
      detail: 'Net owed to customers after swipe inflow until outflow posts',
    });
  }

  const transferByInflow = buildTransferExpensePerInflowId(transactions);
  let mediatorDueTotal = 0;
  for (const t of transactions) {
    if (t.status !== 'COMPLETED' || !isSwipePayInflow(t)) continue;
    const due = mediatorDueForInflow(t, transactions);
    if (due < 0.005) continue;
    mediatorDueTotal += due;
    const cust = customers.find((c) => c.id === t.metadata?.customerId);
    const econ = parseSwipeInflowEconomics(t, transactions);
    const extra = sumSwipeExtraChargesForInflow(t.id, transactions);
    const transferFee = transferByInflow.get(t.id) ?? 0;
    const franchise = econ
      ? computeSwipeInflowFranchisePL(t, econ, extra, transferFee)
      : null;
    payables.push({
      id: `mediator-${t.id}`,
      label: cust?.name ?? t.description.replace(/^Swipe Inflow:\s*/i, '').split('(')[0].trim(),
      amount: due,
      detail: franchise
        ? `Other value ${roundCurrency(franchise.otherValue)} − paid ${roundCurrency(sumMediatorPayoutForInflow(t.id, transactions))}`
        : 'Franchise / mediator share (other value)',
    });
  }
  mediatorDueTotal = roundCurrency(mediatorDueTotal);

  const totalReceivables = roundCurrency(receivables.reduce((s, r) => s + r.amount, 0));
  const totalPayables = roundCurrency(payables.reduce((s, p) => s + p.amount, 0));

  return { receivables, receivableWalletSnapshots, payables, totalReceivables, totalPayables };
}

/** Short labels for dashboard / summary chips. */
export function receivableLineShortLabel(line: RpLine): string {
  if (line.id === 'A006') return 'Pay & Swipe (A006)';
  return line.label;
}

export function formatReceivablesSubtitle(
  summary: ReceivablesPayablesSummary,
  formatCurrency: (n: number) => string
): string {
  const parts: string[] = [];
  for (const r of summary.receivables) {
    parts.push(`${receivableLineShortLabel(r)} ${formatCurrency(r.amount)}`);
  }
  for (const w of summary.receivableWalletSnapshots) {
    if (w.amount >= 0.005) continue;
    parts.push(`${w.label} ${formatCurrency(0)}`);
  }
  if (parts.length === 0) return 'No receivables on books';
  return parts.join(' · ');
}

/** Receivables table rows: non-zero lines plus office wallets at ₹0 (excluded from total). */
export function receivableBreakdownRows(summary: ReceivablesPayablesSummary): RpLine[] {
  const rows = [...summary.receivables];
  for (const w of summary.receivableWalletSnapshots) {
    if (w.amount >= 0.005) continue;
    rows.push({
      id: `zero-${w.id}`,
      label: w.label,
      amount: 0,
      detail: 'Office wallet — no balance (not included in total)',
    });
  }
  return rows;
}
