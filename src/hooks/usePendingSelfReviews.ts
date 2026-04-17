import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSystemSetting, useUpdateSystemSetting } from '@/hooks/useSystemSettings';
import { DEFAULT_WORKFLOW_STAGES } from '@/lib/workflowEngine';

export interface OverdueKpi {
  kpiId: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  departmentName: string;
  kpiName: string;
  kraName: string;
  reviewPeriod: string;
  reviewYear: number;
  frequency: string;
  daysOverdue: number;
  reportingManagerId: string | null;
  reportingManagerName: string | null;
  skipLevelManagerId: string | null;
  skipLevelManagerName: string | null;
}

function getDeadlineDate(reviewPeriod: string, reviewYear: number, deadlineDay: number): Date {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const monthIndex = monthNames.indexOf(reviewPeriod);
  if (monthIndex === -1) return new Date(0);
  // Deadline is on the Nth of the FOLLOWING month
  const nextMonth = monthIndex + 1;
  const year = nextMonth > 11 ? reviewYear + 1 : reviewYear;
  const month = nextMonth > 11 ? 0 : nextMonth;
  return new Date(year, month, deadlineDay, 23, 59, 59);
}

export function usePendingReviewSettings() {
  const { data: daySetting, isLoading: dayLoading } = useSystemSetting('pending_review_deadline_day');
  const { data: remarkSetting, isLoading: remarkLoading } = useSystemSetting('pending_review_auto_remark');
  const { data: mgrRemarkSetting, isLoading: mgrRemarkLoading } = useSystemSetting('manager_penalty_auto_remark');

  const parseStr = (val: unknown, fallback: string): string => {
    if (!val) return fallback;
    if (typeof val === 'string') return val.replace(/^"|"$/g, '');
    return String(val);
  };

  const deadlineDay = daySetting?.setting_value
    ? parseInt(parseStr(daySetting.setting_value, '10'), 10) || 10
    : 10;
  const employeeRemark = remarkSetting?.setting_value
    ? parseStr(remarkSetting.setting_value, 'KPI not self reviewed by due date, score given by system')
    : 'KPI not self reviewed by due date, score given by system';
  const managerRemark = mgrRemarkSetting?.setting_value
    ? parseStr(mgrRemarkSetting.setting_value, 'KRA of team not reviewed by due date')
    : 'KRA of team not reviewed by due date';

  return {
    deadlineDay,
    employeeRemark,
    managerRemark,
    isLoading: dayLoading || remarkLoading || mgrRemarkLoading,
  };
}

const ELIGIBLE_FREQUENCIES = ['Monthly', 'Daily', 'Weekly'];

export function useOverdueKraSetKpis(deadlineDay: number, filterMonth?: string, filterYear?: number) {
  return useQuery({
    queryKey: ['overdue-kra-set-kpis', deadlineDay, filterMonth, filterYear],
    queryFn: async () => {
      let query = supabase
        .from('kpis')
        .select(`
          id, employee_id, kpi_name, kra_name, review_period, review_year, frequency, is_org_level,
          profiles!kpis_employee_id_fkey!inner ( full_name, employee_code, department_id, reporting_manager_id, is_active, departments ( name ) )
        `)
        .eq('status', 'kra_set')
        .eq('is_org_level', false)
        .eq('profiles.is_active', true)
        .in('frequency', ELIGIBLE_FREQUENCIES);

      if (filterMonth) query = query.eq('review_period', filterMonth);
      if (filterYear) query = query.eq('review_year', filterYear);

      const { data: kpis, error } = await query;
      if (error) throw error;

      // Exclude KPIs with open send_back queries (Option A)
      const kpiIds = (kpis || []).map(k => k.id);
      let sentBackIds = new Set<string>();
      if (kpiIds.length > 0) {
        const { data: sentBack } = await supabase
          .from('kpi_queries')
          .select('kpi_id')
          .in('kpi_id', kpiIds)
          .eq('query_type', 'send_back')
          .eq('status', 'open');
        sentBackIds = new Set((sentBack || []).map(r => r.kpi_id));
      }

      const now = new Date();
      const managerIds = new Set<string>();
      const rawItems: Array<{ kpi: any; profile: any; daysOverdue: number }> = [];

      for (const kpi of kpis || []) {
        if (sentBackIds.has(kpi.id)) continue;
        if (!kpi.review_period || !kpi.review_year) continue;
        const deadline = getDeadlineDate(kpi.review_period, kpi.review_year, deadlineDay);
        if (now <= deadline) continue;

        const diffMs = now.getTime() - deadline.getTime();
        const daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const profile = kpi.profiles as any;
        if (profile?.reporting_manager_id) {
          managerIds.add(profile.reporting_manager_id);
        }
        rawItems.push({ kpi, profile, daysOverdue });
      }

      // Fetch manager names + their reporting_manager_id for skip-level
      const allManagerIds = [...managerIds];
      let managerMap: Record<string, string> = {};
      let managerToSkip: Record<string, string> = {};
      const skipManagerIds = new Set<string>();
      if (allManagerIds.length > 0) {
        const { data: managers } = await supabase
          .from('profiles')
          .select('id, full_name, reporting_manager_id')
          .in('id', allManagerIds);
        for (const m of managers || []) {
          managerMap[m.id] = m.full_name || 'Unknown';
          if (m.reporting_manager_id) {
            skipManagerIds.add(m.reporting_manager_id);
            managerToSkip[m.id] = m.reporting_manager_id;
          }
        }
      }

      // Fetch skip-level manager names
      const allSkipIds = [...skipManagerIds];
      let skipMap: Record<string, string> = {};
      if (allSkipIds.length > 0) {
        const { data: skips } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', allSkipIds);
        for (const s of skips || []) {
          skipMap[s.id] = s.full_name || 'Unknown';
        }
      }

      const results: OverdueKpi[] = [];
      for (const { kpi, profile, daysOverdue } of rawItems) {
        const mgrId = profile?.reporting_manager_id || null;
        const skipId = mgrId ? managerToSkip[mgrId] || null : null;

        results.push({
          kpiId: kpi.id,
          employeeId: kpi.employee_id,
          employeeName: profile?.full_name || 'Unknown',
          employeeCode: profile?.employee_code || '',
          departmentName: profile?.departments?.name || '',
          kpiName: kpi.kpi_name,
          kraName: kpi.kra_name,
          reviewPeriod: kpi.review_period,
          reviewYear: kpi.review_year,
          frequency: kpi.frequency || '',
          daysOverdue,
          reportingManagerId: mgrId,
          reportingManagerName: mgrId ? managerMap[mgrId] || null : null,
          skipLevelManagerId: skipId,
          skipLevelManagerName: skipId ? skipMap[skipId] || null : null,
        });
      }

      return results.sort((a, b) => b.daysOverdue - a.daysOverdue);
    },
    enabled: deadlineDay > 0,
  });
}

