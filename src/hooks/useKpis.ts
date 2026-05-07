import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { format, addMonths } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { MONTH_NAMES } from '@/hooks/useAdminReports';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { isDuplicateKpiError, getDuplicateKpiMessage, formatKpiInsertError } from '@/lib/kpiErrorUtils';

export type ReviewStatus = 'kra_set' | 'self_review' | 'manager_check' | 'skip_level_check' | 'hr_pms_review' | 'audit' | 'management_review' | 'approved';
export type RatingLevel = 'red' | 'yellow' | 'green' | 'blue';
export type KpiStatus = 'open' | 'submitted' | 'approved_by_manager' | 'locked' | 'sent_back';
export type QueryStatus = 'open' | 'resolved';

export type OrgLevelScope = 'organization' | 'department' | 'employee';

export type FrequencyType = 'Daily' | 'Weekly' | 'Monthly' | 'Bi-Monthly' | 'Quarterly' | 'Half-Yearly' | 'Yearly';

export interface KPI {
  id: string;
  category_id: string;
  employee_id: string;
  kra_name: string;
  kpi_name: string;
  uom: string | null;
  criteria: string | null;
  target_value: number | null;
  weightage: number | null;
  review_period: string | null;
  review_year: number | null;
  status: ReviewStatus;
  created_at: string;
  updated_at: string;
  // Rating thresholds
  r5: string | null;
  r4: string | null;
  r3: string | null;
  r2: string | null;
  r1: string | null;
  r0: string | null;
  frequency: string | null;
  source_of_data: string | null;
  // Organization-level KPI flag
  is_org_level: boolean;
  // Org-level scope: organization (all employees), department, or employee
  org_level_scope: OrgLevelScope;
  // Qualitative UOM fields
  uom_type: 'numeric' | 'binary' | 'tiered' | null;
  qualitative_options: Array<{ label: string; rating: number; definition: string }> | null;
  // Frequency and Sub-Frequency fields
  sub_frequency: string | null;
  frequency_cycle_start: string | null;
  is_frequency_locked: boolean;
  // Resubmission configuration
  require_resubmit_reason: boolean;
  // Day count type for daily KPIs
  day_count_type: 'working_days' | 'all_days' | null;
  // Threshold mode: 'absolute' (direct value comparison) or 'ratio' (legacy percentage-based)
  threshold_mode: 'absolute' | 'ratio' | null;
  // Template linkage
  source_template_id: string | null;
  kra_categories?: {
    id: string;
    name: string;
    color: string;
    weightage: number;
  };
}

export interface ReviewSubmission {
  id: string;
  kpi_id: string;
  performance_review_id: string | null;
  achieved_value: number | null;
  manager_achieved_value: number | null;
  auditor_achieved_value: number | null;
  management_achieved_value: number | null;
  self_rating: RatingLevel | null;
  self_score: number | null;
  self_remarks: string | null;
  self_evidence_url: string | null;
  self_evidence_urls: string[] | null;
  manager_rating: RatingLevel | null;
  manager_score: number | null;
  manager_remarks: string | null;
  manager_evidence_url: string | null;
  manager_evidence_urls: string[] | null;
  auditor_rating: RatingLevel | null;
  auditor_score: number | null;
  auditor_remarks: string | null;
  auditor_evidence_url: string | null;
  auditor_evidence_urls: string[] | null;
  management_rating: RatingLevel | null;
  management_score: number | null;
  management_remarks: string | null;
  management_evidence_url: string | null;
  management_evidence_urls: string[] | null;
  // Skip-level review fields
  skip_level_rating: RatingLevel | null;
  skip_level_score: number | null;
  skip_level_remarks: string | null;
  skip_level_evidence_url: string | null;
  skip_level_evidence_urls: string[] | null;
  skip_level_achieved_value: number | null;
  // HR PMS review fields
  hr_pms_rating: RatingLevel | null;
  hr_pms_score: number | null;
  hr_pms_remarks: string | null;
  hr_pms_evidence_url: string | null;
  hr_pms_evidence_urls: string[] | null;
  hr_pms_achieved_value: number | null;
  final_rating: RatingLevel | null;
  final_score: number | null;
  kpi_status: KpiStatus;
  is_na: boolean;
  auto_advance_reason: string | null;
  submitted_at: string | null;
  updated_at: string | null;
}

export interface KpiQuery {
  id: string;
  kpi_id: string;
  entity_type: 'kra' | 'kpi';
  raised_by: string;
  raised_to: string;
  reason: string;
  evidence_url: string | null;
  resolution_notes: string | null;
  status: QueryStatus;
  created_at: string;
  resolved_at: string | null;
  updated_at: string;
}

export function useMyKpis() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['my-kpis', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kpis')
        .select(`
          *,
          kra_categories (id, name, color, weightage)
        `)
        .eq('employee_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as unknown as KPI[];
    },
    enabled: !!user?.id,
  });
}

// Slim column selection for bulk queries — avoids fetching unused columns
// NOTE: joins to kra_categories / profiles are intentionally NOT embedded here
// (PostgREST replans wide joins per page → statement timeouts). Resolve them
// via separate `.in('id', [...])` lookups after fetching.
const SLIM_KPI_SELECT = `
  id, employee_id, category_id, kra_name, kpi_name, status, weightage,
  review_period, review_year, frequency, is_org_level, org_level_scope,
  uom, uom_type, criteria, target_value, r5, r4, r3, r2, r1, r0,
  sub_frequency, frequency_cycle_start, source_template_id, threshold_mode,
  source_of_data, qualitative_options, is_issued, ref_code,
  is_frequency_locked, require_resubmit_reason, day_count_type, created_at, updated_at
`;

