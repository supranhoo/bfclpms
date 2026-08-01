/**
 * ADR-226 Phase 2 — Legacy recommendation import (dry-run first).
 *
 * Reads the free-text "Overall recommendation" written by Dept / BU / Management
 * heads and converts it into tracked recommendation records. The run is always
 * previewed before it is committed, and every committed run can be rolled back.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Loader2, PlayCircle, Undo2 } from 'lucide-react';
import { ConfirmDestructiveDialog } from '@/components/common/ConfirmDestructiveDialog';
import {
  useImportRuns, useRollbackImport, useRunLegacyImport,
} from '@/hooks/useRecommendationImport';
import type { ImportRunResult } from '@/services/annualReview/recommendationImport';

export function LegacyImportDialog({
  open, onOpenChange, cycleId, cycleName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cycleId: string;
  cycleName?: string | null;
}) {
  const runImport = useRunLegacyImport();
  const rollback = useRollbackImport();
  const { data: runs = [] } = useImportRuns(open ? cycleId : undefined);
  const [preview, setPreview] = useState<ImportRunResult | null>(null);
  const [rollbackId, setRollbackId] = useState<string | null>(null);

  const committedRuns = runs.filter((r) => !r.dry_run && !r.rolled_back_at);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import legacy recommendations</DialogTitle>
            <DialogDescription>
              Classifies existing free-text overall recommendations for{' '}
              {cycleName ?? 'the active cycle'} into tracked records. The original wording is
              always preserved, nothing is auto-approved, and rows already decided by HR are
              never touched.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={runImport.isPending}
                onClick={() =>
                  runImport.mutate(
                    { cycleId, dryRun: true },
                    { onSuccess: (res) => setPreview(res) },
                  )
                }
              >
                {runImport.isPending && runImport.variables?.dryRun ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <PlayCircle className="h-4 w-4 mr-2" />
                )}
                Preview (dry run)
              </Button>
              <Button
                disabled={!preview || runImport.isPending}
                onClick={() =>
                  runImport.mutate(
                    { cycleId, dryRun: false },
                    { onSuccess: (res) => setPreview(res) },
                  )
                }
              >
                {runImport.isPending && runImport.variables?.dryRun === false && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Run import
              </Button>
            </div>

            {preview && (
              <div className="space-y-3 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant={preview.dry_run ? 'secondary' : 'default'}>
                    {preview.dry_run ? 'Preview' : 'Committed'}
                  </Badge>
                  <span>{preview.scanned} scanned</span>
                  <span>· {preview.created} to create</span>
                  <span>· {preview.updated} to refresh</span>
                  <span>· {preview.skipped} skipped (already decided or captured in form)</span>
                  <span>· {preview.needs_classification} need classification</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {Object.entries(preview.type_breakdown ?? {}).map(([k, v]) => (
                    <Badge key={k} variant="outline" className="text-[11px]">
                      {k}: {v}
                    </Badge>
                  ))}
                </div>

                {preview.sample?.length > 0 && (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Stage</TableHead>
                          <TableHead>Types</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Original text</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.sample.map((s, i) => (
                          <TableRow key={`${s.instance_id}-${i}`}>
                            <TableCell className="text-xs whitespace-nowrap">
                              {s.reviewer_role.replace('_', ' ')}
                            </TableCell>
                            <TableCell className="text-xs">{(s.types ?? []).join(', ')}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {s.amount_value == null
                                ? '—'
                                : s.amount_kind === 'percent'
                                  ? `${s.amount_value}%`
                                  : `₹${Number(s.amount_value).toLocaleString('en-IN')}`}
                            </TableCell>
                            <TableCell className="text-xs">{s.status}</TableCell>
                            <TableCell className="text-xs max-w-[380px] truncate">
                              {s.narrative}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}

            {committedRuns.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Previous committed runs</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead className="text-right">Created</TableHead>
                      <TableHead className="text-right">Refreshed</TableHead>
                      <TableHead className="text-right">Needs classification</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {committedRuns.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs">
                          {new Date(r.created_at).toLocaleString('en-IN')}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.created_count}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.updated_count}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.needs_classification_count}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setRollbackId(r.id)}
                            disabled={rollback.isPending}
                          >
                            <Undo2 className="h-4 w-4 mr-1" />Roll back
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDestructiveDialog
        open={!!rollbackId}
        onOpenChange={(o) => { if (!o) setRollbackId(null); }}
        title="Roll back this import run?"
        description="Only imported recommendations that HR has not yet decided will be removed. Decided records and anything captured directly in a review form are kept."
        confirmLabel="Roll back"
        onConfirm={() => {
          if (rollbackId) rollback.mutate(rollbackId);
          setRollbackId(null);
        }}
      />
    </>
  );
}