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

    // --- Mandatory auth: require admin or hr_pms role ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const token = authHeader.replace('Bearer ', '');
    if (token !== serviceKey) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .in('role', ['admin', 'hr_pms']);
      if (!roles || roles.length === 0) {
        return new Response(JSON.stringify({ error: 'Admin or HR PMS access required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const { review_period, review_year, program_id } = await req.json();
    if (!review_period || !review_year) {
      return new Response(JSON.stringify({ error: 'review_period and review_year required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Find Q/BM KPIs approved in this period
    const { data: resolvedKpis } = await supabase
      .from('kpis')
      .select('id, employee_id, frequency, frequency_cycle_start, review_period, review_year, weightage, status, review_submissions(self_score, manager_score, hr_pms_score, skip_level_score, auditor_score, management_score, final_score, is_na)')
      .eq('review_period', review_period)
      .eq('review_year', review_year)
      .eq('status', 'approved')
      .in('frequency', ['Quarterly', 'Bi-Monthly']);

    if (!resolvedKpis?.length) {
      return new Response(JSON.stringify({ revisions_created: 0, message: 'No Q/BM KPIs resolved this period' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Map of frequency → cycle months (simplified mapping)
    const getCycleMonths = (frequency: string, period: string, cycleStart?: string | null): string[] => {
      const allMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const idx = allMonths.indexOf(period);
      if (idx === -1) return [period];

      // If cycleStart is provided, use dynamic resolution
      if (cycleStart) {
        const abbrevMap: Record<string, number> = {
          Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
          Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
        };
        const csIdx = abbrevMap[cycleStart.split('-')[0]];
        if (csIdx !== undefined) {
          const cycleLength = frequency === 'Quarterly' ? 3 : frequency === 'Bi-Monthly' ? 2 : 1;
          if (cycleLength > 1) {
            const offset = ((idx - csIdx) % 12 + 12) % 12;
            const cycleIdx = Math.floor(offset / cycleLength);
            const cycleStartPos = (csIdx + cycleIdx * cycleLength) % 12;
            const months: string[] = [];
            for (let i = 0; i < cycleLength; i++) {
              months.push(allMonths[(cycleStartPos + i) % 12]);
            }
            return months;
          }
        }
      }

      // Fallback: hardcoded standard cycles
      if (frequency === 'Quarterly') {
        const qStart = Math.floor(idx / 3) * 3;
        return [allMonths[qStart], allMonths[qStart + 1], allMonths[qStart + 2]].filter(Boolean);
      }
      if (frequency === 'Bi-Monthly') {
        const bmStart = Math.floor(idx / 2) * 2;
        return [allMonths[bmStart], allMonths[bmStart + 1]].filter(Boolean);
      }
      return [period];
    };

    // For each resolved KPI, find affected past months
    const affectedEmployeeMonths = new Map<string, Set<string>>();

    for (const kpi of resolvedKpis) {
      const cycleMonths = getCycleMonths(kpi.frequency!, kpi.review_period!, kpi.frequency_cycle_start);
      const pastMonths = cycleMonths.filter(m => m !== review_period);

      for (const month of pastMonths) {
        const key = kpi.employee_id;
        const existing = affectedEmployeeMonths.get(key) || new Set();
        existing.add(month);
        affectedEmployeeMonths.set(key, existing);
      }
    }

    // Fetch existing incentive records for affected months and recalculate
    let revisionsCreated = 0;

    // Fetch slabs for slab matching
    let slabs: any[] = [];
    if (program_id) {
      const { data } = await supabase
        .from('incentive_slabs')
        .select('*')
        .eq('program_id', program_id)
        .eq('slab_category', 'pms_score')
        .order('min_value');
      slabs = data || [];
    }

    for (const [employeeId, months] of affectedEmployeeMonths) {
      for (const affectedMonth of months) {
        // Fetch existing record
        const { data: existingRecord } = await supabase
          .from('employee_incentive_records')
          .select('*')
          .eq('employee_id', employeeId)
          .eq('review_period', affectedMonth)
          .eq('review_year', review_year)
          .maybeSingle();

        if (!existingRecord) continue;

        // Recalculate score for this month including the now-resolved Q/BM KPIs
        let offset = 0;
        const allKpis: any[] = [];
        let hasMore = true;
        while (hasMore) {
          const { data: kpis } = await supabase
            .from('kpis')
            .select('id, employee_id, weightage, status, frequency, review_submissions(self_score, manager_score, hr_pms_score, skip_level_score, auditor_score, management_score, final_score, is_na)')
            .eq('employee_id', employeeId)
            .eq('review_period', affectedMonth)
            .eq('review_year', review_year)
            .range(offset, offset + 999);
          if (kpis?.length) { allKpis.push(...kpis); offset += 1000; hasMore = kpis.length === 1000; }
          else hasMore = false;
        }

        // Also include the resolved Q/BM KPIs that affect this month
        const qbmForThisMonth = resolvedKpis.filter(k =>
          k.employee_id === employeeId &&
          getCycleMonths(k.frequency!, k.review_period!, k.frequency_cycle_start).includes(affectedMonth)
        );
        for (const qbm of qbmForThisMonth) {
          if (!allKpis.find(k => k.id === qbm.id)) allKpis.push(qbm);
        }

        let totalWeightedScore = 0;
        let totalWeight = 0;
        for (const kpi of allKpis) {
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

        const revisedScore = totalWeight > 0 ? totalWeightedScore / totalWeight : null;
        if (revisedScore === null) continue;

        // Match new slab
        let revisedSlabPercent = 0;
        for (const slab of slabs) {
          if (revisedScore >= slab.min_value && revisedScore <= slab.max_value) {
            revisedSlabPercent = slab.incentive_percent;
            break;
          }
        }

        const originalScore = existingRecord.pms_score;
        const originalSlabPercent = existingRecord.base_incentive_percent;

        // Only create revision if slab changed
        if (Math.abs(revisedSlabPercent - originalSlabPercent) > 0.001) {
          const { error } = await supabase.from('incentive_score_revisions').insert({
            employee_id: employeeId,
            affected_period: affectedMonth,
            affected_year: review_year,
            original_score: originalScore,
            revised_score: revisedScore,
            original_slab_percent: originalSlabPercent,
            revised_slab_percent: revisedSlabPercent,
            revision_reason: 'quarterly_kpi_resolved',
            source_period: review_period,
          });
          if (!error) revisionsCreated++;
        }
      }
    }

    // Send email alert to HR/Admin if revisions were created
    if (revisionsCreated > 0) {
      try {
        // Get affected employee names for the email
        const affectedEmployeeIds = Array.from(affectedEmployeeMonths.keys());
        const { data: affectedProfiles } = await supabase
          .from('profiles')
          .select('full_name')
          .in('id', affectedEmployeeIds);
        const affectedNames = (affectedProfiles || []).map((p: any) => p.full_name).filter(Boolean).join(', ');
        const affectedMonthsList = Array.from(new Set(
          Array.from(affectedEmployeeMonths.values()).flatMap(s => Array.from(s))
        )).join(', ');

        // Get HR/Admin recipients
        const { data: recipients } = await supabase
          .from('user_roles')
          .select('user_id, role')
          .in('role', ['admin', 'hr_pms']);

        if (recipients && recipients.length > 0) {
          const uniqueUserIds = Array.from(new Set(recipients.map((r: any) => r.user_id)));
          const { data: recipientProfiles } = await supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('id', uniqueUserIds);

          for (const profile of (recipientProfiles || [])) {
            if (!profile.email) continue;
            try {
              await supabase.functions.invoke('send-email-notification', {
                body: {
                  event_type: 'incentive_retroactive_alert',
                  recipient_email: profile.email,
                  recipient_name: profile.full_name || 'HR/Admin',
                  metadata: {
                    revisions_count: String(revisionsCreated),
                    source_period: review_period,
                    review_year: String(review_year),
                    affected_employees: affectedNames || `${affectedEmployeeIds.length} employee(s)`,
                    affected_months: affectedMonthsList,
                  },
                },
              });
            } catch (emailErr) {
              console.error('Failed to send incentive alert email to', profile.email, emailErr);
            }
          }
        }
      } catch (alertErr) {
        console.error('Failed to send incentive retroactive alerts:', alertErr);
      }
    }

    return new Response(
      JSON.stringify({ revisions_created: revisionsCreated }),
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
