import { Transaction, TransactionType, LedgerEntry, Wallet, Rates } from '../types';
import { roundCurrency } from './utils';

function sumAcct(entries: LedgerEntry[], accountId: string, side: 'debit' | 'credit'): number {
  return entries
    .filter(e => e.accountId === accountId)
    .reduce((s, e) => s + (side === 'debit' ? e.debit : e.credit), 0);
}

/** Swipe **inflow**: gross to L001 (Cr), portal MDR to E001; margin to L003 and/or legacy I001 on the inflow txn. */
export function isSwipePayInflow(t: Transaction): boolean {
  if (t.type !== TransactionType.SWIPE_PAY || t.status !== 'COMPLETED') return false;
  if (sumAcct(t.entries, 'L001', 'credit') < 0.005) return false;
  const marginLine =
    sumAcct(t.entries, 'L003', 'credit') > 0.005 || sumAcct(t.entries, 'I001', 'credit') > 0.005;
  if (!marginLine) return false;
  return true;
}

/** Payout **outflow**: Dr L001 (and optional L003 Dr / I001 Cr when margin is recognised). Not an inflow (no L001 Cr from swipe). */
export function isSwipePayOutflow(t: Transaction): boolean {
  if (t.type !== TransactionType.SWIPE_PAY || t.status !== 'COMPLETED') return false;
  if (sumAcct(t.entries, 'L001', 'credit') > 0.005) return false;
  return sumAcct(t.entries, 'L001', 'debit') > 0.005;
}

/** Pending swipe margin still in L003 on the inflow transaction (new flow). */
export function swipeInflowPendingMarginAmount(t: Transaction): number {
  return roundCurrency(sumAcct(t.entries, 'L003', 'credit'));
}

/** Outflow that settled this inflow's L003 margin into I001 (metadata link or journal match). */
export function resolveOutflowLinkedInflowId(o: Transaction, transactions: Transaction[]): string | undefined {
  const explicit = o.metadata?.relatedInflowId?.trim();
  if (explicit) return explicit;
  if (!isSwipePayOutflow(o)) return undefined;
  const marginDr = roundCurrency(sumAcct(o.entries, 'L003', 'debit'));
  const i001Cr = roundCurrency(sumAcct(o.entries, 'I001', 'credit'));
  if (marginDr < 0.005 && i001Cr < 0.005) return undefined;
  const matchAmount = marginDr > 0.005 ? marginDr : i001Cr;
  const cid = o.metadata?.customerId;
  let candidates = transactions.filter(
    (t) => isSwipePayInflow(t) && Math.abs(swipeInflowPendingMarginAmount(t) - matchAmount) < 0.02
  );
  if (cid) {
    const scoped = candidates.filter((t) => t.metadata?.customerId === cid);
    if (scoped.length > 0) candidates = scoped;
  }
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0].id;
  const oTime = new Date(o.date).getTime();
  candidates.sort(
    (a, b) =>
      Math.abs(new Date(a.date).getTime() - oTime) - Math.abs(new Date(b.date).getTime() - oTime)
  );
  return candidates[0].id;
}

/** True when margin for this inflow is already in I001 (legacy on inflow, explicit link, or resolved orphan outflow). */
export function isSwipeInflowMarginSettledInBooks(inflowId: string, transactions: Transaction[]): boolean {
  const inflow = transactions.find((t) => t.id === inflowId);
  if (inflow && sumAcct(inflow.entries, 'I001', 'credit') > 0.005) return true;
  return transactions.some(
    (ot) =>
      ot.type === TransactionType.SWIPE_PAY &&
      ot.status === 'COMPLETED' &&
      sumAcct(ot.entries, 'I001', 'credit') > 0.005 &&
      (ot.metadata?.relatedInflowId === inflowId ||
        resolveOutflowLinkedInflowId(ot, transactions) === inflowId)
  );
}

