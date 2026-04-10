import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Bi-Monthly cycle definitions keyed by cycle_start.
 * Each entry maps a period to its terminal sibling period.
 */
const BIMONTHLY_CYCLES: Record<string, string[][]> = {
  "Jan-Feb": [["January","February"],["March","April"],["May","June"],["July","August"],["September","October"],["November","December"]],
  "Feb-Mar": [["February","March"],["April","May"],["June","July"],["August","September"],["October","November"],["December","January"]],
};

const QUARTERLY_CYCLES: Record<string, string[][]> = {
  "Jan-Mar": [["January","February","March"],["April","May","June"],["July","August","September"],["October","November","December"]],
  "Apr-Jun": [["April","May","June"],["July","August","September"],["October","November","December"],["January","February","March"]],
};

interface CycleMatch {
  cycle: string[];
  terminalMonth: string;
  /** The year the terminal month falls in relative to the KPI's review_year */
  terminalYear: number;
  /** Whether this is a cross-year recovery (terminal in previous year) */
  isCrossYear: boolean;
}

/**
 * Resolve cycle siblings and compute the terminal month + year.
 * Handles cross-year cycles like Dec-Jan where terminal (December) is in the previous year.
 */
function resolveCycle(frequency: string, period: string, reviewYear: number, cycleStart: string | null): CycleMatch | null {
  let cycles: string[][] | null = null;

  if (frequency === "Bi-Monthly") {
    const key = cycleStart || "Jan-Feb";
    cycles = (BIMONTHLY_CYCLES[key] || BIMONTHLY_CYCLES["Jan-Feb"]) as string[][];
  } else if (frequency === "Quarterly") {
    const key = cycleStart || "Jan-Mar";
    cycles = (QUARTERLY_CYCLES[key] || QUARTERLY_CYCLES["Jan-Mar"]) as string[][];
  }

  if (!cycles) return null;

  for (const cycle of cycles) {
    if (!cycle.includes(period)) continue;
    const terminalMonth = cycle[cycle.length - 1];

    // Determine terminal year: for cross-year cycles (e.g. Dec-Jan with cycle_start "Feb-Mar"),
    // the terminal month (December) is in the previous year relative to January's review_year.
    const MONTH_ORDER = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const periodIdx = MONTH_ORDER.indexOf(period);
    const terminalIdx = MONTH_ORDER.indexOf(terminalMonth);

    // Cross-year detection: if the terminal month's calendar index is GREATER than
    // the current period's index within a wrap-around cycle, the terminal is in the previous year.
    // Example: period=January(0), terminal=December(11) in a Dec-Jan cycle → terminal is previous year.
    // But period=March(2), terminal=April(3) → same year.
    // Key insight: if the cycle wraps (terminal index > period index by a large gap AND
    // the cycle spans across December→January), terminal is in previous year.
    let isCrossYear = false;
    let terminalYear = reviewYear;

    // A cycle wraps when the first month in the cycle has a higher index than the last month
    const firstMonthIdx = MONTH_ORDER.indexOf(cycle[0]);
    const lastMonthIdx = MONTH_ORDER.indexOf(cycle[cycle.length - 1]);
    const cycleWraps = lastMonthIdx < firstMonthIdx;

    if (cycleWraps) {
      // In a wrapping cycle, months before the wrap point are in the later year,
      // months after/at the wrap point are in the earlier year.
      // e.g. cycle ["December","January"]: Dec is in year Y-1, Jan is in year Y
      // The terminal is December, and if our period is January (year Y), terminal is year Y-1
      if (periodIdx < firstMonthIdx) {
        // Period is in the "later" year portion (e.g., January in Dec-Jan)
        // Terminal (December) is in the previous year
        terminalYear = reviewYear - 1;
        isCrossYear = true;
      }
      // If period is in the "earlier" portion (e.g., December), terminal is same year
    }

    return { cycle, terminalMonth, terminalYear, isCrossYear };
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleCheck } = await supabase
      .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Filter to selected IDs if provided
    let targetKpis = kpiIds.length > 0
      ? stuckKpis.filter(k => kpiIds.includes(k.id))
      : stuckKpis;

    // Gather all employee IDs
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

    // Pre-fetch ALL approved siblings for same employees (batch)
    // Include BOTH current year AND previous year to handle cross-year cycles
    const approvedSiblings: any[] = [];
    for (let i = 0; i < empIds.length; i += 200) {
      const batch = empIds.slice(i, i + 200);
      const { data: approved } = await supabase
        .from("kpis")
        .select("id, employee_id, kpi_name, kra_name, review_period, review_year, frequency, frequency_cycle_start, status")
        .in("employee_id", batch)
        .eq("status", "approved")
        .in("frequency", ["Bi-Monthly", "Quarterly"])
        .gte("review_year", 2025) // Include 2025 for cross-year Dec→Jan recovery
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

    const details: any[] = [];
    let repairedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (const kpi of targetKpis) {
      try {
        const empName = empNameMap.get(kpi.employee_id) || "Unknown";
        const catName = catNameMap.get(kpi.category_id) || "";

        // Resolve cycle with cross-year awareness
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

        const { terminalMonth, terminalYear, isCrossYear } = match;

        // Skip if this IS the terminal month
        if (kpi.review_period === terminalMonth && kpi.review_year === terminalYear) {
          skippedCount++;
          details.push({
            kpi_id: kpi.id, kpi_name: kpi.kpi_name, kra_name: kpi.kra_name,
            employee_id: kpi.employee_id, employee_name: empName, category: catName,
            review_period: kpi.review_period, review_year: kpi.review_year,
            terminal_period: terminalMonth, terminal_year: terminalYear,
            terminal_score: null, terminal_rating: null,
            recovery_type: null, action: "skippable", reason: "is_terminal_month",
          });
          continue;
        }

        // Find approved terminal sibling using cross-year-aware key
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

        // Get terminal's submission
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

        // This KPI is repairable
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

        // === REPAIR MODE ===
        // 1. Copy terminal submission data to this KPI
        const { error: upsertErr } = await supabase
          .from("review_submissions")
          .upsert({
            kpi_id: kpi.id,
            achieved_value: termSub.achieved_value,
            self_score: termSub.self_score,
            self_rating: termSub.self_rating,
            self_remarks: termSub.self_remarks,
            is_na: termSub.is_na,
            manager_score: termSub.manager_score,
            manager_rating: termSub.manager_rating,
            manager_remarks: termSub.manager_remarks,
            auditor_score: termSub.auditor_score,
            auditor_rating: termSub.auditor_rating,
            auditor_remarks: termSub.auditor_remarks,
            management_score: termSub.management_score,
            management_rating: termSub.management_rating,
            management_remarks: termSub.management_remarks,
            skip_level_score: termSub.skip_level_score,
            skip_level_rating: termSub.skip_level_rating,
            skip_level_remarks: termSub.skip_level_remarks,
            hr_pms_score: termSub.hr_pms_score,
            hr_pms_rating: termSub.hr_pms_rating,
            hr_pms_remarks: termSub.hr_pms_remarks,
            final_score: termSub.final_score,
            final_rating: termSub.final_rating,
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

        // 2. Advance KPI status to approved
        const { error: statusErr } = await supabase
          .from("kpis")
          .update({ status: "approved", updated_at: new Date().toISOString() })
          .eq("id", kpi.id);

        if (statusErr) {
          errors.push(`${kpi.id}: status update failed: ${statusErr.message}`);
        }

        // 3. Audit log
        await supabase.from("kpi_audit_logs").insert({
          kpi_id: kpi.id,
          action: "SIBLING_RE_PERCOLATION",
          performed_by: user.id,
          old_value: { status: "kra_set" },
          new_value: { status: "approved", final_score: termSub.final_score, final_rating: termSub.final_rating },
          metadata: {
            terminal_kpi_id: terminalSibling.id,
            terminal_period: terminalMonth,
            terminal_year: terminalYear,
            recovery_type: recoveryType,
            repair_tool: "repair-stepped-back-siblings",
          },
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

      verification = {
        kpis_verified: kpisVerified,
        submissions_verified: subsVerified,
        remaining_stuck: remainingStuck ?? 0,
      };
    }

    return new Response(
      JSON.stringify({
        mode,
        repaired: repairedCount,
        skipped: skippedCount,
        total_checked: targetKpis.length,
        errors: errors.slice(0, 20),
        details: details.slice(0, 1500),
        verification,
        ran_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