// Hydrate KPI rows with kra_categories + profiles via separate id-batched lookups.
// Mirrors the embedded-join shape so existing consumers (`kpi.profiles`,
// `kpi.kra_categories`) keep working unchanged.
async function hydrateKpiRelations(kpis: any[]): Promise<any[]> {
  if (!kpis || kpis.length === 0) return kpis;

  const categoryIds = Array.from(new Set(kpis.map(k => k.category_id).filter(Boolean)));
  const employeeIds = Array.from(new Set(kpis.map(k => k.employee_id).filter(Boolean)));

  const [catsRes, profsRes] = await Promise.all([
    categoryIds.length
      ? supabase.from('kra_categories').select('id, name, color, weightage').in('id', categoryIds)
      : Promise.resolve({ data: [], error: null } as any),
    employeeIds.length
      ? supabase
          .from('profiles')
          .select('id, full_name, email, employee_code, department_id, reporting_manager_id')
          .in('id', employeeIds)
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  if (catsRes.error) throw catsRes.error;
  if (profsRes.error) throw profsRes.error;

  const catMap = new Map((catsRes.data || []).map((c: any) => [c.id, c]));
  const profMap = new Map((profsRes.data || []).map((p: any) => [p.id, p]));

  return kpis.map(k => ({
    ...k,
    kra_categories: catMap.get(k.category_id) || null,
    profiles: profMap.get(k.employee_id) || null,
  }));
}

export function useAllKpis(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['all-kpis'],
    placeholderData: keepPreviousData,
    enabled: options?.enabled !== false,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // Fetch all KPIs by paginating through results (Supabase default limit is 1000)
      const allKpis: any[] = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('kpis')
          .select(SLIM_KPI_SELECT)
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);

        if (error) throw error;
        
        if (data && data.length > 0) {
          allKpis.push(...data);
          from += pageSize;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      return hydrateKpiRelations(allKpis);
    },
  });
}

export function useKpisByPeriod(selectedPeriod: string | undefined, selectedYear: number | undefined) {
  return useQuery({
    queryKey: ['kpis-by-period', selectedPeriod, selectedYear],
    enabled: !!selectedPeriod && !!selectedYear,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const pageSize = 1000;
      const isMonthPeriod = MONTH_NAMES.includes(selectedPeriod as any);

      // Helper to fully paginate a query builder.
      const paginate = async (build: () => any) => {
        const out: any[] = [];
        let from = 0;
        // Hard safety: 50 pages
        for (let i = 0; i < 50; i++) {
          const { data, error } = await build()
            .order('created_at', { ascending: false })
            .order('id', { ascending: true })
            .range(from, from + pageSize - 1);
          if (error) throw error;
          const rows = data ?? [];
          out.push(...rows);
          if (rows.length < pageSize) break;
          from += pageSize;
        }
        return out;
      };

      let rows: any[];
      if (isMonthPeriod) {
        // Split fetch: server-side month match + non-monthly frequencies that
        // need client-side coverage resolution. Avoids the year-wide scan that
        // was hitting statement_timeout.
        const NON_MONTHLY = ['Quarterly', 'Half-Yearly', 'Yearly', 'Bi-Monthly', 'Custom'];
        const [monthRows, nonMonthlyRows] = await Promise.all([
          paginate(() =>
            supabase
              .from('kpis')
              .select(SLIM_KPI_SELECT)
              .eq('review_year', selectedYear as number)
              .eq('review_period', selectedPeriod as string),
          ),
          paginate(() =>
            supabase
              .from('kpis')
              .select(SLIM_KPI_SELECT)
              .eq('review_year', selectedYear as number)
              .in('frequency', NON_MONTHLY),
          ),
        ]);
        // Dedupe by id (a row could match both, e.g. Custom with month period)
        const seen = new Set<string>();
        rows = [];
        for (const r of [...monthRows, ...nonMonthlyRows]) {
          if (!seen.has(r.id)) {
            seen.add(r.id);
            rows.push(r);
          }
        }
      } else if (selectedPeriod === 'all') {
        rows = await paginate(() =>
          supabase.from('kpis').select(SLIM_KPI_SELECT).eq('review_year', selectedYear as number),
        );
      } else {
        rows = await paginate(() =>
          supabase
            .from('kpis')
            .select(SLIM_KPI_SELECT)
            .eq('review_year', selectedYear as number)
            .eq('review_period', selectedPeriod as string),
        );
      }

      return hydrateKpiRelations(rows);
    },
  });
}

/**
 * Fetch KPIs across multiple month/year ranges (for YTD, QTD, and Custom period modes).
 * Batches all period combinations into parallel requests and deduplicates by KPI id.
 */
export function useKpisByPeriodRanges(periodRanges: Array<{ month: string; year: number }>) {
  return useQuery({
    queryKey: ['kpis-by-period-ranges', periodRanges],
    enabled: periodRanges.length > 0,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (periodRanges.length === 0) return [];

      // Fetch all period/year combos in parallel, each paginated
      const fetchSinglePeriod = async (month: string, year: number): Promise<any[]> => {
        const allKpis: any[] = [];
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from('kpis')
            .select(SLIM_KPI_SELECT)
            .eq('review_period', month)
            .eq('review_year', year)
            .order('created_at', { ascending: false })
            .range(from, from + pageSize - 1);

          if (error) throw error;

          if (data && data.length > 0) {
            allKpis.push(...data);
            from += pageSize;
            hasMore = data.length === pageSize;
          } else {
            hasMore = false;
          }
        }

        return allKpis;
      };

      // Run all period fetches in parallel
      const results = await Promise.all(
        periodRanges.map(({ month, year }) => fetchSinglePeriod(month, year))
      );

      // Flatten and deduplicate by KPI id
      const seen = new Set<string>();
      const allKpis: any[] = [];
      for (const batch of results) {
        for (const kpi of batch) {
          if (!seen.has(kpi.id)) {
            seen.add(kpi.id);
            allKpis.push(kpi);
          }
        }
      }

      return hydrateKpiRelations(allKpis);
    },
  });
}

