/**
 * ADR-317 — Exception KPI control strip.
 *
 * For KPIs recorded once per department (LTI/STI-style safety metrics) the
 * officer never touches thousands of employee rows. They:
 *  1. fill the roster (one row per department),
 *  2. edit only the departments that had an incident,
 *  3. preview who is affected,
 *  4. release the period — clean departments score full marks automatically.
 *
 * The panel renders nothing unless the table is configured as an exception
 * table (POLICY §KPI-EXCEPTION-SCOPED-RELEASE); configuration is master data.
 */
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Loader2, ShieldAlert, Sparkles, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  useExceptionReleaseState, useExceptionSummary, useReleaseExceptionPeriod,
  useSeedScopeRows, useSetExceptionConfig,
} from '@/hooks/useExceptionKpi';
import {
  EXCEPTION_DIRECTION_LABELS, SCOPE_DIMENSION_LABELS, describeReleaseReadiness,
  isExceptionReady,
  type ExceptionConfig, type ExceptionDirection, type ExceptionReleaseResult,
  type ExceptionScopeDimension,
} from '@/lib/review/exceptionKpiModel';

interface Props {
  datasetId: string;
  config: ExceptionConfig;
  period: string;
  year: number;
  canWrite: boolean;
}

export function ExceptionKpiPanel({ datasetId, config, period, year, canWrite }: Props) {
  const { toast } = useToast();
  const [setupOpen, setSetupOpen] = useState(false);
  const [preview, setPreview] = useState<ExceptionReleaseResult | null>(null);
  const [mode, setMode] = useState<'row_entry' | 'exception'>(config.entry_mode);
  const [dimension, setDimension] = useState<ExceptionScopeDimension>(config.scope_dimension ?? 'department');
  const [cleanValue, setCleanValue] = useState<string>(String(config.clean_value ?? 0));
  const [direction, setDirection] = useState<ExceptionDirection>(config.exception_direction);

  const ready = isExceptionReady(config);
  const summary = useExceptionSummary({ datasetId, reviewYear: year, reviewPeriod: period, enabled: ready });
  const releaseState = useExceptionReleaseState({ datasetId, reviewYear: year, reviewPeriod: period, enabled: ready });
  const saveConfig = useSetExceptionConfig();
  const seed = useSeedScopeRows();
  const release = useReleaseExceptionPeriod();

  const onSaveConfig = async () => {
    try {
      await saveConfig.mutateAsync({
        datasetId,
        entryMode: mode,
        scopeDimension: mode === 'exception' ? dimension : null,
        cleanValue: mode === 'exception' ? Number(cleanValue || 0) : null,
        direction,
      });
      setSetupOpen(false);
      toast({ title: 'Exception settings saved' });
    } catch (e) {
      toast({
        title: 'Could not save exception settings',
        description: e instanceof Error ? e.message : 'Unexpected error',
        variant: 'destructive',
      });
    }
  };

  const onSeed = async () => {
    try {
      const res = await seed.mutateAsync({
        datasetId, reviewPeriod: period, reviewYear: year, mappedOnly: true, dryRun: false,
      });
      toast({
        title: 'Roster filled',
        description: `${res.created} department row(s) added at the clean value ${res.clean_value}; ${res.existing} already present.`,
      });
    } catch (e) {
      toast({
        title: 'Could not fill the roster',
        description: e instanceof Error ? e.message : 'Unexpected error',
        variant: 'destructive',
      });
    }
  };

  const onPreview = async () => {
    try {
      const res = await release.mutateAsync({
        datasetId, reviewYear: year, reviewPeriod: period, dryRun: true,
      });
      setPreview(res);
    } catch (e) {
      toast({
        title: 'Could not build the impact preview',
        description: e instanceof Error ? e.message : 'Unexpected error',
        variant: 'destructive',
      });
    }
  };

  const onRelease = async () => {
    try {
      const res = await release.mutateAsync({
        datasetId, reviewYear: year, reviewPeriod: period, dryRun: false,
      });
      if (!res.ok) {
        toast({
          title: 'Release already running',
          description: 'Another release for this period is still in progress. Try again shortly.',
          variant: 'destructive',
        });
        return;
      }
      setPreview(null);
      toast({
        title: `Released ${period} ${year}`,
        description: `${res.employees_targeted} employee KPI(s) processed — ${res.employees_flagged} penalised, ${res.employees_clean} clean.`,
      });
    } catch (e) {
      toast({
        title: 'Release failed',
        description: e instanceof Error ? e.message : 'Unexpected error',
        variant: 'destructive',
      });
    }
  };

  if (!canWrite && config.entry_mode !== 'exception') return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-amber-50/50 px-4 py-2 text-xs dark:bg-amber-950/20">
      <ShieldAlert className="h-3.5 w-3.5 text-amber-600" aria-hidden />
      <span className="font-medium">
        {config.entry_mode === 'exception' ? 'Exception KPI' : 'Row-by-row KPI'}
      </span>
      {ready && (
        <>
          <Badge variant="outline" className="text-[10px]">
            {SCOPE_DIMENSION_LABELS[config.scope_dimension ?? 'department']}
          </Badge>
          <Badge variant="outline" className="text-[10px]">Clean = {config.clean_value}</Badge>
          {summary.data && (
            <>
              <Badge variant="destructive" className="text-[10px]">
                {summary.data.flagged_scopes} flagged
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                {summary.data.clean_scopes} clean
              </Badge>
              <span className="text-muted-foreground">{describeReleaseReadiness(summary.data)}</span>
            </>
          )}
        </>
      )}
      {releaseState.data?.status === 'completed' && (
        <span className="text-muted-foreground">
          Last release: {releaseState.data.employees_updated} updated, {releaseState.data.employees_skipped} skipped
        </span>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {canWrite && ready && (
          <>
            <Button size="sm" variant="ghost" onClick={onSeed} disabled={seed.isPending}>
              {seed.isPending
                ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
                : <Users className="mr-1 h-3.5 w-3.5" aria-hidden />}
              Fill department roster
            </Button>
            <Button size="sm" variant="outline" onClick={onPreview} disabled={release.isPending}>
              {release.isPending
                ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
                : <Sparkles className="mr-1 h-3.5 w-3.5" aria-hidden />}
              Preview & release
            </Button>
          </>
        )}
        {canWrite && (
          <Button size="sm" variant="ghost" onClick={() => setSetupOpen(true)}>
            Exception settings
          </Button>
        )}
      </div>

      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="w-[96vw] max-w-2xl">
          <DialogHeader>
            <DialogTitle>How is this KPI recorded?</DialogTitle>
            <DialogDescription>
              Exception KPIs are entered once per organisational scope. Scopes left at the clean
              value score full marks; scopes with a recorded incident penalise their employees.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label className="text-xs">Entry style</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as 'row_entry' | 'exception')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="row_entry">Row by row (normal data table)</SelectItem>
                  <SelectItem value="exception">Exception — one row per scope, incidents only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {mode === 'exception' && (
              <>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Kept by</Label>
                  <Select value={dimension} onValueChange={(v) => setDimension(v as ExceptionScopeDimension)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(SCOPE_DIMENSION_LABELS) as ExceptionScopeDimension[]).map((k) => (
                        <SelectItem key={k} value={k}>{SCOPE_DIMENSION_LABELS[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Clean value (no incident)</Label>
                  <Input
                    type="number"
                    value={cleanValue}
                    onChange={(e) => setCleanValue(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">What counts as an incident</Label>
                  <Select value={direction} onValueChange={(v) => setDirection(v as ExceptionDirection)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(EXCEPTION_DIRECTION_LABELS) as ExceptionDirection[]).map((k) => (
                        <SelectItem key={k} value={k}>{EXCEPTION_DIRECTION_LABELS[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setSetupOpen(false)}>Cancel</Button>
            <Button onClick={onSaveConfig} disabled={saveConfig.isPending}>
              {saveConfig.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />}
              Save settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent className="w-[96vw] max-w-4xl">
          <DialogHeader>
            <DialogTitle>Release {period} {year}</DialogTitle>
            <DialogDescription>
              Every employee mapped to this KPI gets a value: the clean value where their scope had
              no incident, the recorded value where it did. Scores already locked by a reviewer are
              skipped, never overwritten.
            </DialogDescription>
          </DialogHeader>

          {preview && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline">{preview.employees_targeted} employee KPI(s)</Badge>
                <Badge variant="destructive">{preview.employees_flagged} penalised</Badge>
                <Badge variant="secondary">{preview.employees_clean} clean</Badge>
                {preview.capped && (
                  <span className="inline-flex items-center gap-1 text-amber-600">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                    Preview capped — release processes the rest too.
                  </span>
                )}
              </div>
              <div className="max-h-[45vh] overflow-auto rounded border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(preview.sample ?? []).map((r, i) => (
                      <TableRow key={`${r.employee_code ?? i}-${i}`}>
                        <TableCell className="min-w-0 break-words">
                          {r.employee_name ?? '—'}
                          {r.employee_code ? ` (${r.employee_code})` : ''}
                        </TableCell>
                        <TableCell className="min-w-0 break-words">{r.department_name}</TableCell>
                        <TableCell className="text-right">{r.value}</TableCell>
                        <TableCell className="text-right">
                          {r.score === null || r.score === undefined ? '—' : Number(r.score).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPreview(null)}>Cancel</Button>
            <Button onClick={onRelease} disabled={release.isPending}>
              {release.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />}
              Release period
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
