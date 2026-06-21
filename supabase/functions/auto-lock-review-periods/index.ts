import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate cron secret
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedSecret = Deno.env.get('CRON_SECRET');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const cronOk = !!expectedSecret && cronSecret === expectedSecret;
    const srvOk = !!serviceKey && bearer === serviceKey;
    if (!cronOk && !srvOk) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch all active auto-lock rules
    const { data: rules, error: rulesErr } = await supabase
      .from('review_period_auto_rules')
      .select('*, review_periods!inner(id, period_name, review_year, current_stage)')
      .eq('is_active', true);

    if (rulesErr) throw rulesErr;

    let locksCreated = 0;
    let auditEntries = 0;
    let kpisAutoAdvanced = 0;

    for (const rule of (rules || [])) {
      const period = (rule as any).review_periods;
      if (!period) continue;

      let shouldTrigger = false;
      const action = rule.action as { lock_type?: string; permissions?: Record<string, boolean> };

      switch (rule.rule_type) {
        case 'deadline_passed': {
          // Check if self-review deadline has passed based on stage
          if (period.current_stage !== 'self_review') break;
          const condition = rule.trigger_condition as { deadline_days?: number };
          // If no specific deadline, skip
          if (!condition.deadline_days) break;
          // Simple: lock if stage has been active for more than X days
          const { data: stageRecord } = await supabase
            .from('review_period_stages')
            .select('started_at')
            .eq('review_period_id', period.id)
            .eq('stage', 'self_review')
            .is('ended_at', null)
            .maybeSingle();
          if (stageRecord) {
            const elapsed = (Date.now() - new Date(stageRecord.started_at).getTime()) / (1000 * 60 * 60 * 24);
            if (elapsed > condition.deadline_days) shouldTrigger = true;
          }
          break;
        }

        case 'approval_complete': {
          // Lock employees whose KPIs are all approved
          const { data: kpis } = await supabase
            .from('kpis')
            .select('employee_id, status')
            .eq('review_period', period.period_name)
            .eq('review_year', period.review_year);

          if (kpis && kpis.length > 0) {
            // Group by employee
            const empKpis: Record<string, string[]> = {};
            kpis.forEach(k => {
              if (!empKpis[k.employee_id]) empKpis[k.employee_id] = [];
              empKpis[k.employee_id].push(k.status || '');
            });

            for (const [empId, statuses] of Object.entries(empKpis)) {
              if (statuses.every(s => s === 'approved')) {
                // Check if already locked
                const { data: existing } = await supabase
                  .from('review_period_locks')
                  .select('id')
                  .eq('review_period_id', period.id)
                  .eq('lock_type', 'employee')
                  .eq('target_id', empId)
                  .eq('is_locked', true)
                  .maybeSingle();

                if (!existing) {
                  const { error: lockErr } = await supabase
                    .from('review_period_locks')
                    .insert({
                      review_period_id: period.id,
                      lock_type: 'employee',
                      target_id: empId,
                      permissions: action.permissions || { view_only: true, edit_kpi: false, submit_self_review: false, submit_manager_review: false, approve: false, edit_scores: false, add_comments: false },
                      is_locked: true,
                      reason: 'Auto-locked: All KPIs approved',
                    });
                  if (!lockErr) {
                    locksCreated++;
                    await supabase.from('review_period_audit_log').insert({
                      review_period_id: period.id,
                      action: 'employee_locked',
                      reason: 'Auto-lock rule: approval_complete',
                      target_type: 'employee',
                      target_id: empId,
                      new_state: { rule_type: 'approval_complete', auto: true },
                    });
                    auditEntries++;
                  }
                }
              }
            }
          }
          break;
        }

        case 'review_submitted': {
          // Lock employee after manager submits review (status = manager_check)
          const { data: kpis } = await supabase
            .from('kpis')
            .select('employee_id, status')
            .eq('review_period', period.period_name)
            .eq('review_year', period.review_year)
            .in('status', ['manager_check', 'audit', 'management_review', 'approved']);

          if (kpis) {
            const empKpis: Record<string, string[]> = {};
            kpis.forEach(k => {
              if (!empKpis[k.employee_id]) empKpis[k.employee_id] = [];
              empKpis[k.employee_id].push(k.status || '');
            });

            for (const [empId, statuses] of Object.entries(empKpis)) {
              if (statuses.every(s => s !== 'kra_set' && s !== 'self_review')) {
                const { data: existing } = await supabase
                  .from('review_period_locks')
                  .select('id')
                  .eq('review_period_id', period.id)
                  .eq('lock_type', 'employee')
                  .eq('target_id', empId)
                  .eq('is_locked', true)
                  .maybeSingle();

                if (!existing) {
                  await supabase.from('review_period_locks').insert({
                    review_period_id: period.id,
                    lock_type: 'employee',
                    target_id: empId,
                    permissions: { view_only: true, edit_kpi: false, submit_self_review: false, submit_manager_review: false, approve: false, edit_scores: false, add_comments: true },
                    is_locked: true,
                    reason: 'Auto-locked: Manager review submitted',
                  });
                  locksCreated++;
                }
              }
            }
          }
          break;
        }

        case 'calibration_complete': {
          // Lock all when calibration stage is done
          if (period.current_stage === 'approval' || period.current_stage === 'closed') {
            shouldTrigger = true;
          }
          break;
        }

        case 'scheduled_lock': {
          const schedCondition = rule.trigger_condition as { lock_date?: string };
          if (!schedCondition.lock_date) break;
          const lockDate = new Date(schedCondition.lock_date);
          if (Date.now() >= lockDate.getTime()) {
            // Check if already locked
            const { data: existingLock } = await supabase
              .from('review_period_locks')
              .select('id')
              .eq('review_period_id', period.id)
              .eq('lock_type', 'global')
              .eq('is_locked', true)
              .maybeSingle();

            if (!existingLock) {
              await supabase.from('review_period_locks').insert({
                review_period_id: period.id,
                lock_type: 'global',
                permissions: { view_only: true },
                is_locked: true,
                reason: `Scheduled lock activated on ${schedCondition.lock_date}`,
              });
              locksCreated++;

              await supabase.from('review_period_audit_log').insert({
                review_period_id: period.id,
                action: 'global_locked',
                reason: `Scheduled lock rule triggered (date: ${schedCondition.lock_date})`,
                new_state: { rule_type: 'scheduled_lock', auto: true, lock_date: schedCondition.lock_date },
              });
              auditEntries++;
            }

            // Mark rule as executed so it doesn't re-fire
            await supabase
              .from('review_period_auto_rules')
              .update({ is_active: false, updated_at: new Date().toISOString() })
              .eq('id', rule.id);
          }
          break;
        }

        case 'auto_advance_zero': {
          // Auto-advance stuck KPIs with 0 score after deadline
          const advanceCondition = rule.trigger_condition as { deadline_days?: number; default_score?: number; target_stages?: string[] };
          const deadlineDays = advanceCondition.deadline_days || 14;
          const defaultScore = advanceCondition.default_score ?? 0;
          const targetStages = advanceCondition.target_stages || ['kra_set', 'self_review'];

          // Check if stage has been active long enough
          const { data: stageRecord } = await supabase
            .from('review_period_stages')
            .select('started_at')
            .eq('review_period_id', period.id)
            .eq('stage', period.current_stage)
            .is('ended_at', null)
            .maybeSingle();

          if (!stageRecord) break;

          const elapsedDays = (Date.now() - new Date(stageRecord.started_at).getTime()) / (1000 * 60 * 60 * 24);
          if (elapsedDays <= deadlineDays) break;

          // Find all stuck KPIs for this period
          const { data: stuckKpis } = await supabase
            .from('kpis')
            .select('id, employee_id, status, kpi_name, kra_name')
            .eq('review_period', period.period_name)
            .eq('review_year', period.review_year)
            .in('status', targetStages);

          if (!stuckKpis || stuckKpis.length === 0) break;

          // Exclude sent-back KPIs — check BOTH kpi_queries and kpi_audit_logs
          const stuckIds = stuckKpis.map(k => k.id);

          const { data: sentBackQueries } = await supabase
            .from('kpi_queries')
            .select('kpi_id')
            .in('kpi_id', stuckIds)
            .eq('query_type', 'send_back');

          const { data: auditSendBacks } = await supabase
            .from('kpi_audit_logs')
            .select('kpi_id')
            .in('kpi_id', stuckIds)
            .ilike('action', '%SENT_BACK%');

          const sentBackIds = new Set([
            ...(sentBackQueries || []).map(q => q.kpi_id),
            ...(auditSendBacks || []).map(a => a.kpi_id),
          ]);

          const eligibleKpis = stuckKpis.filter(k => !sentBackIds.has(k.id));
          if (eligibleKpis.length === 0) break;

          const autoAdvanceReason = `Auto-advanced with score ${defaultScore}: Employee did not submit within ${deadlineDays} days of stage start`;

          for (const kpi of eligibleKpis) {
            // Determine next status based on current
            let nextStatus = 'manager_check';
            if (kpi.status === 'kra_set') nextStatus = 'self_review';

            // Upsert review submission with 0 score
            const { data: existingSub } = await supabase
              .from('review_submissions')
              .select('id')
              .eq('kpi_id', kpi.id)
              .maybeSingle();

            if (existingSub) {
              await supabase
                .from('review_submissions')
                .update({
                  self_score: defaultScore,
                  self_rating: defaultScore,
                  self_remarks: autoAdvanceReason,
                  auto_advance_reason: autoAdvanceReason,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', existingSub.id);
            } else {
              await supabase
                .from('review_submissions')
                .insert({
                  kpi_id: kpi.id,
                  self_score: defaultScore,
                  self_rating: defaultScore,
                  self_remarks: autoAdvanceReason,
                  auto_advance_reason: autoAdvanceReason,
                });
            }

            // Advance KPI status
            await supabase
              .from('kpis')
              .update({ status: nextStatus, updated_at: new Date().toISOString() })
              .eq('id', kpi.id);

            // Audit log
            await supabase.from('review_period_audit_log').insert({
              review_period_id: period.id,
              action: 'kpi_auto_advanced',
              reason: autoAdvanceReason,
              target_type: 'employee',
              target_id: kpi.employee_id,
              new_state: {
                kpi_id: kpi.id,
                kpi_name: kpi.kpi_name,
                from_status: kpi.status,
                to_status: nextStatus,
                default_score: defaultScore,
                auto: true,
              },
            });

            kpisAutoAdvanced++;
            auditEntries++;
          }
          break;
        }
      }

      // Handle global trigger (deadline_passed, calibration_complete)
      if (shouldTrigger && rule.rule_type !== 'approval_complete' && rule.rule_type !== 'review_submitted') {
        const lockType = action.lock_type || 'global';
        const { data: existing } = await supabase
          .from('review_period_locks')
          .select('id')
          .eq('review_period_id', period.id)
          .eq('lock_type', lockType)
          .eq('is_locked', true)
          .maybeSingle();

        if (!existing) {
          await supabase.from('review_period_locks').insert({
            review_period_id: period.id,
            lock_type: lockType,
            permissions: action.permissions || { view_only: true },
            is_locked: true,
            reason: `Auto-locked: ${rule.rule_type}`,
          });
          locksCreated++;

          await supabase.from('review_period_audit_log').insert({
            review_period_id: period.id,
            action: `${lockType}_locked`,
            reason: `Auto-lock rule: ${rule.rule_type}`,
            new_state: { rule_type: rule.rule_type, auto: true },
          });
          auditEntries++;
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, locksCreated, auditEntries, kpisAutoAdvanced, rulesEvaluated: (rules || []).length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
