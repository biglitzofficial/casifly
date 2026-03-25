import { Transaction, TransactionType, LedgerEntry, Wallet, Rates } from '../types';
import { roundCurrency } from './utils';

function sumAcct(entries: LedgerEntry[], accountId: string, side: 'debit' | 'credit'): number {
  return entries
    .filter(e => e.accountId === accountId)
    .reduce((s, e) => s + (side === 'debit' ? e.debit : e.credit), 0);
}

/** Swipe **inflow** (customer swipe booked): commission to I001, portal MDR to E001, full amount credited to L001. */
export function isSwipePayInflow(t: Transaction): boolean {
  if (t.type !== TransactionType.SWIPE_PAY || t.status !== 'COMPLETED') return false;
  if (sumAcct(t.entries, 'I001', 'credit') < 0.005) return false;
  if (sumAcct(t.entries, 'L001', 'credit') < 0.005) return false;
  return true;
}

/** Payout **outflow**: reduces L001, no I001 income line. */
export function isSwipePayOutflow(t: Transaction): boolean {
  if (t.type !== TransactionType.SWIPE_PAY || t.status !== 'COMPLETED') return false;
  if (sumAcct(t.entries, 'I001', 'credit') > 0.005) return false;
  return sumAcct(t.entries, 'L001', 'debit') > 0.005;
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

export function parseSwipeInflowEconomics(t: Transaction): SwipeInflowEconomics | null {
  if (!isSwipePayInflow(t)) return null;
  const shopCharges = roundCurrency(sumAcct(t.entries, 'I001', 'credit'));
  const appCharges = roundCurrency(sumAcct(t.entries, 'E001', 'debit'));
  const l001Credit = roundCurrency(sumAcct(t.entries, 'L001', 'credit'));
  const actualAmount = l001Credit > 0 ? l001Credit : roundCurrency(shopCharges + appCharges);
  if (actualAmount < 0.005) return null;

  const grossAmount = roundCurrency(actualAmount - appCharges);
  const shopPct = (shopCharges / actualAmount) * 100;
  const customerPct = shopPct;
  const appPct = (appCharges / actualAmount) * 100;
  const netAmount = roundCurrency(actualAmount - shopCharges);
  const grossProfit = roundCurrency(shopCharges - appCharges);

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
    const cid = i.metadata?.customerId;
    if (!cid) continue;
    const k = keyOf(cid, localDayKey(i.date));
    if (!inflowsByKey.has(k)) inflowsByKey.set(k, []);
    inflowsByKey.get(k)!.push(i);
  }

  const alloc = new Map<string, number>();
  for (const i of inflows) {
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
