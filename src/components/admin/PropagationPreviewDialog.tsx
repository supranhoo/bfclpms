import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { PropagationPreviewResult } from '@/hooks/usePreviewOrgKpiPropagation';

interface PropagationPreviewDialogProps {
  open: boolean;
  isLoading?: boolean;
  preview: PropagationPreviewResult | null;
  onConfirm: () => void;
  onCancel: () => void;
}

const REASON_LABEL: Record<string, string> = {
  eligible: 'Will advance',
  not_in_kra_set: 'Already past initial stage',
  kpi_not_found: 'KPI row missing',
};

export function PropagationPreviewDialog({
  open,
  isLoading,
  preview,
  onConfirm,
  onCancel,
}: PropagationPreviewDialogProps) {
  const willAdvance = preview?.will_advance ?? 0;
  const willSkip = preview?.will_skip ?? 0;
  const total = preview?.total ?? 0;
  const allSkipped = total > 0 && willAdvance === 0;

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm propagation</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              {isLoading ? (
                <div className="flex items-center gap-2 py-6 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Calculating impact…
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Badge variant="outline" className="gap-1">
                      <span className="text-muted-foreground">Total matched:</span>
                      <span className="font-semibold text-foreground">{total}</span>
                    </Badge>
                    <Badge className="gap-1 bg-green-600 hover:bg-green-600">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>{willAdvance} will advance</span>
                    </Badge>
                    {willSkip > 0 && (
                      <Badge variant="destructive" className="gap-1">
                        <XCircle className="h-3 w-3" />
                        <span>{willSkip} will skip</span>
                      </Badge>
                    )}
                  </div>

                  {allSkipped && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                      All matching KPIs are already past the initial stage. Propagating
                      now will <strong>not</strong> advance any employee. The org KPI
                      definition will also <strong>not</strong> be marked as propagated.
                    </div>
                  )}

                  {preview && preview.breakdown.length > 0 && (
                    <ScrollArea className="max-h-64 rounded-md border">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-muted/60">
                          <tr className="text-left">
                            <th className="px-2 py-1.5 font-medium">Employee</th>
                            <th className="px-2 py-1.5 font-medium">Current status</th>
                            <th className="px-2 py-1.5 font-medium">Outcome</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.breakdown.map((row) => (
                            <tr
                              key={row.kpi_id}
                              className="border-t hover:bg-muted/40"
                            >
                              <td className="px-2 py-1.5">
                                <div className="font-medium text-foreground">
                                  {row.employee_name || '—'}
                                </div>
                                {row.employee_code && (
                                  <div className="text-muted-foreground">
                                    {row.employee_code}
                                  </div>
                                )}
                              </td>
                              <td className="px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
                                {row.current_status}
                              </td>
                              <td className="px-2 py-1.5">
                                {row.will_advance ? (
                                  <span className="inline-flex items-center gap-1 text-green-600">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Advance
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-destructive">
                                    <XCircle className="h-3 w-3" />
                                    {REASON_LABEL[row.reason] ?? row.reason}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </ScrollArea>
                  )}
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isLoading || total === 0}>
            {willAdvance === 0
              ? 'Propagate anyway'
              : `Propagate to ${willAdvance} employee${willAdvance === 1 ? '' : 's'}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
