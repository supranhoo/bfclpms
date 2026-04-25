import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type TNIGapType = 'skill' | 'knowledge' | 'behavior' | 'compliance';
export type TNIPriority = 'high' | 'medium' | 'low';
export type TNIStatus = 'identified' | 'training_planned' | 'in_progress' | 'completed';

export interface TrainingNeed {
  id: string;
  employee_id: string;
  kpi_id: string | null;
  category_id: string | null;
  review_period: string;
  review_year: number;
  score: number | null;
  gap_type: TNIGapType;
  training_recommendation: string | null;
  priority: TNIPriority;
  status: TNIStatus;
  identified_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  employee?: {
    id: string;
    full_name: string | null;
    employee_code: string | null;
    department_id: string | null;
    designation: string | null;
  };
  category?: {
    id: string;
    name: string;
  };
  kpi?: {
    id: string;
    kra_name: string;
    kpi_name: string;
  };
}

export interface TNIAggregation {
  category_id: string | null;
  category_name: string;
  total_count: number;
  high_priority: number;
  medium_priority: number;
  low_priority: number;
  employees_affected: number;
}

export interface DepartmentTNI {
  department_id: string;
  department_name: string;
  total_needs: number;
  high_priority: number;
  employees_affected: number;
  categories: TNIAggregation[];
}

export interface PeriodRange {
  month: string;
  year: number;
}

/**
 * Apply a (month, year) range filter to a supabase query against training_needs.
 * - 0 ranges → no filter (all periods)
 * - 1 range  → uses .eq for both columns (single-month fast path, preserves prior behaviour)
 * - 2+ ranges → uses .or with composite and(...) clauses
 */
function applyPeriodRanges<T>(query: T, ranges?: PeriodRange[]): T {
  if (!ranges || ranges.length === 0) return query;
  const q = query as any;
  if (ranges.length === 1) {
    return q.eq('review_period', ranges[0].month).eq('review_year', ranges[0].year);
  }
  const orClause = ranges
    .map(r => `and(review_period.eq.${r.month},review_year.eq.${r.year})`)
    .join(',');
  return q.or(orClause);
}