/** Swipe inflows with L003 margin still awaiting a linked payout outflow. */
export function swipeInflowsAwaitingPayout(transactions: Transaction[], customerId?: string): Transaction[] {
  return transactions.filter((t) => {
    if (t.type !== TransactionType.SWIPE_PAY || t.status !== 'COMPLETED') return false;
    if (customerId && t.metadata?.customerId !== customerId) return false;
    if (!isSwipePayInflow(t)) return false;
    if (swipeInflowPendingMarginAmount(t) < 0.005) return false;
    return !isSwipeInflowMarginSettledInBooks(t.id, transactions);
  });
}

/** Legacy: I001 credited on inflow. New: I001 only after linked outflow. */
export function isSwipeMarginRecognizedForInflow(inflow: Transaction, allTxns: Transaction[]): boolean {
  if (sumAcct(inflow.entries, 'I001', 'credit') > 0.005) return true;
  return isSwipeInflowMarginSettledInBooks(inflow.id, allTxns);
}

/**
 * E001 on swipe inflows whose margin is still in L003 (not yet in I001). Subset variant: only
 * sums txns present in `subset` (e.g. filtered by card/wallet) while recognition uses `allTxns`.
 */
export function deferredSwipePortalExpenseInSubset(subset: Transaction[], allTxns: Transaction[]): number {
  let sum = 0;
  for (const t of subset) {
    if (t.status !== 'COMPLETED') continue;
    if (!isSwipePayInflow(t)) continue;
    if (isSwipeMarginRecognizedForInflow(t, allTxns)) continue;
    sum += sumAcct(t.entries, 'E001', 'debit');
  }
  return roundCurrency(sum);
}

/**
 * Portal / MDR (E001) on pending-margin swipe inflows — exclude from headline P&L so dashboard /
 * Profit & Loss match Transaction P&L (no orphan expense vs deferred income).
 */
export function deferredSwipePortalExpenseExcludedFromPl(transactions: Transaction[]): number {
  return deferredSwipePortalExpenseInSubset(transactions, transactions);
}

export function transferExpenseFromOutflow(t: Transaction): number {
  const meta = Number(t.metadata?.transferFee);
  if (Number.isFinite(meta) && meta > 0.005) return roundCurrency(meta);
  return roundCurrency(sumAcct(t.entries, 'E001', 'debit'));
}

export type SwipeInflowEconomics = {
  actualAmount: number;
  appCharges: number;
  shopCharges: number /** shop / customer fee in ₹ (Excel shop & customer charges) */;
  grossAmount: number /** actual − app charges */;
  shopPct: number;
  customerPct: number;
  appPct: number;
  netAmount: number /** actual − shop charges */;
  grossProfit: number /** shop charges − app charges */;
};

export function parseSwipeInflowEconomics(t: Transaction, allTxns: Transaction[] = []): SwipeInflowEconomics | null {
  if (!isSwipePayInflow(t)) return null;
  const shopCharges = roundCurrency(
    sumAcct(t.entries, 'L003', 'credit') + sumAcct(t.entries, 'I001', 'credit')
  );
  const appCharges = roundCurrency(sumAcct(t.entries, 'E001', 'debit'));
  const l001Credit = roundCurrency(sumAcct(t.entries, 'L001', 'credit'));
  const actualAmount = l001Credit > 0 ? l001Credit : roundCurrency(shopCharges + appCharges);
  if (actualAmount < 0.005) return null;

  const marginRecognized = isSwipeMarginRecognizedForInflow(t, allTxns);
  const grossAmount = roundCurrency(actualAmount - appCharges);
  const shopPct = (shopCharges / actualAmount) * 100;
  const customerPct = shopPct;
  const appPct = (appCharges / actualAmount) * 100;
  const netAmount = roundCurrency(actualAmount - shopCharges);
  const grossProfit = marginRecognized ? roundCurrency(shopCharges - appCharges) : 0;

  return {
    actualAmount,
    appCharges,
    shopCharges,
    grossAmount,
    shopPct,
    customerPct,
    appPct,
    netAmount,
    grossProfit,
  };
}

/** Franchise / workbook P&L: customer fee, our margin, gap (other value), net after portal. */
export type SwipeInflowFranchisePL = {
  customerChargePct: number;
  customerAmount: number;
  ourChargePct: number;
  ourChargeAmount: number;
  otherValue: number;
  netProfit: number;
};