/**
 * BUG-020 (v2.66.7.21): Reviewer-stage scores live on `review_submissions`,
 * NOT on `kpis`. Fetch a slim slice of submission rows keyed by KPI id so
 * reviewer dashboards (HR PMS, Audit, Management) can detect "reviewed at
 * this stage" via score-signature columns.
 *
 * Returns Map<kpi_id, { manager_score, skip_level_score, hr_pms_score,
 * auditor_score, management_score, final_score }>.
 */
export function useReviewSubmissionScoresByKpiIds(kpiIds: string[]) {
  // v2.66.7.24 (BUG-022): deterministic hash of sorted ids prevents stale cache hits
  // when two periods happen to share `length` and `firstId`. FNV-1a 32-bit on the
  // sorted, joined id list — short string, no collisions in practice for our scale.
  const stableKey = (() => {
    if (kpiIds.length === 0) return '';
    const sorted = [...kpiIds].sort();
    const joined = sorted.join('|');
    let hash = 0x811c9dc5;
    for (let i = 0; i < joined.length; i++) {
      hash ^= joined.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `${kpiIds.length}:${hash.toString(16)}`;
  })();
  return useQuery({
    queryKey: ['review-submission-scores-by-kpi-ids', stableKey],
    enabled: kpiIds.length > 0,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const map = new Map<string, {
        manager_score: number | null;
        skip_level_score: number | null;
        hr_pms_score: number | null;
        auditor_score: number | null;
        management_score: number | null;
        final_score: number | null;
        is_na: boolean | null;
      }>();
      const BATCH_SIZE = 500;
      for (let i = 0; i < kpiIds.length; i += BATCH_SIZE) {
        const batch = kpiIds.slice(i, i + BATCH_SIZE);
        const { data, error } = await supabase
          .from('review_submissions')
          .select('kpi_id, manager_score, skip_level_score, hr_pms_score, auditor_score, management_score, final_score, is_na')
          .in('kpi_id', batch);
        if (error) {
          console.error('[useReviewSubmissionScoresByKpiIds] batch failed:', error);
          continue;
        }
        (data || []).forEach((r: any) => {
          map.set(r.kpi_id, {
            manager_score: r.manager_score,
            skip_level_score: r.skip_level_score,
            hr_pms_score: r.hr_pms_score,
            auditor_score: r.auditor_score,
            management_score: r.management_score,
            final_score: r.final_score,
            is_na: r.is_na,
          });
        });
      }
      return map;
    },
    staleTime: 60_000,
  });
}

export function useKpisByEmployee(employeeId: string | undefined) {
  return useQuery({
    queryKey: ['kpis', employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kpis')
        .select(`
          *,
          kra_categories (id, name, color, weightage)
        `)
        .eq('employee_id', employeeId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as unknown as KPI[];
    },
    enabled: !!employeeId,
  });
}

export function useReviewSubmissions(kpiIds: string[]) {
  return useQuery({
    queryKey: ['review-submissions', kpiIds],
    queryFn: async () => {
      if (kpiIds.length === 0) return [];
      
      // Batch kpiIds to avoid hitting query limits (max ~100 items per IN clause is safe)
      const batchSize = 100;
      const allSubmissions: ReviewSubmission[] = [];
      
      for (let i = 0; i < kpiIds.length; i += batchSize) {
        const batch = kpiIds.slice(i, i + batchSize);
        const { data, error } = await supabase
          .from('review_submissions')
          .select('*')
          .in('kpi_id', batch);

        if (error) throw error;
        if (data) allSubmissions.push(...(data as ReviewSubmission[]));
      }
      
      return allSubmissions;
    },
    enabled: kpiIds.length > 0,
  });
}

interface CreateKpiInput {
  payload: Omit<KPI, 'id' | 'created_at' | 'updated_at' | 'kra_categories'>;
  errorContext?: {
    frequency?: string | null;
    selectedMonth?: string;
    resolvedMonth?: string;
    selectedYear?: number;
  };
  /**
   * If provided, expand multi-month assignments by inserting placeholder
   * sibling KPI rows for each open cycle month from `assignedMonth` forward
   * (excluding the terminal which is the main `payload`). Locked periods are
   * skipped automatically.
   */
  assignedMonth?: string;
  frequencyCycleStart?: string | null;
}

export function useCreateKpi() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ payload, assignedMonth, frequencyCycleStart }: CreateKpiInput) => {
      const { data, error } = await supabase
        .from('kpis')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      // Multi-month sibling expansion (placeholders for non-terminal months).
      if (assignedMonth && payload.frequency) {
        try {
          const { buildSiblingPeriods } = await import('@/lib/multimonthAssignment');
          const expansion = buildSiblingPeriods({
            frequency: payload.frequency,
            frequencyCycleStart: frequencyCycleStart ?? payload.frequency_cycle_start ?? null,
            assignedMonth,
            reviewYear: payload.review_year as number,
          });

          if (expansion.isMultiMonth && expansion.siblings.length > 0) {
            // Filter out locked periods. review_period_locks joins through
            // review_periods (period_name, review_year). Only block global
            // locks (lock_type = 'global') or locks targeting this employee.
            const periodNames = Array.from(new Set(expansion.siblings.map(s => s.period)));
            const years = Array.from(new Set(expansion.siblings.map(s => s.year)));

            const { data: lockedRows } = await supabase
              .from('review_periods')
              .select('period_name, review_year, is_locked, review_period_locks!inner(is_locked, lock_type, target_id)')
              .in('period_name', periodNames)
              .in('review_year', years);

            const lockedSet = new Set<string>();
            (lockedRows ?? []).forEach((row: any) => {
              const periodIsLocked = row.is_locked === true;
              const hasActiveLock = (row.review_period_locks ?? []).some((l: any) => {
                if (!l.is_locked) return false;
                if (l.lock_type === 'global') return true;
                if (l.target_id && l.target_id === payload.employee_id) return true;
                return false;
              });
              if (periodIsLocked || hasActiveLock) {
                lockedSet.add(`${row.period_name}|${row.review_year}`);
              }
            });

            const openSiblings = expansion.siblings.filter(
              s => !lockedSet.has(`${s.period}|${s.year}`),
            );

            if (openSiblings.length > 0) {
              const siblingRows = openSiblings.map(s => ({
                ...payload,
                review_period: s.period,
                review_year: s.year,
                status: 'kra_set' as const,
              }));
              const { error: sibErr } = await supabase
                .from('kpis')
                .insert(siblingRows);
              // Swallow duplicate-row errors silently — sibling may already
              // exist from a prior assignment / rollover. Surface other
              // errors as a non-blocking warning.
              if (sibErr && !isDuplicateKpiError(sibErr)) {
                console.warn('[useCreateKpi] sibling insert warning:', sibErr);
                toast({
                  title: 'KPI created — sibling months partial',
                  description: `Terminal saved, but placeholders for ${openSiblings.length} month(s) hit: ${sibErr.message}`,
                  variant: 'destructive',
                });
              }
            }
          }
        } catch (sibCatch: any) {
          console.warn('[useCreateKpi] sibling expansion error:', sibCatch);
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['my-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
      toast({ title: 'KPI created successfully' });
    },
    onError: (error: any, variables: CreateKpiInput) => {
      const ctx = variables.errorContext;
      const description = isDuplicateKpiError(error)
        ? getDuplicateKpiMessage(ctx)
        : error.message;
      toast({ title: 'Failed to create KPI', description, variant: 'destructive' });
    },
  });
}

