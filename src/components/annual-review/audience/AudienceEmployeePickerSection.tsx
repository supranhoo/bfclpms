import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { X, Users, Copy, AlertTriangle, Filter, Loader2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import type { AssignmentFilters } from '@/types/annualReview';
import CopyFromTemplateDialog from './CopyFromTemplateDialog';
import {
  listEmployeesForTemplateInCycle,
  resolveFilterToEmployeeIds,
} from '@/services/annualReview/formMapping';

/**
 * Audience picker for explicit employee ids. Sits under the filter grid in
 * the Form Mapping "Map a template to an audience" card.
 *
 * Modes (POLICY §AR-MAPPING-EMPLOYEE-IDS):
 *   • filter-only     → ids ignored (legacy behaviour, employee_ids_mode undefined)
 *   • filter ∪ list   → filter-match OR id-in-list
 *   • only these      → id-in-list, other facets ignored
 */
export default function AudienceEmployeePickerSection({
  cycleId,
  templates,
  value,
  onChange,
}: {
  cycleId: string;
  templates: { id: string; name: string; is_active: boolean | null }[];
  value: AssignmentFilters;
  onChange: (next: AssignmentFilters) => void;
}) {
  const [copyOpen, setCopyOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolvePreview, setResolvePreview] = useState<
    { id: string; full_name: string | null; employee_code: string | null }[] | null
  >(null);
  const [resolveLoading, setResolveLoading] = useState(false);
  const ids = value.employee_ids ?? [];
  const mode = value.employee_ids_mode ?? 'off';

  // Look up names for the badge list (paged via the same service the dialog
  // uses). We resolve names by fetching the profiles for the selected ids
  // through any template — cheaper here to just query profiles directly.
  const nameQ = useQuery({
    queryKey: ['audience-picker', 'names', ids],
    queryFn: async () => {
      if (ids.length === 0) return new Map<string, { name: string; active: boolean }>();
      const { supabase } = await import('@/integrations/supabase/client');
      const map = new Map<string, { name: string; active: boolean }>();
      const CHUNK = 500;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, employee_code, is_active')
          .in('id', slice);
        for (const p of data ?? []) {
          map.set(p.id as string, {
            name: ((p as { full_name: string | null }).full_name ?? (p as { employee_code: string | null }).employee_code ?? p.id) as string,
            active: !!(p as { is_active: boolean }).is_active,
          });
        }
      }
      return map;
    },
    enabled: ids.length > 0,
    staleTime: 30_000,
  });

  const inactiveCount = useMemo(() => {
    if (!nameQ.data) return 0;
    let n = 0;
    for (const id of ids) {
      const row = nameQ.data.get(id);
      if (row && !row.active) n++;
    }
    return n;
  }, [nameQ.data, ids]);

  const setMode = (next: 'off' | 'union' | 'only') => {
    if (next === 'off') {
      const { employee_ids: _ids, employee_ids_mode: _m, ...rest } = value;
      onChange({ ...(rest as AssignmentFilters) });
    } else {
      onChange({ ...value, employee_ids: ids, employee_ids_mode: next });
    }
  };

  const addIds = (add: string[]) => {
    const set = new Set(ids);
    for (const id of add) set.add(id);
    onChange({
      ...value,
      employee_ids: Array.from(set),
      // If the admin didn't pick a mode yet, default to "only these people"
      // — the most common case for "copy 5 from Template A".
      employee_ids_mode: value.employee_ids_mode ?? 'only',
    });
  };

  const removeId = (id: string) => {
    const next = ids.filter((x) => x !== id);
    onChange({ ...value, employee_ids: next });
  };

  const clearAll = () => {
    onChange({ ...value, employee_ids: [] });
  };

  const hasFacetFilters = useMemo(() => {
    const f = value as unknown as Record<string, unknown>;
    const keys = ['roles', 'grades', 'levels', 'bu_ids', 'department_ids', 'sub_unit_ids'];
    if (keys.some((k) => Array.isArray(f[k]) && (f[k] as unknown[]).length > 0)) return true;
    if (typeof f.grade_bucket === 'string' && f.grade_bucket) return true;
    if (f.has_kras === 'yes' || f.has_kras === 'no') return true;
    return false;
  }, [value]);

  const openResolveDialog = async () => {
    if (!hasFacetFilters) {
      toast.error('Set at least one audience filter first.');
      return;
    }
    setResolveLoading(true);
    setResolveOpen(true);
    try {
      const resolved = await resolveFilterToEmployeeIds(value);
      setResolvePreview(resolved);
    } catch (e) {
      toast.error((e as Error).message);
      setResolveOpen(false);
    } finally {
      setResolveLoading(false);
    }
  };

  const confirmResolve = () => {
    if (!resolvePreview) return;
    const addIdsList = resolvePreview.map((r) => r.id);
    const set = new Set(ids);
    for (const id of addIdsList) set.add(id);
    // Materialise into an explicit list, clear facet filters, switch to 'only'.
    onChange({
      // Preserve any non-facet fields (e.g. kras_window_months is meaningless
      // once has_kras is cleared, so drop everything that drove selection).
      employee_ids: Array.from(set),
      employee_ids_mode: 'only',
    } as AssignmentFilters);
    toast.success(
      `Added ${addIdsList.length} employee${addIdsList.length === 1 ? '' : 's'} — filters cleared, mode switched to Only these people.`,
    );
    setResolveOpen(false);
    setResolvePreview(null);
  };

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <Label className="text-xs font-semibold uppercase text-muted-foreground">
          Include specific employees (optional)
        </Label>
      </div>

      <RadioGroup
        value={mode}
        onValueChange={(v) => setMode(v as 'off' | 'union' | 'only')}
        className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm"
      >
        <label className="flex items-start gap-2 rounded border p-2 cursor-pointer">
          <RadioGroupItem value="off" id="mode-off" className="mt-0.5" />
          <span>
            <span className="font-medium">Filter only</span>
            <span className="block text-xs text-muted-foreground">Ignore list</span>
          </span>
        </label>
        <label className="flex items-start gap-2 rounded border p-2 cursor-pointer">
          <RadioGroupItem value="union" id="mode-union" className="mt-0.5" />
          <span>
            <span className="font-medium">Filter + these people</span>
            <span className="block text-xs text-muted-foreground">Either condition</span>
          </span>
        </label>
        <label className="flex items-start gap-2 rounded border p-2 cursor-pointer">
          <RadioGroupItem value="only" id="mode-only" className="mt-0.5" />
          <span>
            <span className="font-medium">Only these people</span>
            <span className="block text-xs text-muted-foreground">Ignore filters</span>
          </span>
        </label>
      </RadioGroup>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setCopyOpen(true)}
        >
          <Copy className="h-4 w-4 mr-1" /> Copy from another template
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={openResolveDialog}
          disabled={!hasFacetFilters || resolveLoading}
          title={hasFacetFilters
            ? 'Snapshot the current filters into an explicit employee list'
            : 'Set at least one filter above to enable'}
        >
          {resolveLoading
            ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            : <Filter className="h-4 w-4 mr-1" />}
          Add everyone matching current filters
        </Button>
        <span className="text-xs text-muted-foreground">
          {ids.length} employee{ids.length === 1 ? '' : 's'} selected
        </span>
        {ids.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={clearAll}
          >
            Clear
          </Button>
        )}
        {inactiveCount > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            {inactiveCount} inactive
          </span>
        )}
      </div>

      {ids.length > 0 && (
        <div className="flex flex-wrap gap-1 max-h-32 overflow-auto">
          {ids.slice(0, 100).map((id) => {
            const row = nameQ.data?.get(id);
            const label = row?.name ?? id.slice(0, 8);
            return (
              <Badge
                key={id}
                variant={row?.active === false ? 'outline' : 'secondary'}
                className="gap-1"
                title={row?.active === false ? 'Inactive employee' : undefined}
              >
                {label}
                <button
                  type="button"
                  onClick={() => removeId(id)}
                  className="ml-0.5 hover:text-destructive"
                  aria-label={`Remove ${label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
          {ids.length > 100 && (
            <span className="text-xs text-muted-foreground">…+{ids.length - 100} more</span>
          )}
        </div>
      )}

      <CopyFromTemplateDialog
        open={copyOpen}
        onOpenChange={setCopyOpen}
        cycleId={cycleId}
        templates={templates}
        existingIds={ids}
        onAdd={(add) => { addIds(add); setCopyOpen(false); }}
        fetchEmployees={listEmployeesForTemplateInCycle}
      />

      <AlertDialog
        open={resolveOpen}
        onOpenChange={(o) => {
          setResolveOpen(o);
          if (!o) setResolvePreview(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Snapshot filters into an explicit list?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                {resolveLoading && (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Resolving filters…
                  </p>
                )}
                {!resolveLoading && resolvePreview && (
                  <>
                    <p>
                      This will add <strong>{resolvePreview.length}</strong> employee
                      {resolvePreview.length === 1 ? '' : 's'} to the explicit list.
                    </p>
                    <p>
                      The current facet filters (roles, grades, BUs, departments, etc.)
                      will be <strong>cleared</strong> and the mode will switch to
                      <em> Only these people</em>. Future joiners or leavers that would
                      have matched the filters are <strong>not</strong> tracked.
                    </p>
                    {resolvePreview.length === 0 && (
                      <p className="text-destructive">
                        No employees match — nothing to add.
                      </p>
                    )}
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={resolveLoading || !resolvePreview || resolvePreview.length === 0}
              onClick={confirmResolve}
            >
              Add {resolvePreview?.length ?? 0} and clear filters
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}