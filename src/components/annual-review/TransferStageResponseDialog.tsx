import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronsUpDown, Loader2, ArrowRight, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import * as svc from '@/services/annualReview/annualReviewService';
import type { InstanceWithEmployee, ReassignableReviewerRole } from '@/services/annualReview/annualReviewService';
import { useReviewerCandidates } from '@/hooks/annualReview/useReviewerCandidates';
import { cn } from '@/lib/utils';

/**
 * ADR-169 — Reusable "Transfer stage response" dialog.
 *
 * Moves an already-locked reviewer response on one stage to another stage on
 * the same instance (e.g. re-attribute a BU Head submission as the Dept Head
 * response when a BU Head is demoted). Optionally drops the source stage from
 * the workflow and installs a new reviewer on that stage slot so future
 * cycles / re-enables resolve correctly.
 *
 * Admin / HR PMS only. Every call is audit-logged and reversible.
 */
const ROLES: Array<{ key: ReassignableReviewerRole; label: string }> = [
  { key: 'manager',      label: 'Manager' },
  { key: 'skip_manager', label: 'Skip Manager' },
  { key: 'dept_head',    label: 'Department Head' },
  { key: 'bu_head',      label: 'BU Head' },
  { key: 'hr',           label: 'HR' },
  { key: 'management',   label: 'Management' },
];

export function TransferStageResponseDialog({
  instance, open, onClose, onDone,
}: {
  instance: InstanceWithEmployee | null;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [fromRole, setFromRole] = useState<ReassignableReviewerRole>('bu_head');
  const [toRole, setToRole]     = useState<ReassignableReviewerRole>('dept_head');
  const [drop, setDrop]         = useState(true);
  const [newRev, setNewRev]     = useState<string | null>(null);
  const [reason, setReason]     = useState('');

  const { data: candidates = [] } = useReviewerCandidates(fromRole);
  const picked = candidates.find((c) => c.id === newRev) ?? null;
  const [pickerOpen, setPickerOpen] = useState(false);

  const canSave = !!instance && fromRole !== toRole && reason.trim().length >= 3;

  const save = useMutation({
    mutationFn: async () => {
      if (!instance) throw new Error('No instance');
      await svc.transferAnnualReviewStage({
        instanceId: instance.id,
        fromRole,
        toRole,
        newReviewerIdForSourceSlot: newRev,
        dropFromStage: drop,
        reason: reason.trim(),
      });
    },
    onSuccess: () => {
      toast.success('Stage response transferred.');
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Transfer response to another stage</AlertDialogTitle>
          <AlertDialogDescription>
            Re-attribute the locked response for{' '}
            <strong>{instance?.employee?.full_name ?? '—'}</strong> from one reviewer stage to
            another. The score/comments payload is preserved; only the stage label — and
            optionally the source stage &amp; its reviewer slot — change.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              This is a governed admin action. It writes an audit row and can be reverted by
              an admin. Final score is not modified because the underlying response payload
              is unchanged — only re-labeled.
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
            <div className="space-y-1">
              <Label>From stage (source of locked response)</Label>
              <select
                className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                value={fromRole}
                onChange={(e) => setFromRole(e.target.value as ReassignableReviewerRole)}
              >
                {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </div>
            <ArrowRight className="h-4 w-4 mb-3 text-muted-foreground" />
            <div className="space-y-1">
              <Label>To stage (destination)</Label>
              <select
                className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                value={toRole}
                onChange={(e) => setToRole(e.target.value as ReassignableReviewerRole)}
              >
                {ROLES.filter((r) => r.key !== fromRole).map((r) => (
                  <option key={r.key} value={r.key}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={drop} onCheckedChange={(v) => setDrop(!!v)} />
            Drop the <strong className="mx-1">{fromRole}</strong> stage from this instance
            (recommended when the outgoing reviewer no longer holds that role).
          </label>

          <div className="space-y-1">
            <Label>New reviewer for the <strong>{fromRole}</strong> slot (optional)</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline" role="combobox"
                  className={cn('w-full justify-between font-normal', !picked && 'text-muted-foreground')}
                >
                  {picked ? `${picked.full_name}${picked.employee_code ? ` (${picked.employee_code})` : ''}` : 'Leave unchanged'}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[380px]" align="start">
                <Command>
                  <CommandInput placeholder="Search name or employee code…" />
                  <CommandList>
                    <CommandEmpty>No eligible users.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem value="__clear" onSelect={() => { setNewRev(null); setPickerOpen(false); }}>
                        <Check className={cn('mr-2 h-4 w-4', !newRev ? 'opacity-100' : 'opacity-0')} />
                        Leave unchanged
                      </CommandItem>
                      {candidates.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={`${c.full_name} ${c.employee_code ?? ''}`}
                          onSelect={() => { setNewRev(c.id); setPickerOpen(false); }}
                        >
                          <Check className={cn('mr-2 h-4 w-4', newRev === c.id ? 'opacity-100' : 'opacity-0')} />
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

          <div className="space-y-1">
            <Label>Reason (min 3 chars)</Label>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this response being transferred?"
            />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); save.mutate(); }}
            disabled={!canSave || save.isPending}
          >
            {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Transfer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}