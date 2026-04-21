import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdminUser } from "../_shared/admin-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    // Parse request body
    let batchLimit = 100;
    let fixNullValues = true;
    let mode:
      | "scan"
      | "repair"
      | "scan_stuck"
      | "repair_stuck"
      | "scan_propagation_failures"
      | "repair_propagation_failures" = "repair";
    let kpiIds: string[] = [];
    let okvIds: string[] = [];
    try {
      const body = await req.json();
      if (body?.limit) batchLimit = Math.min(body.limit, 1500);
      if (body?.fix_null_values === false) fixNullValues = false;
      if (body?.mode === "scan") mode = "scan";
      if (body?.mode === "scan_stuck") mode = "scan_stuck";
      if (body?.mode === "repair_stuck") mode = "repair_stuck";
      if (body?.mode === "scan_propagation_failures") mode = "scan_propagation_failures";
      if (body?.mode === "repair_propagation_failures") mode = "repair_propagation_failures";
      if (Array.isArray(body?.kpi_ids)) kpiIds = body.kpi_ids;
      if (Array.isArray(body?.okv_ids)) okvIds = body.okv_ids;
    } catch { /* no body is fine */ }

    // === STATUS-STUCK PASS ===
    // Signature: kpis.status='kra_set' + is_org_level=true + review_submissions row exists with non-null self_score.
    // The previous repair tool only handled "missing submission" — these rows have the submission but
    // the kpis.status was never advanced to self_review. Single-column UPDATE per row.
    if (mode === "scan_stuck" || mode === "repair_stuck") {
      const { data: stuckKpis, error: stuckErr } = await supabase
        .from("kpis")
        .select("id, category_id, kra_name, kpi_name, review_period, review_year, employee_id")
        .eq("is_org_level", true)
        .eq("status", "kra_set")
        .limit(batchLimit);
      if (stuckErr) throw stuckErr;

      let candidates = stuckKpis ?? [];
      if (kpiIds.length > 0) candidates = candidates.filter(k => kpiIds.includes(k.id));

      const candIds = candidates.map(c => c.id);
      const subsByKpi = new Map<string, { self_score: number | null }>();
      for (let i = 0; i < candIds.length; i += 500) {
        const batch = candIds.slice(i, i + 500);
        const { data: subs } = await supabase
          .from("review_submissions")
          .select("kpi_id, self_score")
          .in("kpi_id", batch);
        subs?.forEach(s => subsByKpi.set(s.kpi_id, { self_score: s.self_score }));
      }

      const empIds2 = [...new Set(candidates.map(c => c.employee_id))];
      const { data: empProfiles2 } = await supabase
        .from("profiles").select("id, full_name").in("id", empIds2);
      const empNameMap2 = new Map<string, string>();
      empProfiles2?.forEach(p => empNameMap2.set(p.id, p.full_name || "Unknown"));

      const catIds2 = [...new Set(candidates.map(c => c.category_id))];
      const { data: cats2 } = await supabase
        .from("kra_categories").select("id, name").in("id", catIds2);
      const catNameMap2 = new Map<string, string>();
      cats2?.forEach(c => catNameMap2.set(c.id, c.name));

      const stuckDetails: any[] = [];
      let stuckRepaired = 0;
      let stuckSkipped = 0;
      const stuckErrors: string[] = [];

      for (const k of candidates) {
        const sub = subsByKpi.get(k.id);
        if (!sub || sub.self_score === null) {
          stuckSkipped++;
          stuckDetails.push({
            kpi_id: k.id, kpi_name: k.kpi_name, kra_name: k.kra_name,
            employee_id: k.employee_id, employee_name: empNameMap2.get(k.employee_id) || "Unknown",
            category: catNameMap2.get(k.category_id) || "",
            review_period: k.review_period, review_year: k.review_year,
            achieved_value: null, self_score: sub?.self_score ?? null, self_rating: null,
            action: "skippable", reason: sub ? "submission_no_score" : "no_submission_row",
          });
          continue;
        }

        if (mode === "scan_stuck") {
          stuckDetails.push({
            kpi_id: k.id, kpi_name: k.kpi_name, kra_name: k.kra_name,
            employee_id: k.employee_id, employee_name: empNameMap2.get(k.employee_id) || "Unknown",
            category: catNameMap2.get(k.category_id) || "",
            review_period: k.review_period, review_year: k.review_year,
            achieved_value: null, self_score: sub.self_score, self_rating: null,
            action: "repairable", reason: "status_stuck_at_kra_set",
          });
          stuckRepaired++;
          continue;
        }

        // repair_stuck: single column update
        const { error: updErr } = await supabase
          .from("kpis")
          .update({ status: "self_review", updated_at: new Date().toISOString() })
          .eq("id", k.id)
          .eq("status", "kra_set");
        if (updErr) {
          stuckErrors.push(`${k.id}: ${updErr.message}`);
          stuckDetails.push({
            kpi_id: k.id, kpi_name: k.kpi_name, kra_name: k.kra_name,
            employee_id: k.employee_id, employee_name: empNameMap2.get(k.employee_id) || "Unknown",
            category: catNameMap2.get(k.category_id) || "",
            review_period: k.review_period, review_year: k.review_year,
            achieved_value: null, self_score: sub.self_score, self_rating: null,
            action: "error", reason: updErr.message,
          });
          continue;
        }
        // Audit log (best-effort)
        await supabase.from("kpi_audit_logs").insert({
          kpi_id: k.id,
          action: "STATUS_STUCK_REPAIR",
          old_value: { status: "kra_set" },
          new_value: { status: "self_review" },
          metadata: { tool: "repair-orphaned-propagations", pass: "status_stuck" },
        });
        stuckRepaired++;
        stuckDetails.push({
          kpi_id: k.id, kpi_name: k.kpi_name, kra_name: k.kra_name,
          employee_id: k.employee_id, employee_name: empNameMap2.get(k.employee_id) || "Unknown",
          category: catNameMap2.get(k.category_id) || "",
          review_period: k.review_period, review_year: k.review_year,
          achieved_value: null, self_score: sub.self_score, self_rating: null,
          action: "repaired", reason: "status_advanced_to_self_review",
        });
      }

      return new Response(JSON.stringify({
        mode,
        repaired: stuckRepaired,
        null_values_fixed: 0,
        skipped: stuckSkipped,
        total_checked: candidates.length,
        errors: stuckErrors.slice(0, 20),
        details: stuckDetails.slice(0, 1500),
        verification: null,
        ran_at: new Date().toISOString(),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // === BUCKET F: PROPAGATION FAILURES ===
    // Signature: org_kpi_values.status='propagated' (or 'approved') BUT zero matching `kpis`
    // rows have advanced past 'kra_set'. The Data Owner clicked Propagate, OKV.status flipped,
    // but the per-employee loop produced no advances (RPC bug — see roadmap Step 3).
    // Repair: reset OKV.status back to 'draft' so DO can re-propagate against the patched RPC.
    if (mode === "scan_propagation_failures" || mode === "repair_propagation_failures") {
      // 1. Pull candidate OKV rows (status='propagated' / 'approved')
      const { data: candidateOkvs, error: okvErr } = await supabase
        .from("org_kpi_values")
        .select("id, category_id, kra_name, kpi_name, review_period, review_year, achieved_value, is_na, status, propagated_at, department_id, employee_id")
        .in("status", ["propagated", "approved"])
        .limit(batchLimit);
      if (okvErr) throw okvErr;

      let okvCandidates = candidateOkvs ?? [];
      if (okvIds.length > 0) okvCandidates = okvCandidates.filter(o => okvIds.includes(o.id));

      // 2. For each OKV, count matching kpis with status != 'kra_set' (i.e. advanced)
      const failureDetails: any[] = [];
      let pfRepaired = 0;
      let pfSkipped = 0;
      const pfErrors: string[] = [];

      // Pre-fetch category names for display
      const okvCatIds = [...new Set(okvCandidates.map(o => o.category_id))];
      const { data: okvCats } = await supabase
        .from("kra_categories").select("id, name").in("id", okvCatIds);
      const okvCatMap = new Map<string, string>();
      okvCats?.forEach(c => okvCatMap.set(c.id, c.name));

      for (const okv of okvCandidates) {
        try {
          // Find matching kpis
          let kpiQ = supabase
            .from("kpis")
            .select("id, status, employee_id", { count: "exact" })
            .eq("category_id", okv.category_id)
            .eq("kra_name", okv.kra_name)
            .eq("kpi_name", okv.kpi_name)
            .eq("review_period", okv.review_period)
            .eq("review_year", okv.review_year)
            .eq("is_org_level", true);
          const { data: matchKpis, count: totalKpis } = await kpiQ;

          const detected = matchKpis?.length ?? 0;
          const advanced = (matchKpis ?? []).filter(k => k.status !== "kra_set").length;

          // Failure condition: detected > 0 AND advanced === 0
          if (detected === 0 || advanced > 0) {
            pfSkipped++;
            failureDetails.push({
              kpi_id: okv.id,
              kpi_name: okv.kpi_name,
              kra_name: okv.kra_name,
              employee_id: okv.employee_id ?? "",
              employee_name: detected === 0 ? "(no matching KPIs)" : `(${advanced}/${detected} advanced — healthy)`,
              category: okvCatMap.get(okv.category_id) || "",
              review_period: okv.review_period,
              review_year: okv.review_year,
              achieved_value: okv.achieved_value,
              self_score: null,
              self_rating: null,
              action: "skippable",
              reason: detected === 0 ? "no_matching_kpis" : "partial_advance_healthy",
            });
            continue;
          }

          // Genuine Bucket F failure
          if (mode === "scan_propagation_failures") {
            failureDetails.push({
              kpi_id: okv.id,
              kpi_name: okv.kpi_name,
              kra_name: okv.kra_name,
              employee_id: okv.employee_id ?? "",
              employee_name: `${detected} employees, 0 advanced`,
              category: okvCatMap.get(okv.category_id) || "",
              review_period: okv.review_period,
              review_year: okv.review_year,
              achieved_value: okv.achieved_value,
              self_score: null,
              self_rating: null,
              action: "repairable",
              reason: "propagation_failure_zero_advance",
            });
            pfRepaired++;
            continue;
          }

          // repair_propagation_failures: reset OKV to draft
          const { error: resetErr } = await supabase
            .from("org_kpi_values")
            .update({
              status: "draft",
              propagated_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", okv.id)
            .in("status", ["propagated", "approved"]);

          if (resetErr) {
            pfErrors.push(`${okv.id}: ${resetErr.message}`);
            failureDetails.push({
              kpi_id: okv.id,
              kpi_name: okv.kpi_name,
              kra_name: okv.kra_name,
              employee_id: okv.employee_id ?? "",
              employee_name: `${detected} employees, 0 advanced`,
              category: okvCatMap.get(okv.category_id) || "",
              review_period: okv.review_period,
              review_year: okv.review_year,
              achieved_value: okv.achieved_value,
              self_score: null,
              self_rating: null,
              action: "error",
              reason: resetErr.message,
            });
            continue;
          }

          // Audit log on the OKV's matching KPIs (so it surfaces in KpiTimeline)
          const auditEntries = (matchKpis ?? []).slice(0, 50).map(k => ({
            kpi_id: k.id,
            action: "PROPAGATION_FAILURE_RESET",
            old_value: { okv_status: okv.status },
            new_value: { okv_status: "draft" },
            metadata: {
              tool: "repair-orphaned-propagations",
              pass: "propagation_failures",
              okv_id: okv.id,
              detected_employees: detected,
              advanced: 0,
              note: "OKV reset to draft so Data Owner can re-propagate against patched RPC",
            },
          }));
          if (auditEntries.length > 0) {
            await supabase.from("kpi_audit_logs").insert(auditEntries);
          }

          pfRepaired++;
          failureDetails.push({
            kpi_id: okv.id,
            kpi_name: okv.kpi_name,
            kra_name: okv.kra_name,
            employee_id: okv.employee_id ?? "",
            employee_name: `${detected} employees reset`,
            category: okvCatMap.get(okv.category_id) || "",
            review_period: okv.review_period,
            review_year: okv.review_year,
            achieved_value: okv.achieved_value,
            self_score: null,
            self_rating: null,
            action: "repaired",
            reason: "okv_reset_to_draft",
          });
        } catch (e) {
          pfErrors.push(`${okv.id}: ${(e as Error).message}`);
          failureDetails.push({
            kpi_id: okv.id,
            kpi_name: okv.kpi_name,
            kra_name: okv.kra_name,
            employee_id: okv.employee_id ?? "",
            employee_name: "",
            category: okvCatMap.get(okv.category_id) || "",
            review_period: okv.review_period,
            review_year: okv.review_year,
            achieved_value: okv.achieved_value,
            self_score: null,
            self_rating: null,
            action: "error",
            reason: (e as Error).message,
          });
        }
      }

      return new Response(JSON.stringify({
        mode,
        repaired: pfRepaired,
        null_values_fixed: 0,
        skipped: pfSkipped,
        total_checked: okvCandidates.length,
        errors: pfErrors.slice(0, 20),
        details: failureDetails.slice(0, 1500),
        verification: null,
        ran_at: new Date().toISOString(),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // === PHASE 1: Fix NULL-value org_kpi_values marked as propagated ===
    let nullFixedCount = 0;
    if (mode === "repair" && fixNullValues) {
      const { data: nullRows, error: nullErr } = await supabase
        .from("org_kpi_values")
        .select("id")
        .is("achieved_value", null)
        .eq("is_na", false)
        .in("status", ["propagated", "approved"])
        .limit(200);

      if (!nullErr && nullRows && nullRows.length > 0) {
        const nullIds = nullRows.map(r => r.id);
        const { error: resetErr } = await supabase
          .from("org_kpi_values")
          .update({ status: "entered", updated_at: new Date().toISOString() })
          .in("id", nullIds);
        if (!resetErr) nullFixedCount = nullIds.length;
      }
    }

    // === PHASE 2: Find orphaned KPIs ===
    const { data: orphanedKpis, error: kpiError } = await supabase
      .from("kpis")
      .select("id, category_id, kra_name, kpi_name, review_period, review_year, employee_id, target_value, weightage, r5, r4, r3, r2, r1, r0, criteria, uom, uom_type, qualitative_options, threshold_mode")
      .eq("is_org_level", true)
      .eq("status", "kra_set")
      .limit(batchLimit);

    if (kpiError) throw kpiError;
    if (!orphanedKpis || orphanedKpis.length === 0) {
      return new Response(JSON.stringify({
        repaired: 0, null_values_fixed: nullFixedCount, skipped: 0, total_checked: 0, errors: [], details: [],
        message: nullFixedCount > 0 ? `Fixed ${nullFixedCount} NULL-value entries` : "No orphaned records found"
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Filter to selected IDs if provided
    let targetKpis = orphanedKpis;
    if (kpiIds.length > 0) {
      targetKpis = orphanedKpis.filter(k => kpiIds.includes(k.id));
    }

    // Pre-fetch employee profiles (with full_name)
    const empIds = [...new Set(targetKpis.map(k => k.employee_id))];
    const { data: empProfiles } = await supabase
      .from("profiles")
      .select("id, department_id, full_name")
      .in("id", empIds);
    const empDeptMap = new Map<string, string | null>();
    const empNameMap = new Map<string, string>();
    empProfiles?.forEach(p => {
      empDeptMap.set(p.id, p.department_id);
      empNameMap.set(p.id, p.full_name || "Unknown");
    });

    // Pre-fetch category names
    const catIds = [...new Set(targetKpis.map(k => k.category_id))];
    const { data: categories } = await supabase
      .from("kra_categories")
      .select("id, name")
      .in("id", catIds);
    const catNameMap = new Map<string, string>();
    categories?.forEach(c => catNameMap.set(c.id, c.name));

    // === BATCH PRE-FETCH: review_submissions ===
    const allKpiIds = targetKpis.map(k => k.id);
    const existingSubSet = new Set<string>();
    for (let i = 0; i < allKpiIds.length; i += 500) {
      const batch = allKpiIds.slice(i, i + 500);
      const { data: subs } = await supabase
        .from("review_submissions")
        .select("kpi_id")
        .in("kpi_id", batch);
      subs?.forEach(s => existingSubSet.add(s.kpi_id));
    }

    // === BATCH PRE-FETCH: org_kpi_values ===
    const uniqueCatIds = [...new Set(targetKpis.map(k => k.category_id))];
    const uniquePeriods = [...new Set(targetKpis.map(k => k.review_period))];
    const uniqueYears = [...new Set(targetKpis.map(k => k.review_year))];
    const allOrgValues: any[] = [];
    for (let i = 0; i < uniqueCatIds.length; i += 100) {
      const catBatch = uniqueCatIds.slice(i, i + 100);
      const { data: ovBatch } = await supabase
        .from("org_kpi_values")
        .select("category_id, kra_name, kpi_name, review_period, review_year, achieved_value, is_na, remarks, employee_id, department_id")
        .in("category_id", catBatch)
        .in("review_period", uniquePeriods)
        .in("review_year", uniqueYears)
        .in("status", ["propagated", "approved", "entered"])
        .limit(5000);
      if (ovBatch) allOrgValues.push(...ovBatch);
    }

    // Build lookup maps for org_kpi_values
    const orgExactMap = new Map<string, any[]>();
    const orgFallbackMap = new Map<string, any[]>();
    for (const ov of allOrgValues) {
      const exactKey = `${ov.category_id}|${ov.kra_name}|${ov.kpi_name}|${ov.review_period}|${ov.review_year}`;
      if (!orgExactMap.has(exactKey)) orgExactMap.set(exactKey, []);
      orgExactMap.get(exactKey)!.push(ov);

      const fallbackKey = `${ov.category_id}|${ov.kra_name}|${ov.review_period}|${ov.review_year}`;
      if (!orgFallbackMap.has(fallbackKey)) orgFallbackMap.set(fallbackKey, []);
      orgFallbackMap.get(fallbackKey)!.push(ov);
    }

    const details: any[] = [];
    let repairedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (const kpi of targetKpis) {
      try {
        const empName = empNameMap.get(kpi.employee_id) || "Unknown";
        const catName = catNameMap.get(kpi.category_id) || "";

        // Check if review_submission already exists (from pre-fetched Set)
        if (existingSubSet.has(kpi.id)) {
          skippedCount++;
          details.push({
            kpi_id: kpi.id, kpi_name: kpi.kpi_name, kra_name: kpi.kra_name,
            employee_id: kpi.employee_id, employee_name: empName, category: catName,
            review_period: kpi.review_period, review_year: kpi.review_year,
            achieved_value: null, self_score: null, self_rating: null,
            action: "skippable", reason: "submission_exists",
          });
          continue;
        }

        // Find matching org_kpi_value (from pre-fetched Maps)
        const exactKey = `${kpi.category_id}|${kpi.kra_name}|${kpi.kpi_name}|${kpi.review_period}|${kpi.review_year}`;
        let orgValues = orgExactMap.get(exactKey) || null;

        if (!orgValues || orgValues.length === 0) {
          const fallbackKey = `${kpi.category_id}|${kpi.kra_name}|${kpi.review_period}|${kpi.review_year}`;
          orgValues = orgFallbackMap.get(fallbackKey) || null;
        }

        if (!orgValues || orgValues.length === 0) {
          skippedCount++;
          details.push({
            kpi_id: kpi.id, kpi_name: kpi.kpi_name, kra_name: kpi.kra_name,
            employee_id: kpi.employee_id, employee_name: empName, category: catName,
            review_period: kpi.review_period, review_year: kpi.review_year,
            achieved_value: null, self_score: null, self_rating: null,
            action: "skippable", reason: "no_org_value",
          });
          continue;
        }

        // Match priority
        const empDeptId = empDeptMap.get(kpi.employee_id);
        const matchingValue =
          orgValues.find(v => v.employee_id === kpi.employee_id) ||
          (empDeptId ? orgValues.find(v => v.department_id === empDeptId && !v.employee_id) : null) ||
          orgValues.find(v => v.employee_id === null && v.department_id === null) ||
          orgValues[0];
        if (!matchingValue) {
          skippedCount++;
          details.push({
            kpi_id: kpi.id, kpi_name: kpi.kpi_name, kra_name: kpi.kra_name,
            employee_id: kpi.employee_id, employee_name: empName, category: catName,
            review_period: kpi.review_period, review_year: kpi.review_year,
            achieved_value: null, self_score: null, self_rating: null,
            action: "skippable", reason: "no_matching_value",
          });
          continue;
        }
        if (matchingValue.achieved_value === null && !matchingValue.is_na) {
          skippedCount++;
          details.push({
            kpi_id: kpi.id, kpi_name: kpi.kpi_name, kra_name: kpi.kra_name,
            employee_id: kpi.employee_id, employee_name: empName, category: catName,
            review_period: kpi.review_period, review_year: kpi.review_year,
            achieved_value: null, self_score: null, self_rating: null,
            action: "skippable", reason: "null_achieved_value",
          });
          continue;
        }

        // Calculate score
        let selfScore: number | null = null;
        let selfRating: string | null = null;
        if (!matchingValue.is_na) {
          const uomType = kpi.uom_type || "numeric";
          const isBinaryOrTiered = uomType === "binary" ||
            (uomType === "tiered" && Array.isArray(kpi.qualitative_options) && (kpi.qualitative_options as any[]).length > 0);
          if (isBinaryOrTiered) {
            selfScore = matchingValue.achieved_value ?? 0;
          } else {
            selfScore = calculateRating(
              matchingValue.achieved_value, kpi.target_value,
              { r5: kpi.r5, r4: kpi.r4, r3: kpi.r3, r2: kpi.r2, r1: kpi.r1, r0: kpi.r0 },
              kpi.criteria || "Higher is Better", kpi.threshold_mode || "absolute"
            );
          }
          selfRating = scoreToRating(selfScore);
        }

        // In SCAN mode: just report, don't modify
        if (mode === "scan") {
          details.push({
            kpi_id: kpi.id, kpi_name: kpi.kpi_name, kra_name: kpi.kra_name,
            employee_id: kpi.employee_id, employee_name: empName, category: catName,
            review_period: kpi.review_period, review_year: kpi.review_year,
            achieved_value: matchingValue.achieved_value,
            self_score: selfScore, self_rating: selfRating,
            action: "repairable", reason: "missing_submission",
          });
          repairedCount++;
          continue;
        }

        // REPAIR mode: insert and update
        const { error: insertError } = await supabase
          .from("review_submissions")
          .upsert({
            kpi_id: kpi.id,
            achieved_value: matchingValue.achieved_value,
            self_score: selfScore,
            self_rating: selfRating,
            is_na: matchingValue.is_na,
            self_remarks: matchingValue.remarks,
          }, { onConflict: "kpi_id" });

        if (insertError) {
          errors.push(`${kpi.id}: ${insertError.message}`);
          details.push({
            kpi_id: kpi.id, kpi_name: kpi.kpi_name, kra_name: kpi.kra_name,
            employee_id: kpi.employee_id, employee_name: empName, category: catName,
            review_period: kpi.review_period, review_year: kpi.review_year,
            achieved_value: matchingValue.achieved_value,
            self_score: selfScore, self_rating: selfRating,
            action: "error", reason: insertError.message,
          });
          continue;
        }

        await supabase
          .from("kpis")
          .update({ status: "self_review", updated_at: new Date().toISOString() })
          .eq("id", kpi.id)
          .eq("status", "kra_set");

        repairedCount++;
        details.push({
          kpi_id: kpi.id, kpi_name: kpi.kpi_name, kra_name: kpi.kra_name,
          employee_id: kpi.employee_id, employee_name: empName, category: catName,
          review_period: kpi.review_period, review_year: kpi.review_year,
          achieved_value: matchingValue.achieved_value,
          self_score: selfScore, self_rating: selfRating,
          action: "repaired", reason: "submission_created",
        });
      } catch (e) {
        errors.push(`${kpi.id}: ${e.message}`);
        details.push({
          kpi_id: kpi.id, kpi_name: kpi.kpi_name, kra_name: kpi.kra_name,
          employee_id: kpi.employee_id, employee_name: empNameMap.get(kpi.employee_id) || "Unknown",
          category: catNameMap.get(kpi.category_id) || "",
          review_period: kpi.review_period, review_year: kpi.review_year,
          achieved_value: null, self_score: null, self_rating: null,
          action: "error", reason: e.message,
        });
      }
    }

    // === POST-REPAIR VERIFICATION (only in repair mode with actual repairs) ===
    let verification: { kpis_verified: number; submissions_verified: number; remaining_orphans: number } | null = null;
    if (mode === "repair" && repairedCount > 0) {
      const repairedIds = details
        .filter(d => d.action === "repaired")
        .map(d => d.kpi_id);

      // Check 1: Verify repaired KPIs moved to self_review
      let kpisVerified = 0;
      if (repairedIds.length > 0) {
        const { data: verifiedKpis } = await supabase
          .from("kpis")
          .select("id")
          .in("id", repairedIds.slice(0, 200))
          .eq("status", "self_review");
        kpisVerified = verifiedKpis?.length ?? 0;
      }

      // Check 2: Verify review_submissions exist
      let subsVerified = 0;
      if (repairedIds.length > 0) {
        const { data: verifiedSubs } = await supabase
          .from("review_submissions")
          .select("kpi_id")
          .in("kpi_id", repairedIds.slice(0, 200));
        subsVerified = verifiedSubs?.length ?? 0;
      }

      // Check 3: Count remaining orphans
      const { count: remainingOrphans } = await supabase
        .from("kpis")
        .select("id", { count: "exact", head: true })
        .eq("is_org_level", true)
        .eq("status", "kra_set");

      verification = {
        kpis_verified: kpisVerified,
        submissions_verified: subsVerified,
        remaining_orphans: remainingOrphans ?? 0,
      };
    }

    return new Response(
      JSON.stringify({
        mode,
        repaired: repairedCount,
        null_values_fixed: nullFixedCount,
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

function scoreToRating(score: number): string {
  if (score >= 5) return "blue";
  if (score >= 4) return "green";
  if (score >= 3) return "yellow";
  return "red";
}

function calculateRating(
  achievedValue: number | null, targetValue: number | null,
  thresholds: { r5: string | null; r4: string | null; r3: string | null; r2: string | null; r1: string | null; r0: string | null },
  criteria: string, thresholdMode: string
): number {
  if (achievedValue === null || targetValue === null) return 0;
  const parse = (val: string | null): number | null => {
    if (!val) return null;
    const n = parseFloat(val.replace("%", ""));
    return isNaN(n) ? null : n;
  };
  const toAbs = (v: number | null): number | null => {
    if (v === null) return null;
    return thresholdMode === "percentage" ? targetValue * (v / 100) : v;
  };
  const r5 = toAbs(parse(thresholds.r5));
  const r4 = toAbs(parse(thresholds.r4));
  const r3 = toAbs(parse(thresholds.r3));
  const r2 = toAbs(parse(thresholds.r2));
  const r1 = toAbs(parse(thresholds.r1));

  if (criteria === "Lower is Better") {
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