export function useUpdateKpi() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<KPI> & { id: string }) => {
      const { data, error } = await supabase
        .from('kpis')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['my-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
      toast({ title: 'KPI updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update KPI', description: error.message, variant: 'destructive' });
    },
  });
}

// Admin update hook with audit logging and status change notifications
export function useAdminUpdateKpi() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, reason, ...updates }: Partial<KPI> & { id: string; reason?: string }) => {
      // Get old values for audit
      const { data: oldKpi, error: fetchError } = await supabase
        .from('kpis')
        .select('id, kpi_name, kra_name, status, employee_id, profiles:employee_id(id, full_name, email, employee_code, reporting_manager_id)')
        .eq('id', id)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!oldKpi) throw new Error('KPI not found');

      const statusChanged = updates.status && updates.status !== oldKpi.status;

      // Update KPI
      const { data, error } = await supabase
        .from('kpis')
        .update(updates)
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Failed to retrieve updated KPI');

      // Create audit log entry
      await supabase.from('kpi_audit_logs').insert({
        kpi_id: id,
        action: statusChanged ? 'ADMIN_STATUS_OVERRIDE' : 'ADMIN_OVERRIDE',
        performed_by: user?.id,
        old_value: oldKpi,
        new_value: data,
        metadata: { 
          reason: reason || null, 
          source: 'admin_edit_dialog',
          changed_fields: Object.keys(updates).filter(k => k !== 'id' && k !== 'reason'),
          status_changed: statusChanged || false,
          old_status: oldKpi.status,
          new_status: updates.status || oldKpi.status,
        },
      });

      // If status changed, send notifications to employee and reporting manager
      if (statusChanged && reason) {
        const employeeProfile = oldKpi.profiles as any;
        const employeeId = oldKpi.employee_id;
        const managerId = employeeProfile?.reporting_manager_id;
        const employeeDisplay = employeeProfile?.full_name 
          ? `${employeeProfile.full_name}${employeeProfile.employee_code ? ` (${employeeProfile.employee_code})` : ''}`
          : 'Employee';

        const notificationMessage = `Admin changed status of KPI "${oldKpi.kpi_name}" from ${oldKpi.status} to ${updates.status}. Reason: ${reason}`;

        // Notify the employee
        await supabase.from('notifications').insert({
          user_id: employeeId,
          type: 'admin_status_change',
          title: 'KPI Status Changed by Admin',
          message: notificationMessage,
          kpi_id: id,
          related_user_id: user?.id,
          metadata: {
            old_status: oldKpi.status,
            new_status: updates.status,
            reason,
            kra_name: oldKpi.kra_name,
          },
        });

        // Notify the reporting manager if exists
        if (managerId) {
          await supabase.from('notifications').insert({
            user_id: managerId,
            type: 'admin_status_change',
            title: 'Team Member KPI Status Changed',
            message: `Admin changed status of ${employeeDisplay}'s KPI "${oldKpi.kpi_name}". Reason: ${reason}`,
            kpi_id: id,
            related_user_id: user?.id,
            metadata: {
              old_status: oldKpi.status,
              new_status: updates.status,
              reason,
              employee_id: employeeId,
              kra_name: oldKpi.kra_name,
            },
          });
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['my-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['kpis-by-period'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast({ title: 'KPI updated by admin' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update KPI', description: error.message, variant: 'destructive' });
    },
  });
}