export function useOverdueTeamReviewKpis(deadlineDay: number, filterMonth?: string, filterYear?: number) {
  return useQuery({
    queryKey: ['overdue-team-review-kpis', deadlineDay, filterMonth, filterYear],
    queryFn: async () => {
      let query = supabase
        .from('kpis')
        .select(`
          id, employee_id, kpi_name, kra_name, review_period, review_year, frequency, is_org_level,
          profiles!kpis_employee_id_fkey!inner ( full_name, employee_code, department_id, reporting_manager_id, is_active, departments ( name ) )
        `)
        .eq('status', 'self_review')
        .eq('is_org_level', false)
        .eq('profiles.is_active', true)
        .in('frequency', ELIGIBLE_FREQUENCIES);

      if (filterMonth) query = query.eq('review_period', filterMonth);
      if (filterYear) query = query.eq('review_year', filterYear);

      const { data: kpis, error } = await query;
      if (error) throw error;

      // Workflow-aware filter: only keep KPIs where the employee's workflow
      // has 'manager_check' as the stage immediately after 'self_review'
      const uniqueEmployeeIds = [...new Set((kpis || []).map(k => k.employee_id))];
      const workflowCache: Record<string, string[]> = {};
      for (const empId of uniqueEmployeeIds) {
        // Use first KPI's period/year for workflow resolution
        const sampleKpi = (kpis || []).find(k => k.employee_id === empId);
        if (sampleKpi?.review_period && sampleKpi?.review_year) {
          const { data: wf } = await supabase.rpc('get_employee_workflow', {
            employee_uuid: empId,
            p_review_period: sampleKpi.review_period,
            p_review_year: sampleKpi.review_year,
          });
          if (wf && Array.isArray(wf)) workflowCache[empId] = wf as string[];
        }
      }
      const workflowFilteredKpis = (kpis || []).filter(kpi => {
        const stages = workflowCache[kpi.employee_id];
        if (!stages) return false;
        const selfIdx = stages.indexOf('self_review');
        if (selfIdx === -1) return false;
        return stages[selfIdx + 1] === 'manager_check';
      });

      // Exclude KPIs where manager has already scored (false-positive fix)
      const allKpiIds = workflowFilteredKpis.map(k => k.id);
      let alreadyReviewedIds = new Set<string>();
      if (allKpiIds.length > 0) {
        const { data: reviewed } = await supabase
          .from('review_submissions')
          .select('kpi_id')
          .in('kpi_id', allKpiIds)
          .or('manager_score.not.is.null,is_na.eq.true');
        alreadyReviewedIds = new Set((reviewed || []).map(r => r.kpi_id));
      }

      const now = new Date();
      const results: OverdueKpi[] = [];

      // Collect unique manager IDs to fetch names
      const managerIds = new Set<string>();
      const skipManagerIds = new Set<string>();

      const rawItems: Array<{ kpi: any; profile: any; daysOverdue: number }> = [];

      for (const kpi of workflowFilteredKpis) {
        if (alreadyReviewedIds.has(kpi.id)) continue;
        if (!kpi.review_period || !kpi.review_year) continue;
        const deadline = getDeadlineDate(kpi.review_period, kpi.review_year, deadlineDay);
        if (now <= deadline) continue;

        const diffMs = now.getTime() - deadline.getTime();
        const daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const profile = kpi.profiles as any;
        if (profile?.reporting_manager_id) {
          managerIds.add(profile.reporting_manager_id);
        }
        rawItems.push({ kpi, profile, daysOverdue });
      }

      // Fetch manager names
      const allManagerIds = [...managerIds];
      let managerMap: Record<string, string> = {};
      if (allManagerIds.length > 0) {
        const { data: managers } = await supabase
          .from('profiles')
          .select('id, full_name, reporting_manager_id')
          .in('id', allManagerIds);
        for (const m of managers || []) {
          managerMap[m.id] = m.full_name || 'Unknown';
          if (m.reporting_manager_id) skipManagerIds.add(m.reporting_manager_id);
        }
      }

      // Fetch skip-level manager names
      const allSkipIds = [...skipManagerIds];
      let skipMap: Record<string, string> = {};
      if (allSkipIds.length > 0) {
        const { data: skips } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', allSkipIds);
        for (const s of skips || []) {
          skipMap[s.id] = s.full_name || 'Unknown';
        }
      }

      // Rebuild skip mapping via manager's reporting_manager_id
      let managerToSkip: Record<string, string> = {};
      if (allManagerIds.length > 0) {
        const { data: managers } = await supabase
          .from('profiles')
          .select('id, reporting_manager_id')
          .in('id', allManagerIds);
        for (const m of managers || []) {
          if (m.reporting_manager_id) {
            managerToSkip[m.id] = m.reporting_manager_id;
          }
        }
      }

      for (const { kpi, profile, daysOverdue } of rawItems) {
        const mgrId = profile?.reporting_manager_id || null;
        const skipId = mgrId ? managerToSkip[mgrId] || null : null;

        results.push({
          kpiId: kpi.id,
          employeeId: kpi.employee_id,
          employeeName: profile?.full_name || 'Unknown',
          employeeCode: profile?.employee_code || '',
          departmentName: profile?.departments?.name || '',
          kpiName: kpi.kpi_name,
          kraName: kpi.kra_name,
          reviewPeriod: kpi.review_period,
          reviewYear: kpi.review_year,
          frequency: kpi.frequency || '',
          daysOverdue,
          reportingManagerId: mgrId,
          reportingManagerName: mgrId ? managerMap[mgrId] || null : null,
          skipLevelManagerId: skipId,
          skipLevelManagerName: skipId ? skipMap[skipId] || null : null,
        });
      }

      return results.sort((a, b) => b.daysOverdue - a.daysOverdue);
    },
    enabled: deadlineDay > 0,
  });
}

