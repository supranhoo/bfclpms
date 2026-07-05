/**
 * Annual Review System — shared TypeScript types.
 * Mirrors the public.annual_review_* tables added in the Phase 1 migration.
 */

export type AnnualReviewStatus =
  | 'not_started'
  | 'pending_self'
  | 'pending_manager'
  | 'pending_skip'
  | 'pending_dept'
  | 'pending_bu'
  | 'pending_hr'
  | 'completed';

export type AnnualReviewerRole = 'self' | 'manager' | 'skip_manager' | 'dept_head' | 'bu_head' | 'hr';

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
  dept_review_start: string | null;
  dept_review_end: string | null;
  bu_review_start: string | null;
  bu_review_end: string | null;
  hr_finalization_deadline: string | null;
  /**
   * Cycle-level default workflow chain — JSON array of reviewer roles.
   * Seeder stamps this onto each new instance.enabled_stages. Must contain
   * 'self'. Defaults to the full 6-stage canonical chain on net-new cycles.
   */
  default_enabled_stages?: AnnualReviewerRole[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** A single 0-5 option on a criterion. */
export interface CriterionOption {
  id: string;
  label: string;
  /** Optional imported Hindi/local-language label from criteria_library.scoring_bands. */
  label_hi?: string | null;
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
  /** Optional human-readable description shown in the editor and the review form. */
  description?: string;
  weight: number;        // max percentage points contributed
  source?: 'manual' | 'safety' | 'hr' | 'env' | 'carry_kra' | string;
  /** Only used when source === 'carry_kra'. */
  carry_config?: CarryKraConfig;
}

export type CarryKraAggregation = 'overall_avg' | 'last_n_months' | 'selected_months';

export interface CarryKraConfig {
  aggregation: CarryKraAggregation;
  /** Used when aggregation === 'last_n_months'. */
  lastN?: number;
  /** Used when aggregation === 'selected_months'. Month names: 'July'..'June'. */
  months?: string[];
  /** Default true — exclude is_na submissions. */
  excludeNa?: boolean;
}

export interface CarryKraMonthly {
  month: string;          // 'July'..'June'
  avg: number | null;     // 0..KPI_SCALE_MAX, weight-aware avg of KPI ratings (null = no data)
  kpiCount: number;
  /** Weighted sum of (kpi_score × kpi_weight) on the 0..KPI_SCALE_MAX scale. Null = no data. */
  totalScore?: number | null;
  /** Sum of kpi_weight × KPI_SCALE_MAX — the denominator for a "perfect" month. Null = no data. */
  outOf?: number | null;
  /** totalScore / outOf × 100 (0..100). Null = no data. */
  percentage?: number | null;
}

export interface CarryKraSnapshot {
  monthly: CarryKraMonthly[];
  /** Raw rating, 0..KPI_SCALE_MAX, average of selected monthly ratings (ignoring null months). */
  rating: number;
  /** Scaled contribution in percentage points = (rating / KPI_SCALE_MAX) * weight. */
  value: number;
  /** Max possible contribution = the system-score `weight` passed in. */
  maxValue: number;
  fiscal_year: number;
  config: CarryKraConfig;
  computed_at: string;
}

export type EligibilityOperator = 'equals' | 'not_equals' | 'gt' | 'gte' | 'lt' | 'lte';

export interface EligibilityCriterion {
  id: string;
  name: string;
  type: 'number' | 'boolean' | 'string';
  operator: EligibilityOperator;
  expected_value: string | number | boolean;
  /** HR-authored human-readable rule shown to the employee in place of operator/expected. */
  description?: string;
}

export interface SelfReviewField {
  id: string;
  label: string;
  placeholder?: string;
  required?: boolean;
}

/** A row in the reusable Self Review Field library. */
export interface SelfReviewLibraryEntry {
  id: string;
  kind: 'field' | 'bundle';
  key: string;
  category: string;
  label_en: string;
  label_hi: string | null;
  placeholder_en: string | null;
  placeholder_hi: string | null;
  required: boolean;
  is_builtin: boolean;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SelfReviewLibraryBundleItem {
  bundle_id: string;
  field_id: string;
  position: number;
}

export interface TemplateSettings {
  enable_multilingual?: boolean;
  available_languages?: string[];
  default_language?: string;
  /** When true, render a speaker icon next to translated text for read-aloud (Web Speech API). */
  enable_audio?: boolean;
}

/**
 * How template-authored text (criterion name/description, option labels, field
 * labels) is shown to reviewers when a non-default language is active.
 * - `bilingual`        — English / Translated side-by-side (default).
 * - `english_only`     — always show the authored English, ignore translations.
 * - `translated_only`  — show only the translation; fall back to English when missing.
 */
export type TemplateDisplayMode = 'bilingual' | 'english_only' | 'translated_only';

export interface TemplateSections {
  system_scores?: TemplateSystemScore[];
  criteria?: TemplateCriterion[];
  eligibility_criteria?: EligibilityCriterion[];
  self_review_fields?: SelfReviewField[];
  settings?: TemplateSettings;
  translations?: Record<string, Record<string, string>>;
  /** Reviewer-facing label rendering. Defaults to `bilingual` when missing. */
  display_mode?: TemplateDisplayMode;
  /**
   * Optional final-score weight blend (Phase 2). Keys must be a subset of
   * (self|manager|skip_manager|bu_head|hr|system|criteria) and values must
   * sum to 100. When absent the legacy {criteria:100} default applies.
   */
  stage_weights?: Partial<Record<
    'self' | 'manager' | 'skip_manager' | 'dept_head' | 'bu_head' | 'hr' | 'system' | 'criteria',
    number
  >>;
  /**
   * Two-tier final-score config (Phase 3).
   * Outer pools (System vs Criteria, must sum to 100) and a Criteria reviewer
   * mix (per-role weights inside the criteria pool, must sum to 100). When
   * present and valid this drives the derived `stage_weights` snapshot used by
   * the math engine + SQL trigger. Backward compatible: `stage_weights` keeps
   * working when `stage_weights_v2` is absent.
   */
  stage_weights_v2?: {
    pools: { system?: number; criteria?: number };
    criteria_mix: Partial<Record<
      'self' | 'manager' | 'skip_manager' | 'dept_head' | 'bu_head' | 'hr',
      number
    >>;
  };
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
  /**
   * Per-instance enabled stages — subset of the canonical 5-stage chain.
   * Must contain 'self'. Disabled stages are skipped by advance/send-back RPCs.
   * Defaults to all 5 stages on net-new instances.
   */
  enabled_stages: AnnualReviewerRole[];
  manager_id: string | null;
  skip_id: string | null;
  dept_head_id: string | null;
  bu_head_id: string | null;
  hr_id: string | null;
  system_scores: Record<string, number>;
  eligibility_inputs: Record<string, string | number | boolean>;
  criteria_weighted_score: number | null;
  total_score: number | null;
  /** Phase 2 — per-employee final-score weight override. NULL → use template. */
  stage_weights_override?: Partial<Record<
    'self' | 'manager' | 'skip_manager' | 'dept_head' | 'bu_head' | 'hr' | 'system' | 'criteria',
    number
  >> | null;
  final_rating: string | null;
  hr_remarks: string | null;
  language_pref: string;
  finalized_at: string | null;
  finalized_by: string | null;
  acknowledged_at?: string | null;
  acknowledged_by?: string | null;
  employee_rebuttal?: string | null;
  /** Free-text remark recorded by the HR-input submitter; visible to the employee when set. */
  eligibility_remark?: string | null;
  created_at: string;
  updated_at: string;
  /** Assisted submission audit linkage (Phase 3). */
  submitted_via_proxy?: boolean;
  proxy_submission_id?: string | null;
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