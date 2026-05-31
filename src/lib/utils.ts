import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format employee name with optional employee code.
 * Returns "Name (Code)" if code exists, otherwise just "Name" or email fallback.
 */
export function formatEmployeeName(
  fullName: string | null | undefined,
  email: string,
  employeeCode?: string | null
): string {
  const name = fullName || email;
  return employeeCode ? `${name} (${employeeCode})` : name;
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

/**
 * Format a numeric value to exactly 2 decimal places.
 * Returns '—' for null/empty/NaN inputs. Zero is preserved as '0.00'.
 */
export function fmt2(value: number | string | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (isNaN(n)) return '—';
  return n.toFixed(2);
}

/**
 * Format a numeric value rounded DOWN (floor) to 2 decimal places.
 * Used for monetary values like Increment Amount where we must never round up.
 * Returns '—' for null/empty/NaN inputs.
 */
export function fmtFloor2(value: number | string | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (isNaN(n)) return '—';
  return (Math.floor(n * 100) / 100).toFixed(2);
}