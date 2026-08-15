/**
 * ADR-259 Phase 3 — one-value entry, many employees.
 *
 * The data owner enters the actual value once; the dialog first calls the
 * dry-run RPC and shows exactly who will be written (with the 0-5 rating each
 * employee derives from their own scoring bands) and who will be skipped, with
 * the reason. Nothing is saved until the admin confirms the preview.
 * Final-score-approved rows are never written (POLICY §88).
 */
import { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  useGroupWritePreview,
  useGroupWriteCommit,
  GROUP_WRITE_SKIP_LABELS,
  type GroupWritePolicy,
  type GroupWriteResult,
  type KpiDetailArgs,
} from '@/hooks/useBuConsole';

interface Props {
  args: KpiDetailArgs | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const POLICY_OPTIONS: { value: GroupWritePolicy; label: string; hint: string }[] = [
  { value: 'safe', label: 'Safe — KRA-set rows only', hint: 'Touches nothing that has moved into review.' },
  { value: 'pre_review_only', label: 'Pre-review (default)', hint: 'KRA-set and self-review rows.' },
  { value: 'force_pre_terminal', label: 'Force — up to approval', hint: 'Overwrites reviewer stages, never approved rows.' },
  { value: 'overwrite_and_stepback', label: 'Overwrite + step back', hint: 'Resets downstream scores back to self-review.' },
];

const fmt = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : Number(v).toFixed(2);

export function GroupValueEntryDialog({ args, open, onOpenChange }: Props) {
  const [value, setValue] = useState('');
  const [isNa, setIsNa] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [policy, setPolicy] = useState<GroupWritePolicy>('pre_review_only');
  const [preview, setPreview] = useState<GroupWriteResult | null>(null);

  const previewMut = useGroupWritePreview();
  const commitMut = useGroupWriteCommit();

  const numericValue = value.trim() === '' ? null : Number(value);
  const valueInvalid = !isNa && (numericValue === null || Number.isNaN(numericValue));

  const basePayload = useMemo(() => {
    if (!args) return null;
    return {
      categoryId: args.categoryId,
      kraName: args.kraName,
      kpiName: args.kpiName,
      period: args.period,
      year: args.year,
      buIds: args.buIds,
      deptIds: args.deptIds,
      achievedValue: isNa ? null : numericValue,
      isNa,
      remarks: remarks.trim() || null,
      policy,
    };
  }, [args, isNa, numericValue, remarks, policy]);

  const reset = () => {
    setValue(''); setIsNa(false); setRemarks('');
    setPolicy('pre_review_only'); setPreview(null);
    previewMut.reset(); commitMut.reset();
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const runPreview = async () => {
    if (!basePayload) return;
    const res = await previewMut.mutateAsync(basePayload);
    setPreview(res);
  };

  const runCommit = async () => {
    if (!basePayload) return;
    await commitMut.mutateAsync(basePayload);
    handleClose(false);
  };

  const skipGroups = useMemo(() => {
    const rows = preview?.skipped_details ?? [];
    const map = new Map<string, number>();
    rows.forEach(r => map.set(r.reason, (map.get(r.reason) ?? 0) + 1));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [preview]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enter value for all mapped employees</DialogTitle>
          <DialogDescription>
            {args?.kpiName} · {args?.kraName} · {args?.period} {args?.year}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="bu-group-value">Actual value</Label>
            <Input
              id="bu-group-value"
              inputMode="decimal"
              value={value}
              disabled={isNa}
              placeholder="e.g. 92.5"
              onChange={(e) => { setValue(e.target.value); setPreview(null); }}
            />
          </div>

          <div className="space-y-2">
            <Label>Overwrite policy</Label>
            <Select value={policy} onValueChange={(v) => { setPolicy(v as GroupWritePolicy); setPreview(null); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {POLICY_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {POLICY_OPTIONS.find(o => o.value === policy)?.hint}
            </p>
          </div>

          <div className="flex items-center gap-3 sm:col-span-2">
            <Switch
              id="bu-group-na"
              checked={isNa}
              onCheckedChange={(c) => { setIsNa(c); setPreview(null); }}
            />
            <Label htmlFor="bu-group-na" className="cursor-pointer">
              Mark this KPI Not Applicable for the whole group
            </Label>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="bu-group-remarks">Remarks (optional)</Label>
            <Textarea
              id="bu-group-remarks"
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Context recorded against every employee in this batch"
            />
          </div>
        </div>

        {policy === 'overwrite_and_stepback' && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This resets manager, auditor, skip-level, HR and management scores back to
              self-review for every affected employee. Approved rows are still protected.
            </AlertDescription>
          </Alert>
        )}

        {preview && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{preview.will_write ?? 0} will be written</Badge>
              <Badge variant="outline">{preview.will_skip ?? 0} will be skipped</Badge>
              {!isNa && <span className="text-muted-foreground">Value {fmt(numericValue)}</span>}
            </div>

            {skipGroups.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {skipGroups.map(([reason, count]) => (
                  <Badge key={reason} variant="outline" className="font-normal">
                    {GROUP_WRITE_SKIP_LABELS[reason] ?? reason}: {count}
                  </Badge>
                ))}
              </div>
            )}

            <div className="max-h-72 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-right">Weightage</TableHead>
                    <TableHead className="text-right">Target</TableHead>
                    <TableHead className="text-right">Score now</TableHead>
                    <TableHead className="text-right">New score</TableHead>
                    <TableHead>Stage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(preview.preview ?? []).map(r => (
                    <TableRow key={r.kpi_id}>
                      <TableCell className="font-medium">
                        {r.employee_name ?? '—'}
                        {r.employee_code && (
                          <span className="ml-1 text-xs text-muted-foreground">({r.employee_code})</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.department_name ?? '—'}</TableCell>
                      <TableCell className="text-right">{fmt(r.weightage)}</TableCell>
                      <TableCell className="text-right">{fmt(r.target_value)}</TableCell>
                      <TableCell className="text-right">{fmt(r.old_self_score)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(r.new_self_score)}</TableCell>
                      <TableCell><Badge variant="outline">{r.current_status ?? '—'}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {(preview.preview ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                        No employee in this scope can receive this value.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {(preview.skipped_details ?? []).length > 0 && (
              <details className="rounded-md border p-3 text-sm">
                <summary className="cursor-pointer font-medium">
                  Skipped employees ({preview.skipped_details!.length})
                </summary>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  {preview.skipped_details!.map(r => (
                    <li key={r.kpi_id}>
                      {r.employee_name ?? r.kpi_id}
                      {r.employee_code ? ` (${r.employee_code})` : ''} — {GROUP_WRITE_SKIP_LABELS[r.reason] ?? r.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
          <Button
            variant="secondary"
            onClick={runPreview}
            disabled={valueInvalid || previewMut.isPending || !args}
          >
            {previewMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {preview ? 'Refresh preview' : 'Preview changes'}
          </Button>
          <Button
            onClick={runCommit}
            disabled={!preview || (preview.will_write ?? 0) === 0 || commitMut.isPending}
          >
            {commitMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Apply to {preview?.will_write ?? 0} employees
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
