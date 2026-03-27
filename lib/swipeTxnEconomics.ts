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

/** An outflow has already posted I001 for this inflow (metadata link). */
export function isSwipeInflowMarginSettledInBooks(inflowId: string, transactions: Transaction[]): boolean {
  return transactions.some(
    (ot) =>
      ot.type === TransactionType.SWIPE_PAY &&
      ot.status === 'COMPLETED' &&
      ot.metadata?.relatedInflowId === inflowId &&
      sumAcct(ot.entries, 'I001', 'credit') > 0.005
  );
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
 * Same-day payout transfer (E001 on outflow) split evenly across swipe inflows for that customer
 * within the given transaction set (e.g. filtered by date). Remainder from rounding goes to the last inflow.
 */
export function buildTransferExpensePerInflowId(transactions: Transaction[]): Map<string, number> {
  const inflows = transactions.filter(isSwipePayInflow);
  const recognized = (i: Transaction) => isSwipeMarginRecognizedForInflow(i, transactions);
  const outflows = transactions.filter(isSwipePayOutflow);
  const keyOf = (customerId: string, day: string) => `${customerId}|${day}`;

  const transferByKey = new Map<string, number>();
  for (const o of outflows) {
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

  const alloc = new Map<string, number>();
  for (const i of inflows) {
    if (!recognized(i)) {
      alloc.set(i.id, 0);
      continue;
    }
    const cid = i.metadata?.customerId;
    if (!cid) {
      alloc.set(i.id, 0);
      continue;
    }
    const k = keyOf(cid, localDayKey(i.date));
    const list = inflowsByKey.get(k) ?? [];
    const n = list.length;
    const totalT = transferByKey.get(k) ?? 0;
    if (n === 0 || totalT < 0.005) {
      alloc.set(i.id, 0);
      continue;
    }
    const idx = list.findIndex(x => x.id === i.id);
    const base = roundCurrency(totalT / n);
    if (idx === n - 1) {
      const prior = roundCurrency(base * (n - 1));
      alloc.set(i.id, roundCurrency(totalT - prior));
    } else {
      alloc.set(i.id, base);
    }
  }

  return alloc;
}
