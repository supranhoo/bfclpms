import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { DEFAULT_ELIGIBILITY_SEEDS, type EligibilityCriterion } from '@/lib/incrementEligibility';

/** Scope keys — null on a key means "Applies to all". */
export interface EligibilityScope {
  company_id: string[];
  division_id: string[];
  business_unit_id: string[];
  level_id: string[];
  category_id: string[];
  location_id: string[];
  assessment_year: string;
}

export interface EligibilityConfigRow {
  id: string;
  company_id: string[];
  division_id: string[];
  business_unit_id: string[];
  level_id: string[];
  category_id: string[];
  location_id: string[];
  assessment_year: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'archived';
  copied_from_config_id: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EligibilityCriterionRow extends EligibilityCriterion {
  config_id: string;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface EligibilityAuditRow {
  id: string;
  config_id: string | null;
  criterion_id: string | null;
  performed_by: string | null;
  performed_at: string;
  action: string;
  previous_value: unknown;
  revised_value: unknown;
  company_label: string | null;
  assessment_year: string | null;
}

/** All keys present, treating null as "any". Used as React Query key. */
function scopeKey(s: EligibilityScope) {
  const sorted = (a: string[]) => [...a].sort().join(',');
  return [
    sorted(s.company_id), sorted(s.division_id), sorted(s.business_unit_id),
    sorted(s.level_id), sorted(s.category_id), sorted(s.location_id),
    s.assessment_year,
  ];
}

/**
 * Build a Postgres array literal (`{a,b,c}` / `{}`) from a JS string[].
 * Required because PostgREST `.eq(col, jsArray)` serializes a JS array as CSV,
 * which does NOT match a `uuid[]` column. We must send a real array literal
 * via `.filter(col, 'eq', literal)`. Sorted to match the normalize trigger.
 */
export function toPgArrayLiteral(a: string[]): string {
  if (!a || a.length === 0) return '{}';
  return `{${[...a].sort().join(',')}}`;
}

/**
 * Apply scope-array equality. The DB trigger sorts arrays before write, so we
 * send a sorted Postgres array literal via `.filter(col,'eq',…)` — `.eq()` with
 * a JS array would serialize as CSV and never match `uuid[]` rows.
 */
function applyScope<
  T extends {
    eq: (col: string, val: unknown) => T;
    filter: (col: string, op: string, val: unknown) => T;
  },
>(
  q: T,
  scope: EligibilityScope,
): T {
  const cols: Array<[keyof EligibilityScope, string]> = [
    ['company_id', 'company_id'],
    ['division_id', 'division_id'],
    ['business_unit_id', 'business_unit_id'],
    ['level_id', 'level_id'],
    ['category_id', 'category_id'],
    ['location_id', 'location_id'],
  ];
  let next = q;
  for (const [k, col] of cols) {
    next = next.filter(col, 'eq', toPgArrayLiteral(scope[k] as string[]));
  }
  next = next.eq('assessment_year', scope.assessment_year);
  return next;
}

/** Loads (or returns null) the single config matching the scope. */
export function useEligibilityConfig(scope: EligibilityScope | null) {
  return useQuery({
    enabled: !!scope?.assessment_year,
    queryKey: ['increment-eligibility-config', scope && scopeKey(scope)],
    queryFn: async () => {
      if (!scope) return null;
      const base = supabase.from('increment_eligibility_configs').select('*');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await applyScope(base as any, scope).maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return (data as EligibilityConfigRow | null) ?? null;
    },
  });
}

export function useEligibilityCriteria(configId: string | null | undefined) {
  return useQuery({
    enabled: !!configId,
    queryKey: ['increment-eligibility-criteria', configId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('increment_eligibility_criteria')
        .select('*')
        .eq('config_id', configId!)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data as EligibilityCriterionRow[]) ?? [];
    },
  });
}

export function useEligibilityAudit(configId: string | null | undefined) {
  return useQuery({
    enabled: !!configId,
    queryKey: ['increment-eligibility-audit', configId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('increment_eligibility_audit')
        .select('*')
        .eq('config_id', configId!)
        .order('performed_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data as EligibilityAuditRow[]) ?? [];
    },
  });
}

/** Lists all approved configs for the same scope (excluding current AY) — version history. */
export function useEligibilityVersionHistory(scope: EligibilityScope | null) {
  return useQuery({
    enabled: !!scope?.assessment_year,
    queryKey: ['increment-eligibility-history', scope && scopeKey(scope)],
    queryFn: async () => {
      if (!scope) return [];
      const cols: Array<[keyof EligibilityScope, string]> = [
        ['company_id', 'company_id'],
        ['division_id', 'division_id'],
        ['business_unit_id', 'business_unit_id'],
        ['level_id', 'level_id'],
        ['category_id', 'category_id'],
        ['location_id', 'location_id'],
      ];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = supabase.from('increment_eligibility_configs').select('*');
      for (const [k, col] of cols) {
        q = q.filter(col, 'eq', toPgArrayLiteral(scope[k] as string[]));
      }
      q = q.neq('assessment_year', scope.assessment_year).order('assessment_year', { ascending: false });
      const { data, error } = await q;
      if (error) throw error;
      return (data as EligibilityConfigRow[]) ?? [];
    },
  });
}

/** Lists distinct assessment years known to the DB (newest first). */
export function useKnownAssessmentYears() {
  return useQuery({
    queryKey: ['increment-eligibility-known-years'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('increment_eligibility_configs')
        .select('assessment_year')
        .order('assessment_year', { ascending: false });
      if (error) throw error;
      const set = new Set<string>();
      (data ?? []).forEach((r: { assessment_year: string }) => set.add(r.assessment_year));
      return Array.from(set);
    },
  });
}

/** Generates a rolling assessment-year list (current ±N) — April–March cycle. */
export function generateAssessmentYears(spread = 4): string[] {
  const now = new Date();
  // Indian-style fiscal year (Apr–Mar). Current AY starts April of current year if month >= April.
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const years: string[] = [];
  for (let i = spread; i >= -spread; i--) {
    const y = startYear - i;
    years.push(`${y}-${String((y + 1) % 100).padStart(2, '0')}`);
  }
  return years;
}

/* ---------------------------- mutations ---------------------------- */

export function useCreateEligibilityConfig() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (args: {
      scope: EligibilityScope;
      seedDefaults?: boolean;
    }) => {
      const userRes = await supabase.auth.getUser();
      const uid = userRes.data.user?.id ?? null;
      const { data: cfg, error } = await supabase
        .from('increment_eligibility_configs')
        .insert({ ...args.scope, status: 'draft', created_by: uid })
        .select()
        .single();
      if (error) throw error;

      if (args.seedDefaults) {
        const rows = DEFAULT_ELIGIBILITY_SEEDS.map((s) => ({
          config_id: cfg.id,
          criterion_key: s.criterion_key,
          criterion_name: s.criterion_name,
          description: s.description,
          comparison_operator: s.comparison_operator,
          threshold_value: s.threshold_value,
          unit_label: s.unit_label,
          is_active: true,
          effective_date: new Date().toISOString().slice(0, 10),
          sort_order: s.sort_order,
        }));
        const { error: e2 } = await supabase.from('increment_eligibility_criteria').insert(rows);
        if (e2) throw e2;
      }
      return cfg as EligibilityConfigRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['increment-eligibility-config'] });
      qc.invalidateQueries({ queryKey: ['increment-eligibility-known-years'] });
      toast({ title: 'Configuration created', description: 'You can now edit criteria.' });
    },
    onError: (e: Error) =>
      toast({ title: 'Failed to create configuration', description: e.message, variant: 'destructive' }),
  });
}

