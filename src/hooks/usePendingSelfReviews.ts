import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSystemSetting, useUpdateSystemSetting } from '@/hooks/useSystemSettings';

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
          profiles!kpis_employee_id_fkey ( full_name, employee_code, department_id, departments ( name ) )
        `)
        .eq('status', 'kra_set')
        .eq('is_org_level', false)
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
      const results: OverdueKpi[] = [];

      for (const kpi of kpis || []) {
        if (sentBackIds.has(kpi.id)) continue;
        if (!kpi.review_period || !kpi.review_year) continue;
        const deadline = getDeadlineDate(kpi.review_period, kpi.review_year, deadlineDay);
        if (now <= deadline) continue;

        const diffMs = now.getTime() - deadline.getTime();
        const daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const profile = kpi.profiles as any;

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
          reportingManagerId: null,
          reportingManagerName: null,
          skipLevelManagerId: null,
          skipLevelManagerName: null,
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
          profiles!kpis_employee_id_fkey ( full_name, employee_code, department_id, reporting_manager_id, departments ( name ) )
        `)
        .eq('status', 'manager_check')
        .eq('is_org_level', false)
        .in('frequency', ELIGIBLE_FREQUENCIES);

      if (filterMonth) query = query.eq('review_period', filterMonth);
      if (filterYear) query = query.eq('review_year', filterYear);

      const { data: kpis, error } = await query;
      if (error) throw error;

      const now = new Date();
      const results: OverdueKpi[] = [];

      // Collect unique manager IDs to fetch names
      const managerIds = new Set<string>();
      const skipManagerIds = new Set<string>();

      const rawItems: Array<{ kpi: any; profile: any; daysOverdue: number }> = [];

      for (const kpi of kpis || []) {
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

export function useBulkAutoScore() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ kpiIds, remark, adminId }: { kpiIds: string[]; remark: string; adminId: string }) => {
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
  reviewPeriod: string;
  reviewYear: number;
  sentBackBy: string;
  reason: string;
  sentBackDate: string;
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
          id, employee_id, kpi_name, kra_name, review_period, review_year, frequency, is_org_level,
          profiles!kpis_employee_id_fkey ( full_name, employee_code, email, department_id, departments ( name ) )
        `)
        .in('id', kpiIds)
        .eq('is_org_level', false)
        .eq('status', 'kra_set')
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
          reviewPeriod: kpi.review_period || '',
          reviewYear: kpi.review_year || 0,
          sentBackBy: senderMap[q.raised_by] || 'Unknown',
          reason: (q.reason || '').replace(/^\[SENT BACK\]\s*/i, ''),
          sentBackDate: q.created_at,
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
