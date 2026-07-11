import { useEffect, useMemo, useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { MONTH_NAMES } from '@/hooks/useAdminReports';
import type { KPI } from '@/hooks/useKpis';
import {
  resolveKraDeletionIds,
  useAdminDeleteKpiScoped,
  useKraSiblingRows,
  type KraDeleteScope,
  type KraSiblingRow,
} from '@/hooks/useKpis';

interface KraDeleteScopeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kpi: KPI;
  employeeName: string;
  displayKra: string;
  displayKpi: string;
}

function fmtMonth(period: string | null, year: number | null): string {
  if (!period || year == null) return '—';
  const idx = MONTH_NAMES.indexOf(period as any);
  const short = idx >= 0 ? period.slice(0, 3) : period;
  return `${short} ${year}`;
}

function sortRowsCalendar(rows: KraSiblingRow[]): KraSiblingRow[] {
  return [...rows].sort((a, b) => {
    const ay = a.review_year ?? 0;
    const by = b.review_year ?? 0;
    if (ay !== by) return ay - by;
    const ai = a.review_period ? MONTH_NAMES.indexOf(a.review_period as any) : -1;
    const bi = b.review_period ? MONTH_NAMES.indexOf(b.review_period as any) : -1;
    return ai - bi;
  });
}

export function KraDeleteScopeDialog({
  open,
  onOpenChange,
  kpi,
  employeeName,
  displayKra,
  displayKpi,
}: KraDeleteScopeDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [scope, setScope] = useState<KraDeleteScope>('month');
  const [confirmText, setConfirmText] = useState('');

  const currentPeriod = kpi.review_period ?? '';
  const currentYear = kpi.review_year ?? 0;

  const siblingsQ = useKraSiblingRows(
    open
      ? { employeeId: kpi.employee_id, kraName: kpi.kra_name, kpiName: kpi.kpi_name }
      : null,
    open,
  );
  const deleteMut = useAdminDeleteKpiScoped();

  // Reset local state whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setStep(1);
      setScope('month');
      setConfirmText('');
    }
  }, [open]);

  const siblings = siblingsQ.data ?? [];
  const current = { id: kpi.id, period: currentPeriod, year: currentYear };

  const idsByScope = useMemo(
    () => ({
      month: resolveKraDeletionIds(siblings, 'month', current),
      from: resolveKraDeletionIds(siblings, 'from', current),
      all: resolveKraDeletionIds(siblings, 'all', current),
    }),
    [siblings, kpi.id, currentPeriod, currentYear],
  );

  const chosenIds = idsByScope[scope];
  const chosenRows = useMemo(() => {
    const setIds = new Set(chosenIds);
    return sortRowsCalendar(siblings.filter((r) => setIds.has(r.id)));
  }, [chosenIds, siblings]);

  const countsLoading = siblingsQ.isLoading;
  const canContinue = !countsLoading && chosenIds.length > 0;
  const canDelete = confirmText === 'DELETE' && chosenIds.length > 0 && !deleteMut.isPending;

  const handleClose = () => {
    if (deleteMut.isPending) return;
    onOpenChange(false);
  };

  const handleDelete = () => {
    deleteMut.mutate(
      { ids: chosenIds, scope },
      {
        onSuccess: () => onOpenChange(false),
      },
    );
  };

  const scopeOptions: Array<{
    value: KraDeleteScope;
    label: string;
    hint: string;
    count: number;
  }> = [
    {
      value: 'month',
      label: 'This month only',
      hint: fmtMonth(currentPeriod, currentYear),
      count: idsByScope.month.length,
    },
    {
      value: 'from',
      label: 'This and following months only',
      hint: `${fmtMonth(currentPeriod, currentYear)} →`,
      count: idsByScope.from.length,
    },
    {
      value: 'all',
      label: 'All months',
      hint: 'every occurrence',
      count: idsByScope.all.length,
    },
  ];

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <AlertDialogContent className="max-w-lg">
        {step === 1 ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this KRA?</AlertDialogTitle>
              <AlertDialogDescription>
                Choose which occurrences of{' '}
                <span className="font-medium text-foreground">
                  “{displayKra} — {displayKpi}”
                </span>{' '}
                for {employeeName} you want to delete.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="py-2">
              <RadioGroup
                value={scope}
                onValueChange={(v) => setScope(v as KraDeleteScope)}
                className="space-y-2"
              >
                {scopeOptions.map((opt) => (
                  <label
                    key={opt.value}
                    htmlFor={`scope-${opt.value}`}
                    className={cn(
                      'flex items-center gap-3 rounded-md border p-3 cursor-pointer transition-colors',
                      scope === opt.value ? 'border-primary bg-accent/40' : 'border-border',
                    )}
                  >
                    <RadioGroupItem id={`scope-${opt.value}`} value={opt.value} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="text-xs text-muted-foreground">{opt.hint}</div>
                    </div>
                    <div className="text-sm tabular-nums text-muted-foreground min-w-[3ch] text-right">
                      {countsLoading ? (
                        <Skeleton className="h-4 w-8 inline-block" />
                      ) : (
                        <span>({opt.count})</span>
                      )}
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </div>

            <AlertDialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={() => setStep(2)}
                disabled={!canContinue}
              >
                Continue
              </Button>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm permanent deletion</AlertDialogTitle>
              <AlertDialogDescription>
                You are about to permanently delete this KRA and all its review
                submissions and history. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-3 py-2 text-sm">
              <div className="rounded-md border bg-muted/30 p-3 space-y-1">
                <div><span className="text-muted-foreground">Employee: </span><span className="font-medium">{employeeName}</span></div>
                <div><span className="text-muted-foreground">KRA / KPI: </span><span className="font-medium">{displayKra} — {displayKpi}</span></div>
                <div><span className="text-muted-foreground">Scope: </span><span className="font-medium">{scopeOptions.find((o) => o.value === scope)?.label}</span></div>
                <div>
                  <span className="text-muted-foreground">Months: </span>
                  <span className="font-medium">
                    {chosenRows.length
                      ? chosenRows.map((r) => fmtMonth(r.review_period, r.review_year)).join(', ')
                      : '—'}
                  </span>
                </div>
                <div><span className="text-muted-foreground">Rows: </span><span className="font-medium">{chosenIds.length}</span></div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="kra-delete-confirm">
                  Type <span className="font-mono font-semibold">DELETE</span> to confirm
                </Label>
                <Input
                  id="kra-delete-confirm"
                  autoFocus
                  autoComplete="off"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="DELETE"
                />
              </div>
            </div>

            <AlertDialogFooter>
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                disabled={deleteMut.isPending}
              >
                Back
              </Button>
              <Button
                onClick={handleDelete}
                disabled={!canDelete}
                className={cn(buttonVariants({ variant: 'destructive' }))}
              >
                {deleteMut.isPending
                  ? 'Deleting…'
                  : `Delete ${chosenIds.length} row${chosenIds.length === 1 ? '' : 's'}`}
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}