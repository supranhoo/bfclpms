import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { calculateRating, RatingThresholds } from '@/lib/ratingCalculation';
import { scoreToRating } from '@/components/review/ScoreSelector';

export interface ImpactedEmployee {
  employeeId: string;
  fullName: string;
  employeeCode: string | null;
  departmentId: string | null;
  departmentName: string | null;
  designation: string | null;
  kpiId: string;
  weightage: number;
  targetValue: number | null;
  currentAchievedValue: number | null;
  currentScore: number | null;
  currentRating: string | null;
  simulatedScore: number | null;
  simulatedRating: string | null;
  scoreChange: number | null;
}

export interface ImpactSummary {
  totalEmployees: number;
  byDepartment: Record<string, { count: number; departmentName: string }>;
  employees: ImpactedEmployee[];
  increased: number;
  decreased: number;
  unchanged: number;
}

/**
 * Hook to get impact analysis for a specific Org KPI.
 * Shows which employees are affected and simulates score changes.
 */
export function useOrgKpiImpact(
  categoryId: string | null,
  kraName: string | null,
  kpiName: string | null,
  reviewPeriod: string | null,
  reviewYear: number | null,
  simulatedValue?: number | null,
  enabled = false,
  expectedEmployeeIds?: string[]
) {
  const expectedKey = expectedEmployeeIds ? [...expectedEmployeeIds].sort().join(',') : '';
  return useQuery({
    queryKey: ['org-kpi-impact', categoryId, kraName, kpiName, reviewPeriod, reviewYear, simulatedValue, expectedKey],
    queryFn: async (): Promise<ImpactSummary> => {
      // Fetch all matching employee KPIs
      const { data: kpis, error: kpisError } = await supabase
        .from('kpis')
        .select(`
          id,
          employee_id,
          target_value,
          weightage,
          r5, r4, r3, r2, r1, r0,
          criteria,
          uom,
          uom_type,
          qualitative_options,
          threshold_mode,
          profiles!kpis_employee_id_fkey(
            id, full_name, employee_code, department_id, designation, is_active,
            departments(id, name)
          )
        `)
        .eq('category_id', categoryId!)
        .eq('kra_name', kraName!)
        .eq('kpi_name', kpiName!)
        .eq('review_period', reviewPeriod!)
        .eq('review_year', reviewYear!)
        .eq('is_org_level', true);

      if (kpisError) throw kpisError;
      if (!kpis || kpis.length === 0) {
        return { totalEmployees: 0, byDepartment: {}, employees: [], increased: 0, decreased: 0, unchanged: 0 };
      }

      // ADR-064 addendum — anchor scope to the canonical mapping passed by the
      // caller (the same `mappedEmpIdsByKey` that drives the card badge).
      // Prevents the Impact sheet's count from drifting when RLS hides a
      // profile or an inactive row sneaks in via the join.
      const expectedSet = expectedEmployeeIds && expectedEmployeeIds.length > 0
        ? new Set(expectedEmployeeIds)
        : null;
      const scopedKpis = expectedSet
        ? kpis.filter(k => k.employee_id && expectedSet.has(k.employee_id))
        : kpis;

      // Fetch current submissions for these KPIs
      const kpiIds = scopedKpis.map(k => k.id);
      const { data: submissions } = await supabase
        .from('review_submissions')
        .select('kpi_id, achieved_value, self_score, self_rating')
        .in('kpi_id', kpiIds);

      const submissionMap = new Map<string, { achieved_value: number | null; self_score: number | null; self_rating: string | null }>();
      submissions?.forEach(s => submissionMap.set(s.kpi_id, s));

      const employees: ImpactedEmployee[] = [];
      const byDepartment: Record<string, { count: number; departmentName: string }> = {};
      let increased = 0, decreased = 0, unchanged = 0;

      for (const kpi of scopedKpis) {
        const profile = kpi.profiles as any;
        if (!profile) continue;
        // Drop inactive employees so the badge and the sheet agree.
        if (profile.is_active === false) continue;

        const deptName = profile.departments?.name || 'Unassigned';
        const deptId = profile.department_id || 'unassigned';

        if (!byDepartment[deptId]) {
          byDepartment[deptId] = { count: 0, departmentName: deptName };
        }
        byDepartment[deptId].count++;

        const submission = submissionMap.get(kpi.id);
        let simulatedScore: number | null = null;
        let simulatedRatingLevel: string | null = null;

        if (simulatedValue !== null && simulatedValue !== undefined) {
          const thresholds: RatingThresholds = {
            r5: kpi.r5, r4: kpi.r4, r3: kpi.r3,
            r2: kpi.r2, r1: kpi.r1, r0: kpi.r0,
          };
          const result = calculateRating(
            simulatedValue,
            kpi.target_value,
            thresholds,
            kpi.criteria || 'Higher is Better',
            kpi.weightage || 0,
            (kpi.uom_type as any) || 'numeric',
            kpi.qualitative_options as any,
            kpi.uom,
            (kpi as any).threshold_mode || 'absolute'
          );
          simulatedScore = result.rating;
          simulatedRatingLevel = scoreToRating(result.rating);

          const currentScore = submission?.self_score ?? null;
          if (currentScore !== null && simulatedScore !== null) {
            if (simulatedScore > currentScore) increased++;
            else if (simulatedScore < currentScore) decreased++;
            else unchanged++;
          } else if (simulatedScore !== null) {
            increased++; // New score where none existed
          }
        }

        employees.push({
          employeeId: profile.id,
          fullName: profile.full_name || 'Unknown',
          employeeCode: profile.employee_code,
          departmentId: profile.department_id,
          departmentName: deptName,
          designation: profile.designation,
          kpiId: kpi.id,
          weightage: kpi.weightage || 0,
          targetValue: kpi.target_value,
          currentAchievedValue: submission?.achieved_value ?? null,
          currentScore: submission?.self_score ?? null,
          currentRating: submission?.self_rating ?? null,
          simulatedScore,
          simulatedRating: simulatedRatingLevel,
          scoreChange: simulatedScore !== null && submission?.self_score !== null
            ? simulatedScore - (submission?.self_score ?? 0)
            : null,
        });
      }

      return {
        totalEmployees: employees.length,
        byDepartment,
        employees: employees.sort((a, b) => a.fullName.localeCompare(b.fullName)),
        increased,
        decreased,
        unchanged,
      };
    },
    enabled: enabled && !!categoryId && !!kraName && !!kpiName && !!reviewPeriod && !!reviewYear,
  });
}
