import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronsUpDown, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import * as svc from '@/services/annualReview/annualReviewService';
import type { InstanceWithEmployee, ReassignableReviewerRole } from '@/services/annualReview/annualReviewService';
import type { AnnualReviewerRole } from '@/types/annualReview';
import { enabledChain, describeChain } from '@/lib/annualReview/stageChain';
import { useReviewerCandidates, type ReviewerCandidate } from '@/hooks/annualReview/useReviewerCandidates';
import { cn } from '@/lib/utils';

/**
 * Per-employee workflow override dialog.
 * Admin / hr_pms only. RPC enforces stage gate, role, and audit log.
 * Allowed pre-start, or while no reviewer has yet submitted (no responses).
 * Any stage (including Self) may be disabled — chain must keep ≥1 stage.
 */
const TOGGLABLE: Array<{ key: AnnualReviewerRole; label: string }> = [
  { key: 'self',         label: 'Self Review' },
  { key: 'manager',      label: 'Manager Review' },
  { key: 'skip_manager', label: 'Skip Manager Review' },
  { key: 'dept_head',    label: 'Department Head Review' },
  { key: 'bu_head',      label: 'BU Head Review' },
  { key: 'hr',           label: 'HR Finalization' },
  { key: 'management',   label: 'Management Review' },
];

/** ADR-157 — reviewer-picker slots (non-Self). */
const REVIEWER_SLOTS: Array<{
  stage: AnnualReviewerRole;
  role: ReassignableReviewerRole;
  label: string;
  instanceKey: 'manager_id' | 'skip_id' | 'dept_head_id' | 'bu_head_id' | 'hr_id' | 'management_id';
}> = [
  { stage: 'manager',      role: 'manager',      label: 'Manager',         instanceKey: 'manager_id' },
  { stage: 'skip_manager', role: 'skip_manager', label: 'Skip Manager',    instanceKey: 'skip_id' },
  { stage: 'dept_head',    role: 'dept_head',    label: 'Department Head', instanceKey: 'dept_head_id' },
  { stage: 'bu_head',      role: 'bu_head',      label: 'BU Head',         instanceKey: 'bu_head_id' },
  { stage: 'hr',           role: 'hr',           label: 'HR',              instanceKey: 'hr_id' },
  { stage: 'management',   role: 'management',   label: 'Management',      instanceKey: 'management_id' },
];

