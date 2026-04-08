import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Score levels to fix
const SCORE_LEVELS = [
  { scoreCol: "self_score", ratingCol: "self_rating" },
  { scoreCol: "manager_score", ratingCol: "manager_rating" },
  { scoreCol: "skip_level_score", ratingCol: "skip_level_rating" },
  { scoreCol: "hr_pms_score", ratingCol: "hr_pms_rating" },
  { scoreCol: "auditor_score", ratingCol: "auditor_rating" },
  { scoreCol: "management_score", ratingCol: "management_rating" },
  { scoreCol: "final_score", ratingCol: "final_rating" },
] as const;

function scoreToRating(score: number): string {
  if (score >= 5) return "blue";
  if (score >= 4) return "green";
  if (score >= 3) return "yellow";
  return "red";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Validate caller is admin (mandatory)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    if (token !== serviceKey) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!roleData) {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run !== false; // Default to dry_run=true for safety
    const performedBy = body.performed_by || null;

    // ===== PHASE 1: Binary KPIs where achieved_value = 5 but score = 0 =====
    // These are unambiguous - the achieved value IS the rating
    const { data: phase1Records, error: p1Err } = await supabase
      .from("review_submissions")
      .select(`
        id, kpi_id, achieved_value,
        self_score, self_rating,
        manager_score, manager_rating,
        skip_level_score, skip_level_rating,
        hr_pms_score, hr_pms_rating,
        auditor_score, auditor_rating,
        management_score, management_rating,
        final_score, final_rating,
        kpis!inner(id, kpi_name, kra_name, employee_id, uom_type, review_period, review_year)
      `)
      .eq("kpis.uom_type", "binary")
      .eq("achieved_value", 5);

    if (p1Err) throw new Error(`Phase 1 query failed: ${p1Err.message}`);

    const phase1Fixes: Array<{
      submission_id: string;
      kpi_id: string;
      kpi_name: string;
      employee_id: string;
      level: string;
      old_score: number;
      new_score: number;
    }> = [];

    for (const row of phase1Records || []) {
      const kpi = (row as any).kpis;
      for (const level of SCORE_LEVELS) {
        const currentScore = (row as any)[level.scoreCol];
        if (currentScore === 0 || currentScore === null) {
          // Check if this level has been reviewed (don't fix levels that haven't been reached)
          // A score of 0 when achieved=5 is always corrupted for binary
          phase1Fixes.push({
            submission_id: row.id,
            kpi_id: row.kpi_id,
            kpi_name: kpi.kpi_name,
            employee_id: kpi.employee_id,
            level: level.scoreCol,
            old_score: currentScore ?? 0,
            new_score: 5,
          });
        }
      }
    }

    // ===== PHASE 2: Binary KPIs where achieved_value = 0 and "0 = good" =====
    // Only fix if at least one other reviewer scored it as 5 (proof of intent)
    const { data: phase2Records, error: p2Err } = await supabase
      .from("review_submissions")
      .select(`
        id, kpi_id, achieved_value,
        self_score, self_rating,
        manager_score, manager_rating,
        skip_level_score, skip_level_rating,
        hr_pms_score, hr_pms_rating,
        auditor_score, auditor_rating,
        management_score, management_rating,
        final_score, final_rating,
        kpis!inner(id, kpi_name, kra_name, employee_id, uom_type, review_period, review_year, r5)
      `)
      .eq("kpis.uom_type", "binary")
      .eq("achieved_value", 0);

    if (p2Err) throw new Error(`Phase 2 query failed: ${p2Err.message}`);

    const phase2Fixes: typeof phase1Fixes = [];

    for (const row of phase2Records || []) {
      const kpi = (row as any).kpis;
      // Check if R5 description contains "0" patterns (confirming 0 = good)
      const r5Desc = String(kpi.r5 || "").toLowerCase();
      const is0GoodPattern = r5Desc.includes("0") || r5Desc.includes("nil") || r5Desc.includes("no ");

      // Also check: does any reviewer have score = 5? (proof that 0 = R5)
      const anyReviewerHas5 = SCORE_LEVELS.some(
        (l) => (row as any)[l.scoreCol] === 5
      );

      if (!is0GoodPattern && !anyReviewerHas5) continue;

      for (const level of SCORE_LEVELS) {
        const currentScore = (row as any)[level.scoreCol];
        if (currentScore === 0) {
          phase2Fixes.push({
            submission_id: row.id,
            kpi_id: row.kpi_id,
            kpi_name: kpi.kpi_name,
            employee_id: kpi.employee_id,
            level: level.scoreCol,
            old_score: 0,
            new_score: 5,
          });
        }
      }
    }

    // ===== PHASE 3: Tiered KPIs with score = 0 =====
    const { data: phase3Records, error: p3Err } = await supabase
      .from("review_submissions")
      .select(`
        id, kpi_id, achieved_value,
        self_score, self_rating,
        manager_score, manager_rating,
        skip_level_score, skip_level_rating,
        hr_pms_score, hr_pms_rating,
        auditor_score, auditor_rating,
        management_score, management_rating,
        final_score, final_rating,
        kpis!inner(id, kpi_name, kra_name, employee_id, uom_type, qualitative_options, review_period, review_year)
      `)
      .eq("kpis.uom_type", "tiered");

    if (p3Err) throw new Error(`Phase 3 query failed: ${p3Err.message}`);

    const phase3Fixes: typeof phase1Fixes = [];

    for (const row of phase3Records || []) {
      const kpi = (row as any).kpis;
      const options = kpi.qualitative_options as Array<{ label: string; rating: number }> | null;
      if (!options || !row.achieved_value) continue;

      // Try to find the correct rating from qualitative_options
      const achievedStr = String(row.achieved_value);
      const achievedNum = Number(row.achieved_value);

      let correctRating: number | null = null;

      // Match by label
      const labelMatch = options.find((o) => o.label === achievedStr);
      if (labelMatch) {
        correctRating = labelMatch.rating;
      } else if (!isNaN(achievedNum)) {
        // Match by rating value (numeric achieved = rating number)
        const ratingMatch = options.find((o) => o.rating === achievedNum);
        if (ratingMatch) {
          correctRating = ratingMatch.rating;
        }
      }

      if (correctRating === null) continue;

      for (const level of SCORE_LEVELS) {
        const currentScore = (row as any)[level.scoreCol];
        if (currentScore === 0 && correctRating !== 0) {
          phase3Fixes.push({
            submission_id: row.id,
            kpi_id: row.kpi_id,
            kpi_name: kpi.kpi_name,
            employee_id: kpi.employee_id,
            level: level.scoreCol,
            old_score: 0,
            new_score: correctRating,
          });
        }
      }
    }

    const allFixes = [...phase1Fixes, ...phase2Fixes, ...phase3Fixes];

    // Build summary
    const summary = {
      dry_run: dryRun,
      phase1: { count: phase1Fixes.length, description: "Binary KPIs, achieved=5, score=0" },
      phase2: { count: phase2Fixes.length, description: "Binary KPIs, achieved=0, 0=good pattern" },
      phase3: { count: phase3Fixes.length, description: "Tiered KPIs, score mismatch" },
      total_fixes: allFixes.length,
      unique_kpis: new Set(allFixes.map((f) => f.kpi_id)).size,
      unique_employees: new Set(allFixes.map((f) => f.employee_id)).size,
      by_level: {} as Record<string, number>,
      fixes: allFixes.map((f) => ({
        kpi_id: f.kpi_id,
        kpi_name: f.kpi_name,
        level: f.level,
        old_score: f.old_score,
        new_score: f.new_score,
      })),
    };

    // Count by level
    for (const fix of allFixes) {
      summary.by_level[fix.level] = (summary.by_level[fix.level] || 0) + 1;
    }

    // Apply fixes if not dry run
    if (!dryRun && allFixes.length > 0) {
      // Group fixes by submission_id
      const fixesBySubmission = new Map<string, typeof allFixes>();
      for (const fix of allFixes) {
        const existing = fixesBySubmission.get(fix.submission_id) || [];
        existing.push(fix);
        fixesBySubmission.set(fix.submission_id, existing);
      }

      let appliedCount = 0;

      for (const [submissionId, fixes] of fixesBySubmission) {
        // Build update object
        const updateObj: Record<string, any> = { updated_at: new Date().toISOString() };
        for (const fix of fixes) {
          const ratingCol = SCORE_LEVELS.find((l) => l.scoreCol === fix.level)?.ratingCol;
          updateObj[fix.level] = fix.new_score;
          if (ratingCol) {
            updateObj[ratingCol] = scoreToRating(fix.new_score);
          }
        }

        const { error: updateErr } = await supabase
          .from("review_submissions")
          .update(updateObj)
          .eq("id", submissionId);

        if (updateErr) {
          console.error(`Failed to update submission ${submissionId}:`, updateErr.message);
          continue;
        }

        appliedCount += fixes.length;

        // Log each fix to audit trail
        const auditEntries = fixes.map((fix) => ({
          kpi_id: fix.kpi_id,
          performed_by: performedBy,
          action: "BULK_SCORE_CORRECTION",
          old_value: { [fix.level]: fix.old_score },
          new_value: { [fix.level]: fix.new_score },
          submission_id: submissionId,
          metadata: {
            correction_type: fix.old_score === 0 && fix.new_score === 5 ? "binary_score_fix" : "tiered_score_fix",
            phase: phase1Fixes.includes(fix) ? 1 : phase2Fixes.includes(fix) ? 2 : 3,
          },
        }));

        const { error: auditErr } = await supabase
          .from("kpi_audit_logs")
          .insert(auditEntries);

        if (auditErr) {
          console.error(`Failed to log audit for submission ${submissionId}:`, auditErr.message);
        }
      }

      (summary as any).applied_count = appliedCount;
    }

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