/**
 * Send one consolidated email per employee (and their manager) for system auto-scored KPIs.
 */
async function sendConsolidatedAutoScoreEmails(
  kpiDetails: Array<{ kpiId: string; kpiName: string; employeeId: string; reviewPeriod: string; reviewYear: number }>,
  autoScoreReason: string
): Promise<void> {
  // Group by employee
  const byEmployee = new Map<string, { kpiNames: string[]; reviewPeriod: string; reviewYear: number }>();
  for (const detail of kpiDetails) {
    const existing = byEmployee.get(detail.employeeId);
    if (existing) {
      existing.kpiNames.push(detail.kpiName);
    } else {
      byEmployee.set(detail.employeeId, {
        kpiNames: [detail.kpiName],
        reviewPeriod: detail.reviewPeriod,
        reviewYear: detail.reviewYear,
      });
    }
  }

  // Fetch profiles for all employees
  const employeeIds = Array.from(byEmployee.keys());
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email, reporting_manager_id')
    .in('id', employeeIds);

  if (!profiles || profiles.length === 0) return;

  // Fetch manager profiles
  const managerIds = profiles
    .map(p => p.reporting_manager_id)
    .filter((id): id is string => !!id);
  const uniqueManagerIds = [...new Set(managerIds)];

  let managerProfiles: Array<{ id: string; full_name: string | null; email: string | null }> = [];
  if (uniqueManagerIds.length > 0) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', uniqueManagerIds);
    managerProfiles = data || [];
  }

  const managerMap = new Map(managerProfiles.map(m => [m.id, m]));

  const emailPromises: Promise<any>[] = [];

  for (const profile of profiles) {
    const empData = byEmployee.get(profile.id);
    if (!empData || !profile.email) continue;

    const kpiListStr = empData.kpiNames.map(n => `• ${n}`).join('\n');

    // Email to employee
    emailPromises.push(
      supabase.functions.invoke('send-email-notification', {
        body: {
          event_type: 'system_auto_scored',
          recipient_email: profile.email,
          recipient_name: profile.full_name || 'Employee',
          review_period: empData.reviewPeriod,
          review_year: empData.reviewYear,
          auto_score_reason: autoScoreReason,
          kpi_list: empData.kpiNames,
        },
      })
    );

    // Email to reporting manager
    if (profile.reporting_manager_id) {
      const manager = managerMap.get(profile.reporting_manager_id);
      if (manager?.email) {
        emailPromises.push(
          supabase.functions.invoke('send-email-notification', {
            body: {
              event_type: 'system_auto_scored',
              recipient_email: manager.email,
              recipient_name: manager.full_name || 'Manager',
              employee_name: profile.full_name || 'Employee',
              review_period: empData.reviewPeriod,
              review_year: empData.reviewYear,
              auto_score_reason: autoScoreReason,
              kpi_list: empData.kpiNames,
            },
          })
        );
      }
    }
  }

  await Promise.allSettled(emailPromises);
}

