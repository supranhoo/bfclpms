import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  setBuHead, recalculateBuHead,
  setDepartmentHead, recalculateDepartmentHead,
  type BuHeadRow,
} from '@/services/orgHeads/orgHeadsService';
import { resyncAnnualReviewDeptHead } from '@/services/annualReview/resyncDeptHead';
import { useActiveCycle } from '@/hooks/useAnnualReview';
import { RefreshCw, Pencil, ShieldAlert, Check, ChevronsUpDown, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Profile shape used for the picker. Kept loose so callers can pass
 * whatever shape `useProfiles()` returns. */
export interface PickerProfile {
  id: string;
  full_name: string | null;
  employee_code: string | null;
  is_active: boolean | null;
  department_id: string | null;
}

export type OrgHeadScope = 'bu' | 'department';

export interface OrgHeadColumnProps {
  /** Scope decides which RPCs are called and which query key to invalidate. */
  scope: OrgHeadScope;
  /** The entity (BU or Department) identity for mutations + dialog title. */
  entity: { id: string; name: string };
  head: Pick<BuHeadRow, 'head_user_id' | 'head_source'> | undefined;
  profiles: PickerProfile[];
  deptIndex: Map<string, { name: string; business_unit_id: string | null }>;
  buIndex: Map<string, string>;
}

/** Inline cell + actions used by both the Business Units and Departments
 * tabs. Owns its own change-head dialog so callers only render it once per
 * row. The scope prop chooses between the BU and Department RPC pipelines.
 */
export function OrgHeadColumn({ scope, entity, head, profiles, deptIndex, buIndex }: OrgHeadColumnProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pickUserId, setPickUserId] = useState('');
  const [pickReason, setPickReason] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const queryKey = scope === 'bu' ? ['org-heads', 'bus'] : ['org-heads', 'departments'];
  const scopeLabel = scope === 'bu' ? 'BU' : 'Department';
  const recalcFn = scope === 'bu' ? recalculateBuHead : recalculateDepartmentHead;
  const setFn = scope === 'bu' ? setBuHead : setDepartmentHead;
  const activeCycle = useActiveCycle();
  const [resyncOpen, setResyncOpen] = useState(false);

  const profileById = useMemo(() => {
    const m = new Map<string, PickerProfile>();
    profiles.forEach(p => m.set(p.id, p));
    return m;
  }, [profiles]);

  const activeProfiles = useMemo(
    () => profiles
      .filter(p => p.is_active !== false)
      .sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '')),
    [profiles],
  );

  const filteredPool = useMemo(() => {
    const t = searchTerm.trim().toLowerCase();
    const base = t
      ? activeProfiles.filter(p =>
          (p.full_name ?? '').toLowerCase().includes(t) ||
          (p.employee_code ?? '').toLowerCase().includes(t))
      : activeProfiles;
    return base.slice(0, 200);
  }, [activeProfiles, searchTerm]);

  const headProfile = head?.head_user_id ? profileById.get(head.head_user_id) ?? null : null;

  const recalc = useMutation({
    mutationFn: () => recalcFn(entity.id),
    onSuccess: () => {
      toast({ title: 'Recalculated from hierarchy' });
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast({ title: 'Recalculation failed', description: e.message, variant: 'destructive' }),
  });

  const save = useMutation({
    mutationFn: () => setFn(entity.id, pickUserId, pickReason.trim()),
    onSuccess: () => {
      toast({ title: 'Head updated' });
      qc.invalidateQueries({ queryKey });
      setOpen(false);
      setPickUserId('');
      setPickReason('');
      setSearchTerm('');
      setPickerOpen(false);
    },
    onError: (e: Error) => toast({ title: 'Update failed', description: e.message, variant: 'destructive' }),
  });

  const resync = useMutation({
    mutationFn: () => {
      if (!activeCycle.data?.id) throw new Error('No active Annual Review cycle');
      return resyncAnnualReviewDeptHead(activeCycle.data.id, entity.id);
    },
    onSuccess: (r) => {
      toast({
        title: 'Annual reviews re-synced',
        description: `${r.updated} updated · ${r.skipped} skipped (already past Dept Head stage).`,
      });
      qc.invalidateQueries({ queryKey: ['annual-review'] });
      setResyncOpen(false);
    },
    onError: (e: Error) => toast({ title: 'Re-sync failed', description: e.message, variant: 'destructive' }),
  });

  const canSave = !!pickUserId && pickReason.trim().length >= 3;

  const contextFor = (p: PickerProfile) => {
    const dept = p.department_id ? deptIndex.get(p.department_id) : undefined;
    const buName = dept?.business_unit_id ? buIndex.get(dept.business_unit_id) : undefined;
    const parts = [dept?.name, buName].filter(Boolean);
    return parts.length ? ` — ${parts.join(' · ')}` : '';
  };

  const selectedProfile = pickUserId ? profileById.get(pickUserId) : null;

  return (
    <div className="flex items-center justify-between gap-2 min-w-[220px]">
      <div className="min-w-0">
        {headProfile ? (
          <>
            <div className="font-medium truncate">{headProfile.full_name}</div>
            <div className="text-xs text-muted-foreground truncate">
              {headProfile.employee_code ?? '—'}
            </div>
          </>
        ) : (
          <span className="text-muted-foreground inline-flex items-center gap-1 text-sm">
            <ShieldAlert className="h-3.5 w-3.5" /> Not set
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Badge variant={head?.head_source === 'manual' ? 'default' : 'secondary'}>
          {head?.head_source === 'manual' ? 'Manual' : 'Auto'}
        </Badge>
        <Button
          variant="ghost" size="icon" className="h-7 w-7"
          title="Recalculate from hierarchy"
          disabled={recalc.isPending}
          onClick={() => recalc.mutate()}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost" size="icon" className="h-7 w-7"
          title="Change head"
          onClick={() => setOpen(true)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        {scope === 'department' && (
          <Button
            variant="ghost" size="icon" className="h-7 w-7"
            title="Re-sync open Annual Reviews with this head"
            disabled={!activeCycle.data?.id || !head?.head_user_id}
            onClick={() => setResyncOpen(true)}
          >
            <Users className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <AlertDialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change head of {entity.name}</AlertDialogTitle>
            <AlertDialogDescription>
              The selected person becomes the {scopeLabel} head. Pick any active
              employee (cross-{scopeLabel} allowed for matrix structures). The
              change is audit-logged and marked Manual until you recalculate
              from the hierarchy again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>New head</Label>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={pickerOpen}
                    className="w-full justify-between font-normal"
                  >
                    <span className="truncate">
                      {selectedProfile
                        ? `${selectedProfile.full_name}${selectedProfile.employee_code ? ` (${selectedProfile.employee_code})` : ''}`
                        : 'Pick someone'}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search name or employee code…"
                      value={searchTerm}
                      onValueChange={setSearchTerm}
                    />
                    <CommandList>
                      <CommandEmpty>No employees found.</CommandEmpty>
                      <CommandGroup>
                        {filteredPool.map(p => (
                          <CommandItem
                            key={p.id}
                            value={p.id}
                            onSelect={() => {
                              setPickUserId(p.id);
                              setPickerOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                pickUserId === p.id ? 'opacity-100' : 'opacity-0',
                              )}
                            />
                            <span className="truncate">
                              {p.full_name}
                              {p.employee_code ? ` (${p.employee_code})` : ''}
                              <span className="text-muted-foreground">{contextFor(p)}</span>
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <p className="text-[11px] text-muted-foreground">
                Showing active employees across the company. Tip: usually the {scopeLabel}'s own top manager.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Reason (min 3 chars)</Label>
              <Textarea
                rows={3} value={pickReason}
                onChange={(e) => setPickReason(e.target.value)}
                placeholder="Why is this manual override required?"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!canSave || save.isPending}
              onClick={(e) => { e.preventDefault(); save.mutate(); }}
            >
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {scope === 'department' && (
        <AlertDialog open={resyncOpen} onOpenChange={(o) => !o && setResyncOpen(false)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Re-sync Annual Reviews for {entity.name}</AlertDialogTitle>
              <AlertDialogDescription>
                Push the current Department Head onto all open Annual Review
                instances in <strong>{activeCycle.data?.name ?? 'the active cycle'}</strong>.
                Instances already actioned by the previous Dept Head (i.e.
                past Dept Head stage) or already finalized are left untouched
                and reported as "skipped".
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={resync.isPending}
                onClick={(e) => { e.preventDefault(); resync.mutate(); }}
              >
                Re-sync now
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

/** Back-compat wrapper for the existing Business Units tab caller. */
export interface BuHeadColumnProps extends Omit<OrgHeadColumnProps, 'scope' | 'entity'> {
  bu: { id: string; name: string };
}
export function BuHeadColumn({ bu, ...rest }: BuHeadColumnProps) {
  return <OrgHeadColumn scope="bu" entity={bu} {...rest} />;
}
