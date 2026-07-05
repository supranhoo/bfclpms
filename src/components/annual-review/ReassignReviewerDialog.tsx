import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useReassignReviewer } from '@/hooks/useAnnualReview';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { AnnualReviewInstance } from '@/types/annualReview';
import type { InstanceWithEmployee } from '@/services/annualReview/annualReviewService';

type Role = 'manager' | 'skip_manager' | 'bu_head' | 'hr';

/**
 * Mid-cycle reviewer reassignment. Writes an `annual_review_assignment_overrides`
 * row via the `reassign_annual_review_reviewer` RPC and updates the snapshotted
 * reviewer on the instance so queues update immediately.
 */
export function ReassignReviewerDialog({
  open,
  onOpenChange,
  instance,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  instance: InstanceWithEmployee | AnnualReviewInstance;
}) {
  const [role, setRole] = useState<Role>('manager');
  const [newReviewerId, setNewReviewerId] = useState<string>('');
  const [reason, setReason] = useState('');
  const [search, setSearch] = useState('');
  const reassign = useReassignReviewer();

  const currentReviewerId = {
    manager: instance.manager_id,
    skip_manager: instance.skip_id,
    bu_head: instance.bu_head_id,
    hr: instance.hr_id,
  }[role];

  const { data: people = [], isLoading } = useQuery({
    queryKey: ['annual-review-reassign-pool', search],
    queryFn: async () => {
      let q = supabase
        .from('profiles')
        .select('id, full_name, employee_code, designation')
        .eq('is_active', true)
        .order('full_name', { ascending: true })
        .limit(100);
      if (search.trim()) q = q.ilike('full_name', `%${search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
    staleTime: 30_000,
  });

  const { data: currentReviewer, isLoading: currentLoading } = useQuery({
    queryKey: ['annual-review-reassign-current', currentReviewerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, employee_code')
        .eq('id', currentReviewerId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: open && !!currentReviewerId,
    staleTime: 5 * 60_000,
  });

  const currentLabel = !currentReviewerId
    ? '— none —'
    : currentLoading
      ? 'Loading…'
      : currentReviewer
        ? `${currentReviewer.full_name ?? 'Unknown'}${currentReviewer.employee_code ? ` (${currentReviewer.employee_code})` : ''}`
        : '— unknown —';

  const filtered = useMemo(
    () => people.filter((p) => p.id !== instance.employee_id),
    [people, instance.employee_id],
  );

  const submit = async () => {
    try {
      await reassign.mutateAsync({
        instanceId: instance.id,
        role,
        newReviewerId,
        reason: reason.trim(),
      });
      toast.success('Reviewer reassigned.');
      onOpenChange(false);
      setRole('manager'); setNewReviewerId(''); setReason(''); setSearch('');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const canSubmit = !!newReviewerId && reason.trim().length >= 3 && newReviewerId !== currentReviewerId;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reassign reviewer</AlertDialogTitle>
          <AlertDialogDescription>
            Replaces the snapshotted reviewer for this instance. The override is
            audit-logged and takes precedence over the rule-engine resolution.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => { setRole(v as Role); setNewReviewerId(''); }}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="skip_manager">Skip manager</SelectItem>
                <SelectItem value="bu_head">BU head</SelectItem>
                <SelectItem value="hr">HR</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Current: <span className="font-medium text-foreground">{currentLabel}</span>
            </p>
          </div>

          <div className="space-y-1">
            <Label>Search employee</Label>
            <Input
              placeholder="Type a name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>New reviewer</Label>
            <Select value={newReviewerId} onValueChange={setNewReviewerId}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder={isLoading ? 'Loading…' : 'Pick someone'} />
              </SelectTrigger>
              <SelectContent>
                {filtered.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name ?? p.id} {p.employee_code ? `(${p.employee_code})` : ''}
                  </SelectItem>
                ))}
                {filtered.length === 0 && (
                  <div className="p-2 text-xs text-muted-foreground">No matches.</div>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Reason (required, min 3 chars)</Label>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Manager on leave; delegating to acting manager"
            />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canSubmit || reassign.isPending}
            onClick={(e) => { e.preventDefault(); submit(); }}
          >
            {reassign.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Reassign
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}