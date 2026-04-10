import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BIMONTHLY_CYCLES: Record<string, string[][]> = {
  "Jan-Feb": [["January","February"],["March","April"],["May","June"],["July","August"],["September","October"],["November","December"]],
  "Feb-Mar": [["February","March"],["April","May"],["June","July"],["August","September"],["October","November"],["December","January"]],
};

const QUARTERLY_CYCLES: Record<string, string[][]> = {
  "Jan-Mar": [["January","February","March"],["April","May","June"],["July","August","September"],["October","November","December"]],
  "Apr-Jun": [["April","May","June"],["July","August","September"],["October","November","December"],["January","February","March"]],
};

const MONTH_ORDER = ["January","February","March","April","May","June","July","August","September","October","November","December"];

interface CycleMatch {
  cycle: string[];
  terminalMonth: string;
  terminalYear: number;
  isCrossYear: boolean;
  isTerminal: boolean; // whether the current KPI IS the terminal month
}

function resolveCycle(frequency: string, period: string, reviewYear: number, cycleStart: string | null): CycleMatch | null {
  let allCycles: string[][] | null = null;

  if (frequency === "Bi-Monthly") {
    const key = cycleStart || "Jan-Feb";
    allCycles = BIMONTHLY_CYCLES[key] || BIMONTHLY_CYCLES["Jan-Feb"];
  } else if (frequency === "Quarterly") {
    const key = cycleStart || "Jan-Mar";
    allCycles = QUARTERLY_CYCLES[key] || QUARTERLY_CYCLES["Jan-Mar"];
  }

  if (!allCycles) return null;

  for (const cycle of allCycles) {
    if (!cycle.includes(period)) continue;
    const terminalMonth = cycle[cycle.length - 1];
    const isTerminal = period === terminalMonth;

    const firstMonthIdx = MONTH_ORDER.indexOf(cycle[0]);
    const lastMonthIdx = MONTH_ORDER.indexOf(terminalMonth);
    const cycleWraps = lastMonthIdx < firstMonthIdx;
    const periodIdx = MONTH_ORDER.indexOf(period);

    let isCrossYear = false;
    let terminalYear = reviewYear;

    if (cycleWraps && !isTerminal && periodIdx < firstMonthIdx) {
      // Period is in the "later" year portion (e.g., January in Dec-Jan)
      terminalYear = reviewYear - 1;
      isCrossYear = true;
    }

    return { cycle, terminalMonth, terminalYear, isCrossYear, isTerminal };
  }

  return null;
}

/**
 * Reconstruct submission data from audit log entries for a KPI that was previously approved.
 * Merges data from ORG_KPI_PROPAGATED, MANAGER_FORWARDED, SKIP_LEVEL_FORWARDED,
 * HR_PMS_FORWARDED, ADMIN_DATA_ENTRY_HR_PMS audit entries.
 */
