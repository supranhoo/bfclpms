import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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

    // Parse optional batch limit
    let batchLimit = 50;
    try {
      const body = await req.json();
      if (body?.limit) batchLimit = Math.min(body.limit, 200);
    } catch { /* no body is fine */ }

    // Find orphaned KPIs: org_level + kra_set + no review_submission + has org_kpi_value data
    const { data: orphanedKpis, error: kpiError } = await supabase
      .from("kpis")
      .select("id, category_id, kra_name, kpi_name, review_period, review_year, employee_id, target_value, weightage, r5, r4, r3, r2, r1, r0, criteria, uom, uom_type, qualitative_options, threshold_mode")
      .eq("is_org_level", true)
      .eq("status", "kra_set")
      .limit(batchLimit);

    if (kpiError) throw kpiError;
    if (!orphanedKpis || orphanedKpis.length === 0) {
      return new Response(JSON.stringify({ repaired: 0, message: "No orphaned records found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let repairedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (const kpi of orphanedKpis) {
      try {
        // Check if review_submission already exists
        const { data: existingSub } = await supabase
          .from("review_submissions").select("id").eq("kpi_id", kpi.id).maybeSingle();
        if (existingSub) { skippedCount++; continue; }

        // Find matching org_kpi_value
        const { data: orgValues } = await supabase
          .from("org_kpi_values")
          .select("achieved_value, is_na, remarks, employee_id, department_id")
          .eq("category_id", kpi.category_id)
          .eq("kra_name", kpi.kra_name)
          .eq("kpi_name", kpi.kpi_name)
          .eq("review_period", kpi.review_period)
          .eq("review_year", kpi.review_year)
          .in("status", ["propagated", "approved"]);

        if (!orgValues || orgValues.length === 0) { skippedCount++; continue; }

        const matchingValue = orgValues.find(v => v.employee_id === kpi.employee_id) || orgValues.find(v => v.employee_id === null);
        if (!matchingValue) { skippedCount++; continue; }
        if (matchingValue.achieved_value === null && !matchingValue.is_na) { skippedCount++; continue; }

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

        // Insert review_submission
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

        if (insertError) { errors.push(`${kpi.id}: ${insertError.message}`); continue; }

        // Update kpi status to self_review
        await supabase
          .from("kpis")
          .update({ status: "self_review", updated_at: new Date().toISOString() })
          .eq("id", kpi.id)
          .eq("status", "kra_set");

        repairedCount++;
      } catch (e) {
        errors.push(`${kpi.id}: ${e.message}`);
      }
    }

    return new Response(
      JSON.stringify({ repaired: repairedCount, skipped: skippedCount, total_checked: orphanedKpis.length, errors: errors.slice(0, 20) }),
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
