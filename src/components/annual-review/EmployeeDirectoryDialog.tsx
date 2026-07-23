import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Users, Loader2, UserPlus, ArrowRight, X } from 'lucide-react';
import { toast } from 'sonner';
import { useEmployeeDirectorySearch } from '@/hooks/annualReview/useEmployeeDirectorySearch';
import { createOrGetAnnualReviewInstance, type DirectoryEmployee } from '@/services/annualReview/employeeDirectory';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cycleId: string | undefined;
  cycleName?: string;
  /** Called once we have a definite instance id to focus on. */
  onSelectInstance: (instanceId: string, opts: { autoOpenAssisted: boolean }) => void;
}

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function StatusPill({ row }: { row: DirectoryEmployee }) {
  if (row.in_my_queue) {
    return <Badge variant="secondary" className="text-[10px]">In your queue</Badge>;
  }
  if (row.instance_id) {
    return <Badge variant="outline" className="text-[10px]">Has instance</Badge>;
  }
  return <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-600 dark:text-amber-400">No instance yet</Badge>;
}

function AssistedHint({ row }: { row: DirectoryEmployee }) {
  // Employee will land in assisted-mode if no login
  const assisted = !(row.has_email && row.has_signed_in);
  if (!assisted) return null;
  if (row.can_assist_this_employee === false) {
    return (
      <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1" title="You don't have permission to assist this employee">
        <UserPlus className="h-3 w-3" /> Assist not allowed
      </span>
    );
  }
  return (
    <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
      <UserPlus className="h-3 w-3" /> Assisted
    </span>
  );
}

export function EmployeeDirectoryDialog({ open, onOpenChange, cycleId, cycleName, onSelectInstance }: Props) {
  const [input, setInput] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Debounce input -> submittedQuery (250ms) but only after first character.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setSubmittedQuery(input.trim()), 250);
    return () => clearTimeout(t);
  }, [input, open]);

  // Reset on close
  useEffect(() => {
    if (!open) { setInput(''); setSubmittedQuery(''); setPendingId(null); }
  }, [open]);

  const { data: results = [], isFetching, error } = useEmployeeDirectorySearch({
    query: submittedQuery,
    cycleId,
    enabled: open,
    limit: 50,
  });

  const isEmpty = !isFetching && results.length === 0;

  const handleSelect = async (row: DirectoryEmployee) => {
    if (!cycleId) return;
    const assisted = !(row.has_email && row.has_signed_in);
    if (assisted && row.can_assist_this_employee === false) {
      toast.error("You don't have permission to assist this employee's self-review.");
      return;
    }
    setPendingId(row.employee_id);
    try {
      let instanceId = row.instance_id;
      let created = false;
      if (!instanceId) {
        const res = await createOrGetAnnualReviewInstance(row.employee_id, cycleId);
        instanceId = res.instanceId;
        created = res.wasCreated;
      }
      onSelectInstance(instanceId!, { autoOpenAssisted: assisted });
      onOpenChange(false);
      if (created) toast.success('Annual review created — opening now.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Search className="h-5 w-5" /> Find employee
          </DialogTitle>
          <DialogDescription>
            Search across all active employees{cycleName ? ` for ${cycleName}` : ''} and start their annual review.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-3 border-b bg-muted/30 sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') setSubmittedQuery(input.trim()); }}
                placeholder="Name or employee code…"
                className="pl-9 h-10"
                aria-label="Search active employees"
              />
              {input && (
                <button
                  type="button"
                  onClick={() => setInput('')}
                  aria-label="Clear"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button onClick={() => setSubmittedQuery(input.trim())} className="h-10 gap-1.5">
              <Search className="h-4 w-4" /> Search
            </Button>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto" aria-live="polite">
          {error && (
            <div className="p-6 text-sm text-destructive">{(error as Error).message}</div>
          )}

          {isFetching && results.length === 0 && (
            <ul className="p-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className="flex items-center gap-3 p-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-2 w-1/2" />
                  </div>
                  <Skeleton className="h-8 w-24" />
                </li>
              ))}
            </ul>
          )}

          {!isFetching && !error && results.length === 0 && (
            <div className="p-10 text-center text-sm text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
              {submittedQuery
                ? <p>No active employee matches <span className="font-medium text-foreground">"{submittedQuery}"</span>.</p>
                : <p>Start typing a name or employee code, then press Enter or click <span className="font-medium text-foreground">Search</span>.</p>}
            </div>
          )}

          {results.length > 0 && (
            <ul className="divide-y">
              {results.map((row) => {
                const busy = pendingId === row.employee_id;
                const assisted = !(row.has_email && row.has_signed_in);
                const assistBlocked = assisted && row.can_assist_this_employee === false;
                return (
                  <li key={row.employee_id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                    <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                      {initials(row.full_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm truncate">{row.full_name ?? '—'}</p>
                        <StatusPill row={row} />
                        <AssistedHint row={row} />
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {row.employee_code ?? '—'} · {row.designation ?? '—'}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={row.instance_id ? 'outline' : 'default'}
                      disabled={busy || assistBlocked}
                      title={assistBlocked ? "You don't have permission to assist this employee." : undefined}
                      onClick={() => handleSelect(row)}
                      className="shrink-0 gap-1.5"
                    >
                      {busy
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : row.instance_id
                          ? <>Open <ArrowRight className="h-3.5 w-3.5" /></>
                          : <><UserPlus className="h-3.5 w-3.5" /> Start review</>}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter className="px-6 py-3 border-t bg-muted/30 text-xs text-muted-foreground">
          Showing {results.length} {results.length === 1 ? 'result' : 'results'}
          {results.length >= 50 ? ' (refine your search to see more)' : ''}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}