function reconstructSubmissionFromAudit(auditEntries: any[]): Record<string, any> | null {
  const sub: Record<string, any> = {};
  let hasData = false;

  for (const entry of auditEntries) {
    const nv = entry.new_value;
    if (!nv || typeof nv !== 'object') continue;

    switch (entry.action) {
      case 'ORG_KPI_PROPAGATED':
        if (nv.achieved_value !== undefined) sub.achieved_value = nv.achieved_value;
        if (nv.self_score !== undefined) sub.self_score = nv.self_score;
        if (nv.self_rating !== undefined) sub.self_rating = nv.self_rating;
        if (nv.is_na !== undefined) sub.is_na = nv.is_na;
        hasData = true;
        break;
      case 'ADMIN_DATA_ENTRY_HR_PMS':
        // This contains the full submission snapshot — use it as base
        if (nv.self_score !== undefined) sub.self_score = nv.self_score;
        if (nv.self_rating !== undefined) sub.self_rating = nv.self_rating;
        if (nv.self_remarks !== undefined) sub.self_remarks = nv.self_remarks;
        if (nv.achieved_value !== undefined) sub.achieved_value = nv.achieved_value;
        if (nv.hr_pms_score !== undefined) sub.hr_pms_score = nv.hr_pms_score;
        if (nv.hr_pms_rating !== undefined) sub.hr_pms_rating = nv.hr_pms_rating;
        if (nv.hr_pms_remarks !== undefined) sub.hr_pms_remarks = nv.hr_pms_remarks;
        if (nv.is_na !== undefined) sub.is_na = nv.is_na;
        hasData = true;
        break;
      case 'MANAGER_FORWARDED':
        if (nv.manager_score !== undefined) sub.manager_score = nv.manager_score;
        if (nv.manager_rating !== undefined) sub.manager_rating = nv.manager_rating;
        if (nv.manager_remarks !== undefined) sub.manager_remarks = nv.manager_remarks;
        hasData = true;
        break;
      case 'SKIP_LEVEL_FORWARDED':
        if (nv.skip_level_score !== undefined) sub.skip_level_score = nv.skip_level_score;
        if (nv.skip_level_rating !== undefined) sub.skip_level_rating = nv.skip_level_rating;
        if (nv.skip_level_remarks !== undefined) sub.skip_level_remarks = nv.skip_level_remarks;
        hasData = true;
        break;
      case 'HR_PMS_FORWARDED':
        if (nv.hr_pms_score !== undefined) sub.hr_pms_score = nv.hr_pms_score;
        if (nv.hr_pms_rating !== undefined) sub.hr_pms_rating = nv.hr_pms_rating;
        if (nv.hr_pms_remarks !== undefined) sub.hr_pms_remarks = nv.hr_pms_remarks;
        hasData = true;
        break;
      case 'AUDITOR_FORWARDED':
        if (nv.auditor_score !== undefined) sub.auditor_score = nv.auditor_score;
        if (nv.auditor_rating !== undefined) sub.auditor_rating = nv.auditor_rating;
        if (nv.auditor_remarks !== undefined) sub.auditor_remarks = nv.auditor_remarks;
        hasData = true;
        break;
      case 'MANAGEMENT_FORWARDED':
        if (nv.management_score !== undefined) sub.management_score = nv.management_score;
        if (nv.management_rating !== undefined) sub.management_rating = nv.management_rating;
        if (nv.management_remarks !== undefined) sub.management_remarks = nv.management_remarks;
        hasData = true;
        break;
    }
  }

  if (!hasData) return null;

  // Compute final score from the highest-priority reviewer
  const finalScore = sub.hr_pms_score ?? sub.management_score ?? sub.auditor_score ?? sub.skip_level_score ?? sub.manager_score ?? sub.self_score ?? null;
  const finalRating = sub.hr_pms_rating ?? sub.management_rating ?? sub.auditor_rating ?? sub.skip_level_rating ?? sub.manager_rating ?? sub.self_rating ?? null;

  if (finalScore === null) return null;

  sub.final_score = finalScore;
  sub.final_rating = finalRating;

  return sub;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Shared two-client admin auth (CAPA: replaces brittle getClaims pattern)
    const auth = await requireAdminUser(req);
    if (!auth.authorized || !auth.adminClient) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status ?? 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = auth.adminClient;

    // Parse request
    let mode: "scan" | "repair" = "scan";
    let kpiIds: string[] = [];
    let limit = 1500;
    try {
      const body = await req.json();
      if (body?.mode === "repair") mode = "repair";
      if (Array.isArray(body?.kpi_ids)) kpiIds = body.kpi_ids;
      if (body?.limit) limit = Math.min(body.limit, 2000);
    } catch { /* no body */ }

    // === PHASE 1: Find multi-month KPIs at kra_set ===
    const { data: stuckKpis, error: stuckErr } = await supabase
      .from("kpis")
      .select("id, employee_id, kpi_name, kra_name, category_id, review_period, review_year, frequency, frequency_cycle_start, status")
      .eq("status", "kra_set")
      .in("frequency", ["Bi-Monthly", "Quarterly"])
      .gte("review_year", 2026)
      .limit(limit);

    if (stuckErr) throw stuckErr;
    if (!stuckKpis || stuckKpis.length === 0) {
      return new Response(JSON.stringify({
        mode, repaired: 0, skipped: 0, total_checked: 0, errors: [], details: [],
        verification: null, ran_at: new Date().toISOString(),
        message: "No stuck multi-month KPIs found.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let targetKpis = kpiIds.length > 0
      ? stuckKpis.filter(k => kpiIds.includes(k.id))
      : stuckKpis;

    const empIds = [...new Set(targetKpis.map(k => k.employee_id))];

    // Pre-fetch employee profiles
    const empNameMap = new Map<string, string>();
    for (let i = 0; i < empIds.length; i += 500) {
      const batch = empIds.slice(i, i + 500);
      const { data: profiles } = await supabase
        .from("profiles").select("id, full_name").in("id", batch);
      profiles?.forEach(p => empNameMap.set(p.id, p.full_name || "Unknown"));
    }

    // Pre-fetch category names
    const catIds = [...new Set(targetKpis.map(k => k.category_id))];
    const catNameMap = new Map<string, string>();
    for (let i = 0; i < catIds.length; i += 200) {
      const batch = catIds.slice(i, i + 200);
      const { data: cats } = await supabase
        .from("kra_categories").select("id, name").in("id", batch);
      cats?.forEach(c => catNameMap.set(c.id, c.name));
    }

    // Pre-fetch ALL approved siblings (include 2025 for cross-year)
    const approvedSiblings: any[] = [];
    for (let i = 0; i < empIds.length; i += 200) {
      const batch = empIds.slice(i, i + 200);
      const { data: approved } = await supabase
        .from("kpis")
        .select("id, employee_id, kpi_name, kra_name, review_period, review_year, frequency, frequency_cycle_start, status")
        .in("employee_id", batch)
        .eq("status", "approved")
        .in("frequency", ["Bi-Monthly", "Quarterly"])
        .gte("review_year", 2025)
        .limit(5000);
      if (approved) approvedSiblings.push(...approved);
    }

    // Build lookup: employee_id|kpi_name|review_period|review_year → approved KPI
    const approvedMap = new Map<string, any>();
    for (const sib of approvedSiblings) {
      const key = `${sib.employee_id}|${sib.kpi_name}|${sib.review_period}|${sib.review_year}`;
      approvedMap.set(key, sib);
    }

    // Pre-fetch review_submissions for approved sibling KPI IDs
    const approvedKpiIds = approvedSiblings.map(s => s.id);
    const sibSubmissionMap = new Map<string, any>();
    for (let i = 0; i < approvedKpiIds.length; i += 500) {
      const batch = approvedKpiIds.slice(i, i + 500);
      const { data: subs } = await supabase
        .from("review_submissions")
        .select("kpi_id, achieved_value, self_score, self_rating, self_remarks, is_na, manager_score, manager_rating, manager_remarks, auditor_score, auditor_rating, auditor_remarks, management_score, management_rating, management_remarks, skip_level_score, skip_level_rating, skip_level_remarks, hr_pms_score, hr_pms_rating, hr_pms_remarks, final_score, final_rating")
        .in("kpi_id", batch);
      subs?.forEach(s => sibSubmissionMap.set(s.kpi_id, s));
    }

    // Pre-fetch audit logs for terminal KPIs (for self-recovery path)
    // Only fetch for KPIs that had ADMIN_BULK_STEP_BACK
    const targetKpiIds = targetKpis.map(k => k.id);
    const auditMap = new Map<string, any[]>();
    for (let i = 0; i < targetKpiIds.length; i += 500) {
      const batch = targetKpiIds.slice(i, i + 500);
      const { data: audits } = await supabase
        .from("kpi_audit_logs")
        .select("kpi_id, action, new_value, old_value")
        .in("kpi_id", batch)
        .in("action", [
          "ADMIN_BULK_STEP_BACK", "ORG_KPI_PROPAGATED", "ADMIN_DATA_ENTRY_HR_PMS",
          "MANAGER_FORWARDED", "SKIP_LEVEL_FORWARDED", "HR_PMS_FORWARDED",
          "AUDITOR_FORWARDED", "MANAGEMENT_FORWARDED",
        ])
        .order("created_at", { ascending: true })
        .limit(5000);
      if (audits) {
        for (const a of audits) {
          if (!auditMap.has(a.kpi_id)) auditMap.set(a.kpi_id, []);
          auditMap.get(a.kpi_id)!.push(a);
        }
      }
    }

    const details: any[] = [];
    let repairedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (const kpi of targetKpis) {
      try {
        const empName = empNameMap.get(kpi.employee_id) || "Unknown";
        const catName = catNameMap.get(kpi.category_id) || "";

        const match = resolveCycle(kpi.frequency, kpi.review_period, kpi.review_year, kpi.frequency_cycle_start);
        if (!match) {
          skippedCount++;
          details.push({
            kpi_id: kpi.id, kpi_name: kpi.kpi_name, kra_name: kpi.kra_name,
            employee_id: kpi.employee_id, employee_name: empName, category: catName,
            review_period: kpi.review_period, review_year: kpi.review_year,
            terminal_period: null, terminal_year: null, terminal_score: null, terminal_rating: null,
            recovery_type: null, action: "skippable", reason: "no_cycle_match",
          });
          continue;
        }

        const { terminalMonth, terminalYear, isCrossYear, isTerminal } = match;

        // === PATH A: Non-terminal month → recover from terminal sibling ===
        if (!isTerminal) {
          const lookupKey = `${kpi.employee_id}|${kpi.kpi_name}|${terminalMonth}|${terminalYear}`;
          const terminalSibling = approvedMap.get(lookupKey);

          if (!terminalSibling) {
            skippedCount++;
            details.push({
              kpi_id: kpi.id, kpi_name: kpi.kpi_name, kra_name: kpi.kra_name,
              employee_id: kpi.employee_id, employee_name: empName, category: catName,
              review_period: kpi.review_period, review_year: kpi.review_year,
              terminal_period: terminalMonth, terminal_year: terminalYear,
              terminal_score: null, terminal_rating: null,
              recovery_type: isCrossYear ? "cross_year" : "same_year",
              action: "skippable", reason: "terminal_not_approved",
            });
            continue;
          }

          const termSub = sibSubmissionMap.get(terminalSibling.id);
          if (!termSub || termSub.final_score === null) {
            skippedCount++;
            details.push({
              kpi_id: kpi.id, kpi_name: kpi.kpi_name, kra_name: kpi.kra_name,
              employee_id: kpi.employee_id, employee_name: empName, category: catName,
              review_period: kpi.review_period, review_year: kpi.review_year,
              terminal_period: terminalMonth, terminal_year: terminalYear,
              terminal_score: null, terminal_rating: null,
              recovery_type: isCrossYear ? "cross_year" : "same_year",
              action: "skippable", reason: "terminal_no_final_score",
            });
            continue;
          }

          const recoveryType = isCrossYear ? "cross_year" : "same_year";
          const reasonLabel = isCrossYear ? "cross_year_terminal_recoverable" : "same_year_terminal_recoverable";

          if (mode === "scan") {
            details.push({
              kpi_id: kpi.id, kpi_name: kpi.kpi_name, kra_name: kpi.kra_name,
              employee_id: kpi.employee_id, employee_name: empName, category: catName,
              review_period: kpi.review_period, review_year: kpi.review_year,
              terminal_period: terminalMonth, terminal_year: terminalYear,
              terminal_score: termSub.final_score, terminal_rating: termSub.final_rating,
              recovery_type: recoveryType, action: "repairable", reason: reasonLabel,
            });
            repairedCount++;
            continue;
          }

          // REPAIR: copy terminal sibling submission
          const { error: upsertErr } = await supabase.from("review_submissions").upsert({
            kpi_id: kpi.id, achieved_value: termSub.achieved_value,
            self_score: termSub.self_score, self_rating: termSub.self_rating, self_remarks: termSub.self_remarks,
            is_na: termSub.is_na,
            manager_score: termSub.manager_score, manager_rating: termSub.manager_rating, manager_remarks: termSub.manager_remarks,
            auditor_score: termSub.auditor_score, auditor_rating: termSub.auditor_rating, auditor_remarks: termSub.auditor_remarks,
            management_score: termSub.management_score, management_rating: termSub.management_rating, management_remarks: termSub.management_remarks,
            skip_level_score: termSub.skip_level_score, skip_level_rating: termSub.skip_level_rating, skip_level_remarks: termSub.skip_level_remarks,
            hr_pms_score: termSub.hr_pms_score, hr_pms_rating: termSub.hr_pms_rating, hr_pms_remarks: termSub.hr_pms_remarks,
            final_score: termSub.final_score, final_rating: termSub.final_rating,
            kpi_status: "approved",
          }, { onConflict: "kpi_id" });

          if (upsertErr) {
            errors.push(`${kpi.id}: ${upsertErr.message}`);
            details.push({
              kpi_id: kpi.id, kpi_name: kpi.kpi_name, kra_name: kpi.kra_name,
              employee_id: kpi.employee_id, employee_name: empName, category: catName,
              review_period: kpi.review_period, review_year: kpi.review_year,
              terminal_period: terminalMonth, terminal_year: terminalYear,
              terminal_score: termSub.final_score, terminal_rating: termSub.final_rating,
              recovery_type: recoveryType, action: "error", reason: upsertErr.message,
            });
            continue;
          }

          await supabase.from("kpis").update({ status: "approved", updated_at: new Date().toISOString() }).eq("id", kpi.id);
          await supabase.from("kpi_audit_logs").insert({
            kpi_id: kpi.id, action: "SIBLING_RE_PERCOLATION", performed_by: user.id,
            old_value: { status: "kra_set" },
            new_value: { status: "approved", final_score: termSub.final_score, final_rating: termSub.final_rating },
            metadata: { terminal_kpi_id: terminalSibling.id, terminal_period: terminalMonth, terminal_year: terminalYear, recovery_type: recoveryType, repair_tool: "repair-stepped-back-siblings" },
          });

          repairedCount++;
          details.push({
            kpi_id: kpi.id, kpi_name: kpi.kpi_name, kra_name: kpi.kra_name,
            employee_id: kpi.employee_id, employee_name: empName, category: catName,
            review_period: kpi.review_period, review_year: kpi.review_year,
            terminal_period: terminalMonth, terminal_year: terminalYear,
            terminal_score: termSub.final_score, terminal_rating: termSub.final_rating,
            recovery_type: recoveryType, action: "repaired", reason: "sibling_re_percolated",
          });
          continue;
        }

        // === PATH B: Terminal month itself was stepped back → audit-log self-recovery ===
        const kpiAudits = auditMap.get(kpi.id) || [];
        const wasSteppedBack = kpiAudits.some(a => a.action === "ADMIN_BULK_STEP_BACK" && a.old_value?.status === "approved");

        if (!wasSteppedBack) {
          skippedCount++;
          details.push({
            kpi_id: kpi.id, kpi_name: kpi.kpi_name, kra_name: kpi.kra_name,
            employee_id: kpi.employee_id, employee_name: empName, category: catName,
            review_period: kpi.review_period, review_year: kpi.review_year,
            terminal_period: kpi.review_period, terminal_year: kpi.review_year,
            terminal_score: null, terminal_rating: null,
            recovery_type: null, action: "skippable", reason: "is_terminal_month",
          });
          continue;
        }

        // Reconstruct submission from audit entries
        const reconstructed = reconstructSubmissionFromAudit(kpiAudits);
        if (!reconstructed) {
          skippedCount++;
          details.push({
            kpi_id: kpi.id, kpi_name: kpi.kpi_name, kra_name: kpi.kra_name,
            employee_id: kpi.employee_id, employee_name: empName, category: catName,
            review_period: kpi.review_period, review_year: kpi.review_year,
            terminal_period: kpi.review_period, terminal_year: kpi.review_year,
            terminal_score: null, terminal_rating: null,
            recovery_type: "audit_log", action: "skippable", reason: "audit_data_insufficient",
          });
          continue;
        }

        if (mode === "scan") {
          details.push({
            kpi_id: kpi.id, kpi_name: kpi.kpi_name, kra_name: kpi.kra_name,
            employee_id: kpi.employee_id, employee_name: empName, category: catName,
            review_period: kpi.review_period, review_year: kpi.review_year,
            terminal_period: kpi.review_period, terminal_year: kpi.review_year,
            terminal_score: reconstructed.final_score, terminal_rating: reconstructed.final_rating,
            recovery_type: "audit_log", action: "repairable", reason: "audit_log_recoverable",
          });
          repairedCount++;
          continue;
        }

        // REPAIR: create submission from reconstructed audit data
        const { error: upsertErr } = await supabase.from("review_submissions").upsert({
          kpi_id: kpi.id,
          achieved_value: reconstructed.achieved_value ?? null,
          self_score: reconstructed.self_score ?? null, self_rating: reconstructed.self_rating ?? null, self_remarks: reconstructed.self_remarks ?? null,
          is_na: reconstructed.is_na ?? false,
          manager_score: reconstructed.manager_score ?? null, manager_rating: reconstructed.manager_rating ?? null, manager_remarks: reconstructed.manager_remarks ?? null,
          auditor_score: reconstructed.auditor_score ?? null, auditor_rating: reconstructed.auditor_rating ?? null, auditor_remarks: reconstructed.auditor_remarks ?? null,
          management_score: reconstructed.management_score ?? null, management_rating: reconstructed.management_rating ?? null, management_remarks: reconstructed.management_remarks ?? null,
          skip_level_score: reconstructed.skip_level_score ?? null, skip_level_rating: reconstructed.skip_level_rating ?? null, skip_level_remarks: reconstructed.skip_level_remarks ?? null,
          hr_pms_score: reconstructed.hr_pms_score ?? null, hr_pms_rating: reconstructed.hr_pms_rating ?? null, hr_pms_remarks: reconstructed.hr_pms_remarks ?? null,
          final_score: reconstructed.final_score, final_rating: reconstructed.final_rating,
          kpi_status: "approved",
        }, { onConflict: "kpi_id" });

        if (upsertErr) {
          errors.push(`${kpi.id}: ${upsertErr.message}`);
          details.push({
            kpi_id: kpi.id, kpi_name: kpi.kpi_name, kra_name: kpi.kra_name,
            employee_id: kpi.employee_id, employee_name: empName, category: catName,
            review_period: kpi.review_period, review_year: kpi.review_year,
            terminal_period: kpi.review_period, terminal_year: kpi.review_year,
            terminal_score: reconstructed.final_score, terminal_rating: reconstructed.final_rating,
            recovery_type: "audit_log", action: "error", reason: upsertErr.message,
          });
          continue;
        }

        await supabase.from("kpis").update({ status: "approved", updated_at: new Date().toISOString() }).eq("id", kpi.id);
        await supabase.from("kpi_audit_logs").insert({
          kpi_id: kpi.id, action: "SIBLING_RE_PERCOLATION", performed_by: user.id,
          old_value: { status: "kra_set" },
          new_value: { status: "approved", final_score: reconstructed.final_score, final_rating: reconstructed.final_rating },
          metadata: { recovery_type: "audit_log", repair_tool: "repair-stepped-back-siblings", note: "Terminal month self-recovery from audit log data" },
        });

        repairedCount++;
        details.push({
          kpi_id: kpi.id, kpi_name: kpi.kpi_name, kra_name: kpi.kra_name,
          employee_id: kpi.employee_id, employee_name: empName, category: catName,
          review_period: kpi.review_period, review_year: kpi.review_year,
          terminal_period: kpi.review_period, terminal_year: kpi.review_year,
          terminal_score: reconstructed.final_score, terminal_rating: reconstructed.final_rating,
          recovery_type: "audit_log", action: "repaired", reason: "audit_log_restored",
        });
      } catch (e) {
        errors.push(`${kpi.id}: ${e.message}`);
        details.push({
          kpi_id: kpi.id, kpi_name: kpi.kpi_name, kra_name: kpi.kra_name,
          employee_id: kpi.employee_id, employee_name: empNameMap.get(kpi.employee_id) || "Unknown",
          category: catNameMap.get(kpi.category_id) || "",
          review_period: kpi.review_period, review_year: kpi.review_year,
          terminal_period: null, terminal_year: null, terminal_score: null, terminal_rating: null,
          recovery_type: null, action: "error", reason: e.message,
        });
      }
    }

    // === POST-REPAIR VERIFICATION ===
    let verification: { kpis_verified: number; submissions_verified: number; remaining_stuck: number } | null = null;
    if (mode === "repair" && repairedCount > 0) {
      const repairedIds = details.filter(d => d.action === "repaired").map(d => d.kpi_id);

      let kpisVerified = 0;
      if (repairedIds.length > 0) {
        const { data: vKpis } = await supabase
          .from("kpis").select("id").in("id", repairedIds.slice(0, 500)).eq("status", "approved");
        kpisVerified = vKpis?.length ?? 0;
      }

      let subsVerified = 0;
      if (repairedIds.length > 0) {
        const { data: vSubs } = await supabase
          .from("review_submissions").select("kpi_id").in("kpi_id", repairedIds.slice(0, 500));
        subsVerified = vSubs?.length ?? 0;
      }

      const { count: remainingStuck } = await supabase
        .from("kpis")
        .select("id", { count: "exact", head: true })
        .eq("status", "kra_set")
        .in("frequency", ["Bi-Monthly", "Quarterly"])
        .gte("review_year", 2026);

      verification = { kpis_verified: kpisVerified, submissions_verified: subsVerified, remaining_stuck: remainingStuck ?? 0 };
    }

    return new Response(
      JSON.stringify({
        mode, repaired: repairedCount, skipped: skippedCount,
        total_checked: targetKpis.length,
        errors: errors.slice(0, 20), details: details.slice(0, 1500),
        verification, ran_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
