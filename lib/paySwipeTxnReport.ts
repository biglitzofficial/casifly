import { Account, Customer, Transaction, TransactionType, LedgerEntry, Wallet } from '../types';
import { roundCurrency } from './utils';

function sumAcct(entries: LedgerEntry[], accountId: string, side: 'debit' | 'credit'): number {
  return entries
    .filter((e) => e.accountId === accountId)
    .reduce((s, e) => s + (side === 'debit' ? e.debit : e.credit), 0);
}

export function isPaySwipeAdvance(t: Transaction): boolean {
  return t.type === TransactionType.PAY_SWIPE && t.status === 'COMPLETED' && /^Advance Pay:/i.test(t.description.trim());
}

export function isPaySwipeRecovery(t: Transaction): boolean {
  return t.type === TransactionType.PAY_SWIPE && t.status === 'COMPLETED' && /^Recovery:/i.test(t.description.trim());
}

export function paySwipeRecoveryMethod(t: Transaction): 'card' | 'cash' | 'bank' {
  const m = t.metadata?.paySwipeRecoveryMethod;
  if (m === 'cash' || m === 'bank' || m === 'card') return m;
  if (/\(CASH\)/i.test(t.description)) return 'cash';
  if (/\(BANK\)/i.test(t.description)) return 'bank';
  return 'card';
}

/** Wallet / IMPS transfer fee on Pay Advance (E001 or metadata). */
export function transferFeeFromPaySwipeAdvance(t: Transaction): number {
  const meta = Number(t.metadata?.transferFee);
  if (Number.isFinite(meta) && meta > 0.005) return roundCurrency(meta);
  if (!isPaySwipeAdvance(t)) return 0;
  return roundCurrency(sumAcct(t.entries, 'E001', 'debit'));
}

type AdvanceLot = {
  principal: number;
  transferFee: number;
  remainingPrincipal: number;
};

