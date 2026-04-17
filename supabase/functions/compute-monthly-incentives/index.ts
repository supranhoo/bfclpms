import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkIncentiveAccess } from '../_shared/incentive-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // --- Configurable RBAC via shared helper (§73) ---
    const auth = await checkIncentiveAccess(supabase, req.headers.get('Authorization'), ['admin-incentive', 'reports-incentive']);
    if (!auth.authorized) {
      return new Response(JSON.stringify({ error: auth.error }), { status: auth.status || 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { review_period, review_year, program_id, dry_run = false } = await req.json();
    if (!review_period || !review_year) {
      return new Response(JSON.stringify({ error: 'review_period and review_year required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 1. Fetch the program and its slabs
    const { data: program } = await supabase
      .from('incentive_programs')
      .select('*')
      .eq('id', program_id)
      .single();

    if (!program) {
      return new Response(JSON.stringify({ error: 'Program not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: slabs } = await supabase
      .from('incentive_slabs')
      .select('*')
      .eq('program_id', program_id)
      .order('min_value', { ascending: true });

    const { data: dqRules } = await supabase
      .from('incentive_disqualification_rules')
      .select('*')
      .eq('program_id', program_id)
      .eq('is_active', true);

    // 2. Resolve program mappings to get eligible employee IDs
    const { data: mappings } = await supabase
      .from('incentive_program_mappings')
      .select('mapping_type, mapping_value')
      .eq('program_id', program_id);

    let employeeFilter: string[] | null = null; // null = no mappings = all employees

    if (mappings && mappings.length > 0) {
      const eligibleIds = new Set<string>();
      const divIds: string[] = [];
      const deptIds: string[] = [];
      const buIds: string[] = [];
      const desigs: string[] = [];
      const pmsGrades: string[] = [];

      for (const m of mappings) {
        switch (m.mapping_type) {
          case 'employee': eligibleIds.add(m.mapping_value); break;
          case 'division': divIds.push(m.mapping_value); break;
          case 'department': deptIds.push(m.mapping_value); break;
          case 'business_unit': buIds.push(m.mapping_value); break;
          case 'designation': desigs.push(m.mapping_value); break;
          case 'pms_grade': pmsGrades.push(m.mapping_value); break;
        }
      }

      // Resolve division → BU → department → employees
      if (divIds.length > 0) {
        const { data: divBUs } = await supabase
          .from('business_units').select('id').in('division_id', divIds);
        if (divBUs?.length) {
          buIds.push(...divBUs.map((b: any) => b.id));
        }
      }

      // Resolve department employees
      if (deptIds.length > 0) {
        const { data: deptEmps } = await supabase
          .from('profiles').select('id').eq('is_active', true).in('department_id', deptIds);
        deptEmps?.forEach((e: any) => eligibleIds.add(e.id));
      }

      // Resolve BU employees (dept -> BU mapping)
      if (buIds.length > 0) {
        const { data: buDepts } = await supabase
          .from('departments').select('id').in('business_unit_id', buIds);
        if (buDepts?.length) {
          const { data: buEmps } = await supabase
            .from('profiles').select('id').eq('is_active', true)
            .in('department_id', buDepts.map((d: any) => d.id));
          buEmps?.forEach((e: any) => eligibleIds.add(e.id));
        }
      }

      // Resolve designation employees
      if (desigs.length > 0) {
        const { data: desigEmps } = await supabase
          .from('profiles').select('id').eq('is_active', true).in('designation', desigs);
        desigEmps?.forEach((e: any) => eligibleIds.add(e.id));
      }

      // Resolve PMS grade employees
      if (pmsGrades.length > 0) {
        const { data: gradeEmps } = await supabase
          .from('profiles').select('id').eq('is_active', true).in('pms_grade', pmsGrades);
        gradeEmps?.forEach((e: any) => eligibleIds.add(e.id));
      }

      employeeFilter = Array.from(eligibleIds);
    }

    // Fetch employees (filtered if mappings exist, otherwise all)
    let employeeQuery = supabase
      .from('profiles')
      .select('id, full_name, employee_code, department_id')
      .eq('is_active', true);

    if (employeeFilter !== null) {
      if (employeeFilter.length === 0) {
        return new Response(JSON.stringify({ computed: 0, message: 'No employees match program mappings' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      // Batch employee filter in groups of 100 to avoid query limits
      const allEmployees: any[] = [];
      for (let i = 0; i < employeeFilter.length; i += 100) {
        const batch = employeeFilter.slice(i, i + 100);
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, employee_code, department_id')
          .eq('is_active', true)
          .in('id', batch);
        if (data) allEmployees.push(...data);
      }
      var employees = allEmployees;
    } else {
      const { data } = await employeeQuery;
      var employees = data;
    }

    if (!employees?.length) {
      return new Response(JSON.stringify({ computed: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 3. Fetch eligibility data
    const { data: eligibilityData } = await supabase
      .from('employee_incentive_eligibility')
      .select('*')
      .eq('review_period', review_period)
      .eq('review_year', review_year);

    const eligMap = new Map((eligibilityData || []).map((e: any) => [e.employee_id, e]));

    // 4. For support programs, fetch KPIs with scores (paginated)
    let kpiMap = new Map<string, any[]>();
    if (program.program_type === 'support') {
      const empIds = employees.map((e: any) => e.id);
      const batchSize = 50;
      const pageSize = 1000;

      for (let i = 0; i < empIds.length; i += batchSize) {
        const batch = empIds.slice(i, i + batchSize);
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          const { data: kpis } = await supabase
            .from('kpis')
            .select('id, employee_id, weightage, status, review_submissions(self_score, manager_score, hr_pms_score, skip_level_score, auditor_score, management_score, final_score, is_na)')
            .eq('review_period', review_period)
            .eq('review_year', review_year)
            .in('employee_id', batch)
            .range(offset, offset + pageSize - 1);

          if (kpis?.length) {
            for (const kpi of kpis) {
              const list = kpiMap.get(kpi.employee_id) || [];
              list.push(kpi);
              kpiMap.set(kpi.employee_id, list);
            }
            offset += pageSize;
            hasMore = kpis.length === pageSize;
          } else {
            hasMore = false;
          }
        }
      }
    }

    // 5a. Fetch vessel rates and monthly vessel entries for vessel-based programs
    let vesselRateMap = new Map<string, number>();
    let vesselEntryMap = new Map<string, number>();
    if (program.incentive_base === 'fixed') {
      const { data: vRates } = await supabase
        .from('incentive_vessel_rates')
        .select('employee_id, rate_per_vessel')
        .eq('program_id', program_id);
      if (vRates) {
        for (const vr of vRates) {
          vesselRateMap.set(vr.employee_id, vr.rate_per_vessel);
        }
      }

      const { data: vEntries } = await supabase
        .from('vessel_monthly_entries')
        .select('employee_id, vessels_handled')
        .eq('program_id', program_id)
        .eq('month', review_period)
        .eq('year', review_year);
      if (vEntries) {
        for (const ve of vEntries) {
          vesselEntryMap.set(ve.employee_id, ve.vessels_handled);
        }
      }
    }

    // 5b. Fetch production daily entries and rates for production programs
    // Store raw daily_values so we can split by period later
    let prodDailyMap = new Map<string, Record<string, any>>(); // employee_id -> daily_values
    let prodEntryMap = new Map<string, number>(); // employee_id -> totalTons (for slab matching)
    let prodRates: any[] = [];
    if (program.program_type === 'production') {
      const { data: dailyEntries } = await supabase
        .from('production_daily_entries')
        .select('employee_id, daily_values')
        .eq('program_id', program_id)
        .eq('month', review_period)
        .eq('year', review_year);

      if (dailyEntries) {
        for (const entry of dailyEntries) {
          const vals = entry.daily_values as Record<string, any> || {};
          prodDailyMap.set(entry.employee_id, vals);
          let total = 0;
          for (const key of Object.keys(vals)) {
            const v = parseFloat(vals[key]);
            if (!isNaN(v)) total += v;
          }
          prodEntryMap.set(entry.employee_id, total);
        }
      }

      const { data: rates } = await supabase
        .from('incentive_production_rates')
        .select('employee_id, entity_id, rate_per_ton, rate_type, effective_from')
        .eq('program_id', program_id);
      prodRates = rates || [];
    }

    // Build dept -> BU and BU -> company resolution chain (for production rate cascade)
    const deptToBu = new Map<string, string | null>();
    const buToCompany = new Map<string, string | null>();
    if (program.program_type === 'production') {
      const { data: allDepts } = await supabase
        .from('departments').select('id, business_unit_id');
      allDepts?.forEach((d: any) => deptToBu.set(d.id, d.business_unit_id));

      const { data: allBus } = await supabase
        .from('business_units').select('id, division_id');
      const { data: allDivs } = await supabase
        .from('divisions').select('id, company_id');
      const divToCompany = new Map<string, string | null>();
      allDivs?.forEach((dv: any) => divToCompany.set(dv.id, dv.company_id));
      allBus?.forEach((b: any) => {
        buToCompany.set(b.id, b.division_id ? (divToCompany.get(b.division_id) ?? null) : null);
      });
    }

    // 5. Fetch existing records to check for manual overrides
    const { data: existingRecords } = await supabase
      .from('employee_incentive_records')
      .select('employee_id, incentive_status, status_overridden_by')
      .eq('review_period', review_period)
      .eq('review_year', review_year)
      .eq('program_id', program_id);

    // 6. Compute incentive for each employee
    const records: any[] = [];
    let computed = 0;

    for (const emp of employees) {
      const elig = eligMap.get(emp.id);
      let pmsScore: number | null = null;
      let matchedSlab: any = null;
      let basePercent = 0;
      let isDQ = false;
      const dqReasons: string[] = [];
      let ltiPenalty = 0;
      let proRata = 1.0;

      // Compute PMS score for support
      if (program.program_type === 'support') {
        const empKpis = kpiMap.get(emp.id) || [];
        let totalWeightedScore = 0;
        let totalWeight = 0;

        for (const kpi of empKpis) {
          const s = kpi.review_submissions;
          if (!s || s.is_na) continue;

          const score = (kpi.status === 'approved' ? s.final_score : null)
            ?? s.management_score ?? s.auditor_score
            ?? s.hr_pms_score ?? s.skip_level_score
            ?? s.manager_score ?? s.self_score ?? null;

          if (score !== null && kpi.weightage) {
            totalWeightedScore += score * kpi.weightage;
            totalWeight += kpi.weightage;
          }
        }

        pmsScore = totalWeight > 0 ? totalWeightedScore / totalWeight : null;
      } else {
        // Production — use aggregated production daily entries
        pmsScore = null;
      }

      // Resolve production rate and amount for production programs
      let productionTotalTons: number | null = null;
      let resolvedRate: number | null = null;
      let incentiveAmount = 0;

      if (program.program_type === 'production') {
        productionTotalTons = prodEntryMap.get(emp.id) ?? null;

        // Resolve BU and company for this employee
        const empBuId = emp.department_id ? (deptToBu.get(emp.department_id) ?? null) : null;
        const empCompanyId = empBuId ? (buToCompany.get(empBuId) ?? null) : null;

        // Compute period-end date for effective-from filtering
        const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
        const monthIdx = MONTHS.indexOf(String(review_period).toLowerCase());
        // Last day of month: use day 0 of next month
        const periodEndDate = monthIdx >= 0
          ? new Date(Date.UTC(review_year, monthIdx + 1, 0))
          : new Date();
        const periodEndStr = periodEndDate.toISOString().slice(0, 10);

        // Pick latest-effective rate (effective_from <= periodEnd) per scope
        const pickLatest = (filterFn: (r: any) => boolean) => {
          const candidates = prodRates
            .filter(filterFn)
            .filter((r: any) => !r.effective_from || r.effective_from <= periodEndStr)
            .sort((a: any, b: any) => String(b.effective_from || '').localeCompare(String(a.effective_from || '')));
          return candidates[0] || null;
        };

        // Priority cascade: employee > department > BU > company > common
        const empRate = pickLatest((r: any) => r.rate_type === 'employee' && r.employee_id === emp.id);
        const deptRate = emp.department_id ? pickLatest((r: any) => r.rate_type === 'department' && r.entity_id === emp.department_id) : null;
        const buRate = empBuId ? pickLatest((r: any) => r.rate_type === 'bu' && r.entity_id === empBuId) : null;
        const companyRate = empCompanyId ? pickLatest((r: any) => r.rate_type === 'company' && r.entity_id === empCompanyId) : null;
        const commonRate = pickLatest((r: any) => r.rate_type === 'common');

        const rateRecord = empRate || deptRate || buRate || companyRate || commonRate;
        resolvedRate = rateRecord?.rate_per_ton ?? null;

        if (productionTotalTons !== null && resolvedRate !== null) {
          incentiveAmount = productionTotalTons * resolvedRate;
        }
      }

      // Match slab
      const scoreForSlab = program.program_type === 'support' ? pmsScore : (productionTotalTons ?? elig?.production_value);
      if (scoreForSlab !== null && scoreForSlab !== undefined && slabs?.length) {
        const pmsSlabs = slabs.filter((s: any) =>
          s.slab_category === (program.program_type === 'support' ? 'pms_score' : 'production')
        );
        for (const slab of pmsSlabs) {
          if (scoreForSlab >= slab.min_value && scoreForSlab <= slab.max_value) {
            matchedSlab = slab;
            basePercent = slab.incentive_percent;
            break;
          }
        }
      }

      // Evaluate DQ rules
      if (elig) {
        const customFields = (elig.custom_fields || {}) as Record<string, any>;
        for (const rule of (dqRules || [])) {
          const config = rule.rule_config as any;
          switch (rule.rule_type) {
            case 'absence':
              if (elig.absent_days >= (config.threshold_days || 1)) {
                isDQ = true;
                dqReasons.push(`Absent ${elig.absent_days} day(s)`);
              }
              break;
            case 'warning':
              if (elig.has_warning_letter) { isDQ = true; dqReasons.push('Warning letter'); }
              break;
            case 'suspension':
              if (elig.is_suspended) { isDQ = true; dqReasons.push('Suspended'); }
              break;
            case 'contract':
              if (elig.is_contract_worker && config.ineligible) {
                isDQ = true; dqReasons.push('Contract worker');
              }
              break;
            case 'lwp':
              if (elig.lwp_days > (config.max_lwp_days || 3)) {
                const total = elig.total_working_days || 26;
                const present = elig.present_days ?? (total - elig.lwp_days);
                const weeklyOff = elig.weekly_off_days || 0;
                proRata = Math.max(0, Math.min(1, (present + weeklyOff) / total));
                dqReasons.push(`LWP ${elig.lwp_days} days (pro-rata)`);
              }
              break;
            case 'lti':
              if (elig.lti_count >= 2 || elig.department_lti_count >= 2) {
                ltiPenalty = config.lti_2_plus_penalty_percent || 100;
                dqReasons.push(`LTI ${elig.lti_count >= 2 ? elig.lti_count : elig.department_lti_count} (100% penalty)`);
              } else if (elig.lti_count === 1 || elig.department_lti_count === 1) {
                ltiPenalty = config.lti_1_penalty_percent || 50;
                dqReasons.push(`LTI 1 (50% penalty)`);
              }
              break;
            case 'kra_score': {
              const op = config.operator || 'gte';
              const threshold = config.threshold ?? 3;
              if (pmsScore === null || pmsScore === undefined) {
                if (config.no_kra_action === 'ineligible') {
                  isDQ = true;
                  dqReasons.push('No KRA score available');
                }
              } else {
                const pass =
                  (op === 'gte' && pmsScore >= threshold) ||
                  (op === 'gt'  && pmsScore >  threshold) ||
                  (op === 'lte' && pmsScore <= threshold) ||
                  (op === 'lt'  && pmsScore <  threshold) ||
                  (op === 'eq'  && pmsScore === threshold);
                if (!pass) {
                  isDQ = true;
                  dqReasons.push(`KRA score ${pmsScore.toFixed(2)} fails ${op} ${threshold}`);
                }
              }
              break;
            }
            case 'custom':
              // Evaluate custom field-based DQ rules
              if (config.field_key && customFields[config.field_key] !== undefined) {
                const fieldValue = customFields[config.field_key];
                const op = config.operator || 'gte';
                const threshold = config.threshold;
                let triggered = false;
                if (typeof fieldValue === 'boolean') {
                  triggered = fieldValue === true;
                } else if (typeof fieldValue === 'number' && threshold !== undefined) {
                  if (op === 'gte') triggered = fieldValue >= threshold;
                  else if (op === 'gt') triggered = fieldValue > threshold;
                  else if (op === 'lte') triggered = fieldValue <= threshold;
                  else if (op === 'lt') triggered = fieldValue < threshold;
                  else if (op === 'eq') triggered = fieldValue === threshold;
                }
                if (triggered) {
                  isDQ = config.action === 'disqualify';
                  dqReasons.push(config.reason || `Custom rule: ${config.field_key}`);
                }
              }
              break;
          }
        }
      }

      const finalPercent = isDQ ? 0 : basePercent * (1 - ltiPenalty / 100) * proRata;

      // DQ records retain calculated incentive amount for audit visibility
      // Payroll must use is_disqualified flag to determine actual payout

      // Vessel-based incentive calculation
      let vesselAmount: number | null = null;
      const vesselRate = vesselRateMap.get(emp.id);
      const vesselsHandled = vesselEntryMap.get(emp.id);
      if (program.incentive_base === 'fixed' && vesselRate !== undefined) {
        // Check KRA score gate
        if (pmsScore !== null && pmsScore < (program.min_kra_score || 3)) {
          isDQ = true;
          dqReasons.push(`KRA score ${pmsScore.toFixed(2)} below minimum ${program.min_kra_score}`);
          // Retain vessel amount for audit visibility; DQ flag determines payout
        } else if (pmsScore === null && !program.no_kra_eligible) {
          // No KRA and not eligible without KRA
          vesselAmount = 0;
        } else {
          vesselAmount = (vesselsHandled || 0) * vesselRate;
        }
      }

      // Determine incentive_status
      let incentiveStatus = 'hold';
      if (isDQ) {
        incentiveStatus = 'forfeited';
      } else if (program.incentive_base === 'fixed' && vesselRate !== undefined) {
        // Vessel-based: finalised if vessel entry exists
        incentiveStatus = vesselsHandled !== undefined && vesselsHandled > 0 ? 'finalised' : 'hold';
      } else {
        // Check KRA approval for support programs
        if (program.program_type === 'support') {
          const empKpis = kpiMap.get(emp.id) || [];
          const allApproved = empKpis.length > 0 && empKpis.every((k: any) => k.status === 'approved');
          const noKra = empKpis.length === 0;
          if (allApproved) {
            incentiveStatus = 'finalised';
          } else if (noKra && program.no_kra_eligible) {
            incentiveStatus = 'finalised';
          } else {
            incentiveStatus = 'hold';
          }
        } else {
          // Production: finalised if production daily entries exist
          incentiveStatus = productionTotalTons !== null && productionTotalTons > 0 ? 'finalised' : 'hold';
        }
      }

      // Check if record already has a manual override — if so, don't revert it
      const existingOverride = existingRecords?.find((er: any) => er.employee_id === emp.id && er.status_overridden_by);

      // For production programs, split into period-based records
      if (program.program_type === 'production' && prodDailyMap.has(emp.id)) {
        const dailyVals = prodDailyMap.get(emp.id) || {};
        const days = Object.keys(dailyVals).map(Number).filter(d => !isNaN(d));

        // Compute per-range totals
        const ranges: { label: string; min: number; max: number }[] = [
          { label: '1-10', min: 1, max: 10 },
          { label: '11-20', min: 11, max: 20 },
          { label: '21-31', min: 21, max: 31 },
        ];

        const rangeTotals: { label: string; total: number }[] = [];
        for (const range of ranges) {
          let total = 0;
          for (const d of days) {
            if (d >= range.min && d <= range.max) {
              const v = parseFloat(dailyVals[String(d)]);
              if (!isNaN(v)) total += v;
            }
          }
          if (total > 0) rangeTotals.push({ label: range.label, total });
        }

        // If all 3 ranges have data → "Full Month"; otherwise per-range records
        const populatedRanges = rangeTotals.filter(r => r.total > 0);
        const isFullMonth = populatedRanges.length === 3;

        if (isFullMonth) {
          // Single "Full Month" record
          const totalTons = populatedRanges.reduce((s, r) => s + r.total, 0);
          const amount = resolvedRate !== null ? totalTons * resolvedRate : 0;
          records.push({
            employee_id: emp.id,
            program_id: program_id,
            review_period,
            review_year,
            payment_period: 'Full Month',
            pms_score: null,
            production_value: totalTons,
            incentive_amount: amount,
            matched_slab_id: matchedSlab?.id || null,
            base_incentive_percent: basePercent,
            is_disqualified: isDQ,
            disqualification_reasons: dqReasons.length > 0 ? dqReasons : null,
            lti_penalty_percent: ltiPenalty,
            pro_rata_factor: proRata,
            final_incentive_percent: Math.round(finalPercent * 100) / 100,
            status: 'draft',
            incentive_status: existingOverride ? existingOverride.incentive_status : incentiveStatus,
            computed_at: new Date().toISOString(),
          });
          computed++;
        } else {
          // Per-range records
          for (const rt of populatedRanges) {
            const amount = resolvedRate !== null ? rt.total * resolvedRate : 0;
            records.push({
              employee_id: emp.id,
              program_id: program_id,
              review_period,
              review_year,
              payment_period: rt.label,
              pms_score: null,
              production_value: rt.total,
              incentive_amount: amount,
              matched_slab_id: matchedSlab?.id || null,
              base_incentive_percent: basePercent,
              is_disqualified: isDQ,
              disqualification_reasons: dqReasons.length > 0 ? dqReasons : null,
              lti_penalty_percent: ltiPenalty,
              pro_rata_factor: proRata,
              final_incentive_percent: Math.round(finalPercent * 100) / 100,
              status: 'draft',
              incentive_status: existingOverride ? existingOverride.incentive_status : incentiveStatus,
              computed_at: new Date().toISOString(),
            });
            computed++;
          }
        }
      } else {
        // Support / vessel / production with no daily data — single record
        records.push({
          employee_id: emp.id,
          program_id: program_id,
          review_period,
          review_year,
          payment_period: 'Full Month',
          pms_score: pmsScore,
          production_value: vesselAmount !== null ? vesselAmount : (productionTotalTons ?? elig?.production_value ?? null),
          incentive_amount: vesselAmount !== null ? vesselAmount : (incentiveAmount || 0),
          matched_slab_id: matchedSlab?.id || null,
          base_incentive_percent: vesselAmount !== null ? 0 : basePercent,
          is_disqualified: isDQ,
          disqualification_reasons: dqReasons.length > 0 ? dqReasons : null,
          lti_penalty_percent: ltiPenalty,
          pro_rata_factor: proRata,
          final_incentive_percent: vesselAmount !== null ? 0 : Math.round(finalPercent * 100) / 100,
          status: 'draft',
          incentive_status: existingOverride ? existingOverride.incentive_status : incentiveStatus,
          computed_at: new Date().toISOString(),
        });
        computed++;
      }
    }

    // 6. Compute summary stats
    const eligible = records.filter((r: any) => !r.is_disqualified);
    const disqualified = records.filter((r: any) => r.is_disqualified);
    const avgIncentive = eligible.length > 0
      ? eligible.reduce((s: number, r: any) => s + r.final_incentive_percent, 0) / eligible.length
      : 0;

    const totalAmount = records.reduce((s: number, r: any) => s + (r.incentive_amount || 0), 0);

    const summary = {
      total: records.length,
      eligible: eligible.length,
      disqualified: disqualified.length,
      avg_incentive_percent: Math.round(avgIncentive * 100) / 100,
      total_amount: Math.round(totalAmount * 100) / 100,
    };

    // In dry_run mode, return preview without writing
    if (dry_run) {
      return new Response(
        JSON.stringify({ computed, program: program.name, dry_run: true, summary, records }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete existing records for all affected employees before upserting
    // This prevents orphaned records when period structure changes (full → split or vice versa)
    if (records.length > 0) {
      const uniqueEmployeeIds = [...new Set(records.map((r: any) => r.employee_id))];
      const empBatchSize = 50;
      for (let i = 0; i < uniqueEmployeeIds.length; i += empBatchSize) {
        const empBatch = uniqueEmployeeIds.slice(i, i + empBatchSize);
        const { error: delError } = await supabase
          .from('employee_incentive_records')
          .delete()
          .eq('program_id', program_id)
          .eq('review_period', review_period)
          .eq('review_year', review_year)
          .in('employee_id', empBatch);
        if (delError) console.error('Delete error:', delError);
      }

      // Upsert fresh records
      const batchSize = 100;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const { error } = await supabase
          .from('employee_incentive_records')
          .upsert(batch, { onConflict: 'employee_id,review_period,review_year,program_id,payment_period' });
        if (error) console.error('Upsert error:', error);
      }
    }

    return new Response(
      JSON.stringify({ computed, program: program.name, summary }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
