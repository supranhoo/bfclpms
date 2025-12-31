/**
 * Shared constants for review pages
 * Single source of truth for status colors, labels, and rating options
 */

import { RatingLevel, KpiStatus } from '@/hooks/useKpis';

// Review status colors for KPI workflow
export const statusColors: Record<string, string> = {
  kra_set: 'bg-muted text-muted-foreground',
  self_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  manager_check: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  audit: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  management_review: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

export const statusLabels: Record<string, string> = {
  kra_set: 'KRA Set',
  self_review: 'Self Review',
  manager_check: 'Manager Check',
  audit: 'Audit',
  management_review: 'Management Review',
  approved: 'Approved',
};

// KPI submission status colors
export const kpiStatusColors: Record<KpiStatus, string> = {
  open: 'bg-muted text-muted-foreground',
  submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  approved_by_manager: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  locked: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  sent_back: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
};

export const kpiStatusLabels: Record<KpiStatus, string> = {
  open: 'Open',
  submitted: 'Submitted',
  approved_by_manager: 'Approved',
  locked: 'Locked',
  sent_back: 'Sent Back',
};

// Rating options for review selectors
export const ratingOptions: { value: RatingLevel; label: string; color: string; score: number }[] = [
  { value: 'blue', label: 'Outstanding', color: '#3B82F6', score: 5 },
  { value: 'green', label: 'Exceeds Expectations', color: '#10B981', score: 4 },
  { value: 'yellow', label: 'Meets Expectations', color: '#F59E0B', score: 3 },
  { value: 'red', label: 'Below Expectations', color: '#EF4444', score: 2 },
];

// Review periods
export const reviewPeriods = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
  'Q1', 'Q2', 'Q3', 'Q4'
];

// Helper to get rating display info
export function getRatingInfo(rating: RatingLevel | null | undefined) {
  if (!rating) return null;
  return ratingOptions.find(r => r.value === rating);
}
