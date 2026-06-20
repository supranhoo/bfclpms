import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useProfiles, useBusinessUnits } from '@/hooks/useOrganization';
import {
  getOrgHeadConfig, setHrDepartment, setHrHead, recalculateHrHead,
} from '@/services/orgHeads/orgHeadsService';
import { RefreshCw, Pencil, ShieldAlert } from 'lucide-react';

/** HR Finalization card. Picks the HR business unit and the HR head used
 * by the Annual Review HR Finalization stage. Extracted from the old
 * OrgHeadsTab so BU heads can live inline on the Business Units tab. */
export function HrFinalizationCard({ companyId }: { companyId: string | null }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: profiles } = useProfiles();
  const { data: businessUnits } = useBusinessUnits();

  const hrCfgQ = useQuery({
    queryKey: ['org-heads', 'hr', companyId ?? 'global'],
    queryFn: () => getOrgHeadConfig(companyId),
  });

  const profileById = useMemo(() => {
    const m = new Map<string, any>();
    (profiles ?? []).forEach((p: any) => m.set(p.id, p));
    return m;
  }, [profiles]);

  const [open, setOpen] = useState(false);
  const [pickUserId, setPickUserId] = useState('');
  const [pickReason, setPickReason] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Pool: all active employees company-wide. Cross-BU is allowed for HR
  // head too (consistent with BU head picker).
  const activeProfiles = useMemo(
    () => (profiles ?? [])
      .filter((p: any) => p.is_active !== false)
      .sort((a: any, b: any) => (a.full_name ?? '').localeCompare(b.full_name ?? '')),
    [profiles],
  );
  const filteredPool = useMemo(() => {
    const t = searchTerm.trim().toLowerCase();
    const base = t
      ? activeProfiles.filter((p: any) =>
          (p.full_name ?? '').toLowerCase().includes(t) ||
          (p.employee_code ?? '').toLowerCase().includes(t))
      : activeProfiles;
    return base.slice(0, 200);
  }, [activeProfiles, searchTerm]);

  const setHrDept = useMutation({
    mutationFn: (buId: string) => setHrDepartment(companyId, buId),
    onSuccess: () => {
      toast({ title: 'HR business unit set' });
      qc.invalidateQueries({ queryKey: ['org-heads', 'hr'] });
    },
    onError: (e: Error) => toast({ title: 'Update failed', description: e.message, variant: 'destructive' }),
  });

  const recalcHr = useMutation({
    mutationFn: () => recalculateHrHead(companyId),
    onSuccess: () => {
      toast({ title: 'HR head recalculated' });
      qc.invalidateQueries({ queryKey: ['org-heads', 'hr'] });
    },
    onError: (e: Error) => toast({ title: 'Recalculation failed', description: e.message, variant: 'destructive' }),
  });

  const saveHead = useMutation({
    mutationFn: () => setHrHead(companyId, pickUserId, pickReason.trim()),
    onSuccess: () => {
      toast({ title: 'HR head updated' });
      qc.invalidateQueries({ queryKey: ['org-heads', 'hr'] });
      setOpen(false);
      setPickUserId('');
      setPickReason('');
      setSearchTerm('');
    },
    onError: (e: Error) => toast({ title: 'Update failed', description: e.message, variant: 'destructive' }),
  });

  const canSave = !!pickUserId && pickReason.trim().length >= 3;

  const hrHeadProfile = hrCfgQ.data?.hr_head_user_id
    ? profileById.get(hrCfgQ.data.hr_head_user_id) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>HR Finalization</CardTitle>
        <CardDescription>
          The HR Head signs off the Annual Review at the HR Finalization stage. Pick the HR business
          unit and the system will derive the head from the top of that BU's reporting hierarchy.
          You can also override manually.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>HR Business Unit</Label>
            <Select
              value={hrCfgQ.data?.hr_business_unit_id ?? ''}
              onValueChange={(v) => setHrDept.mutate(v)}
            >
              <SelectTrigger><SelectValue placeholder="Select HR BU" /></SelectTrigger>
              <SelectContent>
                {(businessUnits ?? []).map((bu: any) => (
                  <SelectItem key={bu.id} value={bu.id}>{bu.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>HR Head</Label>
            <div className="flex items-center gap-2 h-10">
              {hrHeadProfile ? (
                <div>
                  <div className="font-medium">{hrHeadProfile.full_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {hrHeadProfile.employee_code ?? '—'}
                  </div>
                </div>
              ) : (
                <span className="text-muted-foreground inline-flex items-center gap-1 text-sm">
                  <ShieldAlert className="h-3.5 w-3.5" /> Not set
                </span>
              )}
              <Badge variant={hrCfgQ.data?.hr_head_source === 'manual' ? 'default' : 'secondary'}>
                {hrCfgQ.data?.hr_head_source === 'manual' ? 'Manual' : 'Auto'}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline" size="sm"
            disabled={!hrCfgQ.data?.hr_business_unit_id || recalcHr.isPending}
            onClick={() => recalcHr.mutate()}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Recalculate from HR hierarchy
          </Button>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Change HR head
          </Button>
        </div>
        {!hrCfgQ.data?.hr_business_unit_id && (
          <p className="text-xs text-muted-foreground">
            Select an HR Business Unit first so the system knows where to look for the HR head.
          </p>
        )}
      </CardContent>

      <AlertDialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change HR head</AlertDialogTitle>
            <AlertDialogDescription>
              Pick any active employee. The change is audit-logged and flips
              source to Manual until you recalculate from the HR hierarchy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Search</Label>
              <Input
                placeholder="Name or employee code"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>New HR head</Label>
              <Select value={pickUserId} onValueChange={setPickUserId}>
                <SelectTrigger><SelectValue placeholder="Pick someone" /></SelectTrigger>
                <SelectContent>
                  {filteredPool.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">No matches.</div>
                  )}
                  {filteredPool.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name} {p.employee_code ? `(${p.employee_code})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              disabled={!canSave || saveHead.isPending}
              onClick={(e) => { e.preventDefault(); saveHead.mutate(); }}
            >
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}