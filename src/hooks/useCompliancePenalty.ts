import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSystemSetting, useUpdateSystemSetting } from '@/hooks/useSystemSettings';
import { isCycleComplete } from '@/lib/frequencyUtils';

// ─── Constants ───

const PENALTY_KRA_NAME = 'Implementation of common - policies / systems / processes';

// ─── Settings Hook ───

export interface CompliancePenaltyExclusions {
  excludeOrgKpi: boolean;
  excludeSentBack: boolean;
  excludeQuarterlyNotDue: boolean;
  excludeBimonthlyNotDue: boolean;
  excludeHalfyearlyNotDue: boolean;
  excludeYearlyNotDue: boolean;
}

export interface CompliancePenaltySettings {
  enabled: boolean;
  deadlineDay: number;
  remark: string;
  exclusions: CompliancePenaltyExclusions;
  isLoading: boolean;
}

function parseBool(val: unknown, fallback: boolean): boolean {
  if (!val) return fallback;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const s = val.replace(/^"|"$/g, '');
    return s === 'true' || s === '1';
  }
  return fallback;
}

function parseStr(val: unknown, fallback: string): string {
  if (!val) return fallback;
  if (typeof val === 'string') return val.replace(/^"|"$/g, '');
  return String(val);
}

function parseInt10(val: unknown, fallback: number): number {
  if (!val) return fallback;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const n = parseInt(val.replace(/^"|"$/g, ''), 10);
    return isNaN(n) ? fallback : n;
  }
  return fallback;
}

export function useCompliancePenaltySettings(): CompliancePenaltySettings {
  const { data: enabledS, isLoading: l1 } = useSystemSetting('compliance_penalty_enabled');
  const { data: deadlineS, isLoading: l2 } = useSystemSetting('compliance_penalty_deadline_day');
  const { data: remarkS, isLoading: l3 } = useSystemSetting('compliance_penalty_auto_remark');
  const { data: exOrgS, isLoading: l4 } = useSystemSetting('compliance_exclude_org_kpi');
  const { data: exSentBackS, isLoading: l5 } = useSystemSetting('compliance_exclude_sent_back');
  const { data: exQuarterlyS, isLoading: l6 } = useSystemSetting('compliance_exclude_quarterly_not_due');
  const { data: exBimonthlyS, isLoading: l7 } = useSystemSetting('compliance_exclude_bimonthly_not_due');
  const { data: exHalfyearlyS, isLoading: l8 } = useSystemSetting('compliance_exclude_halfyearly_not_due');
  const { data: exYearlyS, isLoading: l9 } = useSystemSetting('compliance_exclude_yearly_not_due');

  return {
    enabled: parseBool(enabledS?.setting_value, false),
    deadlineDay: parseInt10(deadlineS?.setting_value, 10),
    remark: parseStr(remarkS?.setting_value, 'Self-review not completed by due date'),
    exclusions: {
      excludeOrgKpi: parseBool(exOrgS?.setting_value, true),
      excludeSentBack: parseBool(exSentBackS?.setting_value, true),
      excludeQuarterlyNotDue: parseBool(exQuarterlyS?.setting_value, true),
      excludeBimonthlyNotDue: parseBool(exBimonthlyS?.setting_value, true),
      excludeHalfyearlyNotDue: parseBool(exHalfyearlyS?.setting_value, true),
      excludeYearlyNotDue: parseBool(exYearlyS?.setting_value, true),
    },
    isLoading: l1 || l2 || l3 || l4 || l5 || l6 || l7 || l8 || l9,
  };
}

// ─── Non-Compliant Employees Hook ───

export interface NonCompliantEmployee {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  departmentName: string;
  pendingKpiIds: string[];
  pendingKpiCount: number;
  complianceKpiId: string | null;
  complianceKpiStatus: string | null;
  status: 'ready' | 'penalized' | 'no_compliance_kpi';
}

function isFrequencyNotDue(
  frequency: string | null,
  reviewMonth: string,
  reviewYear: number,
  cycleStart: string | null,
  exclusions: CompliancePenaltyExclusions,
): boolean {
  if (!frequency) return false;
  const freq = frequency.toLowerCase();

  if (freq === 'quarterly' && exclusions.excludeQuarterlyNotDue) {
    return !isCycleComplete('Quarterly', reviewMonth, reviewYear, cycleStart);
  }
  if (freq === 'bi-monthly' && exclusions.excludeBimonthlyNotDue) {
    return !isCycleComplete('Bi-Monthly', reviewMonth, reviewYear, cycleStart);
  }
  if (freq === 'half-yearly' && exclusions.excludeHalfyearlyNotDue) {
    return !isCycleComplete('Half-Yearly', reviewMonth, reviewYear, cycleStart);
  }
  if (freq === 'yearly' && exclusions.excludeYearlyNotDue) {
    return !isCycleComplete('Yearly', reviewMonth, reviewYear, cycleStart);
  }
  return false;
}

