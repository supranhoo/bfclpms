/**
 * Annual Review System — shared TypeScript types.
 * Mirrors the public.annual_review_* tables added in the Phase 1 migration.
 */

export type AnnualReviewStatus =
  | 'not_started'
  | 'pending_self'
  | 'pending_manager'
  | 'pending_skip'
  | 'pending_bu'
  | 'pending_hr'
  | 'completed';

export type AnnualReviewerRole = 'self' | 'manager' | 'skip_manager' | 'bu_head' | 'hr';

export type CycleStatus = 'draft' | 'active' | 'closed';

export interface AnnualReviewCycle {
  id: string;
  name: string;
  review_year: number;
  description: string | null;
  status: CycleStatus;
  self_review_start: string | null;
  self_review_end: string | null;
  manager_review_start: string | null;
  manager_review_end: string | null;
  skip_review_start: string | null;
  skip_review_end: string | null;
  bu_review_start: string | null;
  bu_review_end: string | null;
  hr_finalization_deadline: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** A single 0-5 option on a criterion. */
export interface CriterionOption {
  id: string;
  label: string;
  score: number; // 0..5
}

export interface TemplateCriterion {
  id: string;
  name: string;
  description?: string;
  weight: number;
  reviewer_stages: AnnualReviewerRole[];
  enable_remarks?: boolean;
  enable_evidence?: boolean;
  evidence_required?: boolean;
  options?: CriterionOption[];
}

export interface TemplateSystemScore {
  id: string;
  name: string;
  weight: number;        // max percentage points contributed
  source?: 'manual' | 'safety' | 'hr' | 'env' | string;
}

export type EligibilityOperator = 'equals' | 'not_equals' | 'gt' | 'gte' | 'lt' | 'lte';

export interface EligibilityCriterion {
  id: string;
  name: string;
  type: 'number' | 'boolean' | 'string';
  operator: EligibilityOperator;
  expected_value: string | number | boolean;
}

export interface SelfReviewField {
  id: string;
  label: string;
  placeholder?: string;
  required?: boolean;
}

export interface TemplateSettings {
  enable_multilingual?: boolean;
  available_languages?: string[];
  default_language?: string;
}

export interface TemplateSections {
  system_scores?: TemplateSystemScore[];
  criteria?: TemplateCriterion[];
  eligibility_criteria?: EligibilityCriterion[];
  self_review_fields?: SelfReviewField[];
  settings?: TemplateSettings;
  translations?: Record<string, Record<string, string>>;
}

export interface AnnualReviewTemplate {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sections: TemplateSections;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  parent_template_id?: string | null;
  version?: number;
}

export interface AssignmentFilters {
  roles: string[];
  grades: string[];
  levels: string[];
  bu_ids: string[];
  department_ids: string[];
}

export interface AnnualReviewAssignmentRule {
  id: string;
  template_id: string;
  cycle_id: string;
  name: string | null;
  priority: number;
  filters: AssignmentFilters;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnnualReviewInstance {
  id: string;
  employee_id: string;
  template_id: string;
  /** Optional per-employee override. NULL → use `template_id`. Resolved via `resolveTemplateId`. */
  template_override_id?: string | null;
  cycle_id: string;
  assigned_rule_id: string | null;
  overall_status: AnnualReviewStatus;
  manager_id: string | null;
  skip_id: string | null;
  bu_head_id: string | null;
  hr_id: string | null;
  system_scores: Record<string, number>;
  eligibility_inputs: Record<string, string | number | boolean>;
  criteria_weighted_score: number | null;
  total_score: number | null;
  final_rating: string | null;
  hr_remarks: string | null;
  language_pref: string;
  finalized_at: string | null;
  finalized_by: string | null;
  acknowledged_at?: string | null;
  acknowledged_by?: string | null;
  employee_rebuttal?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EvidenceItem {
  path: string;
  name: string;
  size?: number;
  mime?: string;
  uploaded_at?: string;
}

export interface AnnualReviewResponse {
  id: string;
  instance_id: string;
  reviewer_id: string;
  reviewer_role: AnnualReviewerRole;
  criteria_scores: Record<string, number>;
  qualitative_responses: Record<string, string>;
  evidence: EvidenceItem[];
  weighted_score: number | null;
  submitted_at: string | null;
  is_locked: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}