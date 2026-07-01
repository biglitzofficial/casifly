import { Transaction, TransactionType } from '../types';
import { roundCurrency } from './utils';

export function isOpeningBalanceJournal(t: Transaction): boolean {
  return (
    t.status === 'COMPLETED' &&
    t.type === TransactionType.JOURNAL &&
    /^Opening balance/i.test(t.description.trim())
  );
}

/** Net opening capital posted via Dr asset / Cr Q002 (and reversals) for the given asset ledger ids. */
export function sumOpeningCapitalForAccounts(
  transactions: Transaction[],
  assetAccountIds: Set<string>
): number {
  if (assetAccountIds.size === 0) return 0;
  let sum = 0;
  for (const t of transactions) {
    if (!isOpeningBalanceJournal(t)) continue;
    if (t.entries.length !== 2) continue;
    const qEntry = t.entries.find((e) => e.accountId === 'Q002');
    const assetEntry = t.entries.find((e) => assetAccountIds.has(e.accountId));
    if (!qEntry || !assetEntry) continue;
    sum += qEntry.credit - qEntry.debit;
  }
  return roundCurrency(sum);
}

export function sumOpeningForAccount(transactions: Transaction[], assetAccountId: string): number {
  return sumOpeningCapitalForAccounts(transactions, new Set([assetAccountId]));
}