// Admin delete KPI
export function useAdminDeleteKpi() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (kpiId: string) => {
      const { error } = await supabase
        .from('kpis')
        .delete()
        .eq('id', kpiId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['my-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['kpis-by-period'] });
      toast({ title: 'KRA deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete KRA', description: error.message, variant: 'destructive' });
    },
  });
}

// Self review submission with optimistic updates
export function useSubmitSelfReview() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      kpi_id,
      achieved_value,
      self_rating,
      self_score,
      self_remarks,
      self_evidence_url,
      self_evidence_urls,
      is_na = false,
    }: {
      kpi_id: string;
      achieved_value: number | null;
      self_rating: RatingLevel | null;
      self_score: number | null;
      self_remarks: string;
      self_evidence_url?: string | null;
      self_evidence_urls?: string[];
      is_na?: boolean;
    }) => {
      // Transient-error retry for Lovable Cloud overload windows.
      // Codes:
      //   57014 = statement timeout
      //   08006/08000 = connection failure
      //   XX000 = "the database system is not accepting connections"
      const isTransient = (err: any): boolean => {
        if (!err) return false;
        const code = String(err.code || '');
        const msg = String(err.message || '').toLowerCase();
        return (
          code === '57014' ||
          code === '08006' ||
          code === '08000' ||
          code === 'XX000' ||
          msg.includes('statement timeout') ||
          msg.includes('timed out') ||
          msg.includes('not accepting connections') ||
          msg.includes('fetch failed')
        );
      };

      const friendly = (err: any): Error => {
        const wrapped: any = new Error(
          'The server is busy right now. Please wait a moment and try again.'
        );
        wrapped.code = err?.code;
        wrapped.cause = err;
        return wrapped;
      };

      const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

      const runWithRetry = async <T,>(op: () => Promise<{ error: any } & T>) => {
        const delays = [0, 1000, 2000];
        let lastErr: any = null;
        for (const d of delays) {
          if (d > 0) await sleep(d);
          const res = await op();
          if (!res.error) return res;
          lastErr = res.error;
          if (!isTransient(res.error)) throw res.error;
        }
        throw friendly(lastErr);
      };

      // First upsert the submission (with retry on transient errors)
      await runWithRetry(() =>
        supabase
          .from('review_submissions')
          .upsert({
            kpi_id,
            achieved_value: is_na ? null : achieved_value,
            self_rating: is_na ? null : self_rating,
            self_score: is_na ? null : self_score,
            self_remarks,
            self_evidence_url,
            self_evidence_urls: self_evidence_urls || [],
            is_na,
            na_marked_by_role: is_na ? 'employee' : null,
            kpi_status: 'submitted' as const,
          }, {
            onConflict: 'kpi_id',
          }) as any
      );

      // Then update KPI status to self_review (employee has submitted, awaiting manager)
      await runWithRetry(() =>
        supabase
          .from('kpis')
          .update({ status: 'self_review' as const })
          .eq('id', kpi_id) as any
      );

      // Fire-and-forget audit log for recall eligibility tracking
      supabase.auth.getUser().then(({ data }) => {
        if (data?.user?.id) {
          supabase.from('kpi_audit_logs').insert({
            kpi_id,
            action: 'SELF_REVIEW_SUBMITTED',
            performed_by: data.user.id,
            old_value: { status: 'kra_set' } as any,
            new_value: { status: 'self_review', achieved_value, self_score, self_rating } as any,
          }).then();
        }
      });
      
      return { kpi_id, achieved_value, self_rating, self_score, self_remarks, self_evidence_url, is_na };
    },
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['review-submissions'] });
      await queryClient.cancelQueries({ queryKey: ['my-kpis'] });
      await queryClient.cancelQueries({ queryKey: ['all-kpis'] });
      await queryClient.cancelQueries({ queryKey: ['kpis-by-period'] });
      
      // Snapshot previous values (best-effort)
      const previousSubmissions = queryClient.getQueryData(['review-submissions']);
      const previousKpis = queryClient.getQueryData(['my-kpis']);
      
      // Optimistically update submissions
      queryClient.setQueriesData({ queryKey: ['review-submissions'] }, (old: ReviewSubmission[] | undefined) => {
        if (!old) return old;
        const exists = old.some(s => s.kpi_id === variables.kpi_id);
        if (exists) {
          return old.map(sub => 
            sub.kpi_id === variables.kpi_id 
              ? { 
                  ...sub,
                  achieved_value: variables.is_na ? null : variables.achieved_value,
                  self_rating: variables.is_na ? null : variables.self_rating,
                  self_score: variables.is_na ? null : variables.self_score,
                  self_remarks: variables.self_remarks,
                  self_evidence_url: variables.self_evidence_url,
                  is_na: variables.is_na,
                  na_marked_by_role: variables.is_na ? 'employee' : null,
                  kpi_status: 'submitted' as KpiStatus,
                }
              : sub
          );
        }
        return old;
      });
      
      // Optimistically update KPI status to self_review across commonly used KPI caches
      const applyKpiStatus = <T extends { id: string; status?: any }>(old: T[] | undefined) => {
        if (!old) return old;
        return old.map(kpi => (
          kpi.id === variables.kpi_id
            ? { ...kpi, status: 'self_review' as ReviewStatus }
            : kpi
        ));
      };

      queryClient.setQueriesData({ queryKey: ['my-kpis'] }, applyKpiStatus);
      queryClient.setQueriesData({ queryKey: ['all-kpis'] }, applyKpiStatus as any);
      queryClient.setQueriesData({ queryKey: ['kpis-by-period'] }, applyKpiStatus as any);
      
      return { previousSubmissions, previousKpis };
    },
    onError: (error: Error, _, context) => {
      // Rollback on error (partial)
      if (context?.previousSubmissions) {
        queryClient.setQueriesData({ queryKey: ['review-submissions'] }, context.previousSubmissions);
      }
      if (context?.previousKpis) {
        queryClient.setQueriesData({ queryKey: ['my-kpis'] }, context.previousKpis);
      }
      toast({ title: 'Failed to submit review', description: error.message, variant: 'destructive' });
    },
    onSuccess: () => {
      toast({ title: 'Self review submitted successfully' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['my-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['kpis-by-period'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
    },
  });
}

