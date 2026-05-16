// deploy-sync: 2026-04-10T19:15 — force redeploy after kpiErr fix
import { requireAdminUser } from "../_shared/admin-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Bulk Zero-Score Non-Submitters
 *
 * Modes:
 *   scan    – Returns KPIs stuck at the configured stages for a given period/year
 *              (default: kra_set, self_review)
 *   execute – Sets score 0 across all workflow levels, advances to approved, logs audit
 *
 * Body:
 *   mode: "scan" | "execute"
 *   review_period: string (e.g. "January")
 *   review_year: number
 *   include_org_kpis: boolean
 *   kpi_ids: string[]          (execute only – selected KPIs)
 *   org_kpi_ids: string[]      (execute only – selected org KPI value IDs)
 *   admin_remarks: string      (execute only)
 *   stuck_at_stages: string[]  (optional, default ["kra_set","self_review"])
 *                              v2.66.11.17 — admin may also drain manager_check,
 *                              skip_level_check, hr_pms_review, audit,
 *                              management_review when reviewers fail to act.
 */

// Deploy sync marker: 2026-04-10T2 org-filter support.

// v2.66.11.17 — whitelist of stages that may be drained. Anything else is
// rejected to prevent accidental zero-scoring of terminal/unknown statuses.
const ALLOWED_STUCK_STAGES = new Set([
  "kra_set",
  "self_review",
  "manager_check",
  "skip_level_check",
  "hr_pms_review",
  "audit",
  "management_review",
]);

function sanitizeStuckStages(input: unknown): string[] {
  if (!Array.isArray(input) || input.length === 0) {
    return ["kra_set", "self_review"];
  }
  const cleaned = input
    .filter((s): s is string => typeof s === "string")
    .filter((s) => ALLOWED_STUCK_STAGES.has(s));
  return cleaned.length > 0 ? Array.from(new Set(cleaned)) : ["kra_set", "self_review"];
}

// ── Helpers ──────────────────────────────────────────────────────────────

const ALL_MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const CYCLE_DEFS: Record<string, number> = {
  "Bi-Monthly": 2, Quarterly: 3, "Half-Yearly": 6, Yearly: 12,
};

function isTerminalMonth(
  frequency: string | null,
  period: string,
  cycleStart: string | null,
): boolean {
  const span = CYCLE_DEFS[frequency ?? ""];
  if (!span) return true; // Monthly / unknown → always terminal
  const months = cycleStart ? cycleStart.split("-").map((m: string) => m.trim()) : null;
  if (!months || months.length === 0) return true;
  const startIdx = ALL_MONTHS.indexOf(months[0]);
  if (startIdx < 0) return true;
  // Terminal months are the last month of each cycle window
  const terminals: string[] = [];
  for (let i = 0; i < 12; i += span) {
    const termIdx = (startIdx + i + span - 1) % 12;
    terminals.push(ALL_MONTHS[termIdx]);
  }
  return terminals.includes(period);
}