// Fetch all training needs with filters
export function useTrainingNeeds(filters?: {
  reviewPeriod?: string;
  reviewYear?: number;
  status?: TNIStatus;
  priority?: TNIPriority;
  employeeId?: string;
  departmentId?: string;
  gapType?: TNIGapType;
  periodRanges?: PeriodRange[];
}) {
  return useQuery({
    queryKey: ['training-needs', filters],
    queryFn: async () => {
      let query = supabase
        .from('training_needs')
        .select(`
          *,
          employee:profiles!training_needs_employee_id_fkey(
            id, full_name, employee_code, department_id, designation
          ),
          category:kra_categories(id, name),
          kpi:kpis(id, kra_name, kpi_name)
        `)
        .order('priority', { ascending: true })
        .order('created_at', { ascending: false });

      if (filters?.periodRanges && filters.periodRanges.length > 0) {
        query = applyPeriodRanges(query, filters.periodRanges);
      } else {
        if (filters?.reviewPeriod) {
          query = query.eq('review_period', filters.reviewPeriod);
        }
        if (filters?.reviewYear) {
          query = query.eq('review_year', filters.reviewYear);
        }
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.priority) {
        query = query.eq('priority', filters.priority);
      }
      if (filters?.employeeId) {
        query = query.eq('employee_id', filters.employeeId);
      }
      if (filters?.gapType) {
        query = query.eq('gap_type', filters.gapType);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Filter by department if needed (post-query since it's a nested field)
      let result = data as TrainingNeed[];
      if (filters?.departmentId) {
        result = result.filter(tn => tn.employee?.department_id === filters.departmentId);
      }

      return result;
    },
    staleTime: 2 * 60 * 1000,
  });
}

// Get TNI aggregation by category
export function useTNIByCategory(reviewPeriod?: string, reviewYear?: number, periodRanges?: PeriodRange[]) {
  return useQuery({
    queryKey: ['tni-by-category', reviewPeriod, reviewYear, periodRanges],
    queryFn: async () => {
      let query = supabase
        .from('training_needs')
        .select(`
          category_id,
          priority,
          employee_id,
          category:kra_categories(id, name)
        `);

      if (periodRanges && periodRanges.length > 0) {
        query = applyPeriodRanges(query, periodRanges);
      } else {
        if (reviewPeriod) query = query.eq('review_period', reviewPeriod);
        if (reviewYear) query = query.eq('review_year', reviewYear);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Aggregate by category
      const categoryMap = new Map<string, TNIAggregation>();

      data.forEach((item: any) => {
        const catId = item.category_id || 'uncategorized';
        const catName = item.category?.name || 'Uncategorized';

        if (!categoryMap.has(catId)) {
          categoryMap.set(catId, {
            category_id: item.category_id,
            category_name: catName,
            total_count: 0,
            high_priority: 0,
            medium_priority: 0,
            low_priority: 0,
            employees_affected: 0,
          });
        }

        const agg = categoryMap.get(catId)!;
        agg.total_count++;
        if (item.priority === 'high') agg.high_priority++;
        else if (item.priority === 'medium') agg.medium_priority++;
        else agg.low_priority++;
      });

      // Count unique employees per category
      const employeesByCat = new Map<string, Set<string>>();
      data.forEach((item: any) => {
        const catId = item.category_id || 'uncategorized';
        if (!employeesByCat.has(catId)) {
          employeesByCat.set(catId, new Set());
        }
        employeesByCat.get(catId)!.add(item.employee_id);
      });

      employeesByCat.forEach((employees, catId) => {
        const agg = categoryMap.get(catId);
        if (agg) agg.employees_affected = employees.size;
      });

      return Array.from(categoryMap.values()).sort((a, b) => b.total_count - a.total_count);
    },
    staleTime: 2 * 60 * 1000,
  });
}

// Get TNI aggregation by department
export function useTNIByDepartment(reviewPeriod?: string, reviewYear?: number, periodRanges?: PeriodRange[]) {
  return useQuery({
    queryKey: ['tni-by-department', reviewPeriod, reviewYear, periodRanges],
    queryFn: async () => {
      let query = supabase
        .from('training_needs')
        .select(`
          id,
          category_id,
          priority,
          employee_id,
          employee:profiles!training_needs_employee_id_fkey(
            id, department_id,
            department:departments(id, name)
          ),
          category:kra_categories(id, name)
        `);

      if (periodRanges && periodRanges.length > 0) {
        query = applyPeriodRanges(query, periodRanges);
      } else {
        if (reviewPeriod) query = query.eq('review_period', reviewPeriod);
        if (reviewYear) query = query.eq('review_year', reviewYear);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Aggregate by department
      const deptMap = new Map<string, DepartmentTNI>();

      data.forEach((item: any) => {
        const deptId = item.employee?.department_id || 'unassigned';
        const deptName = (item.employee?.department as any)?.name || 'Unassigned';

        if (!deptMap.has(deptId)) {
          deptMap.set(deptId, {
            department_id: deptId,
            department_name: deptName,
            total_needs: 0,
            high_priority: 0,
            employees_affected: 0,
            categories: [],
          });
        }

        const dept = deptMap.get(deptId)!;
        dept.total_needs++;
        if (item.priority === 'high') dept.high_priority++;
      });

      // Count unique employees per department
      const employeesByDept = new Map<string, Set<string>>();
      data.forEach((item: any) => {
        const deptId = item.employee?.department_id || 'unassigned';
        if (!employeesByDept.has(deptId)) {
          employeesByDept.set(deptId, new Set());
        }
        employeesByDept.get(deptId)!.add(item.employee_id);
      });

      employeesByDept.forEach((employees, deptId) => {
        const dept = deptMap.get(deptId);
        if (dept) dept.employees_affected = employees.size;
      });

      return Array.from(deptMap.values()).sort((a, b) => b.total_needs - a.total_needs);
    },
    staleTime: 2 * 60 * 1000,
  });
}

// Create training need
export function useCreateTrainingNeed() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: Partial<TrainingNeed>) => {
      const { data: result, error } = await supabase
        .from('training_needs')
        .insert(data as any)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-needs'] });
      queryClient.invalidateQueries({ queryKey: ['tni-by-category'] });
      queryClient.invalidateQueries({ queryKey: ['tni-by-department'] });
      toast({ title: 'Training need created successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to create training need', description: error.message, variant: 'destructive' });
    },
  });
}

// Update training need
export function useUpdateTrainingNeed() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<TrainingNeed> & { id: string }) => {
      const { data: result, error } = await supabase
        .from('training_needs')
        .update(data as any)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-needs'] });
      queryClient.invalidateQueries({ queryKey: ['tni-by-category'] });
      queryClient.invalidateQueries({ queryKey: ['tni-by-department'] });
      toast({ title: 'Training need updated successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to update training need', description: error.message, variant: 'destructive' });
    },
  });
}

