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
  userName?: string
): PaySwipePLRow {
  const principal = roundCurrency(sumAcct(t.entries, 'A006', 'debit'));
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
  userId?: string,
  userName?: string
): PaySwipePLRow | null {
  if (!isPaySwipeRecovery(t)) return null;
  const principal = roundCurrency(sumAcct(t.entries, 'A006', 'credit'));
  const mdrCost = roundCurrency(sumAcct(t.entries, 'E001', 'debit'));
  const chargesCollected = roundCurrency(sumAcct(t.entries, 'I001', 'credit'));

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

  const netMargin = roundCurrency(chargesCollected - mdrCost);
  const cid = t.metadata?.customerId;
  const customer = customers.find((c) => c.id === cid)?.name ?? '—';
  const cardRaw = (t.metadata?.cardType || '—').toUpperCase();
  const cardLabel = cardRaw === 'MASTERCARD' ? 'MASTER' : cardRaw;

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
  userName?: string
): PaySwipePLRow[] {
  const rows: PaySwipePLRow[] = [];
  for (const t of transactions) {
    if (t.type !== TransactionType.PAY_SWIPE || t.status !== 'COMPLETED') continue;
    if (isPaySwipeAdvance(t)) {
      rows.push(parseAdvance(t, accounts, customers, userId, userName));
    } else if (isPaySwipeRecovery(t)) {
      const r = parseRecovery(t, wallets, accounts, customers, userId, userName);
      if (r) rows.push(r);
    }
  }
  return rows;
}
