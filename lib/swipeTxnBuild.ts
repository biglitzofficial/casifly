import {
  LedgerEntry,
  PGConfig,
  Rates,
  Transaction,
  TransactionMetadata,
  Wallet,
} from '../types';
import { roundCurrency, safeParseFloat } from './utils';
import {
  isSwipePayInflow,
  isSwipePayOutflow,
  parseSwipeInflowEconomics,
  resolveOutflowLinkedInflowId,
} from './swipeTxnEconomics';

function lineSum(t: Transaction, accountId: string, side: 'debit' | 'credit'): number {
  return t.entries
    .filter((e) => e.accountId === accountId)
    .reduce((s, e) => s + (side === 'debit' ? e.debit : e.credit), 0);
}

export function coercePgRate(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' && Number.isFinite(v) ? v : safeParseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

export function portalPctFromPg(pg: PGConfig | undefined, cardType: string): number {
  if (!pg?.charges) return 0;
  const c = pg.charges as unknown as Record<string, unknown>;
  return roundCurrency(coercePgRate(c[cardType]));
}

export type ParsedSwipeInflow = {
  walletId: string;
  pgName: string;
  cardType: string;
  amount: number;
  customerChargePct: number;
  ourChargePct: number;
  customerId?: string;
};

export function parseSwipeInflowTransaction(t: Transaction): ParsedSwipeInflow | null {
  if (!isSwipePayInflow(t)) return null;
  const econ = parseSwipeInflowEconomics(t)!;
  const customerChargePct =
    t.metadata?.customerChargePct ??
    (econ.actualAmount > 0 ? (econ.shopCharges / econ.actualAmount) * 100 : 0);
  return {
    walletId: t.metadata?.walletId ?? '',
    pgName: t.metadata?.pgName ?? '',
    cardType: t.metadata?.cardType ?? 'visa',
    amount: econ.actualAmount,
    customerChargePct,
    ourChargePct: t.metadata?.ourChargePct ?? customerChargePct,
    customerId: t.metadata?.customerId,
  };
}

export function buildSwipeInflowEntries(
  wallet: Wallet,
  pg: PGConfig,
  cardType: string,
  amount: number,
  customerChargePct: number,
): LedgerEntry[] {
  const portalFee = roundCurrency((amount * portalPctFromPg(pg, cardType)) / 100);
  const serviceFee = roundCurrency((amount * customerChargePct) / 100);
  return [
    { accountId: wallet.ledgerAccountId, debit: amount, credit: 0 },
    { accountId: 'L001', debit: 0, credit: amount },
    { accountId: 'E001', debit: portalFee, credit: 0 },
    { accountId: wallet.ledgerAccountId, debit: 0, credit: portalFee },
    { accountId: 'L001', debit: serviceFee, credit: 0 },
    { accountId: 'L003', debit: 0, credit: serviceFee },
  ];
}

export function buildSwipeInflowMetadata(
  base: TransactionMetadata | undefined,
  walletId: string,
  pgName: string,
  cardType: string,
  customerChargePct: number,
  ourChargePct: number,
): TransactionMetadata {
  return {
    ...base,
    walletId,
    pgName,
    cardType,
    customerChargePct,
    ourChargePct,
  };
}

export type ParsedSwipeOutflow = {
  payoutAmount: number;
  transferFee: number;
  extraCharges: number;
  walletId: string;
  customerId?: string;
  linkedInflowId?: string;
  marginRecognized: number;
};

export function parseSwipeOutflowTransaction(
  t: Transaction,
  allTransactions: Transaction[],
): ParsedSwipeOutflow | null {
  if (!isSwipePayOutflow(t)) return null;
  const marginRecognized = roundCurrency(lineSum(t, 'L003', 'debit'));
  const i001Cr = roundCurrency(lineSum(t, 'I001', 'credit'));
  const extraCharges =
    Number(t.metadata?.extraCharges) > 0.005
      ? roundCurrency(Number(t.metadata!.extraCharges))
      : roundCurrency(Math.max(0, i001Cr - marginRecognized));
  const l001Dr = roundCurrency(lineSum(t, 'L001', 'debit'));
  const payoutAmount = roundCurrency(Math.max(0, l001Dr - extraCharges));
  const transferFee =
    Number(t.metadata?.transferFee) > 0.005
      ? roundCurrency(Number(t.metadata!.transferFee))
      : roundCurrency(lineSum(t, 'E001', 'debit'));
  const walletLine = t.entries.find((e) => e.credit > 0.005 && e.accountId !== 'L001' && e.accountId !== 'I001');
  return {
    payoutAmount,
    transferFee,
    extraCharges,
    walletId: t.metadata?.walletId ?? walletLine?.accountId ?? '',
    customerId: t.metadata?.customerId,
    linkedInflowId: resolveOutflowLinkedInflowId(t, allTransactions),
    marginRecognized,
  };
}

export function buildSwipeOutflowEntries(
  outflowWallet: Wallet,
  payoutAmount: number,
  transferFee: number,
  marginRecognized: number,
  extraCharges: number,
): LedgerEntry[] {
  const totalFromWallet = roundCurrency(payoutAmount + transferFee);
  const entries: LedgerEntry[] = [
    { accountId: 'L001', debit: payoutAmount, credit: 0 },
    { accountId: outflowWallet.ledgerAccountId, debit: 0, credit: totalFromWallet },
  ];
  if (transferFee > 0.005) {
    entries.push({ accountId: 'E001', debit: transferFee, credit: 0 });
  }
  if (marginRecognized > 0.005) {
    entries.push(
      { accountId: 'L003', debit: marginRecognized, credit: 0 },
      { accountId: 'I001', debit: 0, credit: marginRecognized },
    );
  }
  if (extraCharges > 0.005) {
    entries.push(
      { accountId: 'L001', debit: extraCharges, credit: 0 },
      { accountId: 'I001', debit: 0, credit: extraCharges },
    );
  }
  return entries;
}

export function buildSwipeOutflowMetadata(
  base: TransactionMetadata | undefined,
  walletId: string,
  customerId: string | undefined,
  linkedInflowId: string | undefined,
  transferFee: number,
  extraCharges: number,
): TransactionMetadata {
  return {
    ...base,
    walletId,
    customerId,
    relatedInflowId: linkedInflowId || undefined,
    transferFee: transferFee > 0.005 ? transferFee : undefined,
    extraCharges: extraCharges > 0.005 ? extraCharges : undefined,
  };
}
