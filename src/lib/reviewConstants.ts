/**
 * Shared constants for review pages
 * Single source of truth for status colors, labels, rating options, and score utilities
 */

import { RatingLevel, KpiStatus } from '@/hooks/useKpis';

// ============= Rating Scale (0-5) with Severity Gradient =============

export interface RatingScaleEntry {
  score: number;
  label: string;
  shortLabel: string;
  color: string;          // Hex color for inline styles
  badgeClass: string;     // Tailwind classes for Badge backgrounds
  dotColor: string;       // Hex for color dots/circles
  level: RatingLevel;     // DB-level enum (scores 0-2 all map to 'red')
}

/**
 * Canonical rating scale — the SINGLE SOURCE OF TRUTH for all rating visuals.
 * Scores 0, 1, 2 use a three-tier red severity gradient (UI only).
 * At the DB layer, all three map to the 'red' RatingLevel enum.
 */
export const RATING_SCALE: Record<number, RatingScaleEntry> = {
  5: { score: 5, label: 'Outstanding',           shortLabel: 'Outstanding', color: '#3B82F6', dotColor: '#3B82F6', badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',   level: 'blue'   },
  4: { score: 4, label: 'Exceeds Expectations',   shortLabel: 'Exceeds',     color: '#10B981', dotColor: '#10B981', badgeClass: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200', level: 'green'  },
  3: { score: 3, label: 'Meets Expectations',     shortLabel: 'Meets',       color: '#F59E0B', dotColor: '#F59E0B', badgeClass: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200', level: 'yellow' },
  2: { score: 2, label: 'Needs Improvement',      shortLabel: 'Needs Imp.',  color: '#FECACA', dotColor: '#F87171', badgeClass: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',       level: 'red'    },
  1: { score: 1, label: 'Below Expectations',     shortLabel: 'Below',       color: '#EF4444', dotColor: '#EF4444', badgeClass: 'bg-red-400 text-white dark:bg-red-600 dark:text-white',            level: 'red'    },
  0: { score: 0, label: 'Not Achieved',           shortLabel: 'Not Achieved',color: '#7F1D1D', dotColor: '#7F1D1D', badgeClass: 'bg-red-900 text-red-100 dark:bg-red-950 dark:text-red-200',        level: 'red'    },
};

// ============= Centralized Utility Functions =============

/** Get hex color for a numeric score (0-5). Falls back to gray. */
export function getScoreColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return '#6B7280';
  const entry = RATING_SCALE[Math.round(Math.min(5, Math.max(0, score)))];
  return entry?.color || '#6B7280';
}

/** Get Tailwind badge classes for a numeric score (0-5). */
export function getScoreBadgeClass(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'bg-muted text-muted-foreground';
  const entry = RATING_SCALE[Math.round(Math.min(5, Math.max(0, score)))];
  return entry?.badgeClass || 'bg-muted text-muted-foreground';
}

/** Get label for a numeric score (0-5). */
export function getScoreLabel(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'Not Set';
  const entry = RATING_SCALE[Math.round(Math.min(5, Math.max(0, score)))];
  return entry?.label || 'Unknown';
}

/** Get short label for a numeric score (0-5). */
export function getScoreShortLabel(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'Not Set';
  const entry = RATING_SCALE[Math.round(Math.min(5, Math.max(0, score)))];
  return entry?.shortLabel || 'Unknown';
}

/** Map a numeric score to the DB-level RatingLevel enum. */
export function scoreToRatingLevel(score: number): RatingLevel {
  if (score >= 5) return 'blue';
  if (score >= 4) return 'green';
  if (score >= 3) return 'yellow';
  return 'red';
}

/** Map a RatingLevel enum to its canonical label. */
export function ratingLevelToLabel(level: RatingLevel | null | undefined): string {
  switch (level) {
    case 'blue': return 'Outstanding';
    case 'green': return 'Exceeds Expectations';
    case 'yellow': return 'Meets Expectations';
    case 'red': return 'Below Expectations';
    default: return 'N/A';
  }
}

/** Get hex color for a RatingLevel enum. */
export function getRatingLevelColor(level: RatingLevel | null | undefined): string {
  switch (level) {
    case 'blue': return '#3B82F6';
    case 'green': return '#10B981';
    case 'yellow': return '#F59E0B';
    case 'red': return '#EF4444';
    default: return '#6B7280';
  }
}

// ============= Legacy-compatible exports =============

// Review status colors for KPI workflow
export const statusColors: Record<string, string> = {
  kra_set: 'bg-muted text-muted-foreground',
  self_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  manager_check: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  functional_manager_check: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900 dark:text-fuchsia-200',
  skip_level_check: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  hr_pms_review: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
  audit: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  management_review: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

export const statusLabels: Record<string, string> = {
  kra_set: 'KRA Set',
  self_review: 'Self Review',
  manager_check: 'Manager Check',
  functional_manager_check: 'Functional Manager Review',
  skip_level_check: 'Skip-Level Check',
  hr_pms_review: 'HR PMS Review',
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

// Rating options array — full 0-5 scale for review selectors
export const ratingOptions: { value: RatingLevel; label: string; color: string; score: number }[] = [
  { value: 'blue',   label: 'Outstanding',           color: '#3B82F6', score: 5 },
  { value: 'green',  label: 'Exceeds Expectations',  color: '#10B981', score: 4 },
  { value: 'yellow', label: 'Meets Expectations',     color: '#F59E0B', score: 3 },
  { value: 'red',    label: 'Needs Improvement',      color: '#FECACA', score: 2 },
  { value: 'red',    label: 'Below Expectations',     color: '#EF4444', score: 1 },
  { value: 'red',    label: 'Not Achieved',           color: '#7F1D1D', score: 0 },
];

/** Map of RatingLevel to hex color — used by Dashboard and MobileKpiCard */
export const ratingColors: Record<string, string> = {
  blue: '#3B82F6',
  green: '#10B981',
  yellow: '#F59E0B',
  red: '#EF4444',
};

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