export function useBulkAutoScore() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ kpiIds, remark, adminId, kpiDetails }: {
      kpiIds: string[];
      remark: string;
      adminId: string;
      kpiDetails?: Array<{ kpiId: string; kpiName: string; employeeId: string; reviewPeriod: string; reviewYear: number }>;
    }) => {
      let scored = 0;
      for (const kpiId of kpiIds) {
        try {
          // Update KPI status
          await supabase
            .from('kpis')
            .update({ status: 'approved' })
            .eq('id', kpiId);

          // Upsert review submission
          const { data: existing } = await supabase
            .from('review_submissions')
            .select('id')
            .eq('kpi_id', kpiId)
            .maybeSingle();

          if (existing) {
            await supabase
              .from('review_submissions')
              .update({
                achieved_value: 0,
                self_score: 0,
                self_rating: 'red',
                self_remarks: remark,
                manager_score: 0,
                manager_rating: 'red',
                skip_level_score: 0,
                skip_level_rating: 'red',
                hr_pms_score: 0,
                hr_pms_rating: 'red',
                auditor_score: 0,
                auditor_rating: 'red',
                management_score: 0,
                management_rating: 'red',
                final_score: 0,
                final_rating: 'red',
                kpi_status: 'submitted',
                auto_advance_reason: 'Auto-scored with zero by System (overdue self-review)',
              })
              .eq('id', existing.id);
          } else {
            await supabase
              .from('review_submissions')
              .insert([{
                kpi_id: kpiId,
                achieved_value: 0,
                self_score: 0,
                self_rating: 'red',
                self_remarks: remark,
                manager_score: 0,
                manager_rating: 'red',
                skip_level_score: 0,
                skip_level_rating: 'red',
                hr_pms_score: 0,
                hr_pms_rating: 'red',
                auditor_score: 0,
                auditor_rating: 'red',
                management_score: 0,
                management_rating: 'red',
                final_score: 0,
                final_rating: 'red',
                kpi_status: 'submitted',
                auto_advance_reason: 'Auto-scored with zero by System (overdue self-review)',
              }]);
          }

          // Audit log
          await supabase.from('kpi_audit_logs').insert({
            kpi_id: kpiId,
            performed_by: adminId,
            action: 'SYSTEM_AUTO_SCORED',
            old_value: { status: 'kra_set' },
            new_value: { status: 'approved', final_score: 0 },
            metadata: { remark, source: 'pending_reviews_admin' },
          });

          scored++;
        } catch (e) {
          console.error(`Failed to auto-score KPI ${kpiId}:`, e);
        }
      }

      // Send consolidated emails (fire-and-forget)
      if (kpiDetails && kpiDetails.length > 0) {
        sendConsolidatedAutoScoreEmails(kpiDetails, 'delayed self review').catch(err =>
          console.error('Failed to send auto-score emails:', err)
        );
      }

      return scored;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['overdue-kra-set-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      toast({ title: 'Auto-Score Complete', description: `${count} KPI(s) scored with zero.` });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

const PENALTY_KRA_NAME = 'Implementation of common - policies / systems / processes';

export function useBulkManagerPenalty() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      items,
      remark,
      adminId,
    }: {
      items: OverdueKpi[];
      remark: string;
      adminId: string;
    }) => {
      let penalized = 0;
      // Collect unique manager+skip IDs with their review periods
      const targets: Array<{ managerId: string; reviewPeriod: string; reviewYear: number }> = [];

      for (const item of items) {
        if (item.reportingManagerId) {
          targets.push({ managerId: item.reportingManagerId, reviewPeriod: item.reviewPeriod, reviewYear: item.reviewYear });
        }
        if (item.skipLevelManagerId) {
          targets.push({ managerId: item.skipLevelManagerId, reviewPeriod: item.reviewPeriod, reviewYear: item.reviewYear });
        }
      }

      // Deduplicate by managerId+period+year
      const unique = new Map<string, typeof targets[0]>();
      for (const t of targets) {
        const key = `${t.managerId}|${t.reviewPeriod}|${t.reviewYear}`;
        unique.set(key, t);
      }

      for (const { managerId, reviewPeriod, reviewYear } of unique.values()) {
        try {
          // Find manager's penalty KRA KPI
          const { data: mgrKpi } = await supabase
            .from('kpis')
            .select('id, status')
            .eq('employee_id', managerId)
            .eq('kra_name', PENALTY_KRA_NAME)
            .eq('review_period', reviewPeriod)
            .eq('review_year', reviewYear)
            .maybeSingle();

          if (!mgrKpi) continue;
          if (mgrKpi.status === 'approved') continue; // already scored

          const oldStatus = mgrKpi.status;

          // Update KPI
          await supabase
            .from('kpis')
            .update({ status: 'approved' })
            .eq('id', mgrKpi.id);

          // Upsert submission
          const { data: existing } = await supabase
            .from('review_submissions')
            .select('id, self_remarks')
            .eq('kpi_id', mgrKpi.id)
            .maybeSingle();

          if (existing) {
            const combinedRemark = existing.self_remarks
              ? `${existing.self_remarks}\n[System] ${remark}`
              : remark;
            await supabase
              .from('review_submissions')
              .update({
                achieved_value: 0,
                self_score: 0,
                self_rating: 'red',
                self_remarks: combinedRemark,
                final_score: 0,
                final_rating: 'red',
                kpi_status: 'submitted',
              })
              .eq('id', existing.id);
          } else {
            await supabase
              .from('review_submissions')
              .insert([{
                kpi_id: mgrKpi.id,
                achieved_value: 0,
                self_score: 0,
                self_rating: 'red',
                self_remarks: remark,
                final_score: 0,
                final_rating: 'red',
                kpi_status: 'submitted',
              }]);
          }

          // Audit log
          await supabase.from('kpi_audit_logs').insert({
            kpi_id: mgrKpi.id,
            performed_by: adminId,
            action: 'MANAGER_PENALTY_SCORED',
            old_value: { status: oldStatus },
            new_value: { status: 'approved', final_score: 0 },
            metadata: { remark, penalty_kra: PENALTY_KRA_NAME, source: 'pending_reviews_admin' },
          });

          penalized++;
        } catch (e) {
          console.error(`Failed to penalize manager ${managerId}:`, e);
        }
      }

      // Send consolidated emails for manager penalty (fire-and-forget)
      // Build kpiDetails from the penalized managers
      const penaltyKpiDetails: Array<{ kpiId: string; kpiName: string; employeeId: string; reviewPeriod: string; reviewYear: number }> = [];
      for (const { managerId, reviewPeriod, reviewYear } of unique.values()) {
        penaltyKpiDetails.push({
          kpiId: managerId, // not used for email, just satisfying the interface
          kpiName: PENALTY_KRA_NAME,
          employeeId: managerId,
          reviewPeriod,
          reviewYear,
        });
      }
      if (penaltyKpiDetails.length > 0) {
        sendConsolidatedAutoScoreEmails(penaltyKpiDetails, "delayed team's review").catch(err =>
          console.error('Failed to send manager penalty emails:', err)
        );
      }

      return penalized;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['overdue-team-review-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      toast({ title: 'Manager Penalty Complete', description: `${count} manager KPI(s) penalized.` });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

// ─── Sent-Back KPIs Tab (Tab 3) ───

export interface SentBackKpi {
  kpiId: string;
  queryId: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  employeeEmail: string;
  departmentName: string;
  kpiName: string;
  kraName: string;
  frequency: string;
  reviewPeriod: string;
  reviewYear: number;
  sentBackBy: string;
  reason: string;
  sentBackDate: string;
  currentStatus: string;
}

export function useSentBackKpisTab(filterMonth?: string, filterYear?: number) {
  return useQuery({
    queryKey: ['sent-back-kpis-tab', filterMonth, filterYear],
    queryFn: async () => {
      // Fetch open send_back queries
      const { data: queries, error: qError } = await supabase
        .from('kpi_queries')
        .select('id, kpi_id, reason, created_at, raised_by')
        .eq('query_type', 'send_back')
        .eq('status', 'open');
      if (qError) throw qError;
      if (!queries || queries.length === 0) return [];

      const kpiIds = queries.map(q => q.kpi_id);

      // Fetch matching KPIs
      let kpiQuery = supabase
        .from('kpis')
        .select(`
          id, employee_id, kpi_name, kra_name, review_period, review_year, frequency, is_org_level, status,
          profiles!kpis_employee_id_fkey ( full_name, employee_code, email, department_id, departments ( name ) )
        `)
        .in('id', kpiIds)
        .eq('is_org_level', false)
        .not('status', 'eq', 'approved')
        .in('frequency', ['Monthly', 'Daily', 'Weekly']);

      if (filterMonth) kpiQuery = kpiQuery.eq('review_period', filterMonth);
      if (filterYear) kpiQuery = kpiQuery.eq('review_year', filterYear);

      const { data: kpis, error: kError } = await kpiQuery;
      if (kError) throw kError;

      const kpiMap = new Map((kpis || []).map(k => [k.id, k]));

      // Fetch sender names
      const senderIds = [...new Set(queries.map(q => q.raised_by))];
      let senderMap: Record<string, string> = {};
      if (senderIds.length > 0) {
        const { data: senders } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', senderIds);
        for (const s of senders || []) {
          senderMap[s.id] = s.full_name || 'Unknown';
        }
      }

      const results: SentBackKpi[] = [];
      for (const q of queries) {
        const kpi = kpiMap.get(q.kpi_id);
        if (!kpi) continue;
        const profile = kpi.profiles as any;
        results.push({
          kpiId: kpi.id,
          queryId: q.id,
          employeeId: kpi.employee_id,
          employeeName: profile?.full_name || 'Unknown',
          employeeCode: profile?.employee_code || '',
          employeeEmail: profile?.email || '',
          departmentName: profile?.departments?.name || '',
          kpiName: kpi.kpi_name,
          kraName: kpi.kra_name,
          frequency: kpi.frequency || '',
          reviewPeriod: kpi.review_period || '',
          reviewYear: kpi.review_year || 0,
          sentBackBy: senderMap[q.raised_by] || 'Unknown',
          reason: (q.reason || '').replace(/^\[SENT BACK\]\s*/i, ''),
          sentBackDate: q.created_at,
          currentStatus: (kpi as any).status || 'unknown',
        });
      }

      return results;
    },
  });
}

export function useSendReminder() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ items }: { items: SentBackKpi[] }) => {
      let sent = 0;
      for (const item of items) {
        try {
          await supabase.functions.invoke('send-email-notification', {
            body: {
              event_type: 'pending_review_reminder',
              recipient_email: item.employeeEmail,
              recipient_name: item.employeeName,
              metadata: {
                kpi_name: item.kpiName,
                kra_name: item.kraName,
                review_period: item.reviewPeriod,
                review_year: item.reviewYear,
                sent_back_by: item.sentBackBy,
                reason: item.reason,
              },
            },
          });
          sent++;
        } catch (e) {
          console.error(`Failed to send reminder for ${item.employeeEmail}:`, e);
        }
      }
      return sent;
    },
    onSuccess: (count) => {
      toast({ title: 'Reminders Sent', description: `${count} reminder(s) sent successfully.` });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

// ─── Rollback Types & Hooks ───

export interface AutoScoredKpi {
  kpiId: string;
  auditLogId: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  departmentName: string;
  kpiName: string;
  kraName: string;
  frequency: string;
  reviewPeriod: string;
  reviewYear: number;
  scoredAt: string;
  scoredBy: string;
}

export interface PenalizedManagerKpi {
  kpiId: string;
  auditLogId: string;
  managerId: string;
  managerName: string;
  managerCode: string;
  departmentName: string;
  kpiName: string;
  kraName: string;
  frequency: string;
  reviewPeriod: string;
  reviewYear: number;
  oldStatus: string;
  scoredAt: string;
  scoredBy: string;
}

export function useAutoScoredKpis(filterMonth?: string, filterYear?: number) {
  return useQuery({
    queryKey: ['auto-scored-kpis-rollback', filterMonth, filterYear],
    queryFn: async () => {
      // Get audit logs for system auto-scored
      const { data: logs, error: logErr } = await supabase
        .from('kpi_audit_logs')
        .select('id, kpi_id, performed_by, created_at, old_value, new_value, metadata')
        .eq('action', 'SYSTEM_AUTO_SCORED');
      if (logErr) throw logErr;
      if (!logs || logs.length === 0) return [];

      // Filter by source
      const validLogs = logs.filter(l => {
        const meta = l.metadata as any;
        return meta?.source === 'pending_reviews_admin';
      });
      if (validLogs.length === 0) return [];

      const kpiIds = validLogs.map(l => l.kpi_id);

      // Get KPIs that are still at approved (rollbackable)
      let kpiQuery = supabase
        .from('kpis')
        .select(`
          id, employee_id, kpi_name, kra_name, review_period, review_year, frequency, status,
          profiles!kpis_employee_id_fkey ( full_name, employee_code, department_id, departments ( name ) )
        `)
        .in('id', kpiIds)
        .eq('status', 'approved');

      if (filterMonth) kpiQuery = kpiQuery.eq('review_period', filterMonth);
      if (filterYear) kpiQuery = kpiQuery.eq('review_year', filterYear);

      const { data: kpis, error: kErr } = await kpiQuery;
      if (kErr) throw kErr;

      const kpiMap = new Map((kpis || []).map(k => [k.id, k]));

      // Fetch admin names
      const adminIds = [...new Set(validLogs.map(l => l.performed_by))];
      let adminMap: Record<string, string> = {};
      if (adminIds.length > 0) {
        const { data: admins } = await supabase.from('profiles').select('id, full_name').in('id', adminIds);
        for (const a of admins || []) adminMap[a.id] = a.full_name || 'Unknown';
      }

      const results: AutoScoredKpi[] = [];
      for (const log of validLogs) {
        const kpi = kpiMap.get(log.kpi_id);
        if (!kpi) continue;
        const profile = kpi.profiles as any;
        results.push({
          kpiId: kpi.id,
          auditLogId: log.id,
          employeeId: kpi.employee_id,
          employeeName: profile?.full_name || 'Unknown',
          employeeCode: profile?.employee_code || '',
          departmentName: profile?.departments?.name || '',
          kpiName: kpi.kpi_name,
          kraName: kpi.kra_name,
          frequency: (kpi as any).frequency || '',
          reviewPeriod: kpi.review_period || '',
          reviewYear: kpi.review_year || 0,
          scoredAt: log.created_at,
          scoredBy: adminMap[log.performed_by] || 'System',
        });
      }

      return results;
    },
  });
}

export function usePenalizedManagerKpis(filterMonth?: string, filterYear?: number) {
  return useQuery({
    queryKey: ['penalized-manager-kpis-rollback', filterMonth, filterYear],
    queryFn: async () => {
      const { data: logs, error: logErr } = await supabase
        .from('kpi_audit_logs')
        .select('id, kpi_id, performed_by, created_at, old_value, new_value, metadata')
        .eq('action', 'MANAGER_PENALTY_SCORED');
      if (logErr) throw logErr;
      if (!logs || logs.length === 0) return [];

      const validLogs = logs.filter(l => {
        const meta = l.metadata as any;
        return meta?.source === 'pending_reviews_admin';
      });
      if (validLogs.length === 0) return [];

      const kpiIds = validLogs.map(l => l.kpi_id);

      let kpiQuery = supabase
        .from('kpis')
        .select(`
          id, employee_id, kpi_name, kra_name, review_period, review_year, frequency, status,
          profiles!kpis_employee_id_fkey ( full_name, employee_code, department_id, departments ( name ) )
        `)
        .in('id', kpiIds)
        .eq('status', 'approved');

      if (filterMonth) kpiQuery = kpiQuery.eq('review_period', filterMonth);
      if (filterYear) kpiQuery = kpiQuery.eq('review_year', filterYear);

      const { data: kpis, error: kErr } = await kpiQuery;
      if (kErr) throw kErr;

      const kpiMap = new Map((kpis || []).map(k => [k.id, k]));

      const adminIds = [...new Set(validLogs.map(l => l.performed_by))];
      let adminMap: Record<string, string> = {};
      if (adminIds.length > 0) {
        const { data: admins } = await supabase.from('profiles').select('id, full_name').in('id', adminIds);
        for (const a of admins || []) adminMap[a.id] = a.full_name || 'Unknown';
      }

      const results: PenalizedManagerKpi[] = [];
      for (const log of validLogs) {
        const kpi = kpiMap.get(log.kpi_id);
        if (!kpi) continue;
        const profile = kpi.profiles as any;
        const oldVal = log.old_value as any;
        results.push({
          kpiId: kpi.id,
          auditLogId: log.id,
          managerId: kpi.employee_id,
          managerName: profile?.full_name || 'Unknown',
          managerCode: profile?.employee_code || '',
          departmentName: profile?.departments?.name || '',
          kpiName: kpi.kpi_name,
          kraName: kpi.kra_name,
          frequency: (kpi as any).frequency || '',
          reviewPeriod: kpi.review_period || '',
          reviewYear: kpi.review_year || 0,
          oldStatus: oldVal?.status || 'kra_set',
          scoredAt: log.created_at,
          scoredBy: adminMap[log.performed_by] || 'System',
        });
      }

      return results;
    },
  });
}

export function useRollbackAutoScore() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ kpiIds, adminId }: { kpiIds: string[]; adminId: string }) => {
      let rolled = 0;
      for (const kpiId of kpiIds) {
        try {
          // Revert KPI status to kra_set
          await supabase
            .from('kpis')
            .update({ status: 'kra_set' })
            .eq('id', kpiId);

          // Clear submission scores
          const { data: sub } = await supabase
            .from('review_submissions')
            .select('id')
            .eq('kpi_id', kpiId)
            .maybeSingle();

          if (sub) {
            await supabase
              .from('review_submissions')
              .update({
                achieved_value: null,
                self_score: null,
                self_rating: null,
                self_remarks: null,
                final_score: null,
                final_rating: null,
                auto_advance_reason: null,
                kpi_status: 'open',
              })
              .eq('id', sub.id);
          }

          // Audit log
          await supabase.from('kpi_audit_logs').insert({
            kpi_id: kpiId,
            performed_by: adminId,
            action: 'SYSTEM_AUTO_SCORE_ROLLBACK',
            old_value: { status: 'approved' },
            new_value: { status: 'kra_set' },
            metadata: { source: 'pending_reviews_admin' },
          });

          rolled++;
        } catch (e) {
          console.error(`Failed to rollback auto-score for ${kpiId}:`, e);
        }
      }
      return rolled;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['auto-scored-kpis-rollback'] });
      queryClient.invalidateQueries({ queryKey: ['overdue-kra-set-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      toast({ title: 'Rollback Complete', description: `${count} auto-scored KPI(s) reverted to KRA Set.` });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

export function useRollbackManagerPenalty() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ items, adminId }: { items: PenalizedManagerKpi[]; adminId: string }) => {
      let rolled = 0;
      for (const item of items) {
        try {
          // Revert to old status
          const targetStatus = item.oldStatus || 'kra_set';
          await supabase
            .from('kpis')
            .update({ status: targetStatus as any })
            .eq('id', item.kpiId);

          // Clear submission
          const { data: sub } = await supabase
            .from('review_submissions')
            .select('id')
            .eq('kpi_id', item.kpiId)
            .maybeSingle();

          if (sub) {
            await supabase
              .from('review_submissions')
              .update({
                achieved_value: null,
                self_score: null,
                self_rating: null,
                self_remarks: null,
                final_score: null,
                final_rating: null,
                auto_advance_reason: null,
                kpi_status: 'open',
              })
              .eq('id', sub.id);
          }

          await supabase.from('kpi_audit_logs').insert({
            kpi_id: item.kpiId,
            performed_by: adminId,
            action: 'MANAGER_PENALTY_ROLLBACK',
            old_value: { status: 'approved' },
            new_value: { status: targetStatus },
            metadata: { source: 'pending_reviews_admin' },
          });

          rolled++;
        } catch (e) {
          console.error(`Failed to rollback penalty for ${item.kpiId}:`, e);
        }
      }
      return rolled;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['penalized-manager-kpis-rollback'] });
      queryClient.invalidateQueries({ queryKey: ['overdue-team-review-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      toast({ title: 'Rollback Complete', description: `${count} manager penalty KPI(s) reverted.` });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

// ─── Pending Skip-Level Review ───

export function useOverdueSkipLevelKpis(deadlineDay: number, filterMonth?: string, filterYear?: number) {
  return useQuery({
    queryKey: ['overdue-skip-level-kpis', deadlineDay, filterMonth, filterYear],
    queryFn: async () => {
      let query = supabase
        .from('kpis')
        .select(`
          id, employee_id, kpi_name, kra_name, review_period, review_year, frequency, is_org_level,
          profiles!kpis_employee_id_fkey!inner ( full_name, employee_code, department_id, reporting_manager_id, is_active, departments ( name ) )
        `)
        .eq('status', 'manager_check')
        .eq('is_org_level', false)
        .eq('profiles.is_active', true)
        .in('frequency', ELIGIBLE_FREQUENCIES);

      if (filterMonth) query = query.eq('review_period', filterMonth);
      if (filterYear) query = query.eq('review_year', filterYear);

      const { data: kpis, error } = await query;
      if (error) throw error;

      // Workflow-aware filter: only keep KPIs where the employee's workflow
      // has 'skip_level_check' as the stage immediately after 'manager_check'
      const uniqueEmployeeIds = [...new Set((kpis || []).map(k => k.employee_id))];
      const workflowCache: Record<string, string[]> = {};
      for (const empId of uniqueEmployeeIds) {
        const sampleKpi = (kpis || []).find(k => k.employee_id === empId);
        if (sampleKpi?.review_period && sampleKpi?.review_year) {
          const { data: wf } = await supabase.rpc('get_employee_workflow', {
            employee_uuid: empId,
            p_review_period: sampleKpi.review_period,
            p_review_year: sampleKpi.review_year,
          });
          if (wf && Array.isArray(wf)) workflowCache[empId] = wf as string[];
        }
      }
      const workflowFilteredKpis = (kpis || []).filter(kpi => {
        const stages = workflowCache[kpi.employee_id];
        if (!stages) return false;
        const mgrIdx = stages.indexOf('manager_check');
        if (mgrIdx === -1) return false;
        return stages[mgrIdx + 1] === 'skip_level_check';
      });

      // Exclude KPIs where skip-level has already scored
      const allKpiIds = workflowFilteredKpis.map(k => k.id);
      let alreadyReviewedIds = new Set<string>();
      if (allKpiIds.length > 0) {
        const { data: reviewed } = await supabase
          .from('review_submissions')
          .select('kpi_id')
          .in('kpi_id', allKpiIds)
          .or('skip_level_score.not.is.null,is_na.eq.true');
        alreadyReviewedIds = new Set((reviewed || []).map(r => r.kpi_id));
      }

      const now = new Date();
      const managerIds = new Set<string>();
      const rawItems: Array<{ kpi: any; profile: any; daysOverdue: number }> = [];

      for (const kpi of workflowFilteredKpis) {
        if (alreadyReviewedIds.has(kpi.id)) continue;
        if (!kpi.review_period || !kpi.review_year) continue;
        const deadline = getDeadlineDate(kpi.review_period, kpi.review_year, deadlineDay);
        if (now <= deadline) continue;

        const diffMs = now.getTime() - deadline.getTime();
        const daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const profile = kpi.profiles as any;
        if (profile?.reporting_manager_id) {
          managerIds.add(profile.reporting_manager_id);
        }
        rawItems.push({ kpi, profile, daysOverdue });
      }

      // Fetch manager names + their reporting_manager (skip-level)
      const allManagerIds = [...managerIds];
      let managerMap: Record<string, string> = {};
      let managerToSkip: Record<string, string> = {};
      const skipManagerIds = new Set<string>();

      if (allManagerIds.length > 0) {
        const { data: managers } = await supabase
          .from('profiles')
          .select('id, full_name, reporting_manager_id')
          .in('id', allManagerIds);
        for (const m of managers || []) {
          managerMap[m.id] = m.full_name || 'Unknown';
          if (m.reporting_manager_id) {
            managerToSkip[m.id] = m.reporting_manager_id;
            skipManagerIds.add(m.reporting_manager_id);
          }
        }
      }

      let skipMap: Record<string, string> = {};
      const allSkipIds = [...skipManagerIds];
      if (allSkipIds.length > 0) {
        const { data: skips } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', allSkipIds);
        for (const s of skips || []) {
          skipMap[s.id] = s.full_name || 'Unknown';
        }
      }

      const results: OverdueKpi[] = [];
      for (const { kpi, profile, daysOverdue } of rawItems) {
        const mgrId = profile?.reporting_manager_id || null;
        const skipId = mgrId ? managerToSkip[mgrId] || null : null;

        results.push({
          kpiId: kpi.id,
          employeeId: kpi.employee_id,
          employeeName: profile?.full_name || 'Unknown',
          employeeCode: profile?.employee_code || '',
          departmentName: profile?.departments?.name || '',
          kpiName: kpi.kpi_name,
          kraName: kpi.kra_name,
          reviewPeriod: kpi.review_period,
          reviewYear: kpi.review_year,
          frequency: kpi.frequency || '',
          daysOverdue,
          reportingManagerId: mgrId,
          reportingManagerName: mgrId ? managerMap[mgrId] || null : null,
          skipLevelManagerId: skipId,
          skipLevelManagerName: skipId ? skipMap[skipId] || null : null,
        });
      }

      return results.sort((a, b) => b.daysOverdue - a.daysOverdue);
    },
    enabled: deadlineDay > 0,
  });
}

// ─── Bulk Push Forward (no scoring) ───

const TARGET_STATUS_MAP: Record<string, { status: string; label: string }> = {
  self_review: { status: 'self_review', label: 'Manager Review' },
  manager_check: { status: 'manager_check', label: 'Skip-Level Review' },
  skip_level_check: { status: 'skip_level_check', label: 'HR PMS Review' },
  hr_pms_review: { status: 'hr_pms_review', label: 'Audit' },
  audit: { status: 'audit', label: 'Audit' },
  management_review: { status: 'management_review', label: 'Management Review' },
};

export function useBulkPushForward() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ kpiItems, targetStatus, adminId, currentStatusLabel }: {
      kpiItems: Array<{ kpiId: string; employeeId: string }>;
      targetStatus: string;
      adminId: string;
      currentStatusLabel: string;
    }) => {
      const targetLabel = TARGET_STATUS_MAP[targetStatus]?.label || targetStatus.replace(/_/g, ' ');
      let forwarded = 0;
      let skipped = 0;

      // Group KPIs by employeeId to fetch workflow once per employee
      const grouped: Record<string, string[]> = {};
      for (const item of kpiItems) {
        if (!grouped[item.employeeId]) grouped[item.employeeId] = [];
        grouped[item.employeeId].push(item.kpiId);
      }

      for (const [employeeId, kpiIds] of Object.entries(grouped)) {
        try {
          // Fetch workflow stages once per employee
          const { data: stagesData } = await supabase
            .rpc('get_employee_workflow', { employee_uuid: employeeId });
          const stages: string[] = Array.isArray(stagesData) ? (stagesData as string[]) : DEFAULT_WORKFLOW_STAGES;

          // Validate targetStatus exists in this employee's workflow
          const targetIdx = stages.indexOf(targetStatus);
          if (targetIdx === -1) {
            skipped += kpiIds.length;
            continue;
          }

          for (const kpiId of kpiIds) {
            try {
              // Get current status
              const { data: kpi } = await supabase
                .from('kpis')
                .select('status')
                .eq('id', kpiId)
                .single();

              const oldStatus = kpi?.status || 'unknown';
              const currentIdx = stages.indexOf(oldStatus as string);

              // Validate target is ahead of current status
              if (currentIdx !== -1 && targetIdx <= currentIdx) {
                skipped++;
                continue;
              }

              // Update KPI status
              await supabase
                .from('kpis')
                .update({ status: targetStatus as any })
                .eq('id', kpiId);

              // Upsert review submission with auto_advance_reason
              const reason = `System-forwarded to ${targetLabel} (skipped ${currentStatusLabel})`;
              const { data: existing } = await supabase
                .from('review_submissions')
                .select('id')
                .eq('kpi_id', kpiId)
                .maybeSingle();

              if (existing) {
                await supabase
                  .from('review_submissions')
                  .update({ auto_advance_reason: reason })
                  .eq('id', existing.id);
              } else {
                await supabase
                  .from('review_submissions')
                  .insert([{
                    kpi_id: kpiId,
                    auto_advance_reason: reason,
                    kpi_status: 'open',
                  }]);
              }

              // Audit log
              await supabase.from('kpi_audit_logs').insert({
                kpi_id: kpiId,
                performed_by: adminId,
                action: 'SYSTEM_FORWARDED',
                old_value: { status: oldStatus },
                new_value: { status: targetStatus },
                metadata: { reason, source: 'pending_reviews_admin' },
              });

              forwarded++;
            } catch (e) {
              console.error(`Failed to push forward KPI ${kpiId}:`, e);
            }
          }
        } catch (e) {
          console.error(`Failed to fetch workflow for employee ${employeeId}:`, e);
          skipped += kpiIds.length;
        }
      }

      return { forwarded, skipped };
    },
    onSuccess: ({ forwarded, skipped }) => {
      queryClient.invalidateQueries({ queryKey: ['overdue-kra-set-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['overdue-team-review-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['overdue-skip-level-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      const msg = skipped > 0
        ? `${forwarded} KPI(s) forwarded. ${skipped} skipped (workflow mismatch).`
        : `${forwarded} KPI(s) forwarded to next level.`;
      toast({ title: 'Push Forward Complete', description: msg });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}
