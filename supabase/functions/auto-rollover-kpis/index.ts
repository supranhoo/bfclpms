import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface EmployeeResult {
  employee_id: string;
  employee_name: string;
  employee_code: string;
  department: string;
  kpis_copied: number;
  status: 'rolled_over' | 'balance_only' | 'skipped';
  existing_kpi_count: number;
  existing_kpi_names: string[];
  source_kpi_count: number;
}

interface RolloverRequest {
  triggered_by?: string;
  force?: boolean;
  source_month?: string;
  source_year?: number;
  target_month?: string;
  target_year?: number;
  employee_ids?: string[];
  dry_run?: boolean;
  rollover_balance_only?: boolean;
  skip_employee_ids?: string[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // --- Auth gate: require Bearer JWT (admin) OR X-Cron-Secret ---
    const cronSecret = Deno.env.get('CRON_SECRET');
    const cronHeader = req.headers.get('X-Cron-Secret');
    const authHeader = req.headers.get('Authorization');
    let isAuthorized = false;

    if (cronSecret && cronHeader && cronHeader === cronSecret) {
      // Cron / system caller authenticated via shared secret
      isAuthorized = true;
    } else if (authHeader?.startsWith('Bearer ')) {
      // Frontend / admin caller authenticated via JWT
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (!authError && user) {
        const { data: roles } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin');
        if (roles && roles.length > 0) {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: admin JWT or valid CRON_SECRET required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let params: RolloverRequest = {};
    try {
      params = await req.json();
    } catch {
      // defaults
    }

    const {
      triggered_by = 'system',
      force = false,
      dry_run = false,
      rollover_balance_only = false,
      employee_ids,
      skip_employee_ids = [],
    } = params;

    // Calculate source/target periods
    const currentDate = new Date();
    const defaultTargetIdx = currentDate.getMonth();
    const defaultSourceIdx = (defaultTargetIdx + 11) % 12;

    const sourceMonth = params.source_month || MONTHS[defaultSourceIdx];
    const sourceYear = params.source_year ?? (defaultSourceIdx === 11 ? currentDate.getFullYear() - 1 : currentDate.getFullYear());
    const targetMonth = params.target_month || MONTHS[defaultTargetIdx];
    const targetYear = params.target_year ?? currentDate.getFullYear();

    console.log(`Rollover: ${sourceMonth} ${sourceYear} → ${targetMonth} ${targetYear}, dry_run=${dry_run}, balance_only=${rollover_balance_only}`);

    // Check auto-rollover setting (skip if manual/force/dry_run)
    if (!force && !dry_run && triggered_by === 'system') {
      const { data: setting } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'auto_kra_rollover')
        .single();

      if (setting?.setting_value) {
        const value = typeof setting.setting_value === 'string'
          ? setting.setting_value.replace(/^"|"$/g, '')
          : setting.setting_value;
        if (value !== 'enabled') {
          return new Response(
            JSON.stringify({ success: true, skipped: true, reason: 'Auto-rollover is disabled' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    // Fetch source KPIs (paginated to avoid 1000-row default limit)
    const sourceKpis: any[] = [];
    const PAGE_SIZE = 1000;
    let page = 0;
    let fetchError: any = null;

    while (true) {
      let sourceQuery = supabase
        .from('kpis')
        .select('*, profiles!kpis_employee_id_fkey(full_name, employee_code, department_id, departments:department_id(name))')
        .eq('review_period', sourceMonth)
        .eq('review_year', sourceYear)
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (employee_ids && employee_ids.length > 0) {
        sourceQuery = sourceQuery.in('employee_id', employee_ids);
      }

      const { data, error } = await sourceQuery;
      if (error) { fetchError = error; break; }
      if (!data || data.length === 0) break;
      sourceKpis.push(...data);
      if (data.length < PAGE_SIZE) break;
      page++;
    }
    if (fetchError) throw new Error(`Failed to fetch source KPIs: ${fetchError.message}`);

    if (!sourceKpis || sourceKpis.length === 0) {
      if (!dry_run) {
        await supabase.from('kra_rollover_logs').insert({
          source_period: sourceMonth, source_year: sourceYear,
          target_period: targetMonth, target_year: targetYear,
          kpis_copied: 0, employees_affected: 0,
          triggered_by, status: 'completed',
        });
      }
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: `No KPIs found in ${sourceMonth} ${sourceYear}`, rolled_over: [], skipped_employees: [], conflicts: [], total_kpis_copied: 0, total_employees_affected: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Group source KPIs by employee
    const employeeKpis: Record<string, typeof sourceKpis> = {};
    for (const kpi of sourceKpis) {
      if (!employeeKpis[kpi.employee_id]) employeeKpis[kpi.employee_id] = [];
      employeeKpis[kpi.employee_id].push(kpi);
    }

    // Fetch existing target KPIs for all relevant employees (paginated)
    const empIds = Object.keys(employeeKpis);
    const targetKpis: any[] = [];
    // Process in chunks of 50 employee IDs to avoid URL length limits
    for (let i = 0; i < empIds.length; i += 50) {
      const chunk = empIds.slice(i, i + 50);
      let tPage = 0;
      while (true) {
        const { data } = await supabase
          .from('kpis')
          .select('employee_id, kra_name, kpi_name')
          .eq('review_period', targetMonth)
          .eq('review_year', targetYear)
          .in('employee_id', chunk)
          .range(tPage * PAGE_SIZE, (tPage + 1) * PAGE_SIZE - 1);
        if (!data || data.length === 0) break;
        targetKpis.push(...data);
        if (data.length < PAGE_SIZE) break;
        tPage++;
      }
    }

    const targetByEmployee: Record<string, Set<string>> = {};
    const targetKrasByEmployee: Record<string, Set<string>> = {};
    if (targetKpis) {
      for (const tk of targetKpis) {
        if (!targetByEmployee[tk.employee_id]) targetByEmployee[tk.employee_id] = new Set();
        if (!targetKrasByEmployee[tk.employee_id]) targetKrasByEmployee[tk.employee_id] = new Set();
        targetByEmployee[tk.employee_id].add(`${tk.kra_name}|||${tk.kpi_name}`);
        targetKrasByEmployee[tk.employee_id].add(tk.kra_name);
      }
    }

    // Process each employee
    const rolledOver: EmployeeResult[] = [];
    const skippedEmployees: EmployeeResult[] = [];
    const conflicts: EmployeeResult[] = [];
    const kpisToInsert: any[] = [];

    for (const [empId, kpis] of Object.entries(employeeKpis)) {
      if (skip_employee_ids.includes(empId)) continue;

      const profile = (kpis[0] as any).profiles;
      const empName = profile?.full_name || 'Unknown';
      const empCode = profile?.employee_code || '';
      const deptName = profile?.departments?.name || '';

      const existingKeys = targetByEmployee[empId] || new Set();
      const existingCount = existingKeys.size;
      const existingNames = Array.from(existingKeys).map(k => k.split('|||')[1]);

      if (existingCount > 0) {
        // Has existing KPIs in target
        if (rollover_balance_only || dry_run) {
          // Find missing KPIs (check both exact kra+kpi match AND kra-only match)
          const existingKras = targetKrasByEmployee[empId] || new Set();
          const missingKpis = kpis.filter(k => 
            !existingKeys.has(`${k.kra_name}|||${k.kpi_name}`)
          );
          
          if (dry_run) {
            // In dry_run, report as conflict so admin can decide
            conflicts.push({
              employee_id: empId,
              employee_name: empName,
              employee_code: empCode,
              department: deptName,
              kpis_copied: missingKpis.length,
              status: 'balance_only',
              existing_kpi_count: existingCount,
              existing_kpi_names: existingNames,
              source_kpi_count: kpis.length,
            });
          } else {
            // Actually insert the missing KPIs
            for (const kpi of missingKpis) {
              kpisToInsert.push(buildNewKpi(kpi, targetMonth, targetYear));
            }
            rolledOver.push({
              employee_id: empId,
              employee_name: empName,
              employee_code: empCode,
              department: deptName,
              kpis_copied: missingKpis.length,
              status: 'balance_only',
              existing_kpi_count: existingCount,
              existing_kpi_names: existingNames,
              source_kpi_count: kpis.length,
            });
          }
        } else {
          // Skip entirely
          skippedEmployees.push({
            employee_id: empId,
            employee_name: empName,
            employee_code: empCode,
            department: deptName,
            kpis_copied: 0,
            status: 'skipped',
            existing_kpi_count: existingCount,
            existing_kpi_names: existingNames,
            source_kpi_count: kpis.length,
          });
        }
      } else {
        // No existing KPIs - copy all, but skip if same KRA already exists
        // (prevents duplicates when org-KPI replication used different kpi_name)
        const existingKras = targetKrasByEmployee[empId] || new Set();
        const kpisToAdd = kpis.filter(k => !existingKras.has(k.kra_name));
        const skippedByKra = kpis.length - kpisToAdd.length;

        if (!dry_run) {
          for (const kpi of kpisToAdd) {
            kpisToInsert.push(buildNewKpi(kpi, targetMonth, targetYear));
          }
        }
        rolledOver.push({
          employee_id: empId,
          employee_name: empName,
          employee_code: empCode,
          department: deptName,
          kpis_copied: kpisToAdd.length,
          status: 'rolled_over',
          existing_kpi_count: 0,
          existing_kpi_names: [],
          source_kpi_count: kpis.length,
        });
      }
    }

    if (dry_run) {
      return new Response(
        JSON.stringify({
          success: true,
          dry_run: true,
          rolled_over: rolledOver,
          skipped_employees: skippedEmployees,
          conflicts,
          total_kpis_copied: rolledOver.reduce((s, r) => s + r.kpis_copied, 0),
          total_employees_affected: rolledOver.length,
          source_period: sourceMonth,
          source_year: sourceYear,
          target_period: targetMonth,
          target_year: targetYear,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create review period if needed
    await supabase.from('review_periods').upsert(
      { period_name: targetMonth, review_year: targetYear, is_locked: false },
      { onConflict: 'period_name,review_year', ignoreDuplicates: true }
    );

    // Insert KPIs in batches of 500
    let totalInserted = 0;
    for (let i = 0; i < kpisToInsert.length; i += 500) {
      const batch = kpisToInsert.slice(i, i + 500);
      const { data: inserted, error: insertError } = await supabase
        .from('kpis')
        .insert(batch)
        .select('id');

      if (insertError) {
        await supabase.from('kra_rollover_logs').insert({
          source_period: sourceMonth, source_year: sourceYear,
          target_period: targetMonth, target_year: targetYear,
          kpis_copied: totalInserted, employees_affected: 0,
          triggered_by, status: 'failed',
          error_message: insertError.message,
        });
        throw new Error(`Insert failed: ${insertError.message}`);
      }
      totalInserted += inserted?.length || 0;
    }

    const allResults = [...rolledOver, ...skippedEmployees];

    // Log successful rollover
    await supabase.from('kra_rollover_logs').insert({
      source_period: sourceMonth,
      source_year: sourceYear,
      target_period: targetMonth,
      target_year: targetYear,
      kpis_copied: totalInserted,
      employees_affected: rolledOver.length,
      triggered_by,
      status: 'completed',
      details: { rolled_over: rolledOver, skipped: skippedEmployees },
    });

    return new Response(
      JSON.stringify({
        success: true,
        rolled_over: rolledOver,
        skipped_employees: skippedEmployees,
        conflicts: [],
        total_kpis_copied: totalInserted,
        total_employees_affected: rolledOver.length,
        source_period: sourceMonth,
        source_year: sourceYear,
        target_period: targetMonth,
        target_year: targetYear,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Rollover error:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function buildNewKpi(source: any, targetMonth: string, targetYear: number) {
  return {
    employee_id: source.employee_id,
    category_id: source.category_id,
    kra_name: source.kra_name,
    kpi_name: source.kpi_name,
    target_value: source.target_value,
    uom: source.uom,
    uom_type: source.uom_type,
    weightage: source.weightage,
    frequency: source.frequency,
    sub_frequency: source.sub_frequency,
    criteria: source.criteria,
    source_of_data: source.source_of_data,
    r5: source.r5,
    r4: source.r4,
    r3: source.r3,
    r2: source.r2,
    r1: source.r1,
    r0: source.r0,
    threshold_mode: source.threshold_mode,
    qualitative_options: source.qualitative_options,
    is_org_level: source.is_org_level,
    org_level_scope: source.org_level_scope,
    ref_code: source.ref_code,
    day_count_type: source.day_count_type,
    frequency_cycle_start: source.frequency_cycle_start,
    require_resubmit_reason: source.require_resubmit_reason,
    review_period: targetMonth,
    review_year: targetYear,
    status: 'kra_set',
  };
}
