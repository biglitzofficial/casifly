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

export type ReceivablesPayablesSummary = {
  receivables: RpLine[];
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

  for (const w of wallets) {
    if (!isReceivableWallet(w)) continue;
    const bal = roundCurrency(getAccountBalance(w.ledgerAccountId));
    if (bal < 0.005) continue;
    receivables.push({
      id: w.id,
      label: w.name,
      amount: bal,
      detail: 'Office / receivable wallet (e.g. Prakash OFC)',
    });
  }

  const walletLedgerIds = new Set(wallets.map((w) => w.ledgerAccountId));
  for (const a of accounts) {
    if (a.category !== 'Wallet' || walletLedgerIds.has(a.id)) continue;
    if (!/(?:\bofc\b|\boffice\b|\breceivable\b|ofc)/i.test(a.name)) continue;
    const bal = roundCurrency(getAccountBalance(a.id));
    if (bal < 0.005) continue;
    receivables.push({
      id: a.id,
      label: a.name,
      amount: bal,
      detail: 'Office / receivable wallet ledger',
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

  return { receivables, payables, totalReceivables, totalPayables };
}