export function useNonCompliantEmployees(
  filterMonth?: string,
  filterYear?: number,
  exclusions?: CompliancePenaltyExclusions,
) {
  return useQuery({
    queryKey: ['non-compliant-employees', filterMonth, filterYear, exclusions],
    queryFn: async () => {
      if (!filterMonth || !filterYear || !exclusions) return [];

      // 1. Get all KPIs for the period at kra_set/self_review
      let query = supabase
        .from('kpis')
        .select(`
          id, employee_id, kpi_name, kra_name, frequency, is_org_level, status, category_id,
          frequency_cycle_start,
          profiles!kpis_employee_id_fkey ( full_name, employee_code, department_id, departments ( name ) )
        `)
        .eq('review_period', filterMonth)
        .eq('review_year', filterYear)
        .in('status', ['kra_set', 'self_review']);

      const { data: pendingKpis, error } = await query;
      if (error) throw error;
      if (!pendingKpis || pendingKpis.length === 0) return [];

      // 2. Fetch sent-back KPI IDs if exclusion enabled
      let sentBackIds = new Set<string>();
      if (exclusions.excludeSentBack) {
        const kpiIds = pendingKpis.map(k => k.id);
        if (kpiIds.length > 0) {
          const { data: sentBack } = await supabase
            .from('kpi_queries')
            .select('kpi_id')
            .in('kpi_id', kpiIds)
            .eq('query_type', 'send_back')
            .eq('status', 'open');
          sentBackIds = new Set((sentBack || []).map(r => r.kpi_id));
        }
      }

      // 3. Check for already-penalized KPIs via audit logs
      const { data: penaltyLogs } = await supabase
        .from('kpi_audit_logs')
        .select('kpi_id, metadata')
        .eq('action', 'EMPLOYEE_COMPLIANCE_PENALTY');
      const penalizedKpiIds = new Set(
        (penaltyLogs || [])
          .filter(l => {
            const meta = l.metadata as any;
            return meta?.review_period === filterMonth && meta?.review_year === filterYear;
          })
          .map(l => l.kpi_id)
      );

      // 4. Group by employee, apply exclusions
      const employeeMap = new Map<string, {
        profile: any;
        pendingKpiIds: string[];
        complianceKpiId: string | null;
        complianceKpiStatus: string | null;
        wasPenalized: boolean;
      }>();

      for (const kpi of pendingKpis) {
        // Apply exclusions
        if (exclusions.excludeOrgKpi && kpi.is_org_level) continue;
        if (exclusions.excludeSentBack && sentBackIds.has(kpi.id)) continue;
        if (isFrequencyNotDue(kpi.frequency, filterMonth, filterYear, kpi.frequency_cycle_start, exclusions)) continue;

        const empId = kpi.employee_id;
        if (!employeeMap.has(empId)) {
          employeeMap.set(empId, {
            profile: kpi.profiles,
            pendingKpiIds: [],
            complianceKpiId: null,
            complianceKpiStatus: null,
            wasPenalized: false,
          });
        }
        employeeMap.get(empId)!.pendingKpiIds.push(kpi.id);
      }

      // 5. For each employee, find their compliance KPI
      const employeeIds = [...employeeMap.keys()];
      if (employeeIds.length > 0) {
        const { data: complianceKpis } = await supabase
          .from('kpis')
          .select('id, employee_id, status, kra_name')
          .eq('review_period', filterMonth)
          .eq('review_year', filterYear)
          .eq('kra_name', PENALTY_KRA_NAME)
          .in('employee_id', employeeIds);

        for (const ck of complianceKpis || []) {
          const entry = employeeMap.get(ck.employee_id);
          if (entry) {
            entry.complianceKpiId = ck.id;
            entry.complianceKpiStatus = ck.status;
            entry.wasPenalized = penalizedKpiIds.has(ck.id);
          }
        }
      }

      // 6. Build results
      const results: NonCompliantEmployee[] = [];
      for (const [empId, entry] of employeeMap) {
        const profile = entry.profile as any;
        let status: NonCompliantEmployee['status'] = 'ready';
        if (entry.wasPenalized) status = 'penalized';
        else if (!entry.complianceKpiId) status = 'no_compliance_kpi';

        results.push({
          employeeId: empId,
          employeeName: profile?.full_name || 'Unknown',
          employeeCode: profile?.employee_code || '',
          departmentName: profile?.departments?.name || '',
          pendingKpiIds: entry.pendingKpiIds,
          pendingKpiCount: entry.pendingKpiIds.length,
          complianceKpiId: entry.complianceKpiId,
          complianceKpiStatus: entry.complianceKpiStatus,
          status,
        });
      }

      return results.sort((a, b) => b.pendingKpiCount - a.pendingKpiCount);
    },
    enabled: !!filterMonth && !!filterYear && !!exclusions,
  });
}

