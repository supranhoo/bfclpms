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
  /**
   * When true, after rolling over KPIs the function also clones the
   * `audit_kpi_level_assignments` rows from each source KPI onto its newly
   * created target KPI counterpart (matched by employee + kra_name + kpi_name +
   * resolved review_period). Existing assignments on target KPIs are preserved
   * (UNIQUE kpi_id → ON CONFLICT DO NOTHING). Opt-in, audit-logged.
   */
  carry_audit_assignments?: boolean;
}

// --- Frequency resolution helpers ---

/**
 * Parse a cycle_start string (e.g., 'Feb-Mar', 'Apr-Jun') into its start month index (0-based).
 */
function parseCycleStartIdx(cycleStart: string | null | undefined): number | null {
  if (!cycleStart) return null;
  const abbrevMap: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  const first = cycleStart.split('-')[0];
  return abbrevMap[first] ?? null;
}

function getCycleLength(frequency: string): number {
  switch (frequency.trim()) {
    case 'Bi-Monthly': return 2;
    case 'Quarterly': return 3;
    case 'Half-Yearly': return 6;
    case 'Yearly': return 12;
    default: return 1;
  }
}

const MONTH_ABBREV = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/**
 * Resolve the correct cycle anchor (e.g. 'Apr-May', 'Apr-Jun', 'Jan-Dec') for a given
 * frequency + target month. Standard calendar-aligned cycles (Jan-anchored) are used to
 * match the existing UI options and the database `resolve_cycle_anchor` helper.
 */
function resolveCycleAnchorForPeriod(frequency: string | null, targetMonth: string): string | null {
  if (!frequency) return null;
  const len = getCycleLength(frequency);
  if (len <= 1) return null;
  const idx = MONTHS.indexOf(targetMonth);
  if (idx < 0) return null;
  if (len === 12) return 'Jan-Dec';
  const startIdx = Math.floor(idx / len) * len;
  const endIdx = startIdx + len - 1;
  return `${MONTH_ABBREV[startIdx]}-${MONTH_ABBREV[endIdx]}`;
}

/**
 * Given a target month index (0-based), a KPI frequency, and optional cycle start,
 * resolve the correct terminal month index for the cycle that contains the target month.
 */
function resolveTerminalMonth(targetMonthIdx: number, frequency: string | null, cycleStart?: string | null): number {
  if (!frequency) return targetMonthIdx;
  const len = getCycleLength(frequency);
  if (len <= 1) return targetMonthIdx;

  const csIdx = parseCycleStartIdx(cycleStart);
  if (csIdx !== null) {
    // Dynamic: offset from cycle start, find terminal
    const offset = ((targetMonthIdx - csIdx) % 12 + 12) % 12;
    const cycleIdx = Math.floor(offset / len);
    const terminalIdx = (csIdx + (cycleIdx + 1) * len - 1) % 12;
    return terminalIdx;
  }

  // Fallback: hardcoded standard cycles
  const freq = frequency.trim();
  switch (freq) {
    case 'Bi-Monthly':
      return targetMonthIdx % 2 === 0 ? targetMonthIdx + 1 : targetMonthIdx;
    case 'Quarterly':
      if (targetMonthIdx <= 2) return 2;
      if (targetMonthIdx <= 5) return 5;
      if (targetMonthIdx <= 8) return 8;
      return 11;
    case 'Half-Yearly':
      return targetMonthIdx <= 5 ? 5 : 11;
    case 'Yearly':
      return 11;
    default:
      return targetMonthIdx;
  }
}

/**
 * Given a target month index (0-based), a KPI frequency, and optional cycle start,
 * return ALL month indices that belong to the same cycle.
 */
