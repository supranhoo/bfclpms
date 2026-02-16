import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type SuggestionReason = 'already_org' | 'exact_match' | 'similar_name' | 'high_count';

export interface OrgKpiSuggestion {
  kra_name: string;
  kpi_name: string;
  category_id: string;
  category_name: string;
  employee_count: number;
  already_org_level: boolean;
  org_level_scope?: string;
  suggestion_reason: SuggestionReason;
  similar_to_kpi_name?: string;
  priority: number;
}

function getNameSimilarity(a: string, b: string): number {
  const stopWords = new Set(['of', 'the', 'to', 'in', 'for', 'and', 'a', 'an', 'on', 'at', 'by', 'is']);
  const wordsA = a.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
  const wordsB = b.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
  const setB = new Set(wordsB);
  const shared = wordsA.filter(w => setB.has(w));
  return shared.length;
}

const getPriority = (reason: SuggestionReason): number => {
  switch (reason) {
    case 'already_org': return 1;
    case 'exact_match': return 2;
    case 'similar_name': return 3;
    case 'high_count': return 4;
    default: return 5;
  }
};

export function useOrgKpiSuggestions(reviewPeriod?: string, reviewYear?: number) {
  return useQuery({
    queryKey: ['org-kpi-suggestions', reviewPeriod, reviewYear],
    queryFn: async () => {
      // Fetch all non-org KPIs for the period
      const { data: nonOrgKpis, error: err1 } = await supabase
        .from('kpis')
        .select('kra_name, kpi_name, category_id, employee_id')
        .eq('is_org_level', false)
        .eq('review_period', reviewPeriod!)
        .eq('review_year', reviewYear!);

      if (err1) throw err1;

      // Fetch existing org-level KPIs
      const { data: orgKpis, error: err2 } = await supabase
        .from('kpis')
        .select('kra_name, kpi_name, org_level_scope')
        .eq('is_org_level', true)
        .eq('review_period', reviewPeriod!)
        .eq('review_year', reviewYear!);

      if (err2) throw err2;

      // Fetch categories
      const { data: cats } = await supabase.from('kra_categories').select('id, name');
      const catMap = new Map(cats?.map(c => [c.id, c.name]) || []);

      // Build org KPI lookup sets
      const orgSet = new Set(orgKpis?.map(k => `${k.kra_name}||${k.kpi_name}`) || []);
      const orgScopeMap = new Map<string, string>();
      orgKpis?.forEach(k => {
        if (k.org_level_scope) {
          orgScopeMap.set(`${k.kra_name}||${k.kpi_name}`, k.org_level_scope);
        }
      });

      // Unique org KPI names for similarity matching
      const orgKpiNames = [...new Set(orgKpis?.map(k => k.kpi_name) || [])];

      // Group non-org KPIs by category+kra+kpi, count distinct employees
      const grouped = new Map<string, { kra_name: string; kpi_name: string; category_id: string; employees: Set<string> }>();
      nonOrgKpis?.forEach(k => {
        const key = `${k.category_id}||${k.kra_name}||${k.kpi_name}`;
        const existing = grouped.get(key) || { kra_name: k.kra_name, kpi_name: k.kpi_name, category_id: k.category_id, employees: new Set<string>() };
        existing.employees.add(k.employee_id);
        grouped.set(key, existing);
      });

      const suggestions: OrgKpiSuggestion[] = [];
      const addedKeys = new Set<string>();

      // Bucket 1: Already org-level (from orgKpis, deduplicated)
      const orgDeduped = new Map<string, { kra_name: string; kpi_name: string; scope?: string }>();
      orgKpis?.forEach(k => {
        const key = `${k.kra_name}||${k.kpi_name}`;
        if (!orgDeduped.has(key)) {
          orgDeduped.set(key, { kra_name: k.kra_name, kpi_name: k.kpi_name, scope: k.org_level_scope || undefined });
        }
      });

      // For already-org, find a matching grouped entry for category + employee count, or use first non-org group
      orgDeduped.forEach((org, orgKey) => {
        // Find matching non-org groups for employee count
        let bestGroup: { category_id: string; employeeCount: number } | null = null;
        grouped.forEach(g => {
          const gOrgKey = `${g.kra_name}||${g.kpi_name}`;
          if (gOrgKey === orgKey) {
            if (!bestGroup || g.employees.size > bestGroup.employeeCount) {
              bestGroup = { category_id: g.category_id, employeeCount: g.employees.size };
            }
          }
        });

        // Use first category from cats as fallback
        const categoryId = bestGroup?.category_id || (cats?.[0]?.id ?? '');
        const key = `${categoryId}||${org.kra_name}||${org.kpi_name}`;
        addedKeys.add(key);

        suggestions.push({
          kra_name: org.kra_name,
          kpi_name: org.kpi_name,
          category_id: categoryId,
          category_name: catMap.get(categoryId) || 'Unknown',
          employee_count: bestGroup?.employeeCount || 0,
          already_org_level: true,
          org_level_scope: org.scope,
          suggestion_reason: 'already_org',
          priority: getPriority('already_org'),
        });
      });

      // Bucket 2: Exact match — non-org KPIs whose kra+kpi matches an existing org KPI
      grouped.forEach((g, key) => {
        if (addedKeys.has(key)) return;
        const orgKey = `${g.kra_name}||${g.kpi_name}`;
        if (orgSet.has(orgKey)) {
          addedKeys.add(key);
          suggestions.push({
            kra_name: g.kra_name,
            kpi_name: g.kpi_name,
            category_id: g.category_id,
            category_name: catMap.get(g.category_id) || 'Unknown',
            employee_count: g.employees.size,
            already_org_level: false,
            org_level_scope: orgScopeMap.get(orgKey),
            suggestion_reason: 'exact_match',
            priority: getPriority('exact_match'),
          });
        }
      });

      // Bucket 3: Similar name — non-org KPIs with 2+ shared significant words with any org KPI name
      grouped.forEach((g, key) => {
        if (addedKeys.has(key)) return;
        let bestMatch: string | undefined;
        let bestScore = 0;
        for (const orgName of orgKpiNames) {
          const score = getNameSimilarity(g.kpi_name, orgName);
          if (score >= 2 && score > bestScore) {
            bestScore = score;
            bestMatch = orgName;
          }
        }
        if (bestMatch) {
          addedKeys.add(key);
          suggestions.push({
            kra_name: g.kra_name,
            kpi_name: g.kpi_name,
            category_id: g.category_id,
            category_name: catMap.get(g.category_id) || 'Unknown',
            employee_count: g.employees.size,
            already_org_level: false,
            suggestion_reason: 'similar_name',
            similar_to_kpi_name: bestMatch,
            priority: getPriority('similar_name'),
          });
        }
      });

      // Bucket 4: High employee count (3+)
      grouped.forEach((g, key) => {
        if (addedKeys.has(key)) return;
        if (g.employees.size >= 3) {
          suggestions.push({
            kra_name: g.kra_name,
            kpi_name: g.kpi_name,
            category_id: g.category_id,
            category_name: catMap.get(g.category_id) || 'Unknown',
            employee_count: g.employees.size,
            already_org_level: false,
            suggestion_reason: 'high_count',
            priority: getPriority('high_count'),
          });
        }
      });

      // Sort: priority ascending, then employee count descending
      suggestions.sort((a, b) => {
        const pDiff = a.priority - b.priority;
        if (pDiff !== 0) return pDiff;
        return b.employee_count - a.employee_count;
      });

      return suggestions;
    },
    enabled: !!reviewPeriod && !!reviewYear,
  });
}
