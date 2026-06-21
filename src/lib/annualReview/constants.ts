import type { AnnualReviewStatus, AnnualReviewerRole } from '@/types/annualReview';

/** 0-5 score color palette (semantic Tailwind utility classes). */
export const SCORE_COLOR: Record<number, { text: string; bg: string; border: string; ring: string }> = {
  5: { text: 'text-blue-500',   bg: 'bg-blue-500/10',   border: 'border-blue-500',   ring: 'ring-blue-500/40' },
  4: { text: 'text-green-500',  bg: 'bg-green-500/10',  border: 'border-green-500',  ring: 'ring-green-500/40' },
  3: { text: 'text-amber-500',  bg: 'bg-amber-500/10',  border: 'border-amber-500',  ring: 'ring-amber-500/40' },
  2: { text: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500', ring: 'ring-orange-500/40' },
  1: { text: 'text-red-500',    bg: 'bg-red-500/10',    border: 'border-red-500',    ring: 'ring-red-500/40' },
  0: { text: 'text-slate-500',  bg: 'bg-slate-500/10',  border: 'border-slate-500',  ring: 'ring-slate-500/40' },
};

export const SCORE_LABEL: Record<number, string> = {
  5: 'Outstanding',
  4: 'Exceeds Expectations',
  3: 'Meets Expectations',
  2: 'Needs Improvement',
  1: 'Below Expectations',
  0: 'Not Achieved',
};

export const STATUS_LABEL: Record<AnnualReviewStatus, string> = {
  not_started:     'Not Started',
  pending_self:    'Self Review Pending',
  pending_manager: 'Manager Review Pending',
  pending_skip:    'Skip Mgr Review Pending',
  pending_dept:    'Dept Head Review Pending',
  pending_bu:      'BU Head Review Pending',
  pending_hr:      'HR Finalization Pending',
  completed:       'Completed',
};

export const STATUS_BADGE_CLASS: Record<AnnualReviewStatus, string> = {
  not_started:     'bg-slate-500/15 text-slate-400 border-slate-500/30',
  pending_self:    'bg-blue-500/15 text-blue-400 border-blue-500/30',
  pending_manager: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  pending_skip:    'bg-purple-500/15 text-purple-400 border-purple-500/30',
  pending_dept:    'bg-teal-500/15 text-teal-400 border-teal-500/30',
  pending_bu:      'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  pending_hr:      'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  completed:       'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};

/** Stages in canonical order for the stepper UI. */
export const STAGE_ORDER: AnnualReviewerRole[] = ['self', 'manager', 'skip_manager', 'dept_head', 'bu_head', 'hr'];

export const STAGE_LABEL: Record<AnnualReviewerRole, string> = {
  self:          'Self Review',
  manager:       'Manager',
  skip_manager:  'Skip Manager',
  dept_head:     'Dept Head',
  bu_head:       'BU Head',
  hr:            'HR Final',
};

/** Which stage corresponds to which `overall_status`. */
export const STAGE_TO_STATUS: Record<AnnualReviewerRole, AnnualReviewStatus> = {
  self:         'pending_self',
  manager:      'pending_manager',
  skip_manager: 'pending_skip',
  dept_head:    'pending_dept',
  bu_head:      'pending_bu',
  hr:           'pending_hr',
};

export const FINAL_RATINGS = ['Outstanding', 'Good', 'Average', 'Poor'] as const;
export type FinalRating = (typeof FINAL_RATINGS)[number];

/** Default supported languages for the multilingual template option. */
export const SUPPORTED_LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'es', label: 'Español' },
];