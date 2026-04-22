/**
 * rescore-backfilled-submissions
 *
 * One-time data-repair tool. Targets review_submissions rows that were created by
 * the historical PROPAGATION_BACKFILL (Phase A1 / bucket_bc_repair) sweep on
 * 21 Apr 2026. That script copied the parent OKV's achieved_value correctly but
 * hardcoded self_score=0 / self_rating='red' instead of running the real scoring
 * engine. This tool re-runs the engine and corrects the score where it is safe.
 *
 * Skip rules (Submission Snapshot Immutability §88):
 *   - final_score IS NOT NULL                        → frozen, never touch
 *   - manager_score IS NOT NULL                      → reviewer already worked on it
 *   - auditor_score IS NOT NULL                      → reviewer already worked on it
 *   - submitted_at > backfill audit-log timestamp    → employee resubmitted
 *   - new self_score === current self_score          → nothing to change
 *
 * Modes: { dry_run: true }  → preview only
 *        { dry_run: false } → apply + write PROPAGATION_BACKFILL_RESCORE audit rows
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdminUser } from "../_shared/admin-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface KpiRow {
  id: string;
  kpi_name: string;
  criteria: string | null;
  threshold_mode: string | null;
  uom: string | null;
  uom_type: string | null;
  target_value: number | null;
  r5: string | null;
  r4: string | null;
  r3: string | null;
  r2: string | null;
  r1: string | null;
  r0: string | null;
  employee_id: string;
}

interface SubmissionRow {
  id: string;
  kpi_id: string;
  achieved_value: number | null;
  self_score: number | null;
  self_rating: string | null;
  manager_score: number | null;
  auditor_score: number | null;
  hr_pms_score: number | null;
  skip_level_score: number | null;
  management_score: number | null;
  final_score: number | null;
  submitted_at: string | null;
  is_na: boolean | null;
}

function parseNum(val: string | number | null | undefined): number | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") return isNaN(val) ? null : val;
  const cleaned = String(val).trim().replace(/^[><]=?/, "").replace("%", "").replace(",", ".").trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function scoreToRating(score: number): string {
  if (score >= 5) return "blue";
  if (score >= 4) return "green";
  if (score >= 3) return "yellow";
  return "red";
}

/**
 * Engine-equivalent of calculateAbsoluteRating + calculatePercentageRating
 * (Lower-is-Better and Higher-is-Better with optional R0).
 * Returns null if achieved cannot be parsed.
 */