function customerPaySwipeTxnsChronological(customerId: string, transactions: Transaction[]): Transaction[] {
  return transactions
    .filter(
      (t) =>
        t.status === 'COMPLETED' &&
        t.type === TransactionType.PAY_SWIPE &&
        t.metadata?.customerId === customerId &&
        (isPaySwipeAdvance(t) || isPaySwipeRecovery(t)),
    )
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function buildAdvanceLotsAfterAllRecoveries(customerId: string, transactions: Transaction[]): AdvanceLot[] {
  const lots: AdvanceLot[] = [];
  for (const tx of customerPaySwipeTxnsChronological(customerId, transactions)) {
    if (isPaySwipeAdvance(tx)) {
      const principal = roundCurrency(sumAcct(tx.entries, 'A006', 'debit'));
      lots.push({
        principal,
        transferFee: transferFeeFromPaySwipeAdvance(tx),
        remainingPrincipal: principal,
      });
    } else if (isPaySwipeRecovery(tx)) {
      applyRecoveryToLots(lots, roundCurrency(sumAcct(tx.entries, 'A006', 'credit')));
    }
  }
  return lots;
}

function applyRecoveryToLots(lots: AdvanceLot[], recoveryPrincipal: number): void {
  let remaining = recoveryPrincipal;
  for (const lot of lots) {
    if (remaining <= 0.005) break;
    if (lot.remainingPrincipal <= 0.005) continue;
    const take = Math.min(lot.remainingPrincipal, remaining);
    lot.remainingPrincipal = roundCurrency(lot.remainingPrincipal - take);
    remaining = roundCurrency(remaining - take);
  }
}

function transferFeeFromLots(lots: AdvanceLot[], recoveryPrincipal: number): number {
  if (recoveryPrincipal <= 0.005) return 0;
  let remaining = recoveryPrincipal;
  let feeSum = 0;
  for (const lot of lots) {
    if (remaining <= 0.005) break;
    if (lot.remainingPrincipal <= 0.005) continue;
    const take = Math.min(lot.remainingPrincipal, remaining);
    const feePart =
      lot.principal > 0.005 ? roundCurrency(lot.transferFee * (take / lot.principal)) : 0;
    feeSum = roundCurrency(feeSum + feePart);
    lot.remainingPrincipal = roundCurrency(lot.remainingPrincipal - take);
    remaining = roundCurrency(remaining - take);
  }
  return roundCurrency(feeSum);
}

function lotsBeforeRecovery(
  customerId: string,
  transactions: Transaction[],
  beforeRecoveryId?: string,
): AdvanceLot[] {
  const lots: AdvanceLot[] = [];
  for (const tx of customerPaySwipeTxnsChronological(customerId, transactions)) {
    if (beforeRecoveryId && tx.id === beforeRecoveryId) break;
    if (isPaySwipeAdvance(tx)) {
      const principal = roundCurrency(sumAcct(tx.entries, 'A006', 'debit'));
      lots.push({
        principal,
        transferFee: transferFeeFromPaySwipeAdvance(tx),
        remainingPrincipal: principal,
      });
    } else if (isPaySwipeRecovery(tx)) {
      if (beforeRecoveryId && tx.id === beforeRecoveryId) break;
      applyRecoveryToLots(lots, roundCurrency(sumAcct(tx.entries, 'A006', 'credit')));
    }
  }
  return lots;
}

/** FIFO: transfer fee from open advances attributed to this recovery principal. */
export function paySwipeRecoveryTransferFeePreview(
  customerId: string,
  recoveryPrincipal: number,
  transactions: Transaction[],
): number {
  const lots = buildAdvanceLotsAfterAllRecoveries(customerId, transactions);
  return transferFeeFromLots(
    lots.map((l) => ({ ...l })),
    recoveryPrincipal,
  );
}

function recoveryTransferFeeAttributed(t: Transaction, transactions: Transaction[]): number {
  const stored = Number(t.metadata?.transferFee);
  if (Number.isFinite(stored) && stored > 0.005) return roundCurrency(stored);
  const cid = t.metadata?.customerId;
  if (!cid) return 0;
  const principal = roundCurrency(sumAcct(t.entries, 'A006', 'credit'));
  const lots = lotsBeforeRecovery(cid, transactions, t.id);
  return transferFeeFromLots(lots, principal);
}

/** Transfer fees on advances not yet cleared by recoveries (workbook P&L). */
export function unrecoveredPaySwipeAdvanceTransferFees(transactions: Transaction[]): number {
  const customerIds = new Set<string>();
  for (const t of transactions) {
    if (t.status !== 'COMPLETED' || t.type !== TransactionType.PAY_SWIPE) continue;
    const cid = t.metadata?.customerId;
    if (cid && isPaySwipeAdvance(t)) customerIds.add(cid);
  }
  let sum = 0;
  for (const cid of customerIds) {
    const lots = buildAdvanceLotsAfterAllRecoveries(cid, transactions);
    for (const lot of lots) {
      if (lot.remainingPrincipal <= 0.005) continue;
      const ratio = lot.principal > 0.005 ? lot.remainingPrincipal / lot.principal : 0;
      sum = roundCurrency(sum + roundCurrency(lot.transferFee * ratio));
    }
  }
  return roundCurrency(sum);
}

/** Outstanding Pay & Swipe receivable for one customer (A006): advances minus recoveries, from posted txns. */
export function customerPaySwipeReceivableOutstanding(customerId: string, transactions: Transaction[]): number {
  let bal = 0;
  for (const t of transactions) {
    if (t.status !== 'COMPLETED' || t.type !== TransactionType.PAY_SWIPE) continue;
    if (t.metadata?.customerId !== customerId) continue;
    if (isPaySwipeAdvance(t)) {
      bal += sumAcct(t.entries, 'A006', 'debit');
    } else if (isPaySwipeRecovery(t)) {
      bal -= sumAcct(t.entries, 'A006', 'credit');
    }
  }
  return roundCurrency(bal);
}

export type PaySwipePLRow = {
  id: string;
  raw: Transaction;
  date: string;
  kind: 'advance' | 'recovery';
  customerId?: string;
  customer: string;
  lead: string;
  walletName: string;
  card: string;
  /** Advance: amount to A006. Recovery: gross swipe / principal cleared (A006 credit). */
  principal: number;
  mdrCost: number;
  netToWallet: number;
  chargesCollected: number;
  /** Advance: wallet transfer fee. Recovery: fee attributed from linked advance(s). */
  transferFee: number;
  /** Recovery: collection asset name. Advance: source (bank/cash) name. */
  counterpartyAccount: string;
  netMargin: number;
  remarks: string;
};

function leadLabel(t: Transaction, userId?: string, userName?: string): string {
  const performer = t.metadata?.performedByUserId;
  if (performer && userId === performer) return userName ?? '—';
  if (performer) return performer.slice(0, 8) + '…';
  return '—';
}

function parseAdvance(
  t: Transaction,
  accounts: Account[],
  customers: Customer[],
  userId?: string,
  userName?: string,
): PaySwipePLRow {
  const principal = roundCurrency(sumAcct(t.entries, 'A006', 'debit'));
  const transferFee = transferFeeFromPaySwipeAdvance(t);
  let counterpartyAccount = '—';
  for (const e of t.entries) {
    if (e.credit > 0.005 && e.accountId !== 'A006') {
      counterpartyAccount = accounts.find((a) => a.id === e.accountId)?.name ?? e.accountId;
      break;
    }
  }
  const cid = t.metadata?.customerId;
  const customer = customers.find((c) => c.id === cid)?.name ?? '—';
  return {
    id: t.id,
    raw: t,
    date: t.date,
    kind: 'advance',
    customerId: cid,
    customer,
    lead: leadLabel(t, userId, userName),
    walletName: '—',
    card: '—',
    principal,
    mdrCost: 0,
    netToWallet: 0,
    chargesCollected: 0,
    transferFee,
    counterpartyAccount,
    netMargin: 0,
    remarks: t.description.length > 48 ? `${t.description.slice(0, 48)}…` : t.description,
  };
}

function parseRecovery(
  t: Transaction,
  wallets: Wallet[],
  accounts: Account[],
  customers: Customer[],
  transactions: Transaction[],
  userId?: string,
  userName?: string,
): PaySwipePLRow | null {
  if (!isPaySwipeRecovery(t)) return null;
  const principal = roundCurrency(sumAcct(t.entries, 'A006', 'credit'));
  const mdrCost = roundCurrency(sumAcct(t.entries, 'E001', 'debit'));
  const chargesCollected = roundCurrency(sumAcct(t.entries, 'I001', 'credit'));
  const transferFee = recoveryTransferFeeAttributed(t, transactions);

  const walletLedgerIds = new Set(wallets.map((w) => w.ledgerAccountId));
  let netToWallet = 0;
  let walletName = '—';
  for (const w of wallets) {
    const d = sumAcct(t.entries, w.ledgerAccountId, 'debit');
    if (d > 0.005) {
      netToWallet = roundCurrency(d);
      walletName = w.name;
      break;
    }
  }

  let counterpartyAccount = '—';
  for (const e of t.entries) {
    if (e.debit <= 0.005) continue;
    if (e.accountId === 'A006' || e.accountId === 'E001') continue;
    if (walletLedgerIds.has(e.accountId)) continue;
    counterpartyAccount = accounts.find((a) => a.id === e.accountId)?.name ?? e.accountId;
    break;
  }

  const netMargin = roundCurrency(chargesCollected - mdrCost - transferFee);
  const cid = t.metadata?.customerId;
  const customer = customers.find((c) => c.id === cid)?.name ?? '—';
  const method = paySwipeRecoveryMethod(t);
  const cardLabel =
    method === 'cash' ? 'CASH' : method === 'bank' ? 'BANK' : (() => {
      const cardRaw = (t.metadata?.cardType || '—').toUpperCase();
      return cardRaw === 'MASTERCARD' ? 'MASTER' : cardRaw;
    })();

  return {
    id: t.id,
    raw: t,
    date: t.date,
    kind: 'recovery',
    customerId: cid,
    customer,
    lead: leadLabel(t, userId, userName),
    walletName,
    card: cardLabel === '—' ? '—' : cardLabel,
    principal,
    mdrCost,
    netToWallet,
    chargesCollected,
    transferFee,
    counterpartyAccount,
    netMargin,
    remarks: t.description.length > 48 ? `${t.description.slice(0, 48)}…` : t.description,
  };
}

export function buildPaySwipePLRows(
  transactions: Transaction[],
  wallets: Wallet[],
  accounts: Account[],
  customers: Customer[],
  userId?: string,
  userName?: string,
): PaySwipePLRow[] {
  const rows: PaySwipePLRow[] = [];
  for (const t of transactions) {
    if (t.type !== TransactionType.PAY_SWIPE || t.status !== 'COMPLETED') continue;
    if (isPaySwipeAdvance(t)) {
      rows.push(parseAdvance(t, accounts, customers, userId, userName));
    } else if (isPaySwipeRecovery(t)) {
      const r = parseRecovery(t, wallets, accounts, customers, transactions, userId, userName);
      if (r) rows.push(r);
    }
  }
  return rows;
}

/** Pay & Swipe workbook net margin: recovery (charges − MDR − transfer fee) minus unrecovered advance fees. */
export function totalPaySwipeRecoveryNetMargin(transactions: Transaction[]): number {
  let sum = 0;
  for (const t of transactions) {
    if (!isPaySwipeRecovery(t)) continue;
    const charges = roundCurrency(sumAcct(t.entries, 'I001', 'credit'));
    const mdr = roundCurrency(sumAcct(t.entries, 'E001', 'debit'));
    const transferFee = recoveryTransferFeeAttributed(t, transactions);
    sum += roundCurrency(charges - mdr - transferFee);
  }
  sum -= unrecoveredPaySwipeAdvanceTransferFees(transactions);
  return roundCurrency(sum);
}
