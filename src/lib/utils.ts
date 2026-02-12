import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Safely parse a value to float, preserving 0 as a valid number.
 * Returns null for empty strings, null, undefined, or non-numeric values.
 * Prevents the common JS bug where `parseFloat(v) || null` treats 0 as falsy.
 */
export function safeParseFloat(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = parseFloat(String(value));
  return isNaN(n) ? null : n;
}