function calculateScore(achievedValue: number | null, kpi: KpiRow): number | null {
  if (achievedValue === null || achievedValue === undefined) return null;
  const r5 = parseNum(kpi.r5);
  const r4 = parseNum(kpi.r4);
  const r3 = parseNum(kpi.r3);
  const r2 = parseNum(kpi.r2);
  const r1 = parseNum(kpi.r1);
  const r0 = parseNum(kpi.r0);

  const isLowerBetter = (kpi.criteria || "").toLowerCase().includes("lower");

  if (isLowerBetter) {
    if (r5 !== null && achievedValue <= r5) return 5;
    if (r4 !== null && achievedValue <= r4) return 4;
    if (r3 !== null && achievedValue <= r3) return 3;
    if (r2 !== null && achievedValue <= r2) return 2;
    if (r1 !== null && achievedValue <= r1) return 1;
    return 0;
  } else {
    if (r5 !== null && achievedValue >= r5) return 5;
    if (r4 !== null && achievedValue >= r4) return 4;
    if (r3 !== null && achievedValue >= r3) return 3;
    if (r2 !== null && achievedValue >= r2) return 2;
    if (r1 !== null && achievedValue >= r1) return 1;
    return 0;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireAdminUser(req);
    if (!auth.authorized || !auth.adminClient) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status ?? 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = auth.adminClient;

    let dryRun = true;
    try {
      const body = await req.json();
      if (body?.dry_run === false) dryRun = false;
    } catch { /* no body */ }

    // 1. Pull every PROPAGATION_BACKFILL audit row (Phase A1)
    const { data: auditRows, error: auditErr } = await supabase
      .from("kpi_audit_logs")
      .select("id, kpi_id, created_at, metadata")
      .eq("action", "PROPAGATION_BACKFILL")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (auditErr) throw auditErr;

    const targets = (auditRows ?? []).filter(
      (r) => (r.metadata as any)?.pass === "phase_a1",
    );

    // Earliest backfill timestamp per kpi_id (used to detect employee resubmits)
    const backfillAtByKpi = new Map<string, string>();
    for (const r of targets) {
      const existing = backfillAtByKpi.get(r.kpi_id);
      if (!existing || r.created_at < existing) backfillAtByKpi.set(r.kpi_id, r.created_at);
    }
    const kpiIds = [...backfillAtByKpi.keys()];

    if (kpiIds.length === 0) {
      return new Response(
        JSON.stringify({
          dry_run: dryRun,
          total_audit_rows: 0,
          eligible: 0,
          rescored: 0,
          skipped: [],
          fixes: [],
          message: "No Phase A1 backfill audit rows found.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Batch-fetch KPIs and submissions
    const kpiMap = new Map<string, KpiRow>();
    for (let i = 0; i < kpiIds.length; i += 500) {
      const batch = kpiIds.slice(i, i + 500);
      const { data, error } = await supabase
        .from("kpis")
        .select("id, kpi_name, criteria, threshold_mode, uom, uom_type, target_value, r5, r4, r3, r2, r1, r0, employee_id")
        .in("id", batch);
      if (error) throw error;
      data?.forEach((k) => kpiMap.set(k.id, k as KpiRow));
    }

    const subMap = new Map<string, SubmissionRow>();
    for (let i = 0; i < kpiIds.length; i += 500) {
      const batch = kpiIds.slice(i, i + 500);
      const { data, error } = await supabase
        .from("review_submissions")
        .select("id, kpi_id, achieved_value, self_score, self_rating, manager_score, auditor_score, hr_pms_score, skip_level_score, management_score, final_score, submitted_at, is_na")
        .in("kpi_id", batch);
      if (error) throw error;
      data?.forEach((s) => subMap.set(s.kpi_id, s as SubmissionRow));
    }

    // Employee names for the report
    const empIds = [...new Set([...kpiMap.values()].map((k) => k.employee_id))];
    const empNameMap = new Map<string, string>();
    for (let i = 0; i < empIds.length; i += 500) {
      const batch = empIds.slice(i, i + 500);
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", batch);
      data?.forEach((p) => empNameMap.set(p.id, p.full_name || ""));
    }

    interface FixEntry {
      kpi_id: string;
      submission_id: string;
      kpi_name: string;
      employee_id: string;
      employee_name: string;
      achieved_value: number | null;
      old_score: number | null;
      old_rating: string | null;
      new_score: number;
      new_rating: string;
      criteria: string;
    }
    interface SkipEntry {
      kpi_id: string;
      kpi_name: string;
      employee_name: string;
      reason: string;
    }

    const fixes: FixEntry[] = [];
    const skipped: SkipEntry[] = [];

    for (const kpiId of kpiIds) {
      const kpi = kpiMap.get(kpiId);
      const sub = subMap.get(kpiId);
      const empName = kpi ? (empNameMap.get(kpi.employee_id) || "Unknown") : "Unknown";
      if (!kpi || !sub) {
        skipped.push({ kpi_id: kpiId, kpi_name: kpi?.kpi_name ?? "(deleted)", employee_name: empName, reason: "kpi_or_submission_missing" });
        continue;
      }

      // §88 Snapshot Immutability — never touch finalized rows
      if (sub.final_score !== null) {
        skipped.push({ kpi_id: kpiId, kpi_name: kpi.kpi_name, employee_name: empName, reason: "final_score_locked" });
        continue;
      }
      // Reviewer already worked on this row
      if (sub.manager_score !== null || sub.auditor_score !== null || sub.hr_pms_score !== null || sub.skip_level_score !== null || sub.management_score !== null) {
        skipped.push({ kpi_id: kpiId, kpi_name: kpi.kpi_name, employee_name: empName, reason: "reviewer_score_present" });
        continue;
      }
      // Employee resubmitted after the backfill
      const backfillAt = backfillAtByKpi.get(kpiId);
      if (sub.submitted_at && backfillAt && sub.submitted_at > backfillAt) {
        skipped.push({ kpi_id: kpiId, kpi_name: kpi.kpi_name, employee_name: empName, reason: "employee_resubmitted_after_backfill" });
        continue;
      }
      // Skip qualitative rows — backfill never used real engine for them either,
      // but they are out of scope for this fix
      const isQualitative = kpi.uom_type === "binary" || kpi.uom_type === "tiered";
      if (isQualitative) {
        skipped.push({ kpi_id: kpiId, kpi_name: kpi.kpi_name, employee_name: empName, reason: "qualitative_uom_out_of_scope" });
        continue;
      }
      // N/A rows — no scoring
      if (sub.is_na) {
        skipped.push({ kpi_id: kpiId, kpi_name: kpi.kpi_name, employee_name: empName, reason: "marked_na" });
        continue;
      }

      const newScore = calculateScore(sub.achieved_value, kpi);
      if (newScore === null) {
        skipped.push({ kpi_id: kpiId, kpi_name: kpi.kpi_name, employee_name: empName, reason: "achieved_value_unparseable" });
        continue;
      }
      const newRating = scoreToRating(newScore);

      // Nothing to do — current score already matches engine
      if (sub.self_score !== null && Math.abs(sub.self_score - newScore) < 0.001 && sub.self_rating === newRating) {
        skipped.push({ kpi_id: kpiId, kpi_name: kpi.kpi_name, employee_name: empName, reason: "already_correct" });
        continue;
      }

      fixes.push({
        kpi_id: kpiId,
        submission_id: sub.id,
        kpi_name: kpi.kpi_name,
        employee_id: kpi.employee_id,
        employee_name: empName,
        achieved_value: sub.achieved_value,
        old_score: sub.self_score,
        old_rating: sub.self_rating,
        new_score: newScore,
        new_rating: newRating,
        criteria: kpi.criteria || "Higher is Better",
      });
    }

    let appliedCount = 0;
    if (!dryRun) {
      for (const fix of fixes) {
        const { error: updErr } = await supabase
          .from("review_submissions")
          .update({
            self_score: fix.new_score,
            self_rating: fix.new_rating,
            updated_at: new Date().toISOString(),
          })
          .eq("id", fix.submission_id);
        if (updErr) {
          console.error(`[rescore] update failed for ${fix.submission_id}:`, updErr.message);
          continue;
        }
        await supabase.from("kpi_audit_logs").insert({
          kpi_id: fix.kpi_id,
          submission_id: fix.submission_id,
          action: "PROPAGATION_BACKFILL_RESCORE",
          performed_by: null,
          old_value: { self_score: fix.old_score, self_rating: fix.old_rating },
          new_value: { self_score: fix.new_score, self_rating: fix.new_rating },
          metadata: {
            tool: "rescore_backfilled_submissions",
            achieved_value: fix.achieved_value,
            criteria: fix.criteria,
            note: "Re-scored Phase A1 backfill row through real engine (was hardcoded 0).",
          },
        });
        appliedCount++;
      }
    }

    return new Response(
      JSON.stringify({
        dry_run: dryRun,
        total_audit_rows: targets.length,
        unique_kpis: kpiIds.length,
        eligible: fixes.length,
        skipped_count: skipped.length,
        applied_count: appliedCount,
        fixes,
        skipped,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[rescore-backfilled-submissions] error:", err);
    return new Response(JSON.stringify({ error: err.message ?? String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});