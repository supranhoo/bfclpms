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
import { ConfirmDestructiveDialog } from '@/components/common/ConfirmDestructiveDialog';
import { Users, Filter, Search, UserPlus, UserMinus, X, ShieldCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Pilot Access — Annual Review.
 *
 * SSOT-preserving UI over `admin_feature_flags.target_user_ids` for the
 * `annual_review_enabled` flag. Filters (Grade / Level / BU / Department /
 * Has KRA) let admins preview matching employees and bulk-add them to the
 * pilot allowlist without touching the underlying gate logic.
 *
 * Policy: POLICY.md §AR-PILOT-ALLOWLIST.
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

interface Filters {
  grade_ids: string[];
  level_ids: string[];
  business_unit_ids: string[];
  department_ids: string[];
  has_kra: 'yes' | 'no' | 'any';
}

const EMPTY_FILTERS: Filters = {
  grade_ids: [], level_ids: [], business_unit_ids: [], department_ids: [], has_kra: 'any',
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

async function runPreview(f: Filters): Promise<PreviewRow[]> {
  let q = supabase
    .from('profiles')
    .select(
      'id, full_name, employee_code, pms_grade_id, level_id, department_id, ' +
      'pms_grade:pms_grades(name), level:levels(name), ' +
      'department:departments!profiles_department_fk(name, business_unit_id, business_unit:business_units(name))'
    )
    .eq('is_active', true)
    .limit(500);

  if (f.grade_ids.length) q = q.in('pms_grade_id', f.grade_ids);
  if (f.level_ids.length) q = q.in('level_id', f.level_ids);
  if (f.department_ids.length) q = q.in('department_id', f.department_ids);

  const { data, error } = await q;
  if (error) throw error;

  let rows = ((data ?? []) as unknown as ProfileRow[]);

  if (f.business_unit_ids.length) {
    const set = new Set(f.business_unit_ids);
    rows = rows.filter((r) => r.department?.business_unit_id && set.has(r.department.business_unit_id));
  }

  if (rows.length === 0) return [];

  // Has-KRA presence probe (single query, scoped to candidate ids).
  const ids = rows.map((r) => r.id);
  const { data: kpiRows, error: kErr } = await supabase
    .from('kpis')
    .select('employee_id')
    .in('employee_id', ids);
  if (kErr) throw kErr;
  const withKra = new Set(((kpiRows ?? []) as any[]).map((r) => r.employee_id));

  let out: PreviewRow[] = rows.map((r) => ({ ...r, hasKra: withKra.has(r.id) }));
  if (f.has_kra === 'yes') out = out.filter((r) => r.hasKra);
  if (f.has_kra === 'no') out = out.filter((r) => !r.hasKra);
  return out;
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

export function PilotAccessCard() {
  const qc = useQueryClient();
  const flagQ = usePilotFlag();
  const grades = useLookup('pms_grades');
  const levels = useLookup('levels');
  const bus = useLookup('business_units');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const depts = useDepartments(filters.business_unit_ids);

  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmAdd, setConfirmAdd] = useState<null | { ids: string[]; label: string }>(null);
  const [previewing, setPreviewing] = useState(false);

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
      const rows = await runPreview(filters);
      setPreview(rows);
      setSelected(new Set());
    } catch (e: any) {
      toast.error(e?.message ?? 'Preview failed');
    } finally {
      setPreviewing(false);
    }
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
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" /> Pilot Access — Annual Review
        </CardTitle>
        <CardDescription>
          Grant Annual Review module access to specific employees by filtering the roster.
          Admins always have access. The master switch lives in Admin → Feature Flags.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Current audience */}
        <div className="rounded-md border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Current pilot users</span>
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
              No users yet. Use the filters below to add pilot members.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(targetedProfilesQ.data ?? []).map((p: any) => (
                <Badge key={p.id} variant="secondary" className="gap-1 pr-1">
                  {p.full_name ?? 'Unnamed'}{p.employee_code ? ` (${p.employee_code})` : ''}
                  <button
                    type="button"
                    onClick={() => mergeAndSave([p.id], 'removed')}
                    className="rounded hover:bg-muted-foreground/20 p-0.5"
                    aria-label={`Remove ${p.full_name ?? p.id}`}
                    disabled={writeAudience.isPending}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                      No employees match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  preview.map((r) => {
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
                        <TableCell>
                          {inPilot ? (
                            <Badge className="gap-1 text-xs">
                              In pilot
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
        title={`Add ${confirmAdd?.ids.length ?? 0} users to Annual Review pilot?`}
        description={
          `This will grant Annual Review module access to ${confirmAdd?.ids.length ?? 0} employees ` +
          `matching your ${confirmAdd?.label ?? ''} filter. Existing pilot members are preserved.`
        }
        confirmLabel="Add to pilot"
      />
    </Card>
  );
}

export default PilotAccessCard;