export function useCopyEligibilityConfig() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (args: {
      scope: EligibilityScope;
      sourceConfigId: string;
    }) => {
      const userRes = await supabase.auth.getUser();
      const uid = userRes.data.user?.id ?? null;
      const { data: cfg, error } = await supabase
        .from('increment_eligibility_configs')
        .insert({
          ...args.scope,
          status: 'draft',
          created_by: uid,
          copied_from_config_id: args.sourceConfigId,
        })
        .select()
        .single();
      if (error) throw error;

      const { data: src, error: e2 } = await supabase
        .from('increment_eligibility_criteria')
        .select('*')
        .eq('config_id', args.sourceConfigId);
      if (e2) throw e2;

      if (src && src.length > 0) {
        const rows = src.map((r) => ({
          config_id: cfg.id,
          criterion_key: r.criterion_key,
          criterion_name: r.criterion_name,
          description: r.description,
          comparison_operator: r.comparison_operator,
          threshold_value: r.threshold_value,
          unit_label: r.unit_label,
          is_active: r.is_active,
          effective_date: r.effective_date,
          sort_order: r.sort_order,
        }));
        const { error: e3 } = await supabase.from('increment_eligibility_criteria').insert(rows);
        if (e3) throw e3;
      }

      // Audit "copy" action against the new config
      await supabase.from('increment_eligibility_audit').insert({
        config_id: cfg.id,
        criterion_id: null,
        performed_by: uid,
        action: 'copy',
        previous_value: null,
        revised_value: { copied_from: args.sourceConfigId, criteria_count: src?.length ?? 0 },
        assessment_year: args.scope.assessment_year,
      });

      return cfg as EligibilityConfigRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['increment-eligibility-config'] });
      qc.invalidateQueries({ queryKey: ['increment-eligibility-criteria'] });
      qc.invalidateQueries({ queryKey: ['increment-eligibility-audit'] });
      toast({ title: 'Configuration copied', description: 'Review and adjust the copied criteria, then save.' });
    },
    onError: (e: Error) =>
      toast({ title: 'Copy failed', description: e.message, variant: 'destructive' }),
  });
}

