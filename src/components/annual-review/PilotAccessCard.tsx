import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { Users, Filter, Search, UserPlus, UserMinus, X, ShieldCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { listTemplatesInUse, type TemplateInUse } from '@/services/annualReview/formMapping';
import {
  fetchActiveProfiles,
  fetchDeptToBu,
  fetchEmployeesWithKrasSince,
  windowMonthsFromFilters,
} from '@/services/annualReview/formMapping';
import {
  resolveEligibleEmployeeIdsForTemplates,
  type SeededInstance,
} from '@/lib/annualReviewTemplateAudience';
import { fetchAllPaged } from '@/lib/fetchAll';
import type { AnnualReviewAssignmentRule, AssignmentFilters } from '@/types/annualReview';
import { RegistryPager, pagedSlice } from '@/components/admin/kpi-standardization/RegistryPager';

/**
 * Phased Rollout — Annual Review.
 *
 * SSOT-preserving UI over `admin_feature_flags.target_user_ids` for the
 * `annual_review_enabled` flag. Filters (Grade / Level / BU / Department /
 * Has KRA) let admins preview matching employees and bulk-add them to the
 * current rollout phase without touching the underlying gate logic.
 *
 * The Assigned Form column resolves each user's effective template for the
 * selected cycle via `COALESCE(template_override_id, template_id)` —
 * read-only mirror of the template resolver, never a writer.
 *
 * Policy: POLICY.md §AR-PHASED-ROLLOUT (formerly §AR-PILOT-ALLOWLIST).
 */

const FLAG_KEY = 'annual_review_enabled';

interface Lookup { id: string; name: string }
interface ProfileRow {
  id: string;
  full_name: string | null;
  employee_code: string | null;
  pms_grade_id: string | null;
  level_id: string | null;
  department_id: string | null;
  pms_grade: { name: string } | null;
  level: { name: string } | null;
  department: { name: string; business_unit_id: string | null; business_unit: { name: string } | null } | null;
}
interface PreviewRow extends ProfileRow { hasKra: boolean }

interface AssignedForm { name: string; isOverride: boolean }

interface Filters {
  grade_ids: string[];
  level_ids: string[];
  business_unit_ids: string[];
  department_ids: string[];
  has_kra: 'yes' | 'no' | 'any';
  template_ids: string[];
}

const EMPTY_FILTERS: Filters = {
  grade_ids: [], level_ids: [], business_unit_ids: [], department_ids: [], has_kra: 'any', template_ids: [],
};

function useLookup(table: 'pms_grades' | 'levels' | 'business_units') {
  return useQuery({
    queryKey: ['pilot-lookup', table],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Lookup[]> => {
      const { data, error } = await supabase.from(table).select('id, name').order('name');
      if (error) throw error;
      return (data ?? []) as Lookup[];
    },
  });
}

function useDepartments(businessUnitIds: string[]) {
  return useQuery({
    queryKey: ['pilot-lookup', 'departments', businessUnitIds.slice().sort().join(',')],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Array<Lookup & { business_unit_id: string | null }>> => {
      let q = supabase.from('departments').select('id, name, business_unit_id').order('name');
      if (businessUnitIds.length > 0) q = q.in('business_unit_id', businessUnitIds);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

function usePilotFlag() {
  return useQuery({
    queryKey: ['admin_feature_flags', FLAG_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_feature_flags' as any)
        .select('key, value, target_user_ids')
        .eq('key', FLAG_KEY)
        .maybeSingle();
      if (error) throw error;
      return {
        enabled: !!(data as any)?.value,
        userIds: (((data as any)?.target_user_ids) ?? []) as string[],
      };
    },
    staleTime: 15_000,
  });
}

/** Cycles eligible to preview the assigned form against. */
function useRolloutCycles() {
  return useQuery({
    queryKey: ['phased-rollout-cycles'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('annual_review_cycles')
        .select('id, name, status, review_year')
        .in('status', ['active', 'draft', 'in_progress'] as any)
        .order('review_year', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; status: string; review_year: number }>;
    },
  });
}

/** Resolve assigned form (template) per user for a cycle. Read-only. */
function useAssignedForms(userIds: string[], cycleId: string | null) {
  const key = userIds.slice().sort().join(',');
  return useQuery({
    queryKey: ['phased-rollout-assigned-forms', cycleId ?? 'none', key],
    enabled: !!cycleId && userIds.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Map<string, AssignedForm | null>> => {
      const out = new Map<string, AssignedForm | null>();
      if (!cycleId || userIds.length === 0) return out;
      const { data, error } = await supabase
        .from('annual_review_instances')
        .select(
          'employee_id, template_id, template_override_id, ' +
          'template:annual_review_templates!annual_review_instances_template_id_fkey(name), ' +
          'override_template:annual_review_templates!annual_review_instances_template_override_id_fkey(name)'
        )
        .eq('cycle_id', cycleId)
        .in('employee_id', userIds);
      if (error) throw error;
      for (const row of (data ?? []) as any[]) {
        const isOverride = !!row.template_override_id;
        const name = (isOverride ? row.override_template?.name : row.template?.name) ?? null;
        out.set(row.employee_id, name ? { name, isOverride } : null);
      }
      return out;
    },
  });
}

/** Templates in use for the selected cycle — populates the rollout multi-select. */
function useTemplatesInUse(cycleId: string | null) {
  return useQuery({
    queryKey: ['phased-rollout-templates-in-use', cycleId ?? 'none'],
    enabled: !!cycleId,
    staleTime: 60_000,
    queryFn: async (): Promise<TemplateInUse[]> => {
      if (!cycleId) return [];
      return listTemplatesInUse(cycleId);
    },
  });
}

/**
 * Fetch employee IDs whose effective template (COALESCE(override, template))
 * matches one of the selected templates, within the given cycle. Used by the
 * preview to intersect the profile filter results.
 */
/**
 * SEEDED-ONLY intersection: employee ids in this cycle whose effective
 * seeded template is one of `templateIds`. Used by the
 * "Remove template's users from phase" bulk action, whose scope is
 * legitimately the current-audience ∩ seeded-template set.
 *
 * NOTE: Do NOT use for the preview filter — that must include employees
 * who are not yet seeded but would resolve to the template via active
 * mapping rules. See `resolveEligibleEmployeeIdsForTemplates`.
 */
async function fetchSeededEmployeeIdsForTemplates(
  cycleId: string,
  templateIds: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!cycleId || templateIds.length === 0) return out;
  // Paged to bypass PostgREST's 1000-row cap (POLICY §94).
  const data = await fetchAllPaged<{
    employee_id: string;
    template_id: string | null;
    template_override_id: string | null;
  }>((from, to) =>
    supabase
      .from('annual_review_instances')
      .select('employee_id, template_id, template_override_id')
      .eq('cycle_id', cycleId)
      .or(
        `template_id.in.(${templateIds.join(',')}),template_override_id.in.(${templateIds.join(',')})`,
      )
      .range(from, to),
  );
  const set = new Set(templateIds);
  for (const r of data) {
    const eff = r.template_override_id ?? r.template_id;
    if (eff && set.has(eff)) out.add(r.employee_id);
  }
  return out;
}

function AssignedFormCell({ form }: { form: AssignedForm | null | undefined }) {
  if (form === undefined) {
    return <span className="text-xs text-muted-foreground">…</span>;
  }
  if (form === null) {
    return <span className="text-xs italic text-muted-foreground">— not seeded</span>;
  }
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-sm truncate" title={form.name}>{form.name}</span>
      {form.isOverride && (
        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">Override</Badge>
      )}
    </div>
  );
}

async function runPreview(f: Filters): Promise<PreviewRow[]> {
  // POLICY §94 — page the profiles read; a hard `.limit(500)` (or the
  // PostgREST 1000-row default cap) silently truncated the audience for
  // the ~2,533-employee active roster.
  const data = await fetchAllPaged<ProfileRow>((from, to) => {
    let q = supabase
      .from('profiles')
      .select(
        'id, full_name, employee_code, pms_grade_id, level_id, department_id, ' +
          'pms_grade:pms_grades(name), level:levels(name), ' +
          'department:departments!profiles_department_fk(name, business_unit_id, business_unit:business_units(name))'
      )
      .eq('is_active', true);
    if (f.grade_ids.length) q = q.in('pms_grade_id', f.grade_ids);
    if (f.level_ids.length) q = q.in('level_id', f.level_ids);
    if (f.department_ids.length) q = q.in('department_id', f.department_ids);
    return q.order('full_name').range(from, to) as unknown as PromiseLike<{
      data: ProfileRow[] | null;
      error: unknown;
    }>;
  });

  let rows = data;

  if (f.business_unit_ids.length) {
    const set = new Set(f.business_unit_ids);
    rows = rows.filter((r) => r.department?.business_unit_id && set.has(r.department.business_unit_id));
  }

  if (rows.length === 0) return [];

  // Has-KRA presence probe — chunked+paged to bypass the 1000-row cap.
  const ids = rows.map((r) => r.id);
  const withKra = new Set<string>();
  const CHUNK = 500;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const kpiRows = await fetchAllPaged<{ employee_id: string }>((from, to) =>
      supabase
        .from('kpis')
        .select('employee_id')
        .in('employee_id', chunk)
        .order('employee_id')
        .range(from, to),
    );
    for (const r of kpiRows) if (r.employee_id) withKra.add(r.employee_id);
  }

  let out: PreviewRow[] = rows.map((r) => ({ ...r, hasKra: withKra.has(r.id) }));
  if (f.has_kra === 'yes') out = out.filter((r) => r.hasKra);
  if (f.has_kra === 'no') out = out.filter((r) => !r.hasKra);
  return out;
}

/**
 * Apply the Assigned-Template filter. Resolver-aware: an employee passes
 * the filter iff their EFFECTIVE template for this cycle is one of the
 * selected templates, where "effective" = seeded template (with override)
 * if an instance already exists, otherwise the template the active
 * mapping rules would assign at seed time.
 *
 * Cycle-scoped; no-op when no cycle is selected (UI disables the field).
 */
async function applyTemplateFilter(
  rows: PreviewRow[],
  cycleId: string | null,
  templateIds: string[],
): Promise<PreviewRow[]> {
  if (!cycleId || templateIds.length === 0) return rows;
  const [profiles, deptToBu, rulesRes, instRows] = await Promise.all([
    fetchActiveProfiles(),
    fetchDeptToBu(),
    supabase
      .from('annual_review_assignment_rules')
      .select('id, template_id, cycle_id, filters, is_active, priority')
      .eq('cycle_id', cycleId),
    fetchAllPaged<{
      employee_id: string;
      template_id: string | null;
      template_override_id: string | null;
    }>((from, to) =>
      supabase
        .from('annual_review_instances')
        .select('employee_id, template_id, template_override_id')
        .eq('cycle_id', cycleId)
        .order('employee_id')
        .range(from, to),
    ),
  ]);
  if (rulesRes.error) throw rulesRes.error;
  const rules = (rulesRes.data ?? []) as unknown as AnnualReviewAssignmentRule[];

  // Prefetch one KRA set per distinct window used by rules that opt into
  // `has_kras`. Rules that don't use it don't force a fetch.
  const windows = new Set<number>();
  for (const r of rules) {
    if (!r.is_active) continue;
    const filters = r.filters as Partial<AssignmentFilters> | null | undefined;
    if (filters?.has_kras === 'yes' || filters?.has_kras === 'no') {
      windows.add(windowMonthsFromFilters(filters));
    }
  }
  const krasSets = new Map<number, Set<string>>();
  await Promise.all(
    [...windows].map(async (w) => {
      krasSets.set(w, await fetchEmployeesWithKrasSince(w));
    }),
  );

  const seededByEmp = new Map<string, SeededInstance>();
  for (const r of instRows) {
    seededByEmp.set(r.employee_id, {
      template_id: r.template_id,
      template_override_id: r.template_override_id,
    });
  }

  const allowed = resolveEligibleEmployeeIdsForTemplates({
    profiles,
    rules,
    deptToBu,
    krasSets,
    seededByEmp,
    templateIds,
  });
  return rows.filter((r) => allowed.has(r.id));
}

function MultiSelectPopover({
  label, options, value, onChange, placeholder,
}: {
  label: string;
  options: Lookup[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-10 w-full justify-between font-normal">
            <span className="truncate">
              {value.length === 0 ? placeholder : `${value.length} selected`}
            </span>
            <Filter className="h-3.5 w-3.5 opacity-60 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />
            <CommandList>
              <CommandEmpty>No results</CommandEmpty>
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem key={o.id} value={o.name} onSelect={() => toggle(o.id)}>
                    <Checkbox className="mr-2" checked={value.includes(o.id)} />
                    {o.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((id) => {
            const o = options.find((x) => x.id === id);
            return (
              <Badge key={id} variant="secondary" className="gap-1 pr-1 text-xs">
                {o?.name ?? id.slice(0, 6)}
                <button
                  type="button"
                  className="rounded hover:bg-muted-foreground/20 p-0.5"
                  onClick={() => toggle(id)}
                  aria-label={`Remove ${o?.name ?? 'item'}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PhasedRolloutCard() {
  const qc = useQueryClient();
  const flagQ = usePilotFlag();
  const grades = useLookup('pms_grades');
  const levels = useLookup('levels');
  const bus = useLookup('business_units');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const depts = useDepartments(filters.business_unit_ids);
  const cyclesQ = useRolloutCycles();
  const [cycleId, setCycleId] = useState<string | null>(null);
  const effectiveCycleId = cycleId ?? cyclesQ.data?.[0]?.id ?? null;
  const templatesQ = useTemplatesInUse(effectiveCycleId);
  const templatesInUse = templatesQ.data ?? [];
  const templateSelectDisabled = !effectiveCycleId || templatesInUse.length === 0;

  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmAdd, setConfirmAdd] = useState<null | { ids: string[]; label: string }>(null);
  const [previewing, setPreviewing] = useState(false);

  // Client-side pagination state (POLICY §13). Both tables render pre-fetched
  // arrays, so we slice locally rather than re-querying.
  const [audiencePage, setAudiencePage] = useState(1);
  const [audiencePageSize, setAudiencePageSize] = useState(10);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewPageSize, setPreviewPageSize] = useState(10);

  const audienceIds = flagQ.data?.userIds ?? [];
  const audienceSet = useMemo(() => new Set(audienceIds), [audienceIds]);

  const targetedProfilesQ = useQuery({
    queryKey: ['pilot-audience-profiles', audienceIds.slice().sort().join(',')],
    enabled: audienceIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, employee_code')
        .in('id', audienceIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const audienceRows = (targetedProfilesQ.data ?? []) as Array<{ id: string; full_name: string | null; employee_code: string | null }>;
  const pagedAudienceRows = useMemo(
    () => pagedSlice(audienceRows, audiencePage, audiencePageSize),
    [audienceRows, audiencePage, audiencePageSize],
  );
  const pagedPreviewRows = useMemo(
    () => (preview ? pagedSlice(preview, previewPage, previewPageSize) : []),
    [preview, previewPage, previewPageSize],
  );

  // Assigned forms for the union of audience + preview ids.
  const previewIds = useMemo(() => (preview ?? []).map((r) => r.id), [preview]);
  const formLookupIds = useMemo(
    () => Array.from(new Set([...audienceIds, ...previewIds])),
    [audienceIds, previewIds],
  );
  const assignedFormsQ = useAssignedForms(formLookupIds, effectiveCycleId);
  const forms = assignedFormsQ.data;

  const writeAudience = useMutation({
    mutationFn: async (nextIds: string[]) => {
      const { error } = await supabase
        .from('admin_feature_flags' as any)
        .update({ target_user_ids: nextIds })
        .eq('key', FLAG_KEY);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin_feature_flags'] });
      qc.invalidateQueries({ queryKey: ['admin_feature_flag'] });
      qc.invalidateQueries({ queryKey: ['annual_review_flag'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Failed to update audience'),
  });

  async function handlePreview() {
    setPreviewing(true);
    try {
      const baseRows = await runPreview(filters);
      const rows = await applyTemplateFilter(baseRows, effectiveCycleId, filters.template_ids);
      setPreview(rows);
      setSelected(new Set());
    } catch (e: any) {
      toast.error(e?.message ?? 'Preview failed');
    } finally {
      setPreviewing(false);
    }
  }

  /**
   * Bulk remove-by-template: drop everyone in the current phase whose
   * effective template matches the current template selection. No-op when
   * no template is picked.
   */
  async function handleRemoveByTemplate() {
    if (!effectiveCycleId || filters.template_ids.length === 0 || audienceIds.length === 0) return;
    const allowed = await fetchSeededEmployeeIdsForTemplates(effectiveCycleId, filters.template_ids);
    const toRemove = audienceIds.filter((id) => allowed.has(id));
    if (toRemove.length === 0) {
      toast.info('No current-phase users match the selected templates.');
      return;
    }
    mergeAndSave(toRemove, 'removed');
  }

  function mergeAndSave(idsToAdd: string[], verb: 'added' | 'removed') {
    const next =
      verb === 'added'
        ? Array.from(new Set([...audienceIds, ...idsToAdd]))
        : audienceIds.filter((id) => !idsToAdd.includes(id));
    writeAudience.mutate(next, {
      onSuccess: () => toast.success(`${idsToAdd.length} user(s) ${verb} to pilot.`),
    });
  }

  const toAdd = preview?.filter((r) => !audienceSet.has(r.id)) ?? [];
  const selectedToAdd = toAdd.filter((r) => selected.has(r.id));

  function requestAdd(ids: string[], label: string) {
    if (ids.length === 0) return;
    if (ids.length > 25) setConfirmAdd({ ids, label });
    else mergeAndSave(ids, 'added');
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" /> Phased Rollout — Annual Review
            </CardTitle>
            <CardDescription>
              Roll the Annual Review module out in phases. Pick who sees it now; the rest of the
              org stays gated. Admins always have access. Master switch: Admin → Feature Flags.
            </CardDescription>
          </div>
          <div className="min-w-[220px] space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">Cycle (for form preview)</Label>
            <Select
              value={effectiveCycleId ?? ''}
              onValueChange={(v) => setCycleId(v || null)}
              disabled={cyclesQ.isLoading || (cyclesQ.data ?? []).length === 0}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder={cyclesQ.isLoading ? 'Loading…' : 'No cycles'} />
              </SelectTrigger>
              <SelectContent>
                {(cyclesQ.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} <span className="text-muted-foreground">· {c.status}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Current phase audience */}
        <div className="rounded-md border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Users in current phase</span>
            <Badge variant="secondary">{audienceIds.length}</Badge>
            {flagQ.data && !flagQ.data.enabled && (
              <Badge variant="outline" className="text-destructive border-destructive/40">
                Master switch OFF
              </Badge>
            )}
          </div>
          {flagQ.isLoading ? (
            <Skeleton className="h-6 w-full" />
          ) : audienceIds.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No users in the current phase yet. Use the filters below to add members.
            </p>
          ) : (
            <div className="rounded-md border bg-background overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Assigned Form</TableHead>
                    <TableHead className="w-16 text-right">Remove</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedAudienceRows.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium text-sm">{p.full_name ?? 'Unnamed'}</div>
                        <div className="text-xs text-muted-foreground">{p.employee_code ?? '—'}</div>
                      </TableCell>
                      <TableCell>
                        <AssignedFormCell form={forms?.get(p.id)} />
                      </TableCell>
                      <TableCell className="text-right">
                        <button
                          type="button"
                          onClick={() => mergeAndSave([p.id], 'removed')}
                          className="rounded hover:bg-muted-foreground/20 p-1"
                          aria-label={`Remove ${p.full_name ?? p.id}`}
                          disabled={writeAudience.isPending}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="border-t px-3 py-2">
                <RegistryPager
                  page={audiencePage}
                  pageSize={audiencePageSize}
                  total={audienceRows.length}
                  onPageChange={setAudiencePage}
                  onPageSizeChange={(n) => { setAudiencePageSize(n); setAudiencePage(1); }}
                  resetKey={String(audienceRows.length)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div title={templateSelectDisabled ? 'Select a cycle with seeded instances to filter by template' : undefined}>
            <MultiSelectPopover
              label="Assigned Template"
              options={templatesInUse.map((t) => ({
                id: t.template_id,
                name: `${t.name} · ${t.employees_count}`,
              }))}
              value={filters.template_ids}
              onChange={(v) => setFilters({ ...filters, template_ids: v })}
              placeholder={
                templateSelectDisabled
                  ? templatesQ.isLoading
                    ? 'Loading…'
                    : 'No mapping yet'
                  : 'Any template'
              }
            />
          </div>
          <MultiSelectPopover
            label="Grade"
            options={grades.data ?? []}
            value={filters.grade_ids}
            onChange={(v) => setFilters({ ...filters, grade_ids: v })}
            placeholder="Any grade"
          />
          <MultiSelectPopover
            label="Level"
            options={levels.data ?? []}
            value={filters.level_ids}
            onChange={(v) => setFilters({ ...filters, level_ids: v })}
            placeholder="Any level"
          />
          <MultiSelectPopover
            label="Business Unit"
            options={bus.data ?? []}
            value={filters.business_unit_ids}
            onChange={(v) =>
              setFilters({ ...filters, business_unit_ids: v, department_ids: [] })
            }
            placeholder="Any BU"
          />
          <MultiSelectPopover
            label="Department"
            options={(depts.data ?? []).map(({ id, name }) => ({ id, name }))}
            value={filters.department_ids}
            onChange={(v) => setFilters({ ...filters, department_ids: v })}
            placeholder={filters.business_unit_ids.length ? 'Any dept in BU' : 'Any department'}
          />
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Has KRA</Label>
            <Select
              value={filters.has_kra}
              onValueChange={(v) => setFilters({ ...filters, has_kra: v as Filters['has_kra'] })}
            >
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="yes">Has KRA</SelectItem>
                <SelectItem value="no">No KRA</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handlePreview} disabled={previewing} size="sm">
            {previewing ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Search className="h-4 w-4 mr-1.5" />
            )}
            Preview matches
          </Button>
          {filters.template_ids.length > 0 && audienceIds.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleRemoveByTemplate}
              disabled={writeAudience.isPending}
              title="Remove everyone currently in the phase whose assigned template matches the selection"
            >
              <UserMinus className="h-4 w-4 mr-1.5" />
              Remove template's users from phase
            </Button>
          )}
          {preview && (
            <>
              <span className="text-xs text-muted-foreground">
                {preview.length} match(es) · {toAdd.length} not yet in pilot
              </span>
              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selectedToAdd.length === 0 || writeAudience.isPending}
                  onClick={() => requestAdd(selectedToAdd.map((r) => r.id), 'selected')}
                >
                  <UserPlus className="h-4 w-4 mr-1.5" />
                  Add selected ({selectedToAdd.length})
                </Button>
                <Button
                  size="sm"
                  disabled={toAdd.length === 0 || writeAudience.isPending}
                  onClick={() => requestAdd(toAdd.map((r) => r.id), 'all matches')}
                >
                  <UserPlus className="h-4 w-4 mr-1.5" />
                  Add all ({toAdd.length})
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Results */}
        {preview && (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={toAdd.length > 0 && selected.size === toAdd.length}
                      onCheckedChange={(v) =>
                        setSelected(v ? new Set(toAdd.map((r) => r.id)) : new Set())
                      }
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Business Unit</TableHead>
                  <TableHead>KRA</TableHead>
                  <TableHead>Assigned Form</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                      No employees match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  pagedPreviewRows.map((r) => {
                    const inPilot = audienceSet.has(r.id);
                    return (
                      <TableRow key={r.id} className="hover:bg-muted/50">
                        <TableCell>
                          <Checkbox
                            disabled={inPilot}
                            checked={selected.has(r.id)}
                            onCheckedChange={(v) => {
                              const next = new Set(selected);
                              if (v) next.add(r.id); else next.delete(r.id);
                              setSelected(next);
                            }}
                            aria-label={`Select ${r.full_name ?? r.id}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{r.full_name ?? 'Unnamed'}</div>
                          <div className="text-xs text-muted-foreground">{r.employee_code ?? '—'}</div>
                        </TableCell>
                        <TableCell className="text-sm">{r.pms_grade?.name ?? '—'}</TableCell>
                        <TableCell className="text-sm">{r.level?.name ?? '—'}</TableCell>
                        <TableCell className="text-sm">{r.department?.name ?? '—'}</TableCell>
                        <TableCell className="text-sm">{r.department?.business_unit?.name ?? '—'}</TableCell>
                        <TableCell>
                          {r.hasKra ? (
                            <Badge variant="secondary" className="text-xs">Yes</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">No</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <AssignedFormCell form={forms?.get(r.id)} />
                        </TableCell>
                        <TableCell>
                          {inPilot ? (
                            <Badge className="gap-1 text-xs">
                              In phase
                              <button
                                type="button"
                                className="ml-1 rounded hover:bg-primary-foreground/20 p-0.5"
                                onClick={() => mergeAndSave([r.id], 'removed')}
                                aria-label={`Remove ${r.full_name ?? r.id}`}
                              >
                                <UserMinus className="h-3 w-3" />
                              </button>
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">Not added</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            {preview.length > 0 && (
              <div className="border-t px-3 py-2">
                <RegistryPager
                  page={previewPage}
                  pageSize={previewPageSize}
                  total={preview.length}
                  onPageChange={setPreviewPage}
                  onPageSizeChange={(n) => { setPreviewPageSize(n); setPreviewPage(1); }}
                  resetKey={String(preview.length)}
                />
              </div>
            )}
          </div>
        )}
      </CardContent>

      <ConfirmDestructiveDialog
        open={!!confirmAdd}
        onCancel={() => setConfirmAdd(null)}
        onConfirm={() => {
          if (confirmAdd) {
            mergeAndSave(confirmAdd.ids, 'added');
            setConfirmAdd(null);
          }
        }}
        title={`Add ${confirmAdd?.ids.length ?? 0} users to Annual Review rollout?`}
        description={
          `This will grant Annual Review module access to ${confirmAdd?.ids.length ?? 0} employees ` +
          `matching your ${confirmAdd?.label ?? ''} filter. Existing members are preserved.`
        }
        confirmLabel="Add to phase"
      />
    </Card>
  );
}

export default PhasedRolloutCard;

/** @deprecated use `PhasedRolloutCard`. Temporary re-export for import parity. */
export const PilotAccessCard = PhasedRolloutCard;