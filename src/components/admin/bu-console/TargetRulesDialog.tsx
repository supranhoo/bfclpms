/**
 * ADR-288 — tiered targets for one shared KPI.
 *
 * A shared KPI ("SOP creation") is the same measure for everyone, but the bar
 * is not: a manager may owe 10, their team 5. Instead of tuning employees one
 * by one, an admin writes a small rule set here (by level, designation,
 * department or "manages people") and fans it out. Manual per-employee targets
 * are respected unless "replace tuned targets" is ticked.
 */
import { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  TARGET_APPLY_SKIP_LABELS, useDeleteTargetRule, useSaveTargetRule, useTargetRules,
  useTargetRulesCommit, useTargetRulesPreview, targetRuleKey,
  type TargetApplyResult, type TargetMatchDimension,
} from '@/hooks/useBuConsoleRun';
import { TARGET_DIMENSIONS, describeRule } from './targetRuleModel';
import { useBuConsoleCapability } from '@/hooks/useBuConsoleCapability';
import type { BuConsoleScope } from '@/hooks/useBuConsole';
import { Plus, Trash2 } from 'lucide-react';

export interface TargetRulesTarget {
  categoryId: string | null;
  kraName: string;
  kpiName: string;
}

interface Props {
  target: TargetRulesTarget | null;
  scope: BuConsoleScope | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TargetRulesDialog({ target, scope, open, onOpenChange }: Props) {
  const { isAdmin } = useBuConsoleCapability();
  const kpiKey = target ? targetRuleKey(target.categoryId, target.kraName, target.kpiName) : null;
  const { data: rules, isLoading } = useTargetRules(open ? kpiKey : null);
  const save = useSaveTargetRule();
  const del = useDeleteTargetRule();
  const preview = useTargetRulesPreview();
  const commit = useTargetRulesCommit();

  const [dimension, setDimension] = useState<TargetMatchDimension>('is_manager');
  const [matchValue, setMatchValue] = useState('true');
  const [targetValue, setTargetValue] = useState('');
  const [resetOverrides, setResetOverrides] = useState(false);
  const [result, setResult] = useState<TargetApplyResult | null>(null);

  const sorted = useMemo(
    () => [...(rules ?? [])].sort((a, b) =>
      (a.match_dimension === 'default' ? 1 : 0) - (b.match_dimension === 'default' ? 1 : 0)
      || a.priority - b.priority),
    [rules],
  );

  const needsValue = dimension !== 'default';

  const addRule = () => {
    if (!target || !kpiKey || !targetValue.trim()) return;
    save.mutate({
      kpi_key: kpiKey,
      category_id: target.categoryId,
      kra_name: target.kraName,
      kpi_name: target.kpiName,
      match_dimension: dimension,
      match_value: needsValue ? matchValue.trim() : null,
      target_value: targetValue.trim(),
      priority: dimension === 'default' ? 1000 : sorted.length * 10 + 10,
    } as any, { onSuccess: () => setTargetValue('') });
  };

  const applyArgs = () =>
    target && scope
      ? { ...scope, categoryId: target.categoryId, kraName: target.kraName, kpiName: target.kpiName, resetOverrides }
      : null;

  const runPreview = () => {
    const a = applyArgs();
    if (a) preview.mutate(a, { onSuccess: setResult });
  };
  const runCommit = () => {
    const a = applyArgs();
    if (a) commit.mutate(a, { onSuccess: (r) => { setResult(r); } });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setResult(null); }}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="text-base">Target rules · {target?.kpiName}</DialogTitle>
          <DialogDescription className="text-xs">
            One KPI, different bars. Rules resolve top-down — the first match wins, "Everyone else"
            is the fallback. Applying never touches an approved row.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-auto px-6 py-4">
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : sorted.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
              No rules yet — everyone keeps the target they carry today.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Applies to</TableHead>
                  <TableHead className="w-24 text-right text-xs">Target</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="py-2 text-xs">{describeRule(r)}</TableCell>
                    <TableCell className="text-right text-xs font-medium tabular-nums">{r.target_value}</TableCell>
                    <TableCell>
                      {isAdmin && (
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => del.mutate(r.id)}
                          aria-label={`Remove rule ${describeRule(r)}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {isAdmin && (
            <div className="rounded-md border bg-muted/30 p-3">
              <Label className="text-xs font-medium">Add a rule</Label>
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_110px_auto]">
                <Select value={dimension} onValueChange={(v) => setDimension(v as TargetMatchDimension)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TARGET_DIMENSIONS.map((d) => (
                      <SelectItem key={d.value} value={d.value} className="text-xs">{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {dimension === 'is_manager' ? (
                  <Select value={matchValue} onValueChange={setMatchValue}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true" className="text-xs">Has direct reports</SelectItem>
                      <SelectItem value="false" className="text-xs">No direct reports</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    className="h-8 text-xs"
                    value={needsValue ? matchValue : ''}
                    disabled={!needsValue}
                    placeholder={needsValue ? 'Match value (e.g. L4)' : 'Fallback for everyone'}
                    onChange={(e) => setMatchValue(e.target.value)}
                  />
                )}
                <Input
                  className="h-8 text-xs"
                  value={targetValue}
                  placeholder="Target"
                  onChange={(e) => setTargetValue(e.target.value)}
                />
                <Button size="sm" className="h-8" onClick={addRule} disabled={!targetValue.trim() || save.isPending}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add
                </Button>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {TARGET_DIMENSIONS.find((d) => d.value === dimension)?.hint}
              </p>
            </div>
          )}

          {result && (
            <div className="rounded-md border p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  {result.dry_run ? `${result.will_apply ?? 0} would change` : `${result.applied ?? 0} changed`}
                </Badge>
                <Badge variant="outline">
                  {(result.dry_run ? result.will_skip : result.skipped) ?? 0} skipped
                </Badge>
              </div>
              {result.skipped_details?.length ? (
                <ul className="mt-2 max-h-32 space-y-0.5 overflow-auto text-[11px] text-muted-foreground">
                  {result.skipped_details.slice(0, 40).map((s, i) => (
                    <li key={`${s.kpi_id}-${i}`}>
                      {s.employee_name ?? s.employee_code} — {TARGET_APPLY_SKIP_LABELS[s.reason ?? ''] ?? s.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
              {result.preview?.length ? (
                <ul className="mt-2 max-h-32 space-y-0.5 overflow-auto text-[11px]">
                  {result.preview.slice(0, 40).map((p, i) => (
                    <li key={`${p.kpi_id}-${i}`}>
                      {p.employee_name ?? p.employee_code}: {p.current_target ?? '—'} → <b>{p.new_target}</b>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </div>

        {isAdmin && (
          <DialogFooter className="flex-col items-stretch gap-2 border-t px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={resetOverrides} onCheckedChange={(v) => setResetOverrides(!!v)} />
              Replace targets that were tuned by hand
            </label>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={runPreview} disabled={!scope || preview.isPending}>
                {preview.isPending ? 'Checking…' : 'Preview'}
              </Button>
              <Button
                size="sm"
                onClick={runCommit}
                disabled={!scope || commit.isPending || !result || result.dry_run === false}
              >
                {commit.isPending ? 'Applying…' : 'Apply to scope'}
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
