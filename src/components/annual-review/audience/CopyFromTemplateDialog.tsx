import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search } from 'lucide-react';
import type { TemplateEmployeeRow } from '@/services/annualReview/formMapping';

/**
 * "Copy employees from another template" picker. Lists every employee
 * currently seeded on the chosen source template inside this cycle, and
 * lets the admin multi-select rows to add to the new rule's `employee_ids`.
 */
export default function CopyFromTemplateDialog({
  open,
  onOpenChange,
  cycleId,
  templates,
  existingIds,
  onAdd,
  fetchEmployees,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cycleId: string;
  templates: { id: string; name: string; is_active: boolean | null }[];
  existingIds: string[];
  onAdd: (ids: string[]) => void;
  fetchEmployees: (cycleId: string, templateId: string) => Promise<TemplateEmployeeRow[]>;
}) {
  const [sourceTplId, setSourceTplId] = useState<string>('');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) {
      setPicked(new Set());
      setQ('');
    }
  }, [open]);

  const listQ = useQuery({
    queryKey: ['copy-from-template', cycleId, sourceTplId],
    queryFn: () => fetchEmployees(cycleId, sourceTplId),
    enabled: !!sourceTplId && open,
  });

  const filtered = useMemo(() => {
    const rows = listQ.data ?? [];
    if (!q.trim()) return rows;
    const needle = q.trim().toLowerCase();
    return rows.filter((r) =>
      (r.full_name ?? '').toLowerCase().includes(needle)
      || (r.employee_code ?? '').toLowerCase().includes(needle)
      || (r.designation ?? '').toLowerCase().includes(needle),
    );
  }, [listQ.data, q]);

  const alreadySet = useMemo(() => new Set(existingIds), [existingIds]);

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAllPage = () => {
    setPicked((prev) => {
      const next = new Set(prev);
      for (const r of filtered) if (!alreadySet.has(r.employee_id)) next.add(r.employee_id);
      return next;
    });
  };
  const clearPage = () => {
    setPicked((prev) => {
      const next = new Set(prev);
      for (const r of filtered) next.delete(r.employee_id);
      return next;
    });
  };

  const canAdd = picked.size > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Copy employees from another template</DialogTitle>
          <DialogDescription>
            Pick a source template mapped in this cycle, then tick the
            employees to add to your new rule.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-2">
            <label className="text-xs font-semibold uppercase text-muted-foreground">Source template</label>
            <Select value={sourceTplId} onValueChange={setSourceTplId}>
              <SelectTrigger><SelectValue placeholder="Pick a template…" /></SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {sourceTplId && (
            <div className="grid gap-2">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
                <Input
                  className="pl-8"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search name, employee code, designation…"
                />
              </div>

              <div className="flex items-center gap-2 text-xs">
                <Button size="sm" variant="ghost" onClick={selectAllPage} type="button">
                  Select all shown
                </Button>
                <Button size="sm" variant="ghost" onClick={clearPage} type="button">
                  Clear shown
                </Button>
                <span className="ml-auto text-muted-foreground">
                  {picked.size} picked
                </span>
              </div>

              <div className="border rounded-md max-h-80 overflow-auto">
                {listQ.isLoading && (
                  <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading employees…
                  </div>
                )}
                {!listQ.isLoading && filtered.length === 0 && (
                  <div className="p-4 text-sm text-muted-foreground">
                    No employees found for this template.
                  </div>
                )}
                {filtered.map((r) => {
                  const already = alreadySet.has(r.employee_id);
                  const checked = picked.has(r.employee_id) || already;
                  return (
                    <label
                      key={r.employee_id}
                      className={`flex items-center gap-2 px-3 py-2 border-b last:border-b-0 text-sm ${already ? 'opacity-60' : 'cursor-pointer hover:bg-muted/40'}`}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={already}
                        onCheckedChange={() => !already && toggle(r.employee_id)}
                      />
                      <span className="flex-1 truncate">
                        <span className="font-medium">{r.full_name ?? '(unnamed)'}</span>
                        {r.employee_code && (
                          <span className="text-muted-foreground"> · {r.employee_code}</span>
                        )}
                        {r.designation && (
                          <span className="text-muted-foreground"> · {r.designation}</span>
                        )}
                      </span>
                      {already && <Badge variant="outline">already added</Badge>}
                      {!r.is_active && <Badge variant="outline">inactive</Badge>}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!canAdd}
            onClick={() => onAdd(Array.from(picked))}
          >
            Add {picked.size > 0 ? picked.size : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}