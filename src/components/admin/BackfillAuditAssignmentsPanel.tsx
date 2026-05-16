import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface Period { year: number; period: string }
interface Summary {
  target: Period;
  target_kpi_count: number;
  would_create: number;
  already_mapped: number;
  no_source_match: number;
  source_has_no_auditor: number;
}
interface ApiResponse {
  success: boolean;
  dry_run: boolean;
  total_inserted: number;
  errors: string[];
  summaries: Summary[];
}

const DEFAULT_TARGETS: Period[] = [
  { year: 2026, period: 'April' },
  { year: 2026, period: 'May' },
];
const OPTIONAL_TARGETS: Period[] = [{ year: 2026, period: 'June' }];

/**
 * Admin panel — Backfill auditor mappings for periods that were rolled over
 * BEFORE carry-forward was added to the rollover engine.
 *
 * Workflow: Dry-run first → review counts → Apply (with destructive confirm).
 * See POLICY.md §132.1 and DOCUMENTATION.md v2.66.11.20.
 */
export function BackfillAuditAssignmentsPanel() {
  const [includeJune, setIncludeJune] = useState(false);
  const [running, setRunning] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<ApiResponse | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [appliedResult, setAppliedResult] = useState<ApiResponse | null>(null);

  const targets = includeJune ? [...DEFAULT_TARGETS, ...OPTIONAL_TARGETS] : DEFAULT_TARGETS;

  const invoke = async (dryRun: boolean): Promise<ApiResponse> => {
    const { data, error } = await supabase.functions.invoke<ApiResponse>(
      'backfill-audit-assignments',
      { body: { targets, dry_run: dryRun } },
    );
    if (error) throw new Error(error.message ?? 'Edge function failed');
    if (!data) throw new Error('Empty response from edge function');
    return data;
  };

  const handleDryRun = async () => {
    setRunning(true);
    setAppliedResult(null);
    try {
      const res = await invoke(true);
      setDryRunResult(res);
      const total = res.summaries.reduce((a, s) => a + s.would_create, 0);
      toast.success(`Dry-run complete — ${total} mappings would be created`);
    } catch (e: any) {
      toast.error(`Dry-run failed: ${e.message}`);
    } finally {
      setRunning(false);
    }
  };

  const handleApply = async () => {
    setConfirmOpen(false);
    setRunning(true);
    try {
      const res = await invoke(false);
      setAppliedResult(res);
      toast.success(`Backfill applied — ${res.total_inserted} mappings created`);
      setDryRunResult(null);
    } catch (e: any) {
      toast.error(`Apply failed: ${e.message}`);
    } finally {
      setRunning(false);
    }
  };

  const result = appliedResult ?? dryRunResult;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Backfill Auditor Mappings
        </CardTitle>
        <CardDescription>
          One-shot recovery for periods that were rolled over before auditor
          carry-forward was enabled. Inherits the auditor for each KPI from the
          most recent prior period that has a mapping. Existing assignments are
          always preserved.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
          <span className="text-sm font-medium">Target periods:</span>
          {DEFAULT_TARGETS.map((p) => (
            <Badge key={`${p.year}-${p.period}`} variant="secondary">
              {p.period} {p.year}
            </Badge>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <Checkbox
              id="include-june"
              checked={includeJune}
              onCheckedChange={(v) => setIncludeJune(v === true)}
            />
            <Label htmlFor="include-june" className="text-sm font-normal cursor-pointer">
              Also include June 2026
            </Label>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleDryRun} disabled={running}>
            {running && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Run Dry-Run
          </Button>
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={
              running ||
              !dryRunResult ||
              dryRunResult.summaries.every((s) => s.would_create === 0)
            }
          >
            Apply Backfill
          </Button>
        </div>

        {result && (
          <div className="rounded-lg border overflow-hidden">
            <div className="bg-muted px-4 py-2 text-sm font-medium flex items-center justify-between">
              <span>{appliedResult ? 'Applied result' : 'Dry-run preview'}</span>
              {appliedResult && (
                <span className="text-muted-foreground">
                  {appliedResult.total_inserted} rows inserted
                </span>
              )}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-background">
                <tr className="border-b text-left">
                  <th className="px-3 py-2">Period</th>
                  <th className="px-3 py-2 text-right">Target KPIs</th>
                  <th className="px-3 py-2 text-right">Would Create</th>
                  <th className="px-3 py-2 text-right">Already Mapped</th>
                  <th className="px-3 py-2 text-right">No Source Match</th>
                  <th className="px-3 py-2 text-right">Source Has No Auditor</th>
                </tr>
              </thead>
              <tbody>
                {result.summaries.map((s) => (
                  <tr key={`${s.target.year}-${s.target.period}`} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium">
                      {s.target.period} {s.target.year}
                    </td>
                    <td className="px-3 py-2 text-right">{s.target_kpi_count}</td>
                    <td className="px-3 py-2 text-right font-semibold">{s.would_create}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{s.already_mapped}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{s.no_source_match}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{s.source_has_no_auditor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.errors && result.errors.length > 0 && (
              <div className="bg-destructive/10 border-t p-3 text-sm text-destructive flex gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">Errors:</div>
                  <ul className="list-disc pl-5">
                    {result.errors.map((e, i) => (<li key={i}>{e}</li>))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>

      <ConfirmDestructiveDialog
        open={confirmOpen}
        onConfirm={handleApply}
        onCancel={() => setConfirmOpen(false)}
        title="Apply auditor backfill?"
        description={`This will insert ${
          dryRunResult?.summaries.reduce((a, s) => a + s.would_create, 0) ?? 0
        } auditor mapping rows for ${targets.map((t) => `${t.period} ${t.year}`).join(', ')}. Existing assignments are preserved. This is logged to the system audit trail.`}
        confirmLabel="Apply Backfill"
        isLoading={running}
      />
    </Card>
  );
}