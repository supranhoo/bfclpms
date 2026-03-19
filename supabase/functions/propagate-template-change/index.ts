import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PropagateRequest {
  template_id: string;
  fields_changed: Record<string, { old: any; new: any }>;
  effective_month: string;
  effective_year: number;
  employee_ids?: string[]; // empty = all linked
  dry_run?: boolean;
}

const STRUCTURAL_FIELDS = [
  'target_value', 'weightage', 'uom', 'criteria', 'source_of_data',
  'frequency', 'uom_type', 'qualitative_options', 'threshold_mode',
  'kra_name', 'kpi_name', 'r5', 'r4', 'r3', 'r2', 'r1', 'r0',
  'require_resubmit_reason',
];

const MONTH_ORDER: Record<string, number> = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
};

function monthYearToNum(month: string, year: number): number {
  return year * 100 + (MONTH_ORDER[month] || 0);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify user is admin
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check admin role
    const { data: roleData } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: PropagateRequest = await req.json();
    const { template_id, fields_changed, effective_month, effective_year, employee_ids, dry_run } = body;

    if (!template_id || !fields_changed || !effective_month || !effective_year) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Filter to only structural fields
    const validChanges: Record<string, { old: any; new: any }> = {};
    for (const [field, change] of Object.entries(fields_changed)) {
      if (STRUCTURAL_FIELDS.includes(field)) {
        validChanges[field] = change;
      }
    }

    if (Object.keys(validChanges).length === 0) {
      return new Response(JSON.stringify({ 
        error: 'No structural fields changed',
        kpis_updated: 0, employees_affected: 0, skipped: [],
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const effectiveNum = monthYearToNum(effective_month, effective_year);

    // Query all linked KPIs
    let query = adminClient
      .from('kpis')
      .select('id, employee_id, review_period, review_year, status, kra_name, kpi_name')
      .eq('source_template_id', template_id)
      .neq('status', 'approved');

    if (employee_ids && employee_ids.length > 0) {
      query = query.in('employee_id', employee_ids);
    }

    const { data: linkedKpis, error: queryError } = await query;
    if (queryError) throw queryError;

    // Filter by effective month
    const eligibleKpis = (linkedKpis || []).filter(kpi => {
      if (!kpi.review_period || !kpi.review_year) return false;
      const kpiNum = monthYearToNum(kpi.review_period, kpi.review_year);
      return kpiNum >= effectiveNum;
    });

    const skipped = (linkedKpis || []).filter(kpi => {
      if (!kpi.review_period || !kpi.review_year) return true;
      const kpiNum = monthYearToNum(kpi.review_period, kpi.review_year);
      return kpiNum < effectiveNum;
    }).map(k => ({
      kpi_id: k.id,
      employee_id: k.employee_id,
      reason: 'before_effective_month',
      review_period: k.review_period,
      review_year: k.review_year,
    }));

    if (dry_run) {
      const uniqueEmployees = new Set(eligibleKpis.map(k => k.employee_id));
      // Get employee names for the preview
      const empIds = Array.from(uniqueEmployees);
      const { data: empProfiles } = empIds.length > 0 
        ? await adminClient.from('profiles').select('id, full_name, employee_code').in('id', empIds)
        : { data: [] };

      return new Response(JSON.stringify({
        dry_run: true,
        kpis_to_update: eligibleKpis.length,
        employees_affected: uniqueEmployees.size,
        skipped_count: skipped.length,
        fields_changed: validChanges,
        employees: (empProfiles || []).map(p => ({
          id: p.id,
          name: p.full_name || p.employee_code,
          kpi_count: eligibleKpis.filter(k => k.employee_id === p.id).length,
        })),
        skipped,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build update payload from changes
    const updatePayload: Record<string, any> = {};
    for (const [field, change] of Object.entries(validChanges)) {
      updatePayload[field] = change.new;
    }

    // Batch update KPIs
    const kpiIds = eligibleKpis.map(k => k.id);
    let updatedCount = 0;
    const errors: Array<{ kpi_id: string; error: string }> = [];

    if (kpiIds.length > 0) {
      // Disable triggers for bulk update
      // Update in batches of 100
      for (let i = 0; i < kpiIds.length; i += 100) {
        const batch = kpiIds.slice(i, i + 100);
        const { error: updateError, count } = await adminClient
          .from('kpis')
          .update(updatePayload)
          .in('id', batch);

        if (updateError) {
          errors.push({ kpi_id: batch.join(','), error: updateError.message });
        } else {
          updatedCount += batch.length;
        }
      }
    }

    const uniqueEmployees = new Set(eligibleKpis.map(k => k.employee_id));

    // Log the change
    await adminClient.from('template_change_logs').insert({
      template_id,
      changed_by: user.id,
      effective_month,
      effective_year,
      fields_changed: validChanges,
      employees_affected: uniqueEmployees.size,
      kpis_updated: updatedCount,
      scope: (employee_ids && employee_ids.length > 0) ? 'selected' : 'all',
      selected_employee_ids: employee_ids || [],
    });

    // Create audit log entries for each affected KPI
    if (eligibleKpis.length > 0) {
      const auditLogs = eligibleKpis.map(kpi => ({
        kpi_id: kpi.id,
        action: 'TEMPLATE_PROPAGATION',
        performed_by: user.id,
        old_value: Object.fromEntries(
          Object.entries(validChanges).map(([field, change]) => [field, change.old])
        ),
        new_value: updatePayload,
        metadata: {
          template_id,
          effective_month,
          effective_year,
          propagation_type: 'template_master_update',
        },
      }));

      // Insert audit logs in batches
      for (let i = 0; i < auditLogs.length; i += 100) {
        await adminClient.from('kpi_audit_logs').insert(auditLogs.slice(i, i + 100));
      }
    }

    return new Response(JSON.stringify({
      success: true,
      kpis_updated: updatedCount,
      employees_affected: uniqueEmployees.size,
      skipped_count: skipped.length,
      errors,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