export function useUpsertCriterion() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (
      row: Partial<EligibilityCriterionRow> & { config_id: string; criterion_key: string; criterion_name: string }
    ) => {
      if (row.id) {
        const { id, config_id, created_at, updated_at, ...patch } = row as any;
        const { error } = await supabase
          .from('increment_eligibility_criteria')
          .update(patch)
          .eq('id', id);
        if (error) throw error;
      } else {
        // Strip id/created_at/updated_at so DB defaults (gen_random_uuid, now()) apply.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { id: _id, created_at, updated_at, ...insertRow } = row as any;
        const { error } = await supabase
          .from('increment_eligibility_criteria')
          .insert([insertRow]);
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['increment-eligibility-criteria', vars.config_id] });
      qc.invalidateQueries({ queryKey: ['increment-eligibility-audit', vars.config_id] });
      toast({ title: 'Saved' });
    },
    onError: (e: Error) => toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  });
}

export function useDeleteCriterion() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (args: { id: string; config_id: string }) => {
      const { error } = await supabase
        .from('increment_eligibility_criteria')
        .delete()
        .eq('id', args.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['increment-eligibility-criteria', vars.config_id] });
      qc.invalidateQueries({ queryKey: ['increment-eligibility-audit', vars.config_id] });
      toast({ title: 'Criterion deleted' });
    },
    onError: (e: Error) => toast({ title: 'Delete failed', description: e.message, variant: 'destructive' }),
  });
}

export function useUpdateConfigStatus() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (args: { id: string; status: EligibilityConfigRow['status']; action: string; assessment_year: string }) => {
      const userRes = await supabase.auth.getUser();
      const uid = userRes.data.user?.id ?? null;
      const patch: Partial<EligibilityConfigRow> = { status: args.status };
      if (args.status === 'approved') {
        patch.approved_by = uid;
        patch.approved_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from('increment_eligibility_configs')
        .update(patch)
        .eq('id', args.id);
      if (error) throw error;

      await supabase.from('increment_eligibility_audit').insert({
        config_id: args.id,
        performed_by: uid,
        action: args.action,
        previous_value: null,
        revised_value: { status: args.status },
        assessment_year: args.assessment_year,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['increment-eligibility-config'] });
      qc.invalidateQueries({ queryKey: ['increment-eligibility-audit'] });
      toast({ title: 'Status updated' });
    },
    onError: (e: Error) => toast({ title: 'Status update failed', description: e.message, variant: 'destructive' }),
  });
}

/* ----------------------- master-data dropdowns ----------------------- */

export function useEligibilityMasters() {
  return useQuery({
    queryKey: ['increment-eligibility-masters'],
    queryFn: async () => {
      const [companies, divisions, bus, levels, categories, locations] = await Promise.all([
        supabase.from('companies').select('id,name').order('name'),
        supabase.from('divisions').select('id,name').order('name'),
        supabase.from('business_units').select('id,name').order('name'),
        supabase.from('levels').select('id,name').order('name'),
        supabase.from('kra_categories').select('id,name').order('name'),
        supabase.from('locations').select('id,name').order('name'),
      ]);
      return {
        companies: companies.data ?? [],
        divisions: divisions.data ?? [],
        business_units: bus.data ?? [],
        levels: levels.data ?? [],
        categories: categories.data ?? [],
        locations: locations.data ?? [],
      };
    },
  });
}