/** Sum extra charges from outflows linked to this swipe inflow. */
export function sumSwipeExtraChargesForInflow(inflowId: string, transactions: Transaction[]): number {
  let sum = 0;
  for (const t of transactions) {
    if (t.status !== 'COMPLETED' || t.type !== TransactionType.SWIPE_PAY) continue;
    if (t.metadata?.relatedInflowId !== inflowId) continue;
    const extra = Number(t.metadata?.extraCharges) || 0;
    if (extra > 0.005) sum += extra;
  }
  return roundCurrency(sum);
}

export function computeSwipeInflowFranchisePL(
  t: Transaction,
  econ: SwipeInflowEconomics,
  extraChargesAddOn = 0,
  transferFeeDeduction = 0
): SwipeInflowFranchisePL {
  const amount = econ.actualAmount;
  const customerAmount = econ.shopCharges;
  const customerChargePct =
    t.metadata?.customerChargePct ??
    (amount > 0 ? (customerAmount / amount) * 100 : 0);
  const ourChargePct = t.metadata?.ourChargePct ?? customerChargePct;
  const ourChargeAmount = roundCurrency((amount * ourChargePct) / 100);
  const otherValue = roundCurrency(customerAmount - ourChargeAmount);
  const netProfit = roundCurrency(
    ourChargeAmount - econ.appCharges + extraChargesAddOn - transferFeeDeduction
  );
  return {
    customerChargePct,
    customerAmount,
    ourChargePct,
    ourChargeAmount,
    otherValue,
    netProfit,
  };
}

export function inferPgName(wallet: Wallet | undefined, cardType: string | undefined, appPct: number): string {
  if (!wallet?.pgs?.length) return '—';
  const key = (cardType || 'visa').toLowerCase() as keyof Rates;
  const tolerance = 0.06;
  const match = wallet.pgs.find(pg => Math.abs((Number(pg.charges[key]) || 0) - appPct) < tolerance);
  if (match) return match.name;
  let best = wallet.pgs[0];
  let bestDiff = Infinity;
  for (const pg of wallet.pgs) {
    const d = Math.abs((Number(pg.charges[key]) || 0) - appPct);
    if (d < bestDiff) {
      bestDiff = d;
      best = pg;
    }
  }
  return best?.name ?? '—';
}

