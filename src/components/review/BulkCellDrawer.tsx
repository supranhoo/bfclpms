import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  useKpiCellDetail,
  useBulkWriteStageScores,
  useBulkReopenCells,
  type BulkReviewRow,
} from '@/hooks/useBulkReview';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { KpiReviewPanel, type ViewLevel } from './KpiReviewPanel';

type Stage = 'manager' | 'skip_level' | 'hr_pms' | 'auditor';

interface Props {
  row: BulkReviewRow | null;
  viewerStage: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canReopen: boolean;
}

const STAGE_LABEL: Record<Stage, string> = {
  manager: 'Manager',
  skip_level: 'Skip-Level',
  hr_pms: 'HR PMS',
  auditor: 'Auditor',
};

/** Map bulk drawer viewer stage → KpiReviewPanel ViewLevel. */
const VIEWER_TO_VIEWLEVEL: Record<string, ViewLevel> = {
  manager: 'manager',
  skip_level: 'skip_level',
  hr_pms: 'hr_pms',
  auditor: 'auditor',
  management: 'management',
  admin: 'admin',
};

export function BulkCellDrawer({ row, viewerStage, open, onOpenChange, canReopen }: Props) {
  const { toast } = useToast();
  const detail = useKpiCellDetail(row?.kpi_id ?? null, row?.employee_id ?? null, open && !!row);
  const write = useBulkWriteStageScores();
  const reopen = useBulkReopenCells();

  const [score, setScore] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [reopenReason, setReopenReason] = useState<string>('');
  const [reopenStages, setReopenStages] = useState<Stage[]>([]);
  const [confirmReopen, setConfirmReopen] = useState(false);

  if (!row) return null;

  const writeStage = ['manager', 'skip_level', 'hr_pms', 'auditor'].includes(viewerStage)
    ? (viewerStage as Stage)
    : null;

  const isFinal = row.final_score !== null && row.final_score !== undefined;

  const scores: Array<{ stage: Stage | 'self' | 'management'; label: string; value: number | null }> = [
    { stage: 'self', label: 'Self', value: row.self_score },
    { stage: 'manager', label: 'Manager', value: row.manager_score },
    { stage: 'skip_level', label: 'Skip-Level', value: row.skip_level_score },
    { stage: 'hr_pms', label: 'HR PMS', value: row.hr_pms_score },
    { stage: 'auditor', label: 'Auditor', value: row.auditor_score },
    { stage: 'management', label: 'Management', value: row.management_score },
  ];

  const completed = scores.filter((s) => s.value !== null && s.value !== undefined).map((s) => s.value as number);
  const variance = completed.length >= 2 ? Math.max(...completed) - Math.min(...completed) : 0;

  const handleWrite = async () => {
    if (!writeStage || !row.submission_id) return;
    const n = Number(score);
    if (Number.isNaN(n)) {
      toast({ title: 'Invalid score', variant: 'destructive' });
      return;
    }
    try {
      const res = await write.mutateAsync({
        stage: writeStage,
        cells: [{
          submission_id: row.submission_id,
          score: n,
          remarks: remarks || null,
          expected_row_version: row.row_version ?? null,
        }],
      });
      if (res.applied === 0) {
        toast({
          title: 'Write skipped',
          description: res.skipped[0]?.reason ?? 'unknown',
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Score saved', description: `${STAGE_LABEL[writeStage]} score updated.` });
        setScore(''); setRemarks('');
      }
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    }
  };

  const handleReopen = async () => {
    if (!row.submission_id || reopenStages.length === 0) return;
    try {
      const res = await reopen.mutateAsync({
        cells: [{ submission_id: row.submission_id }],
        stages_to_unlock: reopenStages,
        reason: reopenReason,
      });
      if (res.applied === 0) {
        toast({ title: 'Re-open skipped', description: res.skipped[0]?.reason ?? 'unknown', variant: 'destructive' });
      } else {
        toast({ title: 'Cell re-opened', description: `Revision logged. Stages unlocked: ${reopenStages.join(', ')}` });
        setReopenReason(''); setReopenStages([]);
      }
    } catch (e: any) {
      toast({ title: 'Re-open failed', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[1100px] overflow-y-auto p-4 sm:p-6">
        <SheetHeader>
          <SheetTitle className="text-base">
            {row.employee_name}
            {row.employee_code && (
              <span className="text-muted-foreground text-sm ml-2">· {row.employee_code}</span>
            )}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {row.kra_name} · {row.kpi_name}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 mt-4">
          {/* Status badges strip */}
          <div className="flex items-center gap-2 flex-wrap">
            {variance > 1.0 && (
              <Badge variant="destructive" className="text-[10px]">Variance {variance.toFixed(1)}</Badge>
            )}
            {isFinal && <Badge className="text-[10px]">Final · rev {row.final_revision_no ?? 0}</Badge>}
            {row.is_na && <Badge variant="outline" className="text-[10px]">N/A</Badge>}
          </div>

          {/* Full KPI Review Panel — parity with "View KPI Details" */}
          {detail.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : detail.error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">{(detail.error as Error).message}</AlertDescription>
            </Alert>
          ) : detail.data?.kpi ? (
            <KpiReviewPanel
              kpi={detail.data.kpi}
              submission={detail.data.submission}
              allKpis={detail.data.kpi_history?.kpis ?? []}
              allSubmissions={detail.data.kpi_history?.submissions ?? []}
              queries={detail.data.queries ?? []}
              viewLevel={VIEWER_TO_VIEWLEVEL[viewerStage] ?? 'admin'}
              selectedPeriod={row.kpi_id ? (detail.data.kpi.review_period as string) : ''}
              selectedYear={detail.data.kpi.review_year as number}
              employeeName={detail.data.employee?.full_name ?? row.employee_name}
              employeeCode={detail.data.employee?.employee_code ?? row.employee_code ?? undefined}
              reportingManagerName={detail.data.employee?.reporting_manager_name ?? undefined}
              workflowStages={
                Array.isArray(detail.data.workflow)
                  ? (detail.data.workflow as string[])
                  : Array.isArray(detail.data.workflow?.stages)
                    ? (detail.data.workflow.stages as string[])
                    : Array.isArray(detail.data.workflow?.workflow_stages)
                      ? (detail.data.workflow.workflow_stages as string[])
                      : undefined
              }
              orgKpiEnteredByName={detail.data.org_kpi?.entered_by ?? null}
              orgAchievedValue={detail.data.org_kpi?.achieved_value ?? null}
              exploreMode={false}
            />
          ) : null}

          <Separator />

          {/* Stage write */}
          {writeStage && !isFinal && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">
                Write as {STAGE_LABEL[writeStage]}
              </div>
              {writeStage === 'hr_pms' && row.auditor_score !== null && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Auditor score is already set. HR PMS writes are blocked by precedence.
                  </AlertDescription>
                </Alert>
              )}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Score</Label>
                  <Input
                    type="number" step="0.1" min="0" max="5"
                    value={score} onChange={(e) => setScore(e.target.value)}
                    placeholder="0–5"
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Remarks</Label>
                  <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional" />
                </div>
              </div>
              <Button
                size="sm"
                onClick={handleWrite}
                disabled={write.isPending || !score}
              >
                {write.isPending ? 'Saving…' : `Save ${STAGE_LABEL[writeStage]} score`}
              </Button>
            </div>
          )}

          {isFinal && writeStage && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Final score is approved (Policy §88). Stage writes are blocked. Use Re-open if a revision is required.
              </AlertDescription>
            </Alert>
          )}

          {/* Re-open */}
          {isFinal && canReopen && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <RotateCcw className="h-3 w-3" /> Re-open approved cell
                </div>
                <div>
                  <Label className="text-xs">Stages to unlock</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {(['manager', 'skip_level', 'hr_pms', 'auditor'] as Stage[]).map((s) => {
                      const on = reopenStages.includes(s);
                      return (
                        <Button
                          key={s} type="button"
                          variant={on ? 'default' : 'outline'} size="sm"
                          onClick={() => setReopenStages((prev) =>
                            on ? prev.filter((x) => x !== s) : [...prev, s])}
                        >
                          {STAGE_LABEL[s]}
                        </Button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Reason (required, min 8 chars)</Label>
                  <Textarea
                    rows={2} value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value)}
                    placeholder="Why is this cell being re-opened?"
                  />
                </div>
                <Button
                  variant="destructive" size="sm"
                  onClick={() => setConfirmReopen(true)}
                  disabled={reopen.isPending || reopenStages.length === 0 || reopenReason.trim().length < 8}
                >
                  {reopen.isPending ? 'Re-opening…' : 'Re-open cell'}
                </Button>
              </div>
            </>
          )}

          {/* Final-score revisions (raw) */}
          {detail.data?.revisions && detail.data.revisions.length > 0 && (
            <>
              <Separator />
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Final-score revisions ({detail.data.revisions.length})
                </div>
                <pre className="text-[10px] bg-muted/40 rounded p-2 max-h-40 overflow-auto">
{JSON.stringify(detail.data.revisions, null, 2)}
                </pre>
              </div>
            </>
          )}
        </div>

        <ConfirmDestructiveDialog
          open={confirmReopen}
          onCancel={() => setConfirmReopen(false)}
          onConfirm={() => { setConfirmReopen(false); handleReopen(); }}
          title="Re-open approved cell?"
          description={`This will clear the final score, log an immutable revision (no. ${(row.final_revision_no ?? 0) + 1}), and unlock: ${reopenStages.join(', ')}.`}
          confirmLabel="Re-open"
          isLoading={reopen.isPending}
        />
      </SheetContent>
    </Sheet>
  );
}