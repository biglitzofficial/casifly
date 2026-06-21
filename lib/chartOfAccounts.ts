import { Transaction } from '../types';

/** Core COA rows that must not be deleted (rename allowed for bank/cash seeds). */
export const PROTECTED_COA_ACCOUNT_IDS = new Set([
  'A001', 'A002', 'A003', 'A004', 'A005', 'A006',
  'L001', 'L002', 'L003', 'Q001', 'Q002',
  'I001', 'I002', 'E001', 'E002', 'E003', 'E004',
]);

export function accountUsedInTransactions(accountId: string, transactions: Transaction[]): boolean {
  return transactions.some((t) => t.entries.some((e) => e.accountId === accountId));
}

export function canDeleteBankCashAccount(
  accountId: string,
  balance: number,
  transactions: Transaction[]
): { ok: boolean; reason?: string } {
  if (PROTECTED_COA_ACCOUNT_IDS.has(accountId)) {
    return { ok: false, reason: 'This is a system account and cannot be deleted.' };
  }
  if (Math.abs(balance) > 0.005) {
    return { ok: false, reason: 'Balance must be zero before deleting this account.' };
  }
  if (accountUsedInTransactions(accountId, transactions)) {
    return { ok: false, reason: 'This account has posted transactions and cannot be deleted.' };
  }
  return { ok: true };
}
