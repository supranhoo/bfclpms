import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    const { review_period, review_year, program_id } = await req.json();
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

    // 2. Fetch all employees
    const { data: employees } = await supabase
      .from('profiles')
      .select('id, full_name, employee_code, department_id')
      .eq('is_active', true);

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

    // 5. Compute incentive for each employee
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
        // Production — use eligibility production_value
        pmsScore = null;
      }

      // Match slab
      const scoreForSlab = program.program_type === 'support' ? pmsScore : elig?.production_value;
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
          }
        }
      }

      const finalPercent = isDQ ? 0 : basePercent * (1 - ltiPenalty / 100) * proRata;

      records.push({
        employee_id: emp.id,
        program_id: program_id,
        review_period,
        review_year,
        pms_score: pmsScore,
        production_value: elig?.production_value || null,
        matched_slab_id: matchedSlab?.id || null,
        base_incentive_percent: basePercent,
        is_disqualified: isDQ,
        disqualification_reasons: dqReasons.length > 0 ? dqReasons : null,
        lti_penalty_percent: ltiPenalty,
        pro_rata_factor: proRata,
        final_incentive_percent: Math.round(finalPercent * 100) / 100,
        status: 'draft',
        computed_at: new Date().toISOString(),
      });
      computed++;
    }

    // 6. Upsert records
    if (records.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const { error } = await supabase
          .from('employee_incentive_records')
          .upsert(batch, { onConflict: 'employee_id,review_period,review_year,program_id' });
        if (error) console.error('Upsert error:', error);
      }
    }

    return new Response(
      JSON.stringify({ computed, program: program.name }),
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