// Detect training needs for a period
export function useDetectTrainingNeeds() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ reviewPeriod, reviewYear, threshold = 3.0 }: {
      reviewPeriod: string;
      reviewYear: number;
      threshold?: number;
    }) => {
      const { data, error } = await supabase.rpc('detect_training_needs_for_period', {
        p_review_period: reviewPeriod,
        p_review_year: reviewYear,
        p_threshold: threshold,
      });

      if (error) throw error;
      return { total: data as number, period: reviewPeriod, year: reviewYear };
    },
    onSuccess: ({ total }) => {
      queryClient.invalidateQueries({ queryKey: ['training-needs'] });
      queryClient.invalidateQueries({ queryKey: ['tni-by-category'] });
      queryClient.invalidateQueries({ queryKey: ['tni-by-department'] });
      queryClient.invalidateQueries({ queryKey: ['tni-summary'] });
      toast({ 
        title: 'Training needs detection complete', 
        description: `Identified ${total} new record${total !== 1 ? 's' : ''} (skill gaps + compliance flags). See cards for breakdown.`
      });
    },
    onError: (error: any) => {
      toast({ title: 'Detection failed', description: error.message, variant: 'destructive' });
    },
  });
}

// Backfill training needs across a range of (month, year) periods
export function useBackfillTrainingNeeds() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ ranges, threshold = 3.0, onProgress }: {
      ranges: PeriodRange[];
      threshold?: number;
      onProgress?: (done: number, total: number, currentLabel: string) => void;
    }) => {
      let totalDetected = 0;
      const perPeriod: { period: string; year: number; detected: number; error?: string }[] = [];
      for (let i = 0; i < ranges.length; i++) {
        const r = ranges[i];
        onProgress?.(i, ranges.length, `${r.month.slice(0,3)} ${r.year}`);
        try {
          const { data, error } = await supabase.rpc('detect_training_needs_for_period', {
            p_review_period: r.month,
            p_review_year: r.year,
            p_threshold: threshold,
          });
          if (error) throw error;
          const n = (data as number) ?? 0;
          totalDetected += n;
          perPeriod.push({ period: r.month, year: r.year, detected: n });
        } catch (e: any) {
          perPeriod.push({ period: r.month, year: r.year, detected: 0, error: e?.message || String(e) });
        }
      }
      onProgress?.(ranges.length, ranges.length, 'done');
      return { totalDetected, perPeriod };
    },
    onSuccess: ({ totalDetected, perPeriod }) => {
      queryClient.invalidateQueries({ queryKey: ['training-needs'] });
      queryClient.invalidateQueries({ queryKey: ['tni-by-category'] });
      queryClient.invalidateQueries({ queryKey: ['tni-by-department'] });
      queryClient.invalidateQueries({ queryKey: ['tni-summary'] });
      const errors = perPeriod.filter(p => p.error);
      toast({
        title: 'Backfill complete',
        description: `Detected ${totalDetected} record${totalDetected !== 1 ? 's' : ''} across ${perPeriod.length} month${perPeriod.length !== 1 ? 's' : ''}.${errors.length ? ` ${errors.length} failed.` : ''}`,
        variant: errors.length ? 'destructive' : 'default',
      });
    },
    onError: (error: any) => {
      toast({ title: 'Backfill failed', description: error.message, variant: 'destructive' });
    },
  });
}

// Get TNI summary stats
export function useTNISummary(reviewPeriod?: string, reviewYear?: number, periodRanges?: PeriodRange[]) {
  return useQuery({
    queryKey: ['tni-summary', reviewPeriod, reviewYear, periodRanges],
    queryFn: async () => {
      let query = supabase
        .from('training_needs')
        .select('id, priority, status, employee_id, gap_type, review_period, review_year');

      if (periodRanges && periodRanges.length > 0) {
        query = applyPeriodRanges(query, periodRanges);
      } else {
        if (reviewPeriod) query = query.eq('review_period', reviewPeriod);
        if (reviewYear) query = query.eq('review_year', reviewYear);
      }

      const { data, error } = await query;
      if (error) throw error;

      const uniqueEmployees = new Set(data.map(d => d.employee_id));
      const compliance = data.filter(d => (d as any).gap_type === 'compliance');
      const training = data.filter(d => (d as any).gap_type !== 'compliance');

      return {
        total: training.length,
        complianceGaps: compliance.length,
        grandTotal: data.length,
        highPriority: training.filter(d => d.priority === 'high').length,
        mediumPriority: training.filter(d => d.priority === 'medium').length,
        lowPriority: training.filter(d => d.priority === 'low').length,
        identified: data.filter(d => d.status === 'identified').length,
        inProgress: data.filter(d => d.status === 'in_progress').length,
        completed: data.filter(d => d.status === 'completed').length,
        employeesAffected: uniqueEmployees.size,
      };
    },
    staleTime: 2 * 60 * 1000,
  });
}
