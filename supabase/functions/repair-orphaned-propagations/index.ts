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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: roleCheck } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find orphaned records: org_kpi_values marked propagated but kpis still at kra_set with no review_submissions
    const { data: orphaned, error: queryError } = await supabase.rpc("find_orphaned_org_kpi_propagations");

    if (queryError) {
      // Fallback: use direct query
      const { data: orphanedDirect, error: directError } = await supabase
        .from("kpis")
        .select(`
          id, category_id, kra_name, kpi_name, review_period, review_year,
          employee_id, target_value, weightage, r5, r4, r3, r2, r1, r0,
          criteria, uom, uom_type, qualitative_options, threshold_mode
        `)
        .eq("is_org_level", true)
        .eq("status", "kra_set");

      if (directError) throw directError;
      if (!orphanedDirect || orphanedDirect.length === 0) {
        return new Response(JSON.stringify({ repaired: 0, message: "No orphaned records found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // For each KPI at kra_set, check if there's an org_kpi_value with data
      let repairedCount = 0;
      const errors: string[] = [];

      for (const kpi of orphanedDirect) {
        // Check if review_submission exists
        const { data: existingSub } = await supabase
          .from("review_submissions")
          .select("id")
          .eq("kpi_id", kpi.id)
          .maybeSingle();
        if (existingSub) continue;

        // Find matching org_kpi_value
        let query = supabase
          .from("org_kpi_values")
          .select("achieved_value, is_na, remarks, employee_id, department_id")
          .eq("category_id", kpi.category_id)
          .eq("kra_name", kpi.kra_name)
          .eq("kpi_name", kpi.kpi_name)
          .eq("review_period", kpi.review_period)
          .eq("review_year", kpi.review_year)
          .in("status", ["propagated", "approved"]);

        const { data: orgValues } = await query;
        if (!orgValues || orgValues.length === 0) continue;

        // Find the matching org value (employee-scoped or org-scoped)
        const matchingValue = orgValues.find(v => 
          v.employee_id === kpi.employee_id || 
          v.employee_id === null
        );
        if (!matchingValue) continue;
        if (matchingValue.achieved_value === null && !matchingValue.is_na) continue;

        // Calculate score
        let selfScore: number | null = null;
        let selfRating: string | null = null;

        if (matchingValue.is_na) {
          selfScore = null;
          selfRating = null;
        } else {
          const uomType = kpi.uom_type || "numeric";
          const isBinaryOrTiered = uomType === "binary" || 
            (uomType === "tiered" && Array.isArray(kpi.qualitative_options) && kpi.qualitative_options.length > 0);

          if (isBinaryOrTiered) {
            selfScore = matchingValue.achieved_value ?? 0;
          } else {
            // Calculate rating from thresholds
            selfScore = calculateRating(
              matchingValue.achieved_value,
              kpi.target_value,
              { r5: kpi.r5, r4: kpi.r4, r3: kpi.r3, r2: kpi.r2, r1: kpi.r1, r0: kpi.r0 },
              kpi.criteria || "Higher is Better",
              kpi.threshold_mode || "absolute"
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
            remarks: matchingValue.remarks,
          }, { onConflict: "kpi_id" });

        if (insertError) {
          errors.push(`KPI ${kpi.id}: ${insertError.message}`);
          continue;
        }

        // Update kpi status to self_review
        const { error: updateError } = await supabase
          .from("kpis")
          .update({ status: "self_review", updated_at: new Date().toISOString() })
          .eq("id", kpi.id)
          .eq("status", "kra_set");

        if (updateError) {
          errors.push(`KPI ${kpi.id} status update: ${updateError.message}`);
          continue;
        }

        repairedCount++;
      }

      return new Response(
        JSON.stringify({ repaired: repairedCount, total_checked: orphanedDirect.length, errors }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ repaired: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function scoreToRating(score: number): string {
  if (score >= 4.5) return "green";
  if (score >= 3.5) return "light-green";
  if (score >= 2.5) return "yellow";
  if (score >= 1.5) return "orange";
  return "red";
}

function calculateRating(
  achievedValue: number | null,
  targetValue: number | null,
  thresholds: { r5: string | null; r4: string | null; r3: string | null; r2: string | null; r1: string | null; r0: string | null },
  criteria: string,
  thresholdMode: string
): number {
  if (achievedValue === null || targetValue === null) return 0;

  const parseThreshold = (val: string | null): number | null => {
    if (val === null || val === undefined || val === "") return null;
    const n = parseFloat(val.replace("%", ""));
    return isNaN(n) ? null : n;
  };

  const r5 = parseThreshold(thresholds.r5);
  const r4 = parseThreshold(thresholds.r4);
  const r3 = parseThreshold(thresholds.r3);
  const r2 = parseThreshold(thresholds.r2);
  const r1 = parseThreshold(thresholds.r1);

  // Convert to absolute values if percentage mode
  const toAbsolute = (v: number | null): number | null => {
    if (v === null) return null;
    if (thresholdMode === "percentage") return targetValue * (v / 100);
    return v;
  };

  const absR5 = toAbsolute(r5);
  const absR4 = toAbsolute(r4);
  const absR3 = toAbsolute(r3);
  const absR2 = toAbsolute(r2);
  const absR1 = toAbsolute(r1);

  if (criteria === "Lower is Better") {
    if (absR5 !== null && achievedValue <= absR5) return 5;
    if (absR4 !== null && achievedValue <= absR4) return 4;
    if (absR3 !== null && achievedValue <= absR3) return 3;
    if (absR2 !== null && achievedValue <= absR2) return 2;
    if (absR1 !== null && achievedValue <= absR1) return 1;
    return 0;
  } else {
    if (absR5 !== null && achievedValue >= absR5) return 5;
    if (absR4 !== null && achievedValue >= absR4) return 4;
    if (absR3 !== null && achievedValue >= absR3) return 3;
    if (absR2 !== null && achievedValue >= absR2) return 2;
    if (absR1 !== null && achievedValue >= absR1) return 1;
    return 0;
  }
}
