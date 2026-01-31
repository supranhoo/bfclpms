import { format } from 'date-fns';

/**
 * Standard date format for display across the app: "DD MMM YYYY"
 * Example: 12 Dec 2025
 */
export const DATE_FORMAT = 'dd MMM yyyy';

/**
 * Date format with time: "DD MMM YYYY, hh:mm a"
 * Example: 12 Dec 2025, 10:30 AM
 */
export const DATE_TIME_FORMAT = 'dd MMM yyyy, hh:mm a';

/**
 * Time only format: "hh:mm a"
 * Example: 10:30 AM
 */
export const TIME_FORMAT = 'hh:mm a';

/**
 * Format a date string or Date object to the standard display format (DD MMM YYYY)
 * @param date - Date string or Date object
 * @returns Formatted date string (e.g., "12 Dec 2025")
 */
export function formatDate(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return format(dateObj, DATE_FORMAT);
}

/**
 * Format a date string or Date object to date with time format (DD MMM YYYY, hh:mm a)
 * @param date - Date string or Date object
 * @returns Formatted date/time string (e.g., "12 Dec 2025, 10:30 AM")
 */
export function formatDateTime(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return format(dateObj, DATE_TIME_FORMAT);
}

/**
 * Format a date string or Date object to time only format (hh:mm a)
 * @param date - Date string or Date object
 * @returns Formatted time string (e.g., "10:30 AM")
 */
export function formatTime(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return format(dateObj, TIME_FORMAT);
}
