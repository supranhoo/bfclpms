/**
 * ADR-324 — Scoring ladder editor.
 *
 * One KPI, one title, several scoring tiers. An admin writes the tiers here
 * ("BU Head owns 100 trees, department heads 25 each, everyone else 5"), sees
 * exactly who each tier reaches, previews the change, then applies it. Approved
 * rows are never touched unless the edit is wording only (ADR-323 parity), and
 * hand-tuned values are respected unless the reset box is ticked.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useBuConsoleCapability } from '@/hooks/useBuConsoleCapability';
import type { BuConsoleScope } from '@/hooks/useBuConsole';
import {
  useKpiLadder, useLadderCommit, useLadderPreview, useSaveKpiLadder,
  type LadderApplyResult, type LadderTarget,
} from '@/hooks/useScoringLadder';
import {
  DEFAULT_LADDER_CONFIG, LADDER_DIMENSIONS, LADDER_SKIP_LABELS,
  describeTier, emptyTier, sortTiers,
  type LadderCascadeMode, type LadderConfig, type LadderMatchDimension,
  type LadderRollupMode, type LadderTier,
} from './scoringLadderModel';
import { Plus, Trash2 } from 'lucide-react';

interface Props {
  target: LadderTarget | null;
  scope: BuConsoleScope | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const num = (v: string): number | null => (v.trim() === '' ? null : Number(v));
const str = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));

export function ScoringLadderDialog({ target, scope, open, onOpenChange }: Props) {
  const { isAdmin } = useBuConsoleCapability();
  const { data, isLoading } = useKpiLadder(open ? target : null, scope?.period ?? '', scope?.year ?? 0);
  const save = useSaveKpiLadder();
  const preview = useLadderPreview();
  const commit = useLadderCommit();

  const [config, setConfig] = useState<LadderConfig>(DEFAULT_LADDER_CONFIG);
  const [tiers, setTiers] = useState<LadderTier[]>([]);
  const [resetOverrides, setResetOverrides] = useState(false);
  const [result, setResult] = useState<LadderApplyResult | null>(null);
  const [editing, setEditing] = useState<number | null>(null);

  useEffect(() => {
    if (!data) return;
    setConfig(data.config ?? DEFAULT_LADDER_CONFIG);
    setTiers(sortTiers(data.tiers ?? []));
  }, [data]);

  const statsByLabel = useMemo(() => {
    const m = new Map<string, number>();
    (result?.tiers ?? []).forEach((t) => m.set(t.tier_label, t.headcount));
    return m;
  }, [result]);

  const patch = (i: number, p: Partial<LadderTier>) =>
    setTiers((prev) => prev.map((t, ix) => (ix === i ? { ...t, ...p } : t)));

  const applyArgs = () =>
    target && scope ? { ...scope, ...target, resetOverrides } : null;

  const runSave = () => {
    if (!target || !scope) return;
    save.mutate({ ...target, period: scope.period, year: scope.year, config, tiers });
  };
  const runPreview = () => {
    const a = applyArgs();
    if (a) preview.mutate(a, { onSuccess: setResult });
  };
  const runCommit = () => {
    const a = applyArgs();
    if (a) commit.mutate(a, { onSuccess: setResult });
  };

  const shown = result?.dry_run ?? true;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setResult(null); }}>
      <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-6xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="min-w-0 break-words text-base">
            Scoring ladder · {target?.kpiName}
          </DialogTitle>
          <DialogDescription className="text-xs">
            One KPI, different scoring per group. Tiers resolve top-down — the first match wins and
            “Everyone else” is always last. Applying never touches an approved row unless the change
            is wording only.
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 flex-1 space-y-4 overflow-auto px-6 py-4">
          {/* Cascade + roll-up */}
          <div className="grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-4">
            <div className="min-w-0">
              <Label className="text-xs">Targets</Label>
              <Select
                value={config.cascade_mode}
                onValueChange={(v) => setConfig((c) => ({ ...c, cascade_mode: v as LadderCascadeMode }))}
                disabled={!isAdmin}
              >
                <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="explicit" className="text-xs">Typed per tier</SelectItem>
                  <SelectItem value="auto_split" className="text-xs">Split one parent number</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <Label className="text-xs">Parent target</Label>
              <Input
                className="mt-1 h-8 text-xs"
                inputMode="decimal"
                disabled={!isAdmin || config.cascade_mode !== 'auto_split'}
                value={str(config.parent_target)}
                placeholder="e.g. 100 trees"
                onChange={(e) => setConfig((c) => ({ ...c, parent_target: num(e.target.value) }))}
              />
            </div>
            <div className="min-w-0">
              <Label className="text-xs">Achievement</Label>
              <Select
                value={config.rollup_mode}
                onValueChange={(v) => setConfig((c) => ({ ...c, rollup_mode: v as LadderRollupMode }))}
                disabled={!isAdmin}
              >
                <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="independent" className="text-xs">Each person enters their own</SelectItem>
                  <SelectItem value="central" className="text-xs">One central approved value</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <Label className="text-xs">Note</Label>
              <Input
                className="mt-1 h-8 text-xs"
                disabled={!isAdmin}
                value={config.notes ?? ''}
                placeholder="Why this ladder exists"
                onChange={(e) => setConfig((c) => ({ ...c, notes: e.target.value }))}
              />
            </div>
          </div>

          {/* Tiers */}
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : tiers.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
              No tiers yet — everyone keeps the scoring they carry today.
            </p>
          ) : (
            <div className="min-w-0 overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Tier</TableHead>
                    <TableHead className="text-xs">Applies to</TableHead>
                    <TableHead className="w-24 text-right text-xs">Target</TableHead>
                    <TableHead className="w-24 text-right text-xs">Weight</TableHead>
                    <TableHead className="w-20 text-right text-xs">People</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tiers.map((t, i) => (
                    <TableRow key={t.id ?? `new-${i}`} className="align-top">
                      <TableCell className="max-w-[180px] break-words py-2 text-xs font-medium">
                        {t.tier_label}
                      </TableCell>
                      <TableCell className="max-w-[220px] break-words py-2 text-xs">{describeTier(t)}</TableCell>
                      <TableCell className="py-2 text-right text-xs tabular-nums">{str(t.target_value) || '—'}</TableCell>
                      <TableCell className="py-2 text-right text-xs tabular-nums">{str(t.weightage) || '—'}</TableCell>
                      <TableCell className="py-2 text-right text-xs tabular-nums text-muted-foreground">
                        {statsByLabel.has(t.tier_label) ? statsByLabel.get(t.tier_label) : '—'}
                      </TableCell>
                      <TableCell className="py-1">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost" size="sm" className="h-7 px-2 text-xs"
                            onClick={() => setEditing(editing === i ? null : i)}
                          >
                            {editing === i ? 'Close' : 'Edit'}
                          </Button>
                          {isAdmin && (
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7"
                              aria-label={`Remove tier ${t.tier_label}`}
                              onClick={() => { setTiers((p) => p.filter((_, ix) => ix !== i)); setEditing(null); }}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {editing !== null && tiers[editing] && (
                <div className="min-w-0 space-y-3 border-t bg-muted/20 p-3">
                  <div className="grid gap-2 sm:grid-cols-4">
                    <div className="min-w-0">
                      <Label className="text-[11px]">Tier name</Label>
                      <Input
                        className="mt-1 h-8 text-xs" disabled={!isAdmin}
                        value={tiers[editing].tier_label}
                        onChange={(e) => patch(editing, { tier_label: e.target.value })}
                      />
                    </div>
                    <div className="min-w-0">
                      <Label className="text-[11px]">Applies to</Label>
                      <Select
                        value={tiers[editing].match_dimension} disabled={!isAdmin}
                        onValueChange={(v) => patch(editing, {
                          match_dimension: v as LadderMatchDimension,
                          match_value: v === 'default' ? null : v === 'is_manager' ? 'true' : '',
                        })}
                      >
                        <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {LADDER_DIMENSIONS.map((d) => (
                            <SelectItem key={d.value} value={d.value} className="text-xs">{d.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="min-w-0">
                      <Label className="text-[11px]">Match value</Label>
                      {tiers[editing].match_dimension === 'is_manager' ? (
                        <Select
                          value={tiers[editing].match_value ?? 'true'} disabled={!isAdmin}
                          onValueChange={(v) => patch(editing, { match_value: v })}
                        >
                          <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true" className="text-xs">Has direct reports</SelectItem>
                            <SelectItem value="false" className="text-xs">No direct reports</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          className="mt-1 h-8 text-xs"
                          disabled={!isAdmin || tiers[editing].match_dimension === 'default'}
                          value={tiers[editing].match_value ?? ''}
                          placeholder={tiers[editing].match_dimension === 'default' ? 'Fallback' : 'e.g. L4'}
                          onChange={(e) => patch(editing, { match_value: e.target.value })}
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <Label className="text-[11px]">Order</Label>
                      <Input
                        className="mt-1 h-8 text-xs" inputMode="numeric" disabled={!isAdmin}
                        value={String(tiers[editing].priority)}
                        onChange={(e) => patch(editing, { priority: Number(e.target.value) || 100 })}
                      />
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-4">
                    <div className="min-w-0">
                      <Label className="text-[11px]">Target</Label>
                      <Input
                        className="mt-1 h-8 text-xs" inputMode="decimal" disabled={!isAdmin}
                        value={str(tiers[editing].target_value)}
                        onChange={(e) => patch(editing, { target_value: num(e.target.value) })}
                      />
                    </div>
                    <div className="min-w-0">
                      <Label className="text-[11px]">Weightage</Label>
                      <Input
                        className="mt-1 h-8 text-xs" inputMode="decimal" disabled={!isAdmin}
                        value={str(tiers[editing].weightage)}
                        onChange={(e) => patch(editing, { weightage: num(e.target.value) })}
                      />
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-6">
                    {(['r5', 'r4', 'r3', 'r2', 'r1', 'r0'] as const).map((band) => (
                      <div key={band} className="min-w-0">
                        <Label className="text-[11px] uppercase">{band}</Label>
                        <Input
                          className="mt-1 h-8 text-xs" disabled={!isAdmin}
                          value={tiers[editing]![band] ?? ''}
                          onChange={(e) => patch(editing, { [band]: e.target.value } as Partial<LadderTier>)}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="min-w-0">
                      <Label className="text-[11px]">Formula (text)</Label>
                      <Textarea
                        className="mt-1 h-16 resize-none text-xs" disabled={!isAdmin}
                        value={tiers[editing].kpi_formula ?? ''}
                        onChange={(e) => patch(editing, { kpi_formula: e.target.value })}
                      />
                    </div>
                    <div className="min-w-0">
                      <Label className="text-[11px]">Scoring logic (text)</Label>
                      <Textarea
                        className="mt-1 h-16 resize-none text-xs" disabled={!isAdmin}
                        value={tiers[editing].kpi_scoring_logic ?? ''}
                        onChange={(e) => patch(editing, { kpi_scoring_logic: e.target.value })}
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {LADDER_DIMENSIONS.find((d) => d.value === tiers[editing]!.match_dimension)?.hint}
                  </p>
                </div>
              )}
            </div>
          )}

          {isAdmin && (
            <Button
              variant="outline" size="sm" className="h-8"
              onClick={() => {
                setTiers((p) => [...p, emptyTier(p.length * 10 + 10)]);
                setEditing(tiers.length);
              }}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Add tier
            </Button>
          )}

          {result && (
            <div className="min-w-0 rounded-md border p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  {shown ? `${result.will_apply ?? 0} would change` : `${result.applied ?? 0} changed`}
                </Badge>
                <Badge variant="outline">{(shown ? result.will_skip : result.skipped) ?? 0} skipped</Badge>
                {result.cascade_mode === 'auto_split' && (
                  <Badge variant="secondary">Split of {result.parent_target ?? '—'}</Badge>
                )}
              </div>
              {result.tiers?.length ? (
                <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                  {result.tiers.map((t) => (
                    <li key={t.tier_id} className="break-words">
                      {t.tier_label} — {t.headcount} people · target {t.tier_target ?? '—'}
                    </li>
                  ))}
                </ul>
              ) : null}
              {result.skipped_details?.length ? (
                <ul className="mt-2 max-h-32 space-y-0.5 overflow-auto text-[11px] text-muted-foreground">
                  {result.skipped_details.slice(0, 40).map((s, i) => (
                    <li key={`${s.kpi_id}-${i}`} className="break-words">
                      {s.employee_name ?? s.employee_code} — {LADDER_SKIP_LABELS[s.reason ?? ''] ?? s.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
              {result.preview?.length ? (
                <ul className="mt-2 max-h-32 space-y-0.5 overflow-auto text-[11px]">
                  {result.preview.slice(0, 40).map((p, i) => (
                    <li key={`${p.kpi_id}-${i}`} className="break-words">
                      {p.employee_name ?? p.employee_code} · {p.tier_label} —{' '}
                      {Object.keys(p.new_values ?? {}).join(', ')}
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
              Replace values that were tuned by hand
            </label>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={runSave} disabled={save.isPending || !scope}>
                {save.isPending ? 'Saving…' : 'Save ladder'}
              </Button>
              <Button variant="outline" size="sm" onClick={runPreview} disabled={!scope || preview.isPending}>
                {preview.isPending ? 'Checking…' : 'Preview'}
              </Button>
              <Button
                size="sm" onClick={runCommit}
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
