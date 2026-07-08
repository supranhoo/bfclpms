import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { X, Users, Copy, AlertTriangle } from 'lucide-react';
import type { AssignmentFilters } from '@/types/annualReview';
import CopyFromTemplateDialog from './CopyFromTemplateDialog';
import { listEmployeesForTemplateInCycle } from '@/services/annualReview/formMapping';

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
    </div>
  );
}