function getCycleMonthsForTarget(targetMonthIdx: number, frequency: string | null, cycleStart?: string | null): number[] {
  if (!frequency) return [targetMonthIdx];
  const len = getCycleLength(frequency);
  if (len <= 1) return [targetMonthIdx];

  const csIdx = parseCycleStartIdx(cycleStart);
  if (csIdx !== null) {
    // Dynamic: compute cycle boundaries
    const offset = ((targetMonthIdx - csIdx) % 12 + 12) % 12;
    const cycleIdx = Math.floor(offset / len);
    const cycleStartPos = (csIdx + cycleIdx * len) % 12;
    const months: number[] = [];
    for (let i = 0; i < len; i++) {
      months.push((cycleStartPos + i) % 12);
    }
    return months;
  }

  // Fallback: hardcoded standard cycles
  const freq = frequency.trim();
  switch (freq) {
    case 'Bi-Monthly': {
      const pairStart = targetMonthIdx % 2 === 0 ? targetMonthIdx : targetMonthIdx - 1;
      return [pairStart, pairStart + 1];
    }
    case 'Quarterly':
      if (targetMonthIdx <= 2) return [0, 1, 2];
      if (targetMonthIdx <= 5) return [3, 4, 5];
      if (targetMonthIdx <= 8) return [6, 7, 8];
      return [9, 10, 11];
    case 'Half-Yearly':
      return targetMonthIdx <= 5 ? [0, 1, 2, 3, 4, 5] : [6, 7, 8, 9, 10, 11];
    case 'Yearly':
      return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    default:
      return [targetMonthIdx];
  }
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
      isAuthorized = true;
    } else if (authHeader?.startsWith('Bearer ')) {
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
      carry_audit_assignments = false,
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

    // Fetch active status for all employees to skip inactive ones
    const empIdsAll = Object.keys(employeeKpis);
    const inactiveSet = new Set<string>();
    for (let i = 0; i < empIdsAll.length; i += 50) {
      const chunk = empIdsAll.slice(i, i + 50);
      const { data: profileChunk } = await supabase
        .from('profiles')
        .select('id, is_active')
        .in('id', chunk)
        .eq('is_active', false);
      if (profileChunk) {
        for (const p of profileChunk) inactiveSet.add(p.id);
      }
    }

    // Resolve the target month index (0-based)
    const targetMonthIdx = MONTHS.indexOf(targetMonth);

    // Fetch existing target KPIs for all relevant employees (paginated)
    // We need to check ALL possible cycle months, not just the raw target.
    // CRITICAL: build the month set from the actual source KPIs (honouring each
    // KPI's own frequency_cycle_start), otherwise non-standard cycle anchors
    // resolve to months we never queried and the unique index trips on insert.
    const possibleTargetMonths = new Set<string>();
    possibleTargetMonths.add(targetMonth);
    for (const kpi of sourceKpis) {
      const cycleMonths = getCycleMonthsForTarget(targetMonthIdx, kpi.frequency, kpi.frequency_cycle_start);
      for (const m of cycleMonths) {
        if (m >= targetMonthIdx) possibleTargetMonths.add(MONTHS[m]);
      }
    }

    const empIds = Object.keys(employeeKpis);
    const targetKpis: any[] = [];
    for (let i = 0; i < empIds.length; i += 50) {
      const chunk = empIds.slice(i, i + 50);
      let tPage = 0;
      while (true) {
        const { data } = await supabase
          .from('kpis')
          .select('employee_id, kra_name, kpi_name, review_period')
          .eq('review_year', targetYear)
          .in('review_period', Array.from(possibleTargetMonths))
          .in('employee_id', chunk)
          .range(tPage * PAGE_SIZE, (tPage + 1) * PAGE_SIZE - 1);
        if (!data || data.length === 0) break;
        targetKpis.push(...data);
        if (data.length < PAGE_SIZE) break;
        tPage++;
      }
    }

    // Build dedup sets keyed by employee — include review_period in key for multi-month awareness
    const targetByEmployee: Record<string, Set<string>> = {};
    const targetKrasByEmployee: Record<string, Set<string>> = {};
    if (targetKpis) {
      for (const tk of targetKpis) {
        if (!targetByEmployee[tk.employee_id]) targetByEmployee[tk.employee_id] = new Set();
        if (!targetKrasByEmployee[tk.employee_id]) targetKrasByEmployee[tk.employee_id] = new Set();
        targetByEmployee[tk.employee_id].add(`${tk.review_period}|||${tk.kra_name}|||${tk.kpi_name}`);
        targetKrasByEmployee[tk.employee_id].add(`${tk.review_period}|||${tk.kra_name}`);
      }
    }

    // Process each employee
    const rolledOver: EmployeeResult[] = [];
    const skippedEmployees: EmployeeResult[] = [];
    const conflicts: EmployeeResult[] = [];
    const kpisToInsert: any[] = [];
    // Track which source KPI each target row was cloned from, keyed by the
    // signature we use to look the inserted row back up afterwards.
    // Signature: `${employee_id}|${review_year}|${review_period}|${kra_name}|${kpi_name}`
    const sigToSourceKpiId = new Map<string, string>();

    for (const [empId, kpis] of Object.entries(employeeKpis)) {
      if (skip_employee_ids.includes(empId)) continue;
      if (inactiveSet.has(empId)) {
        const profile = (kpis[0] as any).profiles;
        skippedEmployees.push({
          employee_id: empId,
          employee_name: profile?.full_name || 'Unknown',
          employee_code: profile?.employee_code || '',
          department: profile?.departments?.name || '',
          kpis_copied: 0,
          status: 'skipped',
          existing_kpi_count: 0,
          existing_kpi_names: [],
          source_kpi_count: kpis.length,
        });
        continue;
      }

      const profile = (kpis[0] as any).profiles;
      const empName = profile?.full_name || 'Unknown';
      const empCode = profile?.employee_code || '';
      const deptName = profile?.departments?.name || '';

      // For dedup, we check against the resolved target month per KPI
      let kpisCopied = 0;
      const existingNames: string[] = [];
      let existingCount = 0;

      const kpisForThisEmployee: any[] = [];

      for (const kpi of kpis) {
        const empExistingKeys = targetByEmployee[empId] || new Set();
        const empExistingKras = targetKrasByEmployee[empId] || new Set();

        // Determine all cycle months for this KPI frequency
        const cycleMonths = getCycleMonthsForTarget(targetMonthIdx, kpi.frequency, kpi.frequency_cycle_start);
        // Only create records for months >= target month (earlier months already exist from prior cycles)
        const monthsToCreate = cycleMonths.filter(m => m >= targetMonthIdx);

        // Per-month kra_name+kpi_name dedup below is sufficient;
        // KRA-level terminal dedup removed — it blocked sibling month creation.

        let anyCreated = false;
        for (const monthIdx of monthsToCreate) {
          const month = MONTHS[monthIdx];
          const dedupKey = `${month}|||${kpi.kra_name}|||${kpi.kpi_name}`;

          if (empExistingKeys.has(dedupKey)) {
            // Record already exists for this month — skip it
            continue;
          }

          kpisForThisEmployee.push(buildNewKpi(kpi, month, targetYear));
          // Remember the source→target linkage for audit-assignment cloning.
          sigToSourceKpiId.set(
            `${kpi.employee_id}|${targetYear}|${month}|${kpi.kra_name}|${kpi.kpi_name}`,
            kpi.id,
          );
          kpisCopied++;
          anyCreated = true;
          // Add to dedup set so subsequent KPIs don't duplicate
          empExistingKeys.add(dedupKey);
        }

        if (!anyCreated) {
          // All months already had records
          existingCount++;
          existingNames.push(kpi.kpi_name);
        }
      }

      if (dry_run && existingCount > 0 && kpisCopied > 0) {
        conflicts.push({
          employee_id: empId,
          employee_name: empName,
          employee_code: empCode,
          department: deptName,
          kpis_copied: kpisCopied,
          status: 'balance_only',
          existing_kpi_count: existingCount,
          existing_kpi_names: existingNames,
          source_kpi_count: kpis.length,
        });
      } else if (kpisCopied > 0) {
        if (!dry_run) {
          kpisToInsert.push(...kpisForThisEmployee);
        }
        rolledOver.push({
          employee_id: empId,
          employee_name: empName,
          employee_code: empCode,
          department: deptName,
          kpis_copied: kpisCopied,
          status: existingCount > 0 ? 'balance_only' : 'rolled_over',
          existing_kpi_count: existingCount,
          existing_kpi_names: existingNames,
          source_kpi_count: kpis.length,
        });
      } else if (existingCount > 0) {
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

    // Create review period if needed — for all possible resolved months
    const resolvedMonthsSet = new Set<string>();
    for (const kpi of kpisToInsert) {
      resolvedMonthsSet.add(kpi.review_period);
    }
    for (const rm of resolvedMonthsSet) {
      await supabase.from('review_periods').upsert(
        { period_name: rm, review_year: targetYear, is_locked: false },
        { onConflict: 'period_name,review_year', ignoreDuplicates: true }
      );
    }

    // Insert KPIs in batches of 500
    let totalInserted = 0;
    let duplicatesSkipped = 0;
    for (let i = 0; i < kpisToInsert.length; i += 500) {
      const batch = kpisToInsert.slice(i, i + 500);

      // Use the batch insert function that sets the rollover flag,
      // suppressing per-KPI notification triggers. The RPC uses
      // ON CONFLICT ON CONSTRAINT idx_kpis_no_duplicates DO NOTHING,
      // so pre-existing rows are silently skipped instead of aborting
      // the entire batch.
      const { data: insertedCount, error: insertError } = await supabase
        .rpc('batch_insert_kpis_with_rollover_flag', {
          kpis_json: batch,
        });

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
      const inserted = insertedCount || 0;
      totalInserted += inserted;
      duplicatesSkipped += batch.length - inserted;
    }

    // ── Optional: carry forward auditor mappings (audit_kpi_level_assignments) ──
    // Triggered when carry_audit_assignments=true. Idempotent: target KPIs that
    // already have an assignment row are preserved (UNIQUE kpi_id constraint).
    let auditAssignmentsCloned = 0;
    let auditAssignmentsSkipped = 0;
    const auditCloneErrors: string[] = [];
    if (carry_audit_assignments && sigToSourceKpiId.size > 0) {
      try {
        const sourceKpiIds = Array.from(new Set(sigToSourceKpiId.values()));

        // 1. Pull every audit assignment that exists on the source KPIs.
        const sourceAssignmentByKpi = new Map<string, string>(); // src_kpi_id → auditor_id
        for (let i = 0; i < sourceKpiIds.length; i += 200) {
          const chunk = sourceKpiIds.slice(i, i + 200);
          const { data, error } = await supabase
            .from('audit_kpi_level_assignments')
            .select('kpi_id, auditor_id')
            .in('kpi_id', chunk);
          if (error) throw new Error(`Fetch source audit assignments: ${error.message}`);
          for (const row of data || []) {
            sourceAssignmentByKpi.set(row.kpi_id, row.auditor_id);
          }
        }

        if (sourceAssignmentByKpi.size > 0) {
          // 2. Re-fetch the newly created target KPIs so we know their ids.
          //    Filter by employee_ids + target year + the resolved months we used.
          const targetEmployeeIds = Array.from(new Set(kpisToInsert.map((k: any) => k.employee_id)));
          const targetMonths = Array.from(new Set(kpisToInsert.map((k: any) => k.review_period)));
          const targetSigToId = new Map<string, string>(); // sig → target_kpi_id
          for (let i = 0; i < targetEmployeeIds.length; i += 50) {
            const empChunk = targetEmployeeIds.slice(i, i + 50);
            let tp = 0;
            while (true) {
              const { data, error } = await supabase
                .from('kpis')
                .select('id, employee_id, review_period, review_year, kra_name, kpi_name')
                .eq('review_year', targetYear)
                .in('review_period', targetMonths)
                .in('employee_id', empChunk)
                .range(tp * PAGE_SIZE, (tp + 1) * PAGE_SIZE - 1);
              if (error) throw new Error(`Fetch target KPIs: ${error.message}`);
              if (!data || data.length === 0) break;
              for (const r of data) {
                const sig = `${r.employee_id}|${r.review_year}|${r.review_period}|${r.kra_name}|${r.kpi_name}`;
                targetSigToId.set(sig, r.id);
              }
              if (data.length < PAGE_SIZE) break;
              tp++;
            }
          }

          // 3. Build assignment rows for newly created target KPIs whose source
          //    KPI had an auditor mapping.
          const rowsToUpsert: { kpi_id: string; auditor_id: string; assigned_by: string | null }[] = [];
          for (const [sig, srcKpiId] of sigToSourceKpiId.entries()) {
            const targetKpiId = targetSigToId.get(sig);
            if (!targetKpiId) continue;
            const auditorId = sourceAssignmentByKpi.get(srcKpiId);
            if (!auditorId) continue;
            rowsToUpsert.push({
              kpi_id: targetKpiId,
              auditor_id: auditorId,
              assigned_by: null, // automated rollover — system performer attribution
            });
          }

          // 4. Upsert in batches; UNIQUE (kpi_id) → ignoreDuplicates preserves
          //    any pre-existing manual assignment on the target KPI.
          for (let i = 0; i < rowsToUpsert.length; i += 500) {
            const batch = rowsToUpsert.slice(i, i + 500);
            const { error, count } = await supabase
              .from('audit_kpi_level_assignments')
              .upsert(batch, { onConflict: 'kpi_id', ignoreDuplicates: true, count: 'exact' });
            if (error) {
              auditCloneErrors.push(error.message);
              continue;
            }
            auditAssignmentsCloned += count ?? 0;
            auditAssignmentsSkipped += batch.length - (count ?? 0);
          }

          // 5. Audit-log the bulk action (best-effort).
          try {
            await supabase.from('system_audit_logs').insert({
              action: 'AUDIT_ASSIGNMENTS_CARRIED_FORWARD',
              performed_by: null,
              metadata: {
                source_period: sourceMonth,
                source_year: sourceYear,
                target_period: targetMonth,
                target_year: targetYear,
                triggered_by,
                source_assignments_found: sourceAssignmentByKpi.size,
                target_kpis_matched: rowsToUpsert.length,
                cloned: auditAssignmentsCloned,
                skipped_already_assigned: auditAssignmentsSkipped,
                errors: auditCloneErrors,
              },
            });
          } catch (logErr) {
            console.error('Audit-clone log insert failed:', logErr);
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('Carry-forward audit assignments failed:', msg);
        auditCloneErrors.push(msg);
      }
    }

    // ── Send ONE consolidated notification + email per affected employee ──
    // (supabaseUrl is already declared at the top of the handler)
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    for (const result of rolledOver) {
      const empId = result.employee_id;
      const empKpis = employeeKpis[empId] || [];
      const copiedKpis = kpisToInsert.filter((k: any) => k.employee_id === empId);
      const uniqueKras = [...new Set(copiedKpis.map((k: any) => k.kra_name))];
      const totalWeightage = copiedKpis.reduce((s: number, k: any) => s + (k.weightage || 0), 0);

      const notifMessage = `${result.kpis_copied} KPI(s) have been rolled over from ${sourceMonth} ${sourceYear} to ${targetMonth} ${targetYear}. Total weightage: ${totalWeightage}%.`;

      // Check if employee has an auth.users row before inserting notification
      const { data: authCheck } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('id', empId)
        .single();

      if (authCheck) {
        // Insert consolidated in-app notification (best-effort)
        try {
          await supabase.from('notifications').insert({
            user_id: empId,
            type: 'kra_rollover',
            title: 'KRA/KPIs Rolled Over',
            message: notifMessage,
            metadata: {
              source_period: sourceMonth,
              source_year: sourceYear,
              target_period: targetMonth,
              target_year: targetYear,
              kpi_count: result.kpis_copied,
              kra_names: uniqueKras,
            },
          });
        } catch (e) {
          console.error(`Failed to insert rollover notification for ${empId}:`, e);
        }

        // Send consolidated email (fire-and-forget)
        if (authCheck.email) {
          const kraList = copiedKpis.map((k: any) => ({
            kra_name: k.kra_name,
            kpi_name: String(k.kpi_name).split('\n')[0].substring(0, 100),
            target_value: k.target_value != null ? String(k.target_value) : '-',
            weightage: k.weightage != null ? `${k.weightage}%` : '-',
            uom: k.uom || '-',
          }));

          try {
            await fetch(`${supabaseUrl}/functions/v1/send-email-notification`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': anonKey,
                'Authorization': `Bearer ${anonKey}`,
              },
              body: JSON.stringify({
                event_type: 'kra_rollover',
                recipient_email: authCheck.email,
                recipient_name: authCheck.full_name || 'Employee',
                review_period: targetMonth,
                review_year: targetYear,
                source_period: sourceMonth,
                source_year: sourceYear,
                kra_count: result.kpis_copied,
                total_weightage: `${totalWeightage}%`,
                kra_list: kraList,
              }),
            });
          } catch (emailErr) {
            console.error(`Failed to send rollover email for ${empId}:`, emailErr);
          }
        }
      }
    }

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
      error_message: duplicatesSkipped > 0
        ? `Skipped ${duplicatesSkipped} pre-existing duplicate KPI(s).`
        : null,
      details: { rolled_over: rolledOver, skipped: skippedEmployees, duplicates_skipped: duplicatesSkipped },
    });

    return new Response(
      JSON.stringify({
        success: true,
        rolled_over: rolledOver,
        skipped_employees: skippedEmployees,
        conflicts: [],
        total_kpis_copied: totalInserted,
        duplicates_skipped: duplicatesSkipped,
        total_employees_affected: rolledOver.length,
        source_period: sourceMonth,
        source_year: sourceYear,
        target_period: targetMonth,
        target_year: targetYear,
        audit_assignments_cloned: auditAssignmentsCloned,
        audit_assignments_skipped_already_assigned: auditAssignmentsSkipped,
        audit_clone_errors: auditCloneErrors,
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
  const resolvedCycleStart = resolveCycleAnchorForPeriod(source.frequency, targetMonth) ?? source.frequency_cycle_start;
  if (resolvedCycleStart !== source.frequency_cycle_start) {
    console.log(`[Rollover] Cycle anchor resolved for ${source.kpi_name}: ${source.frequency_cycle_start} → ${resolvedCycleStart} (${source.frequency} @ ${targetMonth})`);
  }
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
    frequency_cycle_start: resolvedCycleStart,
    require_resubmit_reason: source.require_resubmit_reason,
    review_period: targetMonth,
    review_year: targetYear,
    status: 'kra_set',
  };
}