// ─── Bulk Compliance Penalty Mutation ───

export function useBulkCompliancePenalty() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      employees,
      remark,
      adminId,
      reviewPeriod,
      reviewYear,
    }: {
      employees: NonCompliantEmployee[];
      remark: string;
      adminId: string;
      reviewPeriod: string;
      reviewYear: number;
    }) => {
      let kpisZeroed = 0;
      let complianceZeroed = 0;
      const batchId = crypto.randomUUID();

      for (const emp of employees) {
        if (emp.status === 'penalized') continue;

        try {
          // 1. Zero-score ALL pending KPIs
          for (const kpiId of emp.pendingKpiIds) {
            await supabase.from('kpis').update({ status: 'approved' }).eq('id', kpiId);

            const { data: existing } = await supabase
              .from('review_submissions')
              .select('id')
              .eq('kpi_id', kpiId)
              .maybeSingle();

            const submissionData = {
              achieved_value: 0,
              self_score: 0,
              self_rating: 'red' as const,
              self_remarks: remark,
              manager_score: 0,
              manager_rating: 'red' as const,
              skip_level_score: 0,
              skip_level_rating: 'red' as const,
              hr_pms_score: 0,
              hr_pms_rating: 'red' as const,
              auditor_score: 0,
              auditor_rating: 'red' as const,
              management_score: 0,
              management_rating: 'red' as const,
              final_score: 0,
              final_rating: 'red' as const,
              kpi_status: 'submitted',
              auto_advance_reason: 'Compliance penalty: self-review not completed by deadline',
            };

            if (existing) {
              await supabase.from('review_submissions').update(submissionData).eq('id', existing.id);
            } else {
              await supabase.from('review_submissions').insert([{ kpi_id: kpiId, ...submissionData }]);
            }

            await supabase.from('kpi_audit_logs').insert({
              kpi_id: kpiId,
              performed_by: adminId,
              action: 'EMPLOYEE_COMPLIANCE_PENALTY',
              old_value: { status: 'kra_set' },
              new_value: { status: 'approved', final_score: 0 },
              metadata: {
                remark,
                batch_id: batchId,
                penalty_type: 'pending_kpi_zero',
                review_period: reviewPeriod,
                review_year: reviewYear,
                source: 'compliance_penalty_admin',
              },
            });
            kpisZeroed++;
          }

          // 2. Zero the compliance KPI (if exists and not already approved with a real score)
          if (emp.complianceKpiId) {
            await supabase.from('kpis').update({ status: 'approved' }).eq('id', emp.complianceKpiId);

            const { data: existing } = await supabase
              .from('review_submissions')
              .select('id, self_remarks')
              .eq('kpi_id', emp.complianceKpiId)
              .maybeSingle();

            const complianceSubmission = {
              achieved_value: 0,
              self_score: 0,
              self_rating: 'red' as const,
              self_remarks: existing?.self_remarks
                ? `${existing.self_remarks}\n[System] ${remark}`
                : remark,
              final_score: 0,
              final_rating: 'red' as const,
              kpi_status: 'submitted',
              auto_advance_reason: 'Compliance penalty: employee did not complete all self-reviews by deadline',
            };

            if (existing) {
              await supabase.from('review_submissions').update(complianceSubmission).eq('id', existing.id);
            } else {
              await supabase.from('review_submissions').insert([{ kpi_id: emp.complianceKpiId, ...complianceSubmission }]);
            }

            await supabase.from('kpi_audit_logs').insert({
              kpi_id: emp.complianceKpiId,
              performed_by: adminId,
              action: 'EMPLOYEE_COMPLIANCE_PENALTY',
              old_value: { status: emp.complianceKpiStatus },
              new_value: { status: 'approved', final_score: 0 },
              metadata: {
                remark,
                batch_id: batchId,
                penalty_type: 'compliance_kpi_zero',
                penalty_kra: PENALTY_KRA_NAME,
                review_period: reviewPeriod,
                review_year: reviewYear,
                source: 'compliance_penalty_admin',
              },
            });
            complianceZeroed++;
          }
        } catch (e) {
          console.error(`Failed to penalize employee ${emp.employeeId}:`, e);
        }
      }

      return { kpisZeroed, complianceZeroed, batchId };
    },
    onSuccess: ({ kpisZeroed, complianceZeroed }) => {
      queryClient.invalidateQueries({ queryKey: ['non-compliant-employees'] });
      queryClient.invalidateQueries({ queryKey: ['compliance-penalized-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      toast({
        title: 'Compliance Penalty Applied',
        description: `${kpisZeroed} pending KPI(s) zeroed, ${complianceZeroed} compliance KPI(s) penalized.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

// ─── Penalized KPIs for Rollback ───

export interface CompliancePenalizedKpi {
  kpiId: string;
  auditLogId: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  departmentName: string;
  kpiName: string;
  kraName: string;
  penaltyType: string;
  batchId: string;
  scoredAt: string;
  scoredBy: string;
  oldStatus: string;
}

export function useCompliancePenalizedKpis(filterMonth?: string, filterYear?: number) {
  return useQuery({
    queryKey: ['compliance-penalized-kpis', filterMonth, filterYear],
    queryFn: async () => {
      const { data: logs, error: logErr } = await supabase
        .from('kpi_audit_logs')
        .select('id, kpi_id, performed_by, created_at, old_value, metadata')
        .eq('action', 'EMPLOYEE_COMPLIANCE_PENALTY');
      if (logErr) throw logErr;
      if (!logs || logs.length === 0) return [];

      const validLogs = logs.filter(l => {
        const meta = l.metadata as any;
        return meta?.source === 'compliance_penalty_admin'
          && (!filterMonth || meta?.review_period === filterMonth)
          && (!filterYear || meta?.review_year === filterYear);
      });
      if (validLogs.length === 0) return [];

      const kpiIds = [...new Set(validLogs.map(l => l.kpi_id))];

      const { data: kpis, error: kErr } = await supabase
        .from('kpis')
        .select(`
          id, employee_id, kpi_name, kra_name, status,
          profiles!kpis_employee_id_fkey ( full_name, employee_code, department_id, departments ( name ) )
        `)
        .in('id', kpiIds)
        .eq('status', 'approved');
      if (kErr) throw kErr;

      const kpiMap = new Map((kpis || []).map(k => [k.id, k]));

      const adminIds = [...new Set(validLogs.map(l => l.performed_by).filter(Boolean))];
      let adminMap: Record<string, string> = {};
      if (adminIds.length > 0) {
        const { data: admins } = await supabase.from('profiles').select('id, full_name').in('id', adminIds);
        for (const a of admins || []) adminMap[a.id] = a.full_name || 'Unknown';
      }

      const results: CompliancePenalizedKpi[] = [];
      for (const log of validLogs) {
        const kpi = kpiMap.get(log.kpi_id);
        if (!kpi) continue;
        const profile = kpi.profiles as any;
        const meta = log.metadata as any;
        const oldVal = log.old_value as any;
        results.push({
          kpiId: kpi.id,
          auditLogId: log.id,
          employeeId: kpi.employee_id,
          employeeName: profile?.full_name || 'Unknown',
          employeeCode: profile?.employee_code || '',
          departmentName: profile?.departments?.name || '',
          kpiName: kpi.kpi_name,
          kraName: kpi.kra_name,
          penaltyType: meta?.penalty_type || 'unknown',
          batchId: meta?.batch_id || '',
          scoredAt: log.created_at,
          scoredBy: adminMap[log.performed_by] || 'System',
          oldStatus: oldVal?.status || 'kra_set',
        });
      }

      return results;
    },
  });
}

// ─── Rollback Compliance Penalty ───

export function useRollbackCompliancePenalty() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ items, adminId }: { items: CompliancePenalizedKpi[]; adminId: string }) => {
      let rolled = 0;
      for (const item of items) {
        try {
          const targetStatus = item.oldStatus || 'kra_set';
          await supabase.from('kpis').update({ status: targetStatus as any }).eq('id', item.kpiId);

          const { data: sub } = await supabase
            .from('review_submissions')
            .select('id')
            .eq('kpi_id', item.kpiId)
            .maybeSingle();

          if (sub) {
            await supabase.from('review_submissions').update({
              achieved_value: null,
              self_score: null,
              self_rating: null,
              self_remarks: null,
              final_score: null,
              final_rating: null,
              auto_advance_reason: null,
              kpi_status: 'open',
            }).eq('id', sub.id);
          }

          await supabase.from('kpi_audit_logs').insert({
            kpi_id: item.kpiId,
            performed_by: adminId,
            action: 'COMPLIANCE_PENALTY_ROLLBACK',
            old_value: { status: 'approved' },
            new_value: { status: targetStatus },
            metadata: {
              batch_id: item.batchId,
              source: 'compliance_penalty_admin',
            },
          });

          rolled++;
        } catch (e) {
          console.error(`Failed to rollback compliance penalty for ${item.kpiId}:`, e);
        }
      }
      return rolled;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['compliance-penalized-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['non-compliant-employees'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      toast({ title: 'Rollback Complete', description: `${count} compliance penalty KPI(s) reverted.` });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}