// Hook for rolling over KPIs to next month/period
export function useRolloverKpi() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ kpi, targetPeriod }: { kpi: KPI; targetPeriod: string }) => {
      // Calculate the next year if rolling to a new year
      const currentPeriod = kpi.review_period || '';
      const currentYear = kpi.review_year || new Date().getFullYear();
      
      // Determine the target year
      let targetYear = currentYear;
      const periodMonths: Record<string, number> = {
        'January': 0, 'February': 1, 'March': 2, 'April': 3, 'May': 4, 'June': 5,
        'July': 6, 'August': 7, 'September': 8, 'October': 9, 'November': 10, 'December': 11,
        'Q1': 0, 'Q2': 3, 'Q3': 6, 'Q4': 9
      };
      
      // If current period is December and target is January, increment year
      if (currentPeriod === 'December' && targetPeriod === 'January') {
        targetYear = currentYear + 1;
      }
      
      // If current quarter is Q4 and target is Q1, increment year
      if (currentPeriod === 'Q4' && targetPeriod === 'Q1') {
        targetYear = currentYear + 1;
      }

      const { data, error } = await supabase
        .from('kpis')
        .insert({
          employee_id: kpi.employee_id,
          category_id: kpi.category_id,
          kra_name: kpi.kra_name,
          kpi_name: kpi.kpi_name,
          target_value: kpi.target_value,
          weightage: kpi.weightage,
          uom: kpi.uom,
          frequency: kpi.frequency,
          criteria: kpi.criteria,
          source_of_data: kpi.source_of_data,
          r0: kpi.r0,
          r1: kpi.r1,
          r2: kpi.r2,
          r3: kpi.r3,
          r4: kpi.r4,
          r5: kpi.r5,
          review_period: targetPeriod,
          review_year: targetYear,
          status: 'kra_set',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['my-kpis'] });
      toast({ title: 'KPI rolled over successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to rollover KPI', description: error.message, variant: 'destructive' });
    },
  });
}

// Hook for approving a single KPI (manager level) - with optimistic updates
export function useApproveKpi() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      kpi_id,
      manager_rating,
      manager_score,
      manager_remarks,
      manager_evidence_url,
      manager_achieved_value,
      forwardStatus,
    }: {
      kpi_id: string;
      manager_rating: RatingLevel;
      manager_score: number;
      manager_remarks: string;
      manager_evidence_url?: string | null;
      manager_achieved_value?: number | null;
      forwardStatus?: string;
    }) => {
      // Update submission with manager rating and set kpi_status to approved_by_manager
      const { data: updateData, error: submissionError } = await supabase
        .from('review_submissions')
        .update({
          manager_rating,
          manager_score,
          manager_remarks,
          manager_evidence_url,
          manager_achieved_value,
          kpi_status: 'approved_by_manager' as const,
        })
        .eq('kpi_id', kpi_id)
        .select();

      if (submissionError) throw submissionError;

      // Check if any rows were actually updated (RLS may block silently)
      if (!updateData || updateData.length === 0) {
        throw new Error('Unable to approve KPI. You may not have permission to review this employee, or the KPI is not at the correct stage.');
      }

      // Update KPI status - use provided forwardStatus or default to manager_check
      const targetStatus = forwardStatus || 'manager_check';
      const { data: kpiUpdateData, error: kpiError } = await supabase
        .from('kpis')
        .update({ status: targetStatus as any })
        .eq('id', kpi_id)
        .select();

      if (kpiError) throw kpiError;

      // Verify KPI was also updated
      if (!kpiUpdateData || kpiUpdateData.length === 0) {
        throw new Error('Unable to update KPI status. Permission denied.');
      }

      // Log the approval action
      if (user?.id) {
        await supabase.from('kpi_audit_logs').insert({
          kpi_id,
          action: 'MANAGER_APPROVED',
          performed_by: user.id,
          new_value: { manager_rating, manager_score, manager_remarks },
          metadata: { approved_at: new Date().toISOString() },
        });
      }
      
      return { kpi_id, manager_rating, manager_score, manager_remarks, manager_evidence_url };
    },
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['review-submissions'] });
      
      // Snapshot previous value
      const previousSubmissions = queryClient.getQueryData(['review-submissions']);
      
      // Optimistically update submissions cache
      queryClient.setQueriesData({ queryKey: ['review-submissions'] }, (old: ReviewSubmission[] | undefined) => {
        if (!old) return old;
        return old.map(sub => 
          sub.kpi_id === variables.kpi_id 
            ? { 
                ...sub, 
                manager_rating: variables.manager_rating,
                manager_score: variables.manager_score,
                manager_remarks: variables.manager_remarks,
                manager_evidence_url: variables.manager_evidence_url,
                kpi_status: 'approved_by_manager' as KpiStatus,
              }
            : sub
        );
      });
      
      return { previousSubmissions };
    },
    onError: (error: Error, _, context) => {
      // Rollback on error
      if (context?.previousSubmissions) {
        queryClient.setQueriesData({ queryKey: ['review-submissions'] }, context.previousSubmissions);
      }
      toast({ title: 'Failed to approve KPI', description: error.message, variant: 'destructive' });
    },
    onSuccess: () => {
      toast({ title: 'KPI approved successfully' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['kpis-by-period'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
    },
  });
}

