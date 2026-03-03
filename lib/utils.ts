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