// ── Main ─────────────────────────────────────────────────────────────────

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
    const user = auth.user;

    const body = await req.json();
    const mode: "scan" | "execute" = body?.mode ?? "scan";
    const reviewPeriod: string = body?.review_period;
    const reviewYear: number = body?.review_year;
    const includeOrgKpis: boolean = body?.include_org_kpis ?? false;
    const kpiIds: string[] = body?.kpi_ids ?? [];
    const orgKpiIds: string[] = body?.org_kpi_ids ?? [];
    const adminRemarks: string = body?.admin_remarks ?? "Data not submitted by deadline";
    const divisionId: string | null = body?.division_id ?? null;
    const businessUnitId: string | null = body?.business_unit_id ?? null;
    const departmentId: string | null = body?.department_id ?? null;
    const employeeId: string | null = body?.employee_id ?? null;

    if (!reviewPeriod || !reviewYear) {
      return new Response(
        JSON.stringify({ error: "review_period and review_year are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Resolve org-filter employee allowlist ──────────────────────────
    let orgEmployeeAllowlist: Set<string> | null = null;
    if (departmentId || businessUnitId || divisionId) {
      // Resolve department IDs from hierarchy
      let deptIds: string[] = [];
      if (departmentId) {
        deptIds = [departmentId];
      } else if (businessUnitId) {
        const { data: depts } = await supabase
          .from("departments")
          .select("id")
          .eq("business_unit_id", businessUnitId);
        deptIds = (depts ?? []).map((d: any) => d.id);
      } else if (divisionId) {
        const { data: bus } = await supabase
          .from("business_units")
          .select("id")
          .eq("division_id", divisionId);
        const buIds = (bus ?? []).map((b: any) => b.id);
        if (buIds.length > 0) {
          const { data: depts } = await supabase
            .from("departments")
            .select("id")
            .in("business_unit_id", buIds);
          deptIds = (depts ?? []).map((d: any) => d.id);
        }
      }

      if (deptIds.length > 0) {
        orgEmployeeAllowlist = new Set<string>();
        for (let i = 0; i < deptIds.length; i += 200) {
          const batch = deptIds.slice(i, i + 200);
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id")
            .in("department_id", batch);
          (profiles ?? []).forEach((p: any) => orgEmployeeAllowlist!.add(p.id));
        }
      } else {
        // Filter was set but resolved to zero departments → empty allowlist
        orgEmployeeAllowlist = new Set<string>();
      }
    }

    // ── SCAN MODE ──────────────────────────────────────────────────────
    if (mode === "scan") {
      // 1. Fetch KPIs stuck at kra_set or self_review (batched to bypass 1000-row limit)
      let allStuckKpis: any[] = [];
      const BATCH_SIZE = 500;
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        let query = supabase
          .from("kpis")
          .select(
            "id, employee_id, kpi_name, kra_name, category_id, review_period, review_year, status, frequency, frequency_cycle_start",
          )
          .eq("review_period", reviewPeriod)
          .eq("review_year", reviewYear)
          .in("status", ["kra_set", "self_review"]);
        if (employeeId) query = query.eq("employee_id", employeeId);
        const { data: batch, error: bErr } = await query.range(offset, offset + BATCH_SIZE - 1);
        if (bErr) throw bErr;
        const rows = batch ?? [];
        allStuckKpis = allStuckKpis.concat(rows);
        hasMore = rows.length === BATCH_SIZE;
        offset += BATCH_SIZE;
      }

      // Apply org filter if set
      const stuckKpis = orgEmployeeAllowlist
        ? allStuckKpis.filter((k: any) => orgEmployeeAllowlist!.has(k.employee_id))
        : allStuckKpis;

      

      // 2. Exclude sent-back KPIs (have open kpi_queries)
      const stuckIds = (stuckKpis ?? []).map((k: any) => k.id);
      let sentBackIds = new Set<string>();
      if (stuckIds.length > 0) {
        const { data: openQueries } = await supabase
          .from("kpi_queries")
          .select("kpi_id")
          .in("kpi_id", stuckIds)
          .eq("status", "open");
        if (openQueries) {
          sentBackIds = new Set(openQueries.map((q: any) => q.kpi_id));
        }
      }

      // 2b. Exclude N/A KPIs (is_na lives on review_submissions, not kpis)
      let naKpiIds = new Set<string>();
      if (stuckIds.length > 0) {
        const { data: naSubmissions } = await supabase
          .from("review_submissions")
          .select("kpi_id")
          .in("kpi_id", stuckIds)
          .eq("is_na", true);
        if (naSubmissions) {
          naKpiIds = new Set(naSubmissions.map((s: any) => s.kpi_id));
        }
      }

      // 3. Check for prior zero-score batches on this period (scoped to employee if provided)
      let priorBatchWarning: string | null = null;
      {
        const { data: priorLogs } = await supabase
          .from("kpi_audit_logs")
          .select("id, metadata, kpi_id")
          .eq("action", "ADMIN_BULK_ZERO_SCORE")
          .limit(50);
        // Filter for period/year match
        let matched = (priorLogs ?? []).filter((l: any) => {
          const meta = typeof l.metadata === "string" ? JSON.parse(l.metadata) : l.metadata;
          return meta?.period === reviewPeriod && meta?.year === reviewYear;
        });
        // When scanning a specific employee, check if any matched KPIs belong to that employee
        if (employeeId && matched.length > 0) {
          const matchedKpiIds = matched.map((l: any) => l.kpi_id).filter(Boolean);
          if (matchedKpiIds.length > 0) {
            const { data: kpiOwners } = await supabase
              .from("kpis")
              .select("id")
              .in("id", matchedKpiIds)
              .eq("employee_id", employeeId)
              .limit(1);
            matched = kpiOwners && kpiOwners.length > 0 ? matched : [];
          }
        }
        if (matched.length > 0) {
          const scope = employeeId ? "this employee" : `${reviewPeriod} ${reviewYear}`;
          priorBatchWarning = `A bulk zero-score batch was already executed for ${scope}. Proceeding will create additional zero-score entries.`;
        }
      }

      // 4. Resolve employee names
      const empIds = [...new Set((stuckKpis ?? []).map((k: any) => k.employee_id))];
      const empNameMap = new Map<string, string>();
      if (empIds.length > 0) {
        for (let i = 0; i < empIds.length; i += 200) {
          const batch = empIds.slice(i, i + 200);
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name, employee_id:employee_code")
            .in("id", batch);
          (profiles ?? []).forEach((p: any) => empNameMap.set(p.id, p.full_name || "Unknown"));
        }
      }

      // 5. Resolve category names
      const catIds = [...new Set((stuckKpis ?? []).filter((k: any) => k.category_id).map((k: any) => k.category_id))];
      const catNameMap = new Map<string, string>();
      if (catIds.length > 0) {
        const { data: cats } = await supabase
          .from("kpi_categories")
          .select("id, name")
          .in("id", catIds);
        (cats ?? []).forEach((c: any) => catNameMap.set(c.id, c.name));
      }

      // 6. Build detail rows
      const details: any[] = [];
      for (const kpi of stuckKpis ?? []) {
        // Skip sent-back
        if (sentBackIds.has(kpi.id)) {
          details.push({
            kpi_id: kpi.id,
            employee_id: kpi.employee_id,
            employee_name: empNameMap.get(kpi.employee_id) || "Unknown",
            kpi_name: kpi.kpi_name,
            kra_name: kpi.kra_name,
            category: catNameMap.get(kpi.category_id) || "",
            review_period: kpi.review_period,
            review_year: kpi.review_year,
            current_status: kpi.status,
            action: "skippable",
            reason: "sent_back_open_query",
          });
          continue;
        }

        // Skip N/A KPIs
        if (naKpiIds.has(kpi.id)) {
          details.push({
            kpi_id: kpi.id,
            employee_id: kpi.employee_id,
            employee_name: empNameMap.get(kpi.employee_id) || "Unknown",
            kpi_name: kpi.kpi_name,
            kra_name: kpi.kra_name,
            category: catNameMap.get(kpi.category_id) || "",
            review_period: kpi.review_period,
            review_year: kpi.review_year,
            current_status: kpi.status,
            action: "skippable",
            reason: "na_marked",
          });
          continue;
        }

        // Skip multi-month KPIs that aren't at terminal month
        if (
          kpi.frequency &&
          kpi.frequency !== "Monthly" &&
          !isTerminalMonth(kpi.frequency, kpi.review_period, kpi.frequency_cycle_start)
        ) {
          details.push({
            kpi_id: kpi.id,
            employee_id: kpi.employee_id,
            employee_name: empNameMap.get(kpi.employee_id) || "Unknown",
            kpi_name: kpi.kpi_name,
            kra_name: kpi.kra_name,
            category: catNameMap.get(kpi.category_id) || "",
            review_period: kpi.review_period,
            review_year: kpi.review_year,
            current_status: kpi.status,
            action: "skippable",
            reason: "non_terminal_multi_month",
          });
          continue;
        }

        details.push({
          kpi_id: kpi.id,
          employee_id: kpi.employee_id,
          employee_name: empNameMap.get(kpi.employee_id) || "Unknown",
          kpi_name: kpi.kpi_name,
          kra_name: kpi.kra_name,
          category: catNameMap.get(kpi.category_id) || "",
          review_period: kpi.review_period,
          review_year: kpi.review_year,
          current_status: kpi.status,
          action: "zero_scorable",
          reason: kpi.status === "kra_set" ? "stuck_at_kra_set" : "stuck_at_self_review",
        });
      }

      // 7. Org KPI scan (optional)
      const orgDetails: any[] = [];
      if (includeOrgKpis) {
        const { data: orgValues } = await supabase
          .from("org_kpi_values")
          .select("id, kpi_name, kra_name, category_id, review_period, review_year, achieved_value, status")
          .eq("review_period", reviewPeriod)
          .eq("review_year", reviewYear)
          .or("achieved_value.is.null,status.is.null,status.eq.entered")
          .limit(500);

        for (const org of orgValues ?? []) {
          orgDetails.push({
            org_kpi_id: org.id,
            kpi_name: org.kpi_name,
            kra_name: org.kra_name,
            category: catNameMap.get(org.category_id) || "",
            review_period: org.review_period,
            review_year: org.review_year,
            current_value: org.achieved_value,
            current_status: org.status,
            action: "zero_scorable",
            reason: org.achieved_value === null ? "no_data_entered" : "not_propagated",
          });
        }
      }

      return new Response(
        JSON.stringify({
          mode: "scan",
          total_kpis: details.length,
          zero_scorable: details.filter((d: any) => d.action === "zero_scorable").length,
          skippable: details.filter((d: any) => d.action === "skippable").length,
          org_kpis: orgDetails.length,
          details,
          org_details: orgDetails,
          prior_batch_warning: priorBatchWarning,
          ran_at: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── EXECUTE MODE ───────────────────────────────────────────────────
    if (mode === "execute") {
      if (kpiIds.length === 0 && orgKpiIds.length === 0) {
        return new Response(
          JSON.stringify({ error: "No KPI IDs or Org KPI IDs provided" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const batchId = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      const zeroRemark = `Admin bulk zero-score: ${adminRemarks} — ${reviewPeriod} ${reviewYear} [Batch: ${batchId.slice(0, 8)}]`;

      let zeroScored = 0;
      let skipped = 0;
      let orgZeroScored = 0;
      const errors: string[] = [];
      const resultDetails: any[] = [];

      // 1. Resolve workflow templates for affected employees
      const { data: targetKpis } = await supabase
        .from("kpis")
        .select("id, employee_id, kpi_name, kra_name, category_id, review_period, review_year, status")
        .in("id", kpiIds)
        .in("status", ["kra_set", "self_review"]);

      if (!targetKpis || targetKpis.length === 0) {
        return new Response(
          JSON.stringify({
            mode: "execute",
            zero_scored: 0,
            skipped: kpiIds.length,
            org_zero_scored: 0,
            errors: ["No eligible KPIs found in kra_set or self_review status"],
            details: [],
            batch_id: batchId,
            ran_at: timestamp,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Resolve employee names
      const empIds = [...new Set(targetKpis.map((k: any) => k.employee_id))];
      const empNameMap = new Map<string, string>();
      for (let i = 0; i < empIds.length; i += 200) {
        const batch = empIds.slice(i, i + 200);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", batch);
        (profiles ?? []).forEach((p: any) => empNameMap.set(p.id, p.full_name || "Unknown"));
      }

      // Resolve category names
      const catIds = [...new Set(targetKpis.filter((k: any) => k.category_id).map((k: any) => k.category_id))];
      const catNameMap = new Map<string, string>();
      if (catIds.length > 0) {
        const { data: cats } = await supabase
          .from("kpi_categories")
          .select("id, name")
          .in("id", catIds);
        (cats ?? []).forEach((c: any) => catNameMap.set(c.id, c.name));
      }

      // Resolve workflow stages per employee (batch pre-fetch)
      // workflow_config maps employee → workflow_template → stages
      const employeeStagesMap = new Map<string, string[]>();
      for (let i = 0; i < empIds.length; i += 200) {
        const batch = empIds.slice(i, i + 200);

        // Period-specific configs first
        const { data: periodConfigs } = await supabase
          .from("workflow_config")
          .select("config_value, workflow_template_id")
          .eq("config_type", "employee")
          .in("config_value", batch)
          .eq("review_period", reviewPeriod)
          .eq("review_year", reviewYear);

        // Global configs (no period)
        const { data: globalConfigs } = await supabase
          .from("workflow_config")
          .select("config_value, workflow_template_id")
          .eq("config_type", "employee")
          .in("config_value", batch)
          .is("review_period", null);

        // Collect template IDs
        const allConfigs = [...(periodConfigs ?? []), ...(globalConfigs ?? [])];
        const templateIds = [...new Set(allConfigs.map((c: any) => c.workflow_template_id))];

        if (templateIds.length > 0) {
          const { data: templates } = await supabase
            .from("workflow_templates")
            .select("id, stages")
            .in("id", templateIds);

          const templateMap = new Map<string, string[]>();
          (templates ?? []).forEach((t: any) => {
            const stages = typeof t.stages === "string" ? JSON.parse(t.stages) : t.stages;
            templateMap.set(t.id, stages);
          });

          // Period-specific overrides first, then global fallback
          const periodEmpMap = new Map<string, string>();
          (periodConfigs ?? []).forEach((c: any) => periodEmpMap.set(c.config_value, c.workflow_template_id));

          const globalEmpMap = new Map<string, string>();
          (globalConfigs ?? []).forEach((c: any) => {
            if (!globalEmpMap.has(c.config_value)) globalEmpMap.set(c.config_value, c.workflow_template_id);
          });

          for (const empId of batch) {
            const templateId = periodEmpMap.get(empId) ?? globalEmpMap.get(empId);
            if (templateId && templateMap.has(templateId)) {
              employeeStagesMap.set(empId, templateMap.get(templateId)!);
            }
          }
        }
      }

      // Fallback: system default template
      let defaultStages: string[] = ["kra_set", "self_review", "manager_check", "approved"];
      const { data: defaultTemplate } = await supabase
        .from("workflow_templates")
        .select("stages")
        .eq("is_default", true)
        .limit(1)
        .maybeSingle();
      if (defaultTemplate?.stages) {
        defaultStages = typeof defaultTemplate.stages === "string"
          ? JSON.parse(defaultTemplate.stages)
          : defaultTemplate.stages;
      }

      // 2. Process each KPI
      for (const kpi of targetKpis) {
        try {
          const stages = employeeStagesMap.get(kpi.employee_id) ?? defaultStages;
          const oldStatus = kpi.status;

          // Build zero-score submission object
          const submissionData: Record<string, any> = {
            kpi_id: kpi.id,
            achieved_value: 0,
            kpi_status: "locked",
            auto_advance_reason: zeroRemark,
            submitted_at: timestamp,
            updated_at: timestamp,
          };

          // Zero out ALL stages present in the workflow
          if (stages.includes("self_review")) {
            submissionData.self_score = 0;
            submissionData.self_rating = 'red';
            submissionData.self_remarks = zeroRemark;
          }
          if (stages.includes("manager_check")) {
            submissionData.manager_score = 0;
            submissionData.manager_rating = 'red';
            submissionData.manager_remarks = zeroRemark;
          }
          if (stages.includes("skip_level_check")) {
            submissionData.skip_level_score = 0;
            submissionData.skip_level_rating = 'red';
            submissionData.skip_level_remarks = zeroRemark;
          }
          if (stages.includes("hr_pms_review")) {
            submissionData.hr_pms_score = 0;
            submissionData.hr_pms_rating = 'red';
            submissionData.hr_pms_remarks = zeroRemark;
          }
          if (stages.includes("audit")) {
            submissionData.auditor_score = 0;
            submissionData.auditor_rating = 'red';
            submissionData.auditor_remarks = zeroRemark;
          }
          if (stages.includes("management_review")) {
            submissionData.management_score = 0;
            submissionData.management_rating = 'red';
            submissionData.management_remarks = zeroRemark;
          }

          // Always set final
          submissionData.final_score = 0;
          submissionData.final_rating = 'red';

          // Upsert review_submissions
          const { error: subErr } = await supabase
            .from("review_submissions")
            .upsert(submissionData, { onConflict: "kpi_id" });

          if (subErr) {
            errors.push(`${kpi.id}: submission upsert failed — ${subErr.message}`);
            resultDetails.push({
              kpi_id: kpi.id,
              employee_name: empNameMap.get(kpi.employee_id) || "Unknown",
              kpi_name: kpi.kpi_name,
              action: "error",
              reason: subErr.message,
            });
            continue;
          }

          // Update KPI status to approved
          const { error: kpiErr } = await supabase
            .from("kpis")
            .update({ status: "approved" })
            .eq("id", kpi.id);

          if (kpiErr) {
            errors.push(`${kpi.id}: status update failed — ${kpiErr.message}`);
            resultDetails.push({
              kpi_id: kpi.id,
              employee_name: empNameMap.get(kpi.employee_id) || "Unknown",
              kpi_name: kpi.kpi_name,
              action: "error",
              reason: kpiErr.message,
            });
            continue;
          }

          // Audit log
          await supabase.from("kpi_audit_logs").insert({
            kpi_id: kpi.id,
            action: "ADMIN_BULK_ZERO_SCORE",
            performed_by: user!.id,
            old_value: { status: oldStatus, scores: null },
            new_value: {
              status: "approved",
              final_score: 0,
              final_rating: 0,
              all_levels_zeroed: true,
              stages_zeroed: stages.filter((s: string) => !["kra_set", "approved"].includes(s)),
            },
            metadata: {
              reason: adminRemarks,
              period: reviewPeriod,
              year: reviewYear,
              batch_id: batchId,
            },
          });

          zeroScored++;
          resultDetails.push({
            kpi_id: kpi.id,
            employee_id: kpi.employee_id,
            employee_name: empNameMap.get(kpi.employee_id) || "Unknown",
            kpi_name: kpi.kpi_name,
            kra_name: kpi.kra_name,
            category: catNameMap.get(kpi.category_id) || "",
            review_period: kpi.review_period,
            review_year: kpi.review_year,
            action: "zero_scored",
            reason: "all_levels_zeroed",
          });
        } catch (err: any) {
          errors.push(`${kpi.id}: ${err.message}`);
          resultDetails.push({
            kpi_id: kpi.id,
            employee_name: empNameMap.get(kpi.employee_id) || "Unknown",
            kpi_name: kpi.kpi_name,
            action: "error",
            reason: err.message,
          });
        }
      }

      // 3. Handle Org KPIs
      if (orgKpiIds.length > 0) {
        const { data: orgValues } = await supabase
          .from("org_kpi_values")
          .select("id, kpi_name, kra_name, category_id, review_period, review_year, achieved_value, status")
          .in("id", orgKpiIds);

        for (const org of orgValues ?? []) {
          try {
            const { error: orgErr } = await supabase
              .from("org_kpi_values")
              .update({
                achieved_value: 0,
                status: "propagated",
              })
              .eq("id", org.id);

            if (orgErr) {
              errors.push(`org:${org.id}: ${orgErr.message}`);
              continue;
            }

            // Log to org_kpi_data_entry_logs
            await supabase.from("org_kpi_data_entry_logs").insert({
              org_kpi_value_id: org.id,
              category_id: org.category_id,
              kra_name: org.kra_name,
              kpi_name: org.kpi_name,
              review_period: org.review_period,
              review_year: org.review_year,
              action: "admin_zero_scored",
              performed_by: user!.id,
              old_value: org.achieved_value,
              new_value: 0,
              remarks: zeroRemark,
            });

            orgZeroScored++;
          } catch (err: any) {
            errors.push(`org:${org.id}: ${err.message}`);
          }
        }
      }

      // 4. Post-execution verification (limited to 200)
      let verification = null;
      if (zeroScored > 0) {
        const verifyIds = resultDetails
          .filter((d: any) => d.action === "zero_scored")
          .slice(0, 200)
          .map((d: any) => d.kpi_id);

        const { data: verifiedKpis } = await supabase
          .from("kpis")
          .select("id, status")
          .in("id", verifyIds)
          .eq("status", "approved");

        const { data: verifiedSubs } = await supabase
          .from("review_submissions")
          .select("kpi_id, final_score")
          .in("kpi_id", verifyIds);

        verification = {
          kpis_at_approved: verifiedKpis?.length ?? 0,
          submissions_with_zero: verifiedSubs?.filter((s: any) => s.final_score === 0).length ?? 0,
          checked: verifyIds.length,
        };
      }

      return new Response(
        JSON.stringify({
          mode: "execute",
          zero_scored: zeroScored,
          skipped,
          org_zero_scored: orgZeroScored,
          total_checked: targetKpis.length,
          errors,
          details: resultDetails,
          batch_id: batchId,
          verification,
          ran_at: timestamp,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid mode. Use 'scan' or 'execute'." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[bulk-zero-score]", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
