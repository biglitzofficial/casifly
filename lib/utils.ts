import { ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatCurrency = (amount: number) => {
  // Prevent NaN from breaking UI
  const safeAmount = isNaN(amount) ? 0 : amount;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(safeAmount);
};

export const generateId = (prefix: string) => {
  return `${prefix}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
};

/** Restrict input to digits only (no decimals) */
export const filterIntegerInput = (value: string): string =>
  value.replace(/\D/g, '');

/** Restrict input to digits and at most one decimal point */
export const filterDecimalInput = (value: string): string => {
  let v = value.replace(/[^\d.]/g, '');
  const parts = v.split('.');
  if (parts.length > 1) v = parts[0] + '.' + parts.slice(1).join('').replace(/\D/g, '');
  return v;
};

export const safeParseFloat = (value: string | number): number => {
  if (typeof value === 'number') return value;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? 0 : parsed;
};

// New helper for financial precision
export const roundCurrency = (value: number): number => {
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

/** Local calendar date YYYY-MM-DD for an ISO or parseable date string (browser local TZ). */
export function transactionLocalYmd(isoOrDate: string): string | null {
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Include ledger transactions through end of `dayYmd` (local calendar day).
 * Lexicographic YYYY-MM-DD compare matches date ordering.
 */
export function txnOnOrBeforeLocalDay(isoOrDate: string, dayYmd: string): boolean {
  const ymd = transactionLocalYmd(isoOrDate);
  if (!ymd) return false;
  return ymd <= dayYmd;
}
