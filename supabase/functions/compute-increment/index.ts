// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RunBody {
  assessment_year: string;
  employee_id?: string | null;
  employee_ids?: string[] | null;
}

// ──────────────────────────────────────────────────────────────────────────
// Confirmation Increment Adjuster (inlined for Deno edge runtime).
// Mirrors src/lib/confirmationIncrementAdjuster.ts — keep in sync.
// ──────────────────────────────────────────────────────────────────────────
type ConfirmationTreatment =
  | 'ignore'
  | 'adjust_covered_period'
  | 'shift_next_cycle'
  | 'carry_forward_uncovered';

type ConfirmationTransition =
  | 'trainee_to_confirmed'
  | 'probation_to_confirmed'
  | 'contract_to_confirmed'
  | 'apprenticeship_to_confirmed';

const TRANSITION_LABELS: Record<ConfirmationTransition, string> = {
  trainee_to_confirmed: 'Trainee → Confirmation',
  probation_to_confirmed: 'Probation → Confirmation',
  contract_to_confirmed: 'Contract → Confirmation',
  apprenticeship_to_confirmed: 'Apprenticeship → Confirmation',
};

/** Map a raw pre-confirmation status string → canonical transition key.
 *  Mirrors src/lib/confirmationIncrementAdjuster.ts. */
function statusToTransition(prev: string | null | undefined): ConfirmationTransition | null {
  if (!prev) return null;
  const k = String(prev).trim().toLowerCase();
  if (k === 'trainee') return 'trainee_to_confirmed';
  if (k === 'probation') return 'probation_to_confirmed';
  if (k === 'contract') return 'contract_to_confirmed';
  if (k === 'apprenticeship' || k === 'apprentice') return 'apprenticeship_to_confirmed';
  return null;
}

function monthsBetweenISO(fromISO: string, toISO: string): number {
  if (!fromISO || !toISO) return 0;
  const from = new Date(fromISO + 'T00:00:00Z');
  const to = new Date(toISO + 'T00:00:00Z');
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  if (to <= from) return 0;
  const years = to.getUTCFullYear() - from.getUTCFullYear();
  const months = to.getUTCMonth() - from.getUTCMonth();
  const dayAdj = to.getUTCDate() >= from.getUTCDate() ? 0 : -1;
  return Math.max(0, years * 12 + months + dayAdj);
}

function adjustConfirmationIncrement(input: {
  confirmationGranted: boolean;
  confirmationEffective: string | null;
  cycleStart: string;
  cycleEnd: string;
  naiveEligibleMonths: number;
  previousCycleUncovered: number;
  treatment: ConfirmationTreatment;
  applicableTransitions?: ConfirmationTransition[] | null;
  preConfirmationStatus?: string | null;
}) {
  const {
    confirmationGranted, confirmationEffective,
    cycleStart, cycleEnd, naiveEligibleMonths,
    previousCycleUncovered, treatment,
    applicableTransitions, preConfirmationStatus,
  } = input;

  // RCA: Transition gate. Confirmation Increment Adjustment must only fire
  // when the employee's actual prior status maps to one of the configured
  // applicable transitions. Missing history → skip with a clear reason (the
  // engine must NEVER treat "currently Confirmed" as proof of any prior status).
  const transitionKey = statusToTransition(preConfirmationStatus);
  if (Array.isArray(applicableTransitions) && applicableTransitions.length > 0) {
    if (!transitionKey || !applicableTransitions.includes(transitionKey)) {
      return {
        treatmentApplied: 'ignore' as ConfirmationTreatment,
        periodCoveredMonths: 0,
        balanceEligibleMonths: naiveEligibleMonths,
        carryForwardMonths: 0,
        finalEligibleMonths: naiveEligibleMonths,
        adjustmentReason: transitionKey
          ? `Transition ${TRANSITION_LABELS[transitionKey]} not in rule applicability list — adjustment skipped`
          : preConfirmationStatus
            ? `Pre-confirmation status "${preConfirmationStatus}" not mapped to a configured transition — adjustment skipped`
            : 'Status history missing — adjustment skipped (data gap)',
        transitionKey: transitionKey,
        skipped: true as const,
      };
    }
  }

  if (treatment === 'ignore' || !confirmationGranted || !confirmationEffective) {
    return {
      treatmentApplied: treatment,
      periodCoveredMonths: 0,
      balanceEligibleMonths: naiveEligibleMonths,
      carryForwardMonths: 0,
      finalEligibleMonths: naiveEligibleMonths,
      adjustmentReason: treatment === 'ignore'
        ? 'Policy: ignore confirmation increment'
        : 'No confirmation increment recorded',
      transitionKey,
      skipped: false as const,
    };
  }

  const covered = confirmationEffective <= cycleStart
    ? 0
    : Math.min(
        confirmationEffective >= cycleEnd ? 0 : monthsBetweenISO(confirmationEffective, cycleEnd),
        naiveEligibleMonths,
      );
  const balance = Math.max(0, naiveEligibleMonths - covered);

  switch (treatment) {
    case 'adjust_covered_period':
      return {
        treatmentApplied: treatment,
        periodCoveredMonths: covered,
        balanceEligibleMonths: balance,
        carryForwardMonths: 0,
        finalEligibleMonths: balance,
        adjustmentReason: `Subtracted ${covered} month(s) covered by confirmation increment effective ${confirmationEffective}`,
        transitionKey,
        skipped: false as const,
      };
    case 'shift_next_cycle':
      return {
        treatmentApplied: treatment,
        periodCoveredMonths: covered,
        balanceEligibleMonths: 0,
        carryForwardMonths: 0,
        finalEligibleMonths: 0,
        adjustmentReason: 'Employee shifted to next normal cycle — no increment this AY',
        transitionKey,
        skipped: false as const,
      };
    case 'carry_forward_uncovered':
      return {
        treatmentApplied: treatment,
        periodCoveredMonths: covered,
        balanceEligibleMonths: balance,
        carryForwardMonths: previousCycleUncovered,
        finalEligibleMonths: balance + previousCycleUncovered,
        adjustmentReason: `Balance ${balance}m + carry-forward ${previousCycleUncovered}m from prior cycle`,
        transitionKey,
        skipped: false as const,
      };
    default:
      return {
        treatmentApplied: treatment,
        periodCoveredMonths: covered,
        balanceEligibleMonths: balance,
        carryForwardMonths: 0,
        finalEligibleMonths: balance,
        adjustmentReason: 'Unknown treatment — defaulted to balance',
        transitionKey,
        skipped: false as const,
      };
  }
}