export function localDayKey(isoDate: string): string {
  const d = new Date(isoDate);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Payout wallet transfer fee (E001 on outflow) attributed per swipe inflow.
 * Linked outflows assign the full fee to `relatedInflowId`; unlinked same-day fees split evenly
 * across recognised inflows for that customer. Remainder from rounding goes to the last inflow.
 */
export function buildTransferExpensePerInflowId(transactions: Transaction[]): Map<string, number> {
  const inflows = transactions.filter(isSwipePayInflow);
  const recognized = (i: Transaction) => isSwipeMarginRecognizedForInflow(i, transactions);
  const outflows = transactions.filter(isSwipePayOutflow);
  const keyOf = (customerId: string, day: string) => `${customerId}|${day}`;

  const outflowToInflow = new Map<string, string>();
  for (const o of outflows) {
    const linkId = resolveOutflowLinkedInflowId(o, transactions);
    if (linkId) outflowToInflow.set(o.id, linkId);
  }

  const alloc = new Map<string, number>();
  for (const o of outflows) {
    const linkId = outflowToInflow.get(o.id);
    if (!linkId) continue;
    const fee = transferExpenseFromOutflow(o);
    if (fee < 0.005) continue;
    alloc.set(linkId, roundCurrency((alloc.get(linkId) ?? 0) + fee));
  }

  const transferByKey = new Map<string, number>();
  for (const o of outflows) {
    if (outflowToInflow.has(o.id)) continue;
    const cid = o.metadata?.customerId;
    if (!cid) continue;
    const k = keyOf(cid, localDayKey(o.date));
    transferByKey.set(k, roundCurrency((transferByKey.get(k) ?? 0) + transferExpenseFromOutflow(o)));
  }

  const inflowsByKey = new Map<string, Transaction[]>();
  for (const i of inflows) {
    if (!recognized(i)) continue;
    const cid = i.metadata?.customerId;
    if (!cid) continue;
    const k = keyOf(cid, localDayKey(i.date));
    if (!inflowsByKey.has(k)) inflowsByKey.set(k, []);
    inflowsByKey.get(k)!.push(i);
  }

  for (const i of inflows) {
    if (!recognized(i)) {
      if (!alloc.has(i.id)) alloc.set(i.id, 0);
      continue;
    }
    const cid = i.metadata?.customerId;
    if (!cid) {
      if (!alloc.has(i.id)) alloc.set(i.id, 0);
      continue;
    }
    const k = keyOf(cid, localDayKey(i.date));
    const list = inflowsByKey.get(k) ?? [];
    const n = list.length;
    const totalT = transferByKey.get(k) ?? 0;
    if (n === 0 || totalT < 0.005) {
      if (!alloc.has(i.id)) alloc.set(i.id, 0);
      continue;
    }
    const idx = list.findIndex(x => x.id === i.id);
    const base = roundCurrency(totalT / n);
    const split =
      idx === n - 1
        ? roundCurrency(totalT - roundCurrency(base * (n - 1)))
        : base;
    alloc.set(i.id, roundCurrency((alloc.get(i.id) ?? 0) + split));
  }

  for (const i of inflows) {
    if (!alloc.has(i.id)) alloc.set(i.id, 0);
  }

  return alloc;
}

/** Franchise pass-through on swipe inflows (customer fee − our fee) — still in ledger I001 but not your margin. */
export function totalSwipeFranchiseOtherValue(transactions: Transaction[]): number {
  const transferByInflow = buildTransferExpensePerInflowId(transactions);
  let sum = 0;
  for (const t of transactions) {
    if (t.status !== 'COMPLETED' || !isSwipePayInflow(t)) continue;
    const econ = parseSwipeInflowEconomics(t, transactions);
    if (!econ) continue;
    const extra = sumSwipeExtraChargesForInflow(t.id, transactions);
    const transferFee = transferByInflow.get(t.id) ?? 0;
    const { otherValue } = computeSwipeInflowFranchisePL(t, econ, extra, transferFee);
    if (otherValue > 0.005) sum += otherValue;
  }
  return roundCurrency(sum);
}

/** Mediator / franchise payouts (E004) linked to a swipe inflow. */
export function sumMediatorPayoutForInflow(inflowId: string, transactions: Transaction[]): number {
  let sum = 0;
  for (const t of transactions) {
    if (t.status !== 'COMPLETED') continue;
    if (t.metadata?.relatedInflowId !== inflowId) continue;
    const meta = Number(t.metadata?.mediatorPayout);
    if (meta > 0.005) {
      sum += meta;
      continue;
    }
    const e004 = roundCurrency(sumAcct(t.entries, 'E004', 'debit'));
    if (e004 > 0.005) sum += e004;
  }
  return roundCurrency(sum);
}

export function mediatorRemarksForInflow(inflowId: string, transactions: Transaction[]): string {
  const parts: string[] = [];
  for (const t of transactions) {
    if (t.status !== 'COMPLETED' || t.metadata?.relatedInflowId !== inflowId) continue;
    const r = t.metadata?.mediatorRemarks?.trim();
    if (r) parts.push(r);
  }
  return parts.join('; ');
}

export function mediatorDueForInflow(inflow: Transaction, transactions: Transaction[]): number {
  if (!isSwipePayInflow(inflow)) return 0;
  const econ = parseSwipeInflowEconomics(inflow, transactions);
  if (!econ) return 0;
  const extra = sumSwipeExtraChargesForInflow(inflow.id, transactions);
  const transferFee = buildTransferExpensePerInflowId(transactions).get(inflow.id) ?? 0;
  const { otherValue } = computeSwipeInflowFranchisePL(inflow, econ, extra, transferFee);
  const paid = sumMediatorPayoutForInflow(inflow.id, transactions);
  return roundCurrency(Math.max(0, otherValue - paid));
}
