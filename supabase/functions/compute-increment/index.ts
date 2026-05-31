// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RunBody {
  assessment_year: string;
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
}) {
  const {
    confirmationGranted, confirmationEffective,
    cycleStart, cycleEnd, naiveEligibleMonths,
    previousCycleUncovered, treatment,
  } = input;

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
      };
    case 'shift_next_cycle':
      return {
        treatmentApplied: treatment,
        periodCoveredMonths: covered,
        balanceEligibleMonths: 0,
        carryForwardMonths: 0,
        finalEligibleMonths: 0,
        adjustmentReason: 'Employee shifted to next normal cycle — no increment this AY',
      };
    case 'carry_forward_uncovered':
      return {
        treatmentApplied: treatment,
        periodCoveredMonths: covered,
        balanceEligibleMonths: balance,
        carryForwardMonths: previousCycleUncovered,
        finalEligibleMonths: balance + previousCycleUncovered,
        adjustmentReason: `Balance ${balance}m + carry-forward ${previousCycleUncovered}m from prior cycle`,
      };
    default:
      return {
        treatmentApplied: treatment,
        periodCoveredMonths: covered,
        balanceEligibleMonths: balance,
        carryForwardMonths: 0,
        finalEligibleMonths: balance,
        adjustmentReason: 'Unknown treatment — defaulted to balance',
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

function applyMethod(method: string, basePercent: number, monthsServed: number, customSlabs: any[]): { eligible: number; notes: string } {
  if (basePercent <= 0) return { eligible: 0, notes: 'Base 0' };
  if (method === 'full') return { eligible: basePercent, notes: 'Full' };
  if (method === 'prorated_doj') {
    const m = Math.max(0, Math.min(12, monthsServed));
    return { eligible: +((basePercent / 12) * m).toFixed(4), notes: `Prorated ${m.toFixed(1)}/12` };
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
  { slab: 'category_ids',      emp: 'category_id' },
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

    // Admin client for all subsequent reads/writes
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Create the run record (running)
    const { data: run, error: runErr } = await admin
      .from('increment_runs')
      .insert({
        assessment_year,
        scope_snapshot: { triggered_by: userId },
        triggered_by: userId,
        status: 'running',
      })
      .select()
      .single();
    if (runErr) throw runErr;
    const runId = (run as any).id;

    try {
      // Load configs
      const [annualCfg, methodCfg, generalElig, slabsRes, inputsRes, criteriaConfig, exclusionsRes, profilesRes, confRulesRes, prevAdjRes] = await Promise.all([
        admin.from('annual_score_configs').select('*').eq('assessment_year', assessment_year).eq('status', 'active').maybeSingle(),
        admin.from('increment_method_configs').select('*').eq('assessment_year', assessment_year).eq('status', 'active').maybeSingle(),
        admin.from('general_eligibility_configs').select('*').eq('assessment_year', assessment_year).order('version', { ascending: false }).limit(1).maybeSingle(),
        admin.from('increment_slabs').select('*').eq('assessment_year', assessment_year).eq('status', 'active'),
        admin.from('increment_inputs').select('*').eq('assessment_year', assessment_year),
        admin.from('increment_eligibility_configs').select('id').eq('assessment_year', assessment_year).eq('status', 'approved').maybeSingle(),
        admin.from('increment_eligibility_exclusions').select('employee_id, reason').eq('assessment_year', assessment_year),
        admin.from('profiles').select('id, full_name, employee_id, doj, employment_status, employee_category, level_id, category_id, company_id, is_active, previous_employment_status, confirmation_date, confirmation_increment_granted, confirmation_increment_effective_date').eq('is_active', true),
        admin.from('confirmation_increment_rules').select('*').eq('assessment_year', assessment_year).eq('status', 'active'),
        admin.from('confirmation_increment_adjustments').select('employee_id, carry_forward_months, final_eligible_months, balance_eligible_months').eq('assessment_year', `${parseInt(assessment_year.split('-')[0], 10) - 1}-${String(parseInt(assessment_year.split('-')[0], 10)).slice(-2)}`),
      ]);

      const annualMethod = (annualCfg.data as any)?.method ?? 'avg_all';
      const customMonths: number[] = (annualCfg.data as any)?.custom_months ?? [];
      const methodType = (methodCfg.data as any)?.method ?? 'full';
      let methodSlabs: any[] = [];
      if (methodType === 'custom' && methodCfg.data) {
        const { data } = await admin.from('increment_method_slabs').select('*').eq('method_config_id', (methodCfg.data as any).id).order('sort_order');
        methodSlabs = data ?? [];
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
      const confRules = (confRulesRes.data as any[]) ?? [];
      const prevAdjByEmp = new Map<string, any>();
      ((prevAdjRes.data as any[]) ?? []).forEach((r) => prevAdjByEmp.set(r.employee_id, r));
      const cycleStartISO = `${startYear}-07-01`;
      const cycleEndISO = `${endYear}-06-30`;

      // Load monthly scores for AY: from performance_reviews
      // Fiscal months: Jul startYear .. Jun endYear
      const monthsList = [
        { m: 7, y: startYear }, { m: 8, y: startYear }, { m: 9, y: startYear },
        { m: 10, y: startYear }, { m: 11, y: startYear }, { m: 12, y: startYear },
        { m: 1, y: endYear }, { m: 2, y: endYear }, { m: 3, y: endYear },
        { m: 4, y: endYear }, { m: 5, y: endYear }, { m: 6, y: endYear },
      ];
      // Pull all performance_reviews in this fiscal range
      const periodStrings = monthsList.map(({ m, y }) => {
        const mn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1];
        return { key: `${mn}-${y}`, month: m, year: y };
      });

      const { data: prData } = await admin
        .from('performance_reviews')
        .select('employee_id, review_period, review_year, overall_score, status')
        .in('review_year', [startYear, endYear]);
      const scoresByEmp = new Map<string, Array<{ score: number | null; month: number }>>();
      ((prData as any[]) ?? []).forEach((r) => {
        const periodMonth = periodStrings.find((p) => p.key.startsWith(r.review_period) && p.year === r.review_year);
        if (!periodMonth) return;
        if (!scoresByEmp.has(r.employee_id)) scoresByEmp.set(r.employee_id, []);
        scoresByEmp.get(r.employee_id)!.push({ score: r.overall_score, month: periodMonth.month });
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
      let countEligible = 0, countIneligible = 0, countExcluded = 0, countNoScore = 0;

      for (const p of profiles) {
        // General eligibility gate
        let geFail: string | null = null;
        if (ge) {
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

        // Exclusion bypass
        let eligibility: string = 'eligible';
        let reason: string | null = null;
        if (exclusions.has(p.id)) {
          eligibility = 'excluded';
          reason = exclusionReasons.get(p.id) ?? 'Per-AY exclusion';
        } else if (geFail) {
          eligibility = 'ineligible';
          reason = geFail;
        } else if (input && criteria.length) {
          const metrics: Record<string, number> = {
            absent_days: Number(input.absent_days ?? 0),
            lwp_days: Number(input.lwp_days ?? 0),
            disciplinary_actions: Number(input.disciplinary_actions ?? 0),
            training_compliance: Number(input.training_compliance ?? 0),
            ...((input.dynamic_metrics ?? {}) as Record<string, number>),
          };
          const failed: string[] = [];
          for (const c of criteria) {
            const val = metrics[c.criterion_key];
            if (val === undefined || val === null) continue;
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
        const naiveEligibleMonths = Math.max(0, Math.min(12, monthsServed));
        const treatment = resolveConfirmationRule(confRules, p);
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
        });
        const effectiveMonths = Math.max(0, Math.min(12, adjustment.finalEligibleMonths));

        // Shift-to-next-cycle hard-blocks the increment this AY.
        if (adjustment.treatmentApplied === 'shift_next_cycle' && eligibility === 'eligible') {
          eligibility = 'ineligible';
          reason = adjustment.adjustmentReason;
        }

        if (pmsScore === null) {
          if (eligibility === 'eligible') {
            eligibility = 'no_score';
            reason = 'No PMS score found';
          }
        } else {
          const slab = matchSlab(slabs, pmsScore);
          if (slab) {
            slabPercent = Number(slab.increment_percent);
            ratingBand = `${slab.rating_from}-${slab.rating_to}`;
          }
          if (eligibility === 'eligible' && slab) {
            const effectiveMethod = slab.prorate_on_doj ? methodType : 'full';
            // Hand the adjuster's finalEligibleMonths to the method engine so
            // proration accounts for any confirmation-increment coverage.
            const monthsForMethod = effectiveMethod === 'full' ? monthsServed : effectiveMonths;
            const res = applyMethod(effectiveMethod, slabPercent ?? 0, monthsForMethod, methodSlabs);
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
          case 'excluded': countExcluded++; break;
          case 'no_score': countNoScore++; break;
        }

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
          confirmation_treatment: adjustment.treatmentApplied,
          confirmation_granted: !!p.confirmation_increment_granted,
          confirmation_effective_date: p.confirmation_increment_effective_date ?? null,
          period_covered_months: adjustment.periodCoveredMonths,
          balance_eligible_months: adjustment.balanceEligibleMonths,
          carry_forward_months: adjustment.carryForwardMonths,
          final_eligible_months: adjustment.finalEligibleMonths,
          adjustment_reason: adjustment.adjustmentReason,
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
          excluded: countExcluded,
          no_score: countNoScore,
          method: methodType,
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