function resolveConfirmationRule(rules: any[], p: any): ConfirmationTreatment {
  // Scope cascade: Level → Category → Company → Global. Most specific wins.
  const score = (r: any) =>
    (r.level_id ? 8 : 0) + (r.category_id ? 4 : 0) + (r.company_id ? 2 : 0);
  const candidates = rules
    .filter((r) =>
      (!r.level_id || r.level_id === p.level_id) &&
      (!r.category_id || r.category_id === p.category_id) &&
      (!r.company_id || r.company_id === p.company_id))
    .sort((a, b) => score(b) - score(a));
  return (candidates[0]?.treatment as ConfirmationTreatment) ?? 'ignore';
}

/** Returns the entire matching rule row (preserving `applicable_transitions`,
 *  scope ids, etc.), or null when no rule matches the employee's scope.
 *  RCA fix: the engine previously kept only `treatment` and silently lost the
 *  transition allow-list, so Trainee→Confirmed treatment was being applied to
 *  every confirmed employee regardless of their actual prior status. */
function resolveConfirmationRuleRow(rules: any[], p: any): any | null {
  const score = (r: any) =>
    (r.level_id ? 8 : 0) + (r.category_id ? 4 : 0) + (r.company_id ? 2 : 0);
  const candidates = rules
    .filter((r) =>
      (!r.level_id || r.level_id === p.level_id) &&
      (!r.category_id || r.category_id === p.category_id) &&
      (!r.company_id || r.company_id === p.company_id))
    .sort((a, b) => score(b) - score(a));
  return candidates[0] ?? null;
}

/** Fiscal year start month is July (7). */
function parseAssessmentYear(ay: string): { startYear: number; endYear: number } {
  // Accept "2024-25" or "2024-2025"
  const [a, b] = ay.split('-');
  const startYear = parseInt(a, 10);
  const endYear = b.length === 2 ? 2000 + parseInt(b, 10) : parseInt(b, 10);
  return { startYear, endYear };
}

function monthsBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, ms / (1000 * 60 * 60 * 24 * 30.4375));
}

/**
 * AY-bounded months served honoring the "Joining Month Cutoff Day" rule.
 * Input date is GDOJ (group date of joining) for the prorated method.
 *
 *   - If GDOJ is after the AY end → 0 months.
 *   - If GDOJ is before the AY start → effectiveStart = AY start (cutoff
 *     irrelevant, decision = 'pre_ay').
 *   - Else: if GDOJ day < cutoff → joining month counted (effectiveStart =
 *     first day of GDOJ month). Otherwise excluded (effectiveStart = first
 *     day of next month).
 *
 * Result is whole-month inclusive, clamped to [0, 12].
 */
export function monthsServedInAY(
  doj: Date,
  cutoffDay: number,
  ayStart: Date,
  ayEnd: Date,
  validationDate: Date,
): { months: number; decision: 'included' | 'excluded' | 'pre_ay' | 'after_ay' } {
  if (doj.getTime() > ayEnd.getTime()) return { months: 0, decision: 'after_ay' };
  let effStart: Date;
  let decision: 'included' | 'excluded' | 'pre_ay';
  if (doj.getTime() < ayStart.getTime()) {
    effStart = new Date(ayStart);
    decision = 'pre_ay';
  } else {
    const joinDay = doj.getDate();
    if (joinDay < cutoffDay) {
      effStart = new Date(doj.getFullYear(), doj.getMonth(), 1);
      decision = 'included';
    } else {
      effStart = new Date(doj.getFullYear(), doj.getMonth() + 1, 1);
      decision = 'excluded';
    }
  }
  const effEnd = validationDate.getTime() < ayEnd.getTime() ? validationDate : ayEnd;
  if (effEnd.getTime() < effStart.getTime()) return { months: 0, decision };
  const months =
    (effEnd.getFullYear() - effStart.getFullYear()) * 12 +
    (effEnd.getMonth() - effStart.getMonth()) +
    1;
  return { months: Math.max(0, Math.min(12, months)), decision };
}

function applyMethod(method: string, basePercent: number, monthsServed: number, customSlabs: any[], proratedNote?: string): { eligible: number; notes: string } {
  if (basePercent <= 0) return { eligible: 0, notes: 'Base 0' };
  if (method === 'full') return { eligible: basePercent, notes: 'Full' };
  if (method === 'prorated_doj') {
    const m = Math.max(0, Math.min(12, monthsServed));
    const base = `Prorated by GDOJ · ${m.toFixed(0)}/12`;
    const notes = proratedNote ? `${base} · ${proratedNote}` : base;
    return { eligible: +((basePercent / 12) * m).toFixed(4), notes };
  }
  // custom
  const slab = customSlabs.find(
    (s) => monthsServed >= Number(s.from_months) && (s.to_months === null || monthsServed <= Number(s.to_months)),
  );
  if (!slab) return { eligible: 0, notes: `No custom slab for ${monthsServed.toFixed(1)}mo` };
  return { eligible: +((basePercent * Number(slab.percent_of_slab)) / 100).toFixed(4), notes: `Custom ${slab.percent_of_slab}%` };
}

function rollUpScores(scores: Array<{ score: number | null; month: number }>, method: string, customMonths: number[]): number | null {
  const valid = scores.filter((s) => s.score !== null && Number.isFinite(s.score));
  let chosen = valid;
  if (method === 'last_6') {
    const fiscalOrder = (m: number) => (m - 7 + 12) % 12;
    chosen = [...valid].sort((a, b) => fiscalOrder(a.month) - fiscalOrder(b.month)).slice(-6);
  } else if (method === 'custom') {
    const set = new Set(customMonths);
    chosen = valid.filter((s) => set.has(s.month));
  }
  if (chosen.length === 0) return null;
  return +(chosen.reduce((a, s) => a + (s.score as number), 0) / chosen.length).toFixed(4);
}