export function ChangeWorkflowDialog({
  instance, onClose, onDone,
}: {
  instance: InstanceWithEmployee | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const current = enabledChain(instance?.enabled_stages);
  const [enabled, setEnabled] = useState<Set<AnnualReviewerRole>>(new Set(current));
  const [reason, setReason] = useState('');
  const [reviewerPicks, setReviewerPicks] = useState<Record<string, string | null>>({});

  useEffect(() => {
    setEnabled(new Set(enabledChain(instance?.enabled_stages)));
    setReason('');
    setReviewerPicks({});
  }, [instance?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasAny = enabled.size > 0;
  const next = hasAny ? enabledChain(Array.from(enabled)) : [];
  const isDirty = JSON.stringify(next) !== JSON.stringify(current);
  const selfDisabled = hasAny && !enabled.has('self');
  const firstStageLabel = next[0]
    ? ({ self: 'Self', manager: 'Manager', skip_manager: 'Skip Manager', dept_head: 'Department Head', bu_head: 'BU Head', hr: 'HR', management: 'Management' } as const)[next[0]]
    : '—';

  // Reviewer-slot changes vs current instance values.
  const reviewerChanges = useMemo(() => {
    if (!instance) return [] as Array<{ role: ReassignableReviewerRole; newReviewerId: string }>;
    const out: Array<{ role: ReassignableReviewerRole; newReviewerId: string }> = [];
    for (const slot of REVIEWER_SLOTS) {
      if (!enabled.has(slot.stage)) continue;
      const picked = reviewerPicks[slot.role];
      if (picked === undefined || picked === null) continue;
      const currentId = (instance[slot.instanceKey] as string | null) ?? null;
      if (picked && picked !== currentId) {
        out.push({ role: slot.role, newReviewerId: picked });
      }
    }
    return out;
  }, [instance, reviewerPicks, enabled]);

  const save = useMutation({
    mutationFn: async () => {
      if (!instance) throw new Error('No instance');
      if (isDirty) {
        await svc.setEnabledStages({
          instanceId: instance.id,
          enabledStages: next,
          reason: reason.trim(),
        });
      }
      for (const change of reviewerChanges) {
        await svc.reassignReviewer({
          instanceId: instance.id,
          role: change.role,
          newReviewerId: change.newReviewerId,
          reason: reason.trim(),
        });
      }
    },
    onSuccess: () => {
      const parts: string[] = [];
      if (isDirty) parts.push('workflow');
      if (reviewerChanges.length) parts.push(`${reviewerChanges.length} reviewer${reviewerChanges.length > 1 ? 's' : ''}`);
      toast.success(`Saved ${parts.join(' + ') || 'changes'}.`);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (key: AnnualReviewerRole) => {
    const ns = new Set(enabled);
    if (ns.has(key)) ns.delete(key); else ns.add(key);
    setEnabled(ns);
  };

  const hasReviewerChange = reviewerChanges.length > 0;
  const canSave = (isDirty || hasReviewerChange) && reason.trim().length >= 3 && hasAny;

  return (
    <AlertDialog open={!!instance} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Edit workflow &amp; reviewers</AlertDialogTitle>
          <AlertDialogDescription>
            Adjust the stages and/or the reviewer on each stage for{' '}
            <strong>{instance?.employee?.full_name ?? '—'}</strong> for this cycle only.
            At least one stage must remain. Reviewer changes are always audit-logged;
            stage changes are only permitted before the review is actioned.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-4">
          <div className="text-xs text-muted-foreground">
            Current chain: <span className="font-medium text-foreground">{describeChain(current)}</span>
          </div>
          <div className="rounded-md border p-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Stages</div>
            {TOGGLABLE.map((s) => (
              <label key={s.key} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={enabled.has(s.key)}
                  onCheckedChange={() => toggle(s.key)}
                  aria-label={s.label}
                />
                <span className="text-sm">{s.label}</span>
                {s.key === 'self' && (
                  <Badge variant="outline" className="ml-auto">Optional</Badge>
                )}
              </label>
            ))}
          </div>
          <div className="text-xs text-muted-foreground">
            New chain: <span className="font-medium text-foreground">{hasAny ? describeChain(next) : '— (at least one stage required)'}</span>
          </div>
          {selfDisabled && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Self Review is disabled — <strong>{instance?.employee?.full_name ?? 'the employee'}</strong> will
                not submit self ratings; the cycle starts at <strong>{firstStageLabel}</strong>.
              </span>
            </div>
          )}

          {/* ADR-157 — reviewer picker per enabled non-Self stage */}
          {instance && (
            <div className="rounded-md border p-3 space-y-3">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Reviewers (only for enabled stages)
              </div>
              {REVIEWER_SLOTS.filter((s) => enabled.has(s.stage)).map((slot) => {
                const currentId = (instance[slot.instanceKey] as string | null) ?? null;
                const pickedId = reviewerPicks[slot.role] ?? currentId;
                return (
                  <ReviewerSlotRow
                    key={slot.role}
                    label={slot.label}
                    role={slot.role}
                    valueId={pickedId ?? null}
                    onChange={(id) => setReviewerPicks((p) => ({ ...p, [slot.role]: id }))}
                  />
                );
              })}
              {REVIEWER_SLOTS.filter((s) => enabled.has(s.stage)).length === 0 && (
                <div className="text-xs text-muted-foreground">
                  Only Self Review is enabled — no reviewer to pick.
                </div>
              )}
            </div>
          )}

          <div className="space-y-1">
            <Label>Reason (min 3 chars)</Label>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why does this employee need a different workflow or reviewer?"
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); save.mutate(); }}
            disabled={!canSave || save.isPending}
          >
            {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ReviewerSlotRow({
  label, role, valueId, onChange,
}: {
  label: string;
  role: ReassignableReviewerRole;
  valueId: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: candidates = [], isLoading } = useReviewerCandidates(role);
  const selected = candidates.find((c) => c.id === valueId) ?? null;

  return (
    <div className="flex items-center gap-3">
      <div className="w-40 text-sm">{label}</div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-label={`${label} reviewer`}
            className={cn('flex-1 justify-between font-normal', !selected && 'text-muted-foreground')}
          >
            {selected
              ? `${selected.full_name}${selected.employee_code ? ` (${selected.employee_code})` : ''}`
              : isLoading ? 'Loading…' : 'Select reviewer…'}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[380px]" align="start">
          <Command>
            <CommandInput placeholder="Search name or employee code…" />
            <CommandList>
              <CommandEmpty>No eligible {label} users.</CommandEmpty>
              <CommandGroup>
                {candidates.map((c: ReviewerCandidate) => (
                  <CommandItem
                    key={c.id}
                    value={`${c.full_name} ${c.employee_code ?? ''}`}
                    onSelect={() => { onChange(c.id); setOpen(false); }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', valueId === c.id ? 'opacity-100' : 'opacity-0')} />
                    <span className="flex-1">{c.full_name}</span>
                    {c.employee_code && (
                      <span className="text-xs text-muted-foreground ml-2">{c.employee_code}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}