// Hook for raising a query on a KPI
export function useRaiseQuery() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      kpi_id,
      raised_to,
      reason,
      entity_type = 'kpi',
      evidence_url,
    }: {
      kpi_id: string;
      raised_to: string;
      reason: string;
      entity_type?: 'kra' | 'kpi';
      evidence_url?: string;
    }) => {
      if (!user?.id) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('kpi_queries')
        .insert({
          kpi_id,
          raised_by: user.id,
          raised_to,
          reason,
          entity_type,
          status: 'open',
          evidence_url: evidence_url || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Log the query action
      await supabase.from('kpi_audit_logs').insert({
        kpi_id,
        action: 'QUERY_RAISED',
        performed_by: user.id,
        new_value: { reason, raised_to, evidence_url },
        metadata: { query_id: data.id },
      });

      // Notification is created by the DB trigger `notify_on_query_raised`
      // (single-source — see POLICY.md §40)

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpi-queries'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast({ title: 'Query raised successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to raise query', description: error.message, variant: 'destructive' });
    },
  });
}

// Hook for resolving a query
export function useResolveQuery() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      query_id,
      resolution_notes,
    }: {
      query_id: string;
      resolution_notes: string;
    }) => {
      const { error } = await supabase
        .from('kpi_queries')
        .update({
          status: 'resolved' as const,
          resolution_notes,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', query_id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpi-queries'] });
      toast({ title: 'Query resolved successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to resolve query', description: error.message, variant: 'destructive' });
    },
  });
}

// Hook for sending back a KPI to employee (manager rejection)
// Uses workflow engine for correct status resolution
export function useSendBackKpi() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      kpi_id,
      employee_id,
      reason,
    }: {
      kpi_id: string;
      employee_id: string;
      reason: string;
    }) => {
      if (!user?.id) throw new Error('User not authenticated');

      // Stamp reviewer remark into transaction-local var so the
      // notify_on_kpi_status_change trigger can include it in metadata.send_back_reason
      // (consumed by the manager_rejected email template).
      await supabase.rpc('record_send_back_reason' as any, { p_reason: reason });

      // Manager sends back to employee = status goes to kra_set
      // Clear all downstream data from kra_set forward
      // Preserve employee self-review data; only clear manager+ fields
      const { error: submissionError } = await supabase
        .from('review_submissions')
        .update({
          kpi_status: 'open' as const,
          manager_rating: null,
          manager_score: null,
          manager_remarks: null,
          manager_evidence_url: null,
          manager_achieved_value: null,
          skip_level_rating: null,
          skip_level_score: null,
          skip_level_remarks: null,
          skip_level_evidence_url: null,
          skip_level_achieved_value: null,
          hr_pms_rating: null,
          hr_pms_score: null,
          hr_pms_remarks: null,
          hr_pms_evidence_url: null,
          hr_pms_achieved_value: null,
          auditor_rating: null,
          auditor_score: null,
          auditor_remarks: null,
          auditor_evidence_url: null,
          auditor_achieved_value: null,
          management_rating: null,
          management_score: null,
          management_remarks: null,
          management_evidence_url: null,
          management_achieved_value: null,
          final_rating: null,
          final_score: null,
        })
        .eq('kpi_id', kpi_id);

      if (submissionError) throw submissionError;

      // Reset KPI status to kra_set so employee needs to resubmit
      const { error: kpiError } = await supabase
        .from('kpis')
        .update({ status: 'kra_set' as const })
        .eq('id', kpi_id);

      if (kpiError) throw kpiError;

      // Create a query to notify employee
      const { data: queryData, error: queryError } = await supabase
        .from('kpi_queries')
        .insert({
          kpi_id,
          raised_by: user.id,
          raised_to: employee_id,
          reason: `[SENT BACK] ${reason}`,
          entity_type: 'kpi',
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          query_type: 'send_back',
        })
        .select()
        .single();

      if (queryError) throw queryError;

      // Log the action
      await supabase.from('kpi_audit_logs').insert({
        kpi_id,
        action: 'MANAGER_SENT_BACK',
        performed_by: user.id,
        new_value: { reason },
        metadata: { query_id: queryData.id },
      });

      return queryData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['kpis-by-period'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['kpi-queries'] });
      toast({ title: 'KPI sent back to employee' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to send back KPI', description: error.message, variant: 'destructive' });
    },
  });
}