// ──────────────────────────────────────────────────────────────────────────
// Slab matcher (mirror of src/lib/slabMatcher.ts — keep in sync).
// Picks the most-specific applicable slab; ties broken by sort_order, then
// most-recent updated_at.
// ──────────────────────────────────────────────────────────────────────────
const SLAB_DIMS: Array<{ slab: string; emp: string }> = [
  { slab: 'company_ids',       emp: 'company_id' },
  { slab: 'division_ids',      emp: 'division_id' },
  { slab: 'business_unit_ids', emp: 'business_unit_id' },
  { slab: 'location_ids',      emp: 'location_id' },
  { slab: 'employee_category_ids', emp: 'employee_category_id' },
  { slab: 'level_ids',         emp: 'level_id' },
];
function slabApplies(slab: any, emp: any): boolean {
  for (const d of SLAB_DIMS) {
    const scope = Array.isArray(slab[d.slab]) ? slab[d.slab] : [];
    if (scope.length === 0) continue;
    const v = emp[d.emp];
    if (!v || !scope.includes(v)) return false;
  }
  return true;
}
function slabSpec(slab: any): number {
  let n = 0;
  for (const d of SLAB_DIMS) if (Array.isArray(slab[d.slab]) && slab[d.slab].length > 0) n++;
  return n;
}
function pickSlab(slabs: any[], emp: any, score: number): any | null {
  const cands = slabs.filter(
    (s) => score >= Number(s.rating_from) && score <= Number(s.rating_to) && slabApplies(s, emp),
  );
  if (cands.length === 0) return null;
  cands.sort((a, b) => {
    const sa = slabSpec(a), sb = slabSpec(b);
    if (sa !== sb) return sb - sa;
    const oa = a.sort_order ?? 0, ob = b.sort_order ?? 0;
    if (oa !== ob) return oa - ob;
    const ua = a.updated_at ? Date.parse(a.updated_at) : 0;
    const ub = b.updated_at ? Date.parse(b.updated_at) : 0;
    return ub - ua;
  });
  return cands[0];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('VITE_SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('VITE_SUPABASE_PUBLISHABLE_KEY')!;

    // Validate user is admin/hr_pms
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;
    const { data: roleCheck } = await userClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    const roles = (roleCheck ?? []).map((r: any) => r.role);
    if (!roles.some((r) => r === 'admin' || r === 'hr_pms')) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as RunBody;
    if (!body?.assessment_year || !/^\d{4}-\d{2,4}$/.test(body.assessment_year)) {
      return new Response(JSON.stringify({ error: 'assessment_year required (e.g. 2024-25)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { assessment_year } = body;
    const { startYear, endYear } = parseAssessmentYear(assessment_year);

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    // Resolve scope: prefer `employee_ids` array; fall back to legacy
    // `employee_id` single value; otherwise = all employees.
    let scopedEmployeeIds: string[] | null = null;
    if (Array.isArray(body.employee_ids) && body.employee_ids.length > 0) {
      const validated = Array.from(
        new Set(body.employee_ids.filter((x) => typeof x === 'string' && UUID_RE.test(x))),
      );
      if (validated.length === 0) {
        return new Response(JSON.stringify({ error: 'employee_ids must contain at least one UUID' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      scopedEmployeeIds = validated;
    } else if (body.employee_id) {
      if (!UUID_RE.test(body.employee_id)) {
        return new Response(JSON.stringify({ error: 'employee_id must be a UUID' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      scopedEmployeeIds = [body.employee_id];
    }
    const scopedEmployeeId = scopedEmployeeIds && scopedEmployeeIds.length === 1
      ? scopedEmployeeIds[0]
      : null;

    // Admin client for all subsequent reads/writes
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Create the run record (running)
    const scopeSnapshot = !scopedEmployeeIds
      ? { triggered_by: userId, scope: 'all' as const }
      : scopedEmployeeIds.length === 1
        ? { triggered_by: userId, scope: 'single' as const, employee_id: scopedEmployeeIds[0] }
        : { triggered_by: userId, scope: 'multi' as const, employee_ids: scopedEmployeeIds, count: scopedEmployeeIds.length };
    const { data: run, error: runErr } = await admin
      .from('increment_runs')
      .insert({
        assessment_year,
        scope_snapshot: scopeSnapshot,
        triggered_by: userId,
        status: 'running',
      })
      .select()
      .single();
    if (runErr) throw runErr;
    const runId = (run as any).id;

    try {
      // Load configs
      const [annualCfg, methodCfgsRes, generalElig, slabsRes, inputsRes, criteriaConfig, exclusionsRes, profilesRes, confRulesRes, prevAdjRes, deptRes, buRes, divRes, catRes, statusHistoryRes] = await Promise.all([
        admin.from('annual_score_configs').select('*').eq('assessment_year', assessment_year).eq('status', 'active').maybeSingle(),
        // Per-employee scope resolution (RCA ADR-072): fetch ALL active
        // method configs for the AY and pick the most specific match per
        // employee (specificity = number of non-null scope columns; ties
        // broken by version DESC, then created_at DESC). The previous
        // single-row "latest active" query ignored scope entirely and
        // applied one global row to every employee.
        admin.from('increment_method_configs').select('*').eq('assessment_year', assessment_year).eq('status', 'active').order('version', { ascending: false }),
        admin.from('general_eligibility_configs').select('*').eq('assessment_year', assessment_year).order('version', { ascending: false }).limit(1).maybeSingle(),
        admin.from('increment_slabs').select('*').eq('assessment_year', assessment_year).eq('status', 'active'),
        admin.from('increment_inputs').select('*').eq('assessment_year', assessment_year),
        admin.from('increment_eligibility_configs').select('id').eq('assessment_year', assessment_year).eq('status', 'approved').maybeSingle(),
        admin.from('increment_eligibility_exclusions').select('employee_id, reason').eq('assessment_year', assessment_year),
        (scopedEmployeeIds
          ? admin.from('profiles').select('id, full_name, doj, group_doj, employment_status, employee_category, level_id, company_id, location_id, department_id, is_active, previous_employment_status, confirmation_date, confirmation_increment_granted, confirmation_increment_effective_date').eq('is_active', true).in('id', scopedEmployeeIds)
          : admin.from('profiles').select('id, full_name, doj, group_doj, employment_status, employee_category, level_id, company_id, location_id, department_id, is_active, previous_employment_status, confirmation_date, confirmation_increment_granted, confirmation_increment_effective_date').eq('is_active', true)),
        admin.from('confirmation_increment_rules').select('*').eq('assessment_year', assessment_year).eq('status', 'active'),
        admin.from('confirmation_increment_adjustments').select('employee_id, carry_forward_months, final_eligible_months, balance_eligible_months').eq('assessment_year', `${parseInt(assessment_year.split('-')[0], 10) - 1}-${String(parseInt(assessment_year.split('-')[0], 10)).slice(-2)}`),
        admin.from('departments').select('id, business_unit_id'),
        admin.from('business_units').select('id, division_id'),
        admin.from('divisions').select('id'),
        admin.from('employee_categories').select('id, name'),
        // RCA: load every status-history row whose effective date sits on or
        // before the cycle end. The engine picks the latest "→ Confirmed"
        // transition per employee. Falls back to profiles.previous_employment_status
        // when no history row exists (legacy data, before this audit table existed).
        (scopedEmployeeIds
          ? admin.from('employment_status_history').select('employee_id, previous_status, new_status, effective_date').in('employee_id', scopedEmployeeIds).order('effective_date', { ascending: false })
          : admin.from('employment_status_history').select('employee_id, previous_status, new_status, effective_date').order('effective_date', { ascending: false })),
      ]);

      if ((profilesRes as any).error) {
        throw new Error(`Failed to load profiles: ${(profilesRes as any).error.message}`);
      }

      const annualMethod = (annualCfg.data as any)?.method ?? 'avg_all';
      const customMonths: number[] = (annualCfg.data as any)?.custom_months ?? [];
      const methodConfigs = ((methodCfgsRes as any).data as any[]) ?? [];
      if (methodConfigs.length === 0) {
        throw new Error(`No increment method configured for AY ${assessment_year}`);
      }
      // Lazy cache of custom slabs keyed by method_config_id.
      const methodSlabsCache = new Map<string, any[]>();
      async function getMethodSlabs(cfgId: string): Promise<any[]> {
        if (methodSlabsCache.has(cfgId)) return methodSlabsCache.get(cfgId)!;
        const { data } = await admin
          .from('increment_method_slabs')
          .select('*')
          .eq('method_config_id', cfgId)
          .order('sort_order');
        const list = data ?? [];
        methodSlabsCache.set(cfgId, list);
        return list;
      }
      // Per-employee scope resolver. Picks the active config row whose
      // non-null scope columns all match the employee's dimensions, with
      // the highest specificity. Returns null when no row matches.
      function resolveMethodConfig(dims: {
        company_id: string | null;
        division_id: string | null;
        business_unit_id: string | null;
        location_id: string | null;
        employee_category_id: string | null;
        level_id: string | null;
      }): any | null {
        const candidates = methodConfigs.filter((c) =>
          (!c.company_id || c.company_id === dims.company_id) &&
          (!c.division_id || c.division_id === dims.division_id) &&
          (!c.business_unit_id || c.business_unit_id === dims.business_unit_id) &&
          (!c.category_id || c.category_id === dims.employee_category_id) &&
          (!c.level_id || c.level_id === dims.level_id) &&
          (!c.location_id || c.location_id === dims.location_id),
        );
        if (!candidates.length) return null;
        const score = (c: any) =>
          (c.company_id ? 1 : 0) + (c.division_id ? 1 : 0) + (c.business_unit_id ? 1 : 0) +
          (c.category_id ? 1 : 0) + (c.level_id ? 1 : 0) + (c.location_id ? 1 : 0);
        candidates.sort((a, b) => {
          const ds = score(b) - score(a);
          if (ds !== 0) return ds;
          const dv = (Number(b.version) || 0) - (Number(a.version) || 0);
          if (dv !== 0) return dv;
          return String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));
        });
        return candidates[0];
      }
      const ge = (generalElig.data as any) ?? null;
      const slabs = (slabsRes.data as any[]) ?? [];
      const inputsByEmp = new Map<string, any>();
      ((inputsRes.data as any[]) ?? []).forEach((r) => inputsByEmp.set(r.employee_id, r));
      let criteria: any[] = [];
      if (criteriaConfig.data) {
        const { data } = await admin.from('increment_eligibility_criteria').select('*').eq('config_id', (criteriaConfig.data as any).id).eq('is_active', true);
        criteria = data ?? [];
      }
      const exclusions = new Set(((exclusionsRes.data as any[]) ?? []).map((r) => r.employee_id));
      const exclusionReasons = new Map<string, string>();
      ((exclusionsRes.data as any[]) ?? []).forEach((r) => exclusionReasons.set(r.employee_id, r.reason ?? null));
      const profiles = (profilesRes.data as any[]) ?? [];
      // Build dimension resolver maps.
      const deptToBu = new Map<string, string | null>();
      ((deptRes.data as any[]) ?? []).forEach((d) => deptToBu.set(d.id, d.business_unit_id ?? null));
      const buToDiv = new Map<string, string | null>();
      ((buRes.data as any[]) ?? []).forEach((b) => buToDiv.set(b.id, b.division_id ?? null));
      const catNameToId = new Map<string, string>();
      ((catRes.data as any[]) ?? []).forEach((c) => {
        if (c?.name) catNameToId.set(String(c.name).trim().toLowerCase(), c.id);
      });
      function empDims(p: any) {
        const buId = p.department_id ? deptToBu.get(p.department_id) ?? null : null;
        const divId = buId ? buToDiv.get(buId) ?? null : null;
        // Employee Category is stored on profiles as a name (per the
        // employee-category-and-status policy). Resolve to its master ID for
        // slab matching.
        const empCatId = p.employee_category
          ? catNameToId.get(String(p.employee_category).trim().toLowerCase()) ?? null
          : null;
        return {
          company_id: p.company_id ?? null,
          division_id: divId,
          business_unit_id: buId,
          location_id: p.location_id ?? null,
          employee_category_id: empCatId,
          level_id: p.level_id ?? null,
        };
      }
      const confRules = (confRulesRes.data as any[]) ?? [];
      const prevAdjByEmp = new Map<string, any>();
      ((prevAdjRes.data as any[]) ?? []).forEach((r) => prevAdjByEmp.set(r.employee_id, r));
      const cycleStartISO = `${startYear}-07-01`;
      const cycleEndISO = `${endYear}-06-30`;

      // Latest "→ Confirmed" history row per employee, restricted to events on
      // or before the cycle end. Used to detect prior employment status
      // (Trainee/Probation/Contract/Apprenticeship → Confirmed).
      const latestConfirmHistory = new Map<string, { previous_status: string | null; effective_date: string }>();
      ((statusHistoryRes as any)?.data as any[] ?? []).forEach((h: any) => {
        if (!h?.employee_id) return;
        if (String(h.new_status ?? '').trim().toLowerCase() !== 'confirmed') return;
        if (h.effective_date && h.effective_date > cycleEndISO) return;
        // Rows came pre-sorted by effective_date DESC — first hit wins.
        if (!latestConfirmHistory.has(h.employee_id)) {
          latestConfirmHistory.set(h.employee_id, {
            previous_status: h.previous_status ?? null,
            effective_date: h.effective_date,
          });
        }
      });

      // Load monthly scores for AY: derived live from review_submissions + kpis
      // using the canonical 8-stage fallback chain (Final → Management → Auditor
      // → HR PMS → Skip-Level → Manager → Self), weighted-average across
      // non-N/A KPIs by kpis.weightage. Mirrors src/hooks/useEmployeeScoresForPeriod.ts.
      // The `performance_reviews` rollup table is NOT a source — it is unused
      // and empty for all employees in this deployment.
      // Fiscal months: Jul startYear .. Jun endYear
      const monthsList = [
        { m: 7, y: startYear }, { m: 8, y: startYear }, { m: 9, y: startYear },
        { m: 10, y: startYear }, { m: 11, y: startYear }, { m: 12, y: startYear },
        { m: 1, y: endYear }, { m: 2, y: endYear }, { m: 3, y: endYear },
        { m: 4, y: endYear }, { m: 5, y: endYear }, { m: 6, y: endYear },
      ];
      // Map full month name → fiscal month number; kpis.review_period stores
      // the full month name ("September") and kpis.review_year is the year.
      const MONTH_NAMES = [
        'January','February','March','April','May','June',
        'July','August','September','October','November','December',
      ];
      const periodKeyToMonth = new Map<string, number>();
      monthsList.forEach(({ m, y }) => {
        periodKeyToMonth.set(`${MONTH_NAMES[m - 1]}|${y}`, m);
      });

      // Canonical 8-stage fallback chain — must mirror
      // src/hooks/useEmployeeScoresForPeriod.ts exactly.
      const bestScore = (s: any): number | null =>
        s.final_score ?? s.management_score ?? s.auditor_score
        ?? s.hr_pms_score ?? s.skip_level_score ?? s.manager_score
        ?? s.self_score ?? null;

      const employeeIdsForScores = profiles.map((p: any) => p.id);

      // Step A — fetch KPIs (id, employee_id, period, year, weightage) for the
      // fiscal range. Batched 500 employee_ids per the project's batching policy.
      type KpiLite = {
        id: string; employee_id: string;
        review_period: string; review_year: number;
        weightage: number | null;
      };
      const kpiRows: KpiLite[] = [];
      for (let i = 0; i < employeeIdsForScores.length; i += 500) {
        const batch = employeeIdsForScores.slice(i, i + 500);
        if (!batch.length) continue;
        const { data, error } = await admin
          .from('kpis')
          .select('id, employee_id, review_period, review_year, weightage')
          .in('employee_id', batch)
          .in('review_year', [startYear, endYear]);
        if (error) throw error;
        (data as any[] ?? []).forEach((r) => {
          // Only keep KPIs whose (period, year) falls in the fiscal window.
          if (!periodKeyToMonth.has(`${r.review_period}|${r.review_year}`)) return;
          kpiRows.push(r as KpiLite);
        });
      }

      // Step B — fetch submissions for those KPI ids (batched 500).
      const subByKpiId = new Map<string, any>();
      const kpiIds = kpiRows.map((k) => k.id);
      for (let i = 0; i < kpiIds.length; i += 500) {
        const batch = kpiIds.slice(i, i + 500);
        if (!batch.length) continue;
        const { data, error } = await admin
          .from('review_submissions')
          .select('kpi_id, is_na, final_score, management_score, auditor_score, hr_pms_score, skip_level_score, manager_score, self_score')
          .in('kpi_id', batch);
        if (error) throw error;
        (data as any[] ?? []).forEach((s) => subByKpiId.set(s.kpi_id, s));
      }

      // Step C — aggregate to one weighted-average score per (employee, month).
      // Accumulate weightedSum / totalWeight per (empId, monthKey).
      type Acc = { weightedSum: number; totalWeight: number; month: number };
      const acc = new Map<string, Acc>(); // key = `${empId}|${month}`
      for (const k of kpiRows) {
        const month = periodKeyToMonth.get(`${k.review_period}|${k.review_year}`);
        if (!month) continue;
        const sub = subByKpiId.get(k.id);
        if (!sub || sub.is_na) continue;
        const score = bestScore(sub);
        if (score === null || score === undefined) continue;
        const w = Number(k.weightage) || 0;
        if (w <= 0) continue;
        const key = `${k.employee_id}|${month}`;
        const cur = acc.get(key) ?? { weightedSum: 0, totalWeight: 0, month };
        cur.weightedSum += Number(score) * w;
        cur.totalWeight += w;
        acc.set(key, cur);
      }

      const scoresByEmp = new Map<string, Array<{ score: number | null; month: number }>>();
      acc.forEach((v, key) => {
        const empId = key.split('|')[0];
        if (v.totalWeight <= 0) return;
        const monthly = Math.round((v.weightedSum / v.totalWeight) * 10) / 10;
        if (!scoresByEmp.has(empId)) scoresByEmp.set(empId, []);
        scoresByEmp.get(empId)!.push({ score: monthly, month: v.month });
      });

      // Resolve service-anchor date per General Eligibility config.
      // Mirrors src/lib/serviceAnchorDate.ts — keep in sync.
      const anchorMode: 'run_date' | 'ay_end' | 'custom' = (ge?.service_as_on_mode as any) ?? 'ay_end';
      let validationDate: Date;
      if (anchorMode === 'run_date') {
        validationDate = new Date();
      } else if (anchorMode === 'custom' && ge?.service_as_on_date) {
        validationDate = new Date(ge.service_as_on_date);
      } else {
        validationDate = new Date(`${endYear}-06-30`);
      }
      const items: any[] = [];
      const adjustmentRows: any[] = [];
      let countEligible = 0, countIneligible = 0, countNoScore = 0, countCriteriaExempt = 0;
      const methodsAppliedSet = new Set<string>();
      let countNoMethodScope = 0;
      let countConfirmationSkippedNoHistory = 0;

      for (const p of profiles) {
        // Resolve employee category name → master id once, and expose it as
        // p.category_id so downstream gating (general eligibility + confirmation
        // rule cascade) compares against the resolved master id. profiles has
        // no category_id column; category is stored as text in employee_category.
        const dims = empDims(p);
        (p as any).category_id = dims.employee_category_id;
        // Per-employee method resolution (scope-aware). When no config row
        // matches the employee's scope at all, mark the row with a clear
        // remark and skip the increment math — the run itself still
        // completes with the rest of the population.
        const resolvedCfg = resolveMethodConfig(dims);
        const methodType: string = (resolvedCfg as any)?.method ?? 'full';
        const methodSlabs: any[] = resolvedCfg && methodType === 'custom'
          ? await getMethodSlabs((resolvedCfg as any).id)
          : [];
        if (resolvedCfg) methodsAppliedSet.add(methodType);
        // Ineligibility-criteria-exempt list: bypass the disqualification-criteria
        // block ONLY. Employees still flow through PMS-score → slab → increment
        // normally and remain subject to confirmation-increment rules. Every active
        // row in `criteria` is treated generically as an ineligibility rule —
        // breaching any one ⇒ eligibility = 'ineligible', eligible % = 0.
        const isCriteriaExempt = exclusions.has(p.id);
        const exemptionReason = isCriteriaExempt
          ? (exclusionReasons.get(p.id) ?? 'Per-AY criteria exemption')
          : null;
        // General eligibility gate
        let geFail: string | null = null;
        if (ge && !isCriteriaExempt) {
          if (ge.category_ids?.length && p.category_id && !ge.category_ids.includes(p.category_id)) geFail = 'Category not eligible';
          else if (ge.employment_statuses?.length && p.employment_status && !ge.employment_statuses.includes(p.employment_status)) geFail = 'Employment status not eligible';
          else if (ge.level_ids?.length && p.level_id && !ge.level_ids.includes(p.level_id)) geFail = 'Level not eligible';
          else if (ge.min_service_months > 0 && p.doj) {
            const ms = monthsBetween(new Date(p.doj), validationDate);
            if (ms < ge.min_service_months) geFail = `Service < ${ge.min_service_months}mo`;
          }
        }

        const input = inputsByEmp.get(p.id);
        const currentSalary = input?.current_salary ?? null;
        const monthsServed = p.doj ? monthsBetween(new Date(p.doj), validationDate) : 12;

        // Cutoff-aware AY-bounded whole-month count. Uses GDOJ
        // (`profiles.group_doj`) — the prorated method's authoritative join
        // date. Drives Final Eligible Months and custom-slab matching. Falls
        // back to the continuous `monthsServed` when GDOJ is absent.
        const cutoffDayGlobal = Number((resolvedCfg as any)?.joining_month_cutoff_day ?? 15);
        const ayStartGlobal = new Date(`${startYear}-07-01T00:00:00Z`);
        const ayEndGlobal = new Date(`${endYear}-06-30T00:00:00Z`);
        const gdoj: Date | null = (p as any).group_doj ? new Date((p as any).group_doj) : null;
        const ayMonths = gdoj
          ? monthsServedInAY(gdoj, cutoffDayGlobal, ayStartGlobal, ayEndGlobal, validationDate)
          : { months: Math.max(0, Math.min(12, Math.round(monthsServed))), decision: 'pre_ay' as const };
        const cutoffDecisionNote =
          ayMonths.decision === 'included' ? `GDOJ month included (cutoff ${cutoffDayGlobal})`
          : ayMonths.decision === 'excluded' ? `GDOJ month excluded (cutoff ${cutoffDayGlobal})`
          : ayMonths.decision === 'pre_ay' ? `GDOJ before AY — counted from AY start`
          : `GDOJ after AY — 0 months`;

        // Eligibility evaluation. Criteria-exempt employees skip the
        // absent/LWP/disciplinary/training criteria block entirely.
        let eligibility: string = 'eligible';
        let reason: string | null = null;
        if (geFail) {
          eligibility = 'ineligible';
          reason = geFail;
        } else if (input && criteria.length && !isCriteriaExempt) {
          const metrics: Record<string, number> = {
            absent_days: Number(input.absent_days ?? 0),
            lwp_days: Number(input.lwp_days ?? 0),
            disciplinary_actions: Number(input.disciplinary_actions ?? 0),
            training_compliance: Number(input.training_compliance ?? 0),
            ...((input.dynamic_metrics ?? {}) as Record<string, number>),
          };
          // Alias resolver — mirrors src/lib/incrementCriterionMetrics.ts.
          // Admin-edited criterion_keys (e.g. "absent", "lwp",
          // "discipline_action") must still map to the canonical metric so
          // disqualification rules never silently no-op. Unknown keys
          // FAIL CLOSED (mark ineligible) instead of being skipped — this
          // prevents a 20% increment being awarded just because the admin
          // mistyped a key.
          const ALIASES: Record<string, string> = {
            absent: 'absent_days', absent_day: 'absent_days', absence: 'absent_days', absences: 'absent_days', absent_days: 'absent_days',
            lwp: 'lwp_days', lwp_day: 'lwp_days', leave_without_pay: 'lwp_days', lwp_days: 'lwp_days',
            discipline: 'disciplinary_actions', discipline_action: 'disciplinary_actions', disciplinary: 'disciplinary_actions', disciplinary_action: 'disciplinary_actions', disciplinary_actions: 'disciplinary_actions',
            training: 'training_compliance', training_program: 'training_compliance', training_programs: 'training_compliance', training_compliance: 'training_compliance',
          };
          const resolveMetric = (rawKey: string): { key: string | null; val: number | null } => {
            const k = String(rawKey ?? '').trim().toLowerCase();
            if (Object.prototype.hasOwnProperty.call(metrics, k)) return { key: k, val: Number(metrics[k]) };
            const aliased = ALIASES[k];
            if (aliased && Object.prototype.hasOwnProperty.call(metrics, aliased)) {
              return { key: aliased, val: Number(metrics[aliased]) };
            }
            return { key: null, val: null };
          };
          const failed: string[] = [];
          for (const c of criteria) {
            const { key: resolvedKey, val } = resolveMetric(c.criterion_key);
            if (resolvedKey === null || val === null || Number.isNaN(val)) {
              // Fail-closed: the criterion is configured + active but cannot
              // be evaluated against any known input. Surface the misconfig
              // explicitly instead of silently passing the employee.
              failed.push(`Configuration error: criterion '${c.criterion_name}' (key='${c.criterion_key}') is not mapped to any input metric — contact admin`);
              continue;
            }
            const op = c.comparison_operator;
            const t = Number(c.threshold_value);
            let breach = false;
            switch (op) {
              case '>=': breach = val >= t; break;
              case '<=': breach = val <= t; break;
              case '>': breach = val > t; break;
              case '<': breach = val < t; break;
              case '=': breach = val === t; break;
            }
            if (breach) failed.push(`${c.criterion_name} ${op} ${t} (actual ${val})`);
          }
          if (failed.length) {
            eligibility = 'ineligible';
            reason = failed.join('; ');
          }
        }

        const monthly = scoresByEmp.get(p.id) ?? [];
        const pmsScore = monthly.length ? rollUpScores(monthly, annualMethod, customMonths) : null;

        let slabPercent: number | null = null;
        let ratingBand: string | null = null;
        let eligiblePercent = 0;
        let methodNotes = '';
        let incrementAmount: number | null = null;
        let revisedSalary: number | null = null;

        // Resolve confirmation-increment rule and run adjuster (pre-method step).
        // Use the cutoff-aware whole-month count so Final Eligible Months and
        // downstream confirmation math line up with what admins configured.
        const naiveEligibleMonths = ayMonths.months;
        const ruleRow = resolveConfirmationRuleRow(confRules, p);
        const treatment: ConfirmationTreatment =
          (ruleRow?.treatment as ConfirmationTreatment) ?? 'ignore';
        const applicableTransitions: ConfirmationTransition[] | null = Array.isArray(ruleRow?.applicable_transitions)
          ? (ruleRow.applicable_transitions as ConfirmationTransition[])
          : null;

        // Pre-confirmation status resolution order:
        //   1. Latest employment_status_history row whose new_status='Confirmed'.
        //   2. profiles.previous_employment_status snapshot (legacy fallback).
        //   3. null → engine skips with "data gap" reason when the rule has a
        //      non-empty applicability list.
        const historyRow = latestConfirmHistory.get(p.id) ?? null;
        const preConfirmationStatus: string | null =
          historyRow?.previous_status ?? p.previous_employment_status ?? null;
        const transitionSource: 'history' | 'profile_snapshot' | 'none' =
          historyRow ? 'history'
            : p.previous_employment_status ? 'profile_snapshot'
              : 'none';

        const prevAdj = prevAdjByEmp.get(p.id);
        const previousUncovered = Number(prevAdj?.balance_eligible_months ?? 0) > 0
          ? Math.max(0, 12 - Number(prevAdj?.final_eligible_months ?? 12))
          : 0;
        const adjustment = adjustConfirmationIncrement({
          confirmationGranted: !!p.confirmation_increment_granted,
          confirmationEffective: p.confirmation_increment_effective_date ?? null,
          cycleStart: cycleStartISO,
          cycleEnd: cycleEndISO,
          naiveEligibleMonths,
          previousCycleUncovered: previousUncovered,
          treatment,
          applicableTransitions,
          preConfirmationStatus,
        });
        // Telemetry: count employees where the rule wanted to apply but no
        // transition history was available (the most common operational gap).
        if (
          adjustment.skipped &&
          transitionSource === 'none' &&
          Array.isArray(applicableTransitions) &&
          applicableTransitions.length > 0
        ) {
          countConfirmationSkippedNoHistory++;
        }
        const effectiveMonths = Math.max(0, Math.min(12, adjustment.finalEligibleMonths));

        // Shift-to-next-cycle hard-blocks the increment this AY.
        if (adjustment.treatmentApplied === 'shift_next_cycle' && eligibility === 'eligible') {
          eligibility = 'ineligible';
          reason = adjustment.adjustmentReason;
        }

        if (!resolvedCfg) {
          // No method config matches this employee's scope. Skip slab/method
          // math. Preserve any pre-existing ineligibility reason; only
          // override the default 'eligible' state.
          if (eligibility === 'eligible') {
            eligibility = 'no_score';
            reason = 'No increment method configured for employee scope';
          }
          countNoMethodScope++;
        } else if (pmsScore === null) {
          if (eligibility === 'eligible') {
            eligibility = 'no_score';
            reason = 'No PMS score found';
          }
        } else {
          const slab = pickSlab(slabs, dims, pmsScore);
          if (slab) {
            slabPercent = Number(slab.increment_percent);
            ratingBand = `${slab.rating_from}-${slab.rating_to}`;
          }
          if (eligibility === 'eligible' && slab) {
            const effectiveMethod = slab.prorate_on_doj ? methodType : 'full';
            // Hand the adjuster's finalEligibleMonths to the method engine so
            // proration accounts for any confirmation-increment coverage.
            let monthsForMethod = effectiveMethod === 'full' ? ayMonths.months : effectiveMonths;
            let proratedNote: string | undefined;
            if (effectiveMethod === 'prorated_doj') {
              if (!gdoj) {
                // Explicit reason — never silently fall back to DOJ.
                eligibility = 'ineligible';
                reason = 'GDOJ missing for prorated increment calculation';
                eligiblePercent = 0;
                methodNotes = 'Prorated by GDOJ · skipped (GDOJ missing)';
                items.push({
                  run_id: runId,
                  employee_id: p.id,
                  pms_score: pmsScore,
                  rating_band: ratingBand,
                  slab_percent: slabPercent,
                  eligibility_status: eligibility,
                  ineligibility_reason: reason,
                  method_used: null,
                  eligible_percent: null,
                  service_months: +monthsServed.toFixed(2),
                  current_salary: currentSalary,
                  increment_amount: null,
                  revised_salary: null,
                  remarks: input?.remarks ?? null,
                  criteria_exempt: isCriteriaExempt,
                  exemption_reason: exemptionReason,
                  confirmation_treatment: adjustment.treatmentApplied,
                  confirmation_granted: !!p.confirmation_increment_granted,
                  confirmation_effective_date: p.confirmation_increment_effective_date ?? null,
                  period_covered_months: adjustment.periodCoveredMonths,
                  balance_eligible_months: adjustment.balanceEligibleMonths,
                  carry_forward_months: adjustment.carryForwardMonths,
                  final_eligible_months: adjustment.finalEligibleMonths,
                  adjustment_reason: adjustment.adjustmentReason,
                  transition_key: adjustment.transitionKey ?? null,
                  pre_confirmation_status: preConfirmationStatus,
                  transition_source: transitionSource,
                });
                countIneligible++;
                continue;
              }
              // Honour any confirmation-adjustment ceiling already applied.
              monthsForMethod = Math.min(ayMonths.months, effectiveMonths);
              proratedNote = cutoffDecisionNote;
            } else if (effectiveMethod === 'custom') {
              // Custom slab matching uses the cutoff-aware whole-month count.
              monthsForMethod = Math.min(ayMonths.months, effectiveMonths);
              proratedNote = cutoffDecisionNote;
            }
            const res = applyMethod(effectiveMethod, slabPercent ?? 0, monthsForMethod, methodSlabs, proratedNote);
            eligiblePercent = res.eligible;
            methodNotes = res.notes;
            if (currentSalary !== null) {
              incrementAmount = +(currentSalary * (eligiblePercent / 100)).toFixed(2);
              revisedSalary = +(currentSalary + incrementAmount).toFixed(2);
            }
          }
        }

        switch (eligibility) {
          case 'eligible': countEligible++; break;
          case 'ineligible': countIneligible++; break;
          case 'no_score': countNoScore++; break;
        }
        if (isCriteriaExempt) countCriteriaExempt++;

        items.push({
          run_id: runId,
          employee_id: p.id,
          pms_score: pmsScore,
          rating_band: ratingBand,
          slab_percent: slabPercent,
          eligibility_status: eligibility,
          ineligibility_reason: reason,
          method_used: eligibility === 'eligible' ? methodNotes : null,
          eligible_percent: eligibility === 'eligible' ? eligiblePercent : null,
          service_months: +monthsServed.toFixed(2),
          current_salary: currentSalary,
          increment_amount: incrementAmount,
          revised_salary: revisedSalary,
          remarks: input?.remarks ?? null,
          criteria_exempt: isCriteriaExempt,
          exemption_reason: exemptionReason,
          confirmation_treatment: adjustment.treatmentApplied,
          confirmation_granted: !!p.confirmation_increment_granted,
          confirmation_effective_date: p.confirmation_increment_effective_date ?? null,
          period_covered_months: adjustment.periodCoveredMonths,
          balance_eligible_months: adjustment.balanceEligibleMonths,
          carry_forward_months: adjustment.carryForwardMonths,
          final_eligible_months: adjustment.finalEligibleMonths,
          adjustment_reason: adjustment.adjustmentReason,
          transition_key: adjustment.transitionKey ?? null,
          pre_confirmation_status: preConfirmationStatus,
          transition_source: transitionSource,
        });

        adjustmentRows.push({
          employee_id: p.id,
          assessment_year,
          run_id: runId,
          treatment_applied: adjustment.treatmentApplied,
          period_covered_months: adjustment.periodCoveredMonths,
          balance_eligible_months: adjustment.balanceEligibleMonths,
          carry_forward_months: adjustment.carryForwardMonths,
          final_eligible_months: adjustment.finalEligibleMonths,
          adjustment_reason: adjustment.adjustmentReason,
          inputs_snapshot: {
            doj: p.doj,
            confirmation_date: p.confirmation_date,
            confirmation_increment_granted: p.confirmation_increment_granted,
            confirmation_increment_effective_date: p.confirmation_increment_effective_date,
            naive_eligible_months: naiveEligibleMonths,
            previous_cycle_uncovered: previousUncovered,
            cycle_start: cycleStartISO,
            cycle_end: cycleEndISO,
            pre_confirmation_status: preConfirmationStatus,
            transition_key: adjustment.transitionKey ?? null,
            transition_source: transitionSource,
            applicable_transitions: applicableTransitions,
            rule_id: ruleRow?.id ?? null,
            history_effective_date: historyRow?.effective_date ?? null,
            joining_month_cutoff_day: cutoffDayGlobal,
            cutoff_decision: ayMonths.decision,
          },
        });
      }

      // Batched insert (250 per page)
      const BATCH = 250;
      for (let i = 0; i < items.length; i += BATCH) {
        const chunk = items.slice(i, i + BATCH);
        const { error } = await admin.from('increment_run_items').insert(chunk);
        if (error) throw error;
      }

      // Persist immutable adjustment audit rows (best-effort; do not abort run).
      for (let i = 0; i < adjustmentRows.length; i += BATCH) {
        const chunk = adjustmentRows.slice(i, i + BATCH);
        const { error } = await admin.from('confirmation_increment_adjustments').insert(chunk);
        if (error) console.error('confirmation_increment_adjustments insert error', error);
      }

      await admin.from('increment_runs').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        summary: {
          total: items.length,
          eligible: countEligible,
          ineligible: countIneligible,
          no_score: countNoScore,
          criteria_exempt: countCriteriaExempt,
          methods_applied: Array.from(methodsAppliedSet),
          no_method_scope: countNoMethodScope,
          confirmation_skipped_no_history: countConfirmationSkippedNoHistory,
          annual_method: annualMethod,
        },
      }).eq('id', runId);

      return new Response(JSON.stringify({ success: true, run_id: runId, total: items.length }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      await admin.from('increment_runs').update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: String(err?.message ?? err),
      }).eq('id', runId);
      throw err;
    }
  } catch (err: any) {
    console.error('compute-increment error', err);
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});