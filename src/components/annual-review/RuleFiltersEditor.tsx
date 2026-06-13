import { useMemo, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import {
  useBusinessUnits,
  useDepartments,
  useDesignations,
  usePmsGrades,
  useLevels,
} from '@/hooks/useOrganization';
import type { AssignmentFilters } from '@/types/annualReview';

export const EMPTY_FILTERS: AssignmentFilters = {
  roles: [], grades: [], levels: [], bu_ids: [], department_ids: [],
};

type PickerKey = keyof AssignmentFilters;

interface OptionItem { value: string; label: string }

/**
 * Compact checkbox-grid picker for one filter facet. Stores values as strings
 * in the rule's `filters` JSONB (designation/grade/level names, BU & department
 * UUIDs). UI shows a searchable scrolling list — no popovers, fits inside the
 * Rules tab card.
 */
function Picker({
  title, items, selected, onChange,
}: {
  title: string;
  items: OptionItem[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [q, setQ] = useState('');
  const filtered = useMemo(
    () => items.filter((o) => !q || o.label.toLowerCase().includes(q.toLowerCase())),
    [items, q],
  );
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</Label>
        {selected.length > 0 && (
          <Button type="button" variant="ghost" size="sm" className="h-6 px-1 text-xs" onClick={() => onChange([])}>
            <X className="h-3 w-3 mr-0.5" /> Clear ({selected.length})
          </Button>
        )}
      </div>
      <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8" />
      <div className="max-h-36 overflow-y-auto pr-1 space-y-1">
        {filtered.length === 0 && <p className="text-xs text-muted-foreground py-1">No options.</p>}
        {filtered.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
            <Checkbox checked={selected.includes(o.value)} onCheckedChange={() => toggle(o.value)} />
            <span className="truncate">{o.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function RuleFiltersEditor({
  value, onChange,
}: {
  value: AssignmentFilters;
  onChange: (next: AssignmentFilters) => void;
}) {
  const { data: bus = [] } = useBusinessUnits();
  const { data: depts = [] } = useDepartments();
  const { data: designations = [] } = useDesignations();
  const { data: grades = [] } = usePmsGrades();
  const { data: levels = [] } = useLevels();

  const set = (k: PickerKey, next: string[]) => onChange({ ...value, [k]: next });

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <Picker title="Designations" selected={value.roles ?? []}
        items={designations.map((d) => ({ value: d.name, label: d.name }))}
        onChange={(v) => set('roles', v)} />
      <Picker title="Grades" selected={value.grades ?? []}
        items={grades.map((g) => ({ value: g.name, label: g.name }))}
        onChange={(v) => set('grades', v)} />
      <Picker title="Levels" selected={value.levels ?? []}
        items={levels.map((l) => ({ value: l.name, label: l.name }))}
        onChange={(v) => set('levels', v)} />
      <Picker title="Business Units" selected={value.bu_ids ?? []}
        items={bus.map((b: { id: string; name: string }) => ({ value: b.id, label: b.name }))}
        onChange={(v) => set('bu_ids', v)} />
      <Picker title="Departments" selected={value.department_ids ?? []}
        items={depts.map((d: { id: string; name: string }) => ({ value: d.id, label: d.name }))}
        onChange={(v) => set('department_ids', v)} />
    </div>
  );
}

export function RuleFiltersSummary({ filters }: { filters: AssignmentFilters }) {
  const parts: string[] = [];
  if (filters.roles?.length) parts.push(`${filters.roles.length} designation${filters.roles.length === 1 ? '' : 's'}`);
  if (filters.grades?.length) parts.push(`${filters.grades.length} grade${filters.grades.length === 1 ? '' : 's'}`);
  if (filters.levels?.length) parts.push(`${filters.levels.length} level${filters.levels.length === 1 ? '' : 's'}`);
  if (filters.bu_ids?.length) parts.push(`${filters.bu_ids.length} BU${filters.bu_ids.length === 1 ? '' : 's'}`);
  if (filters.department_ids?.length) parts.push(`${filters.department_ids.length} dept${filters.department_ids.length === 1 ? '' : 's'}`);
  if (parts.length === 0) return <Badge variant="outline" className="text-xs">All employees</Badge>;
  return <span className="text-xs text-muted-foreground">{parts.join(' · ')}</span>;
}