// Hook to fetch queries for KPIs
export function useKpiQueries(kpiIds: string[]) {
  return useQuery({
    queryKey: ['kpi-queries', kpiIds],
    queryFn: async () => {
      if (kpiIds.length === 0) return [];
      
      // Batch kpiIds to avoid hitting query limits
      const batchSize = 100;
      const allQueries: any[] = [];
      
      for (let i = 0; i < kpiIds.length; i += batchSize) {
        const batch = kpiIds.slice(i, i + batchSize);
        const { data, error } = await supabase
          .from('kpi_queries')
          .select(`
            *,
            raised_by_profile:raised_by(id, full_name, email),
            raised_to_profile:raised_to(id, full_name, email)
          `)
          .in('kpi_id', batch)
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (data) allQueries.push(...data);
      }
      
      // Sort all results by created_at descending
      return allQueries.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
    enabled: kpiIds.length > 0,
  });
}

// Lightweight hook: returns a Map<kpi_id, open_query_count> via a single aggregate query
export function useOpenQueryCounts(kpiIds: string[]) {
  return useQuery({
    queryKey: ['open-query-counts', kpiIds.length, kpiIds[0] ?? null, kpiIds[kpiIds.length - 1] ?? null],
    queryFn: async () => {
      if (kpiIds.length === 0) return new Map<string, number>();
      const countMap = new Map<string, number>();
      // Server-side aggregation via rpc_open_query_counts. Chunk huge id sets
      // to keep RPC payloads sane.
      const CHUNK = 2000;
      try {
        for (let i = 0; i < kpiIds.length; i += CHUNK) {
          const slice = kpiIds.slice(i, i + CHUNK);
          const { data, error } = await supabase.rpc('rpc_open_query_counts', { p_kpi_ids: slice });
          if (error) throw error;
          for (const row of (data || []) as Array<{ kpi_id: string; open_count: number }>) {
            countMap.set(row.kpi_id, (countMap.get(row.kpi_id) || 0) + Number(row.open_count || 0));
          }
        }
        return countMap;
      } catch (err) {
        console.warn('[useOpenQueryCounts] RPC failed, falling back to client aggregation', err);
        const batchSize = 500;
        for (let i = 0; i < kpiIds.length; i += batchSize) {
          const batch = kpiIds.slice(i, i + batchSize);
          const { data, error } = await supabase
            .from('kpi_queries')
            .select('kpi_id')
            .in('kpi_id', batch)
            .eq('status', 'open')
            .eq('query_type', 'query');
          if (error) throw error;
          data?.forEach(row => {
            countMap.set(row.kpi_id, (countMap.get(row.kpi_id) || 0) + 1);
          });
        }
        return countMap;
      }
    },
    staleTime: 60_000,
    enabled: kpiIds.length > 0,
  });
}

// Lightweight hook: fetch distinct review_period + review_year combos without loading all KPIs
export function useDistinctKpiPeriods() {
  return useQuery({
    queryKey: ['distinct-kpi-periods'],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const monthOrder = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
      ];

      const periodSet = new Set<string>();
      const yearSet = new Set<number>();
      try {
        const { data, error } = await supabase.rpc('rpc_distinct_kpi_periods');
        if (error) throw error;
        for (const row of (data || []) as Array<{ review_period: string; review_year: number }>) {
          if (row.review_period) periodSet.add(row.review_period);
          if (row.review_year != null) yearSet.add(Number(row.review_year));
        }
      } catch (err) {
        console.warn('[useDistinctKpiPeriods] RPC failed, falling back to client scan', err);
        const { data, error } = await supabase
          .from('kpis')
          .select('review_period, review_year')
          .not('review_period', 'is', null)
          .not('review_year', 'is', null);
        if (error) throw error;
        data?.forEach(row => {
          if (row.review_period) periodSet.add(row.review_period);
          if (row.review_year) yearSet.add(row.review_year);
        });
      }

      const periods = Array.from(periodSet).sort(
        (a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b),
      );
      const years = Array.from(yearSet).sort((a, b) => b - a);

      return { periods, years };
    },
  });
}

// Hook for review period management
export function useReviewPeriods() {
  return useQuery({
    queryKey: ['review-periods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('review_periods')
        .select('*')
        .order('review_year', { ascending: false })
        .order('period_name', { ascending: true });

      if (error) throw error;
      return data;
    },
  });
}

export function useLockPeriod() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      period_name,
      review_year,
      is_locked,
    }: {
      period_name: string;
      review_year: number;
      is_locked: boolean;
    }) => {
      // Upsert the period lock status
      const { data, error } = await supabase
        .from('review_periods')
        .upsert({
          period_name,
          review_year,
          is_locked,
          locked_at: is_locked ? new Date().toISOString() : null,
          locked_by: is_locked ? user?.id : null,
        }, {
          onConflict: 'period_name,review_year',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['review-periods'] });
      toast({ 
        title: variables.is_locked ? 'Period locked' : 'Period unlocked',
        description: `${variables.period_name} ${variables.review_year} has been ${variables.is_locked ? 'locked' : 'unlocked'}.`
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update period', description: error.message, variant: 'destructive' });
    },
  });
}

// Fetch distinct periods that have KPIs for a given employee
export function useEmployeeKpiPeriods(employeeId: string | undefined) {
  return useQuery({
    queryKey: ['employee-kpi-periods', employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kpis')
        .select('review_period, review_year, status')
        .eq('employee_id', employeeId as string);

      if (error) throw error;

      // Deduplicate to distinct period/year combos with status counts
      const periodMap = new Map<string, { review_period: string; review_year: number; statuses: string[] }>();
      data?.forEach(row => {
        const key = `${row.review_period}-${row.review_year}`;
        const existing = periodMap.get(key);
        if (existing) {
          if (row.status) existing.statuses.push(row.status);
        } else {
          periodMap.set(key, {
            review_period: row.review_period || '',
            review_year: row.review_year || 0,
            statuses: row.status ? [row.status] : [],
          });
        }
      });

      return Array.from(periodMap.values()).sort((a, b) => {
        if (b.review_year !== a.review_year) return b.review_year - a.review_year;
        return b.review_period.localeCompare(a.review_period);
      });
    },
    enabled: !!employeeId,
  });
}
