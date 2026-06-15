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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { TableSkeleton } from '@/components/ui/LoadingSkeletons';
import { useToast } from '@/hooks/use-toast';
import { useProfiles, useDepartments, useBusinessUnits } from '@/hooks/useOrganization';
import {
  listBuHeads, getOrgHeadConfig,
  setBuHead, recalculateBuHead,
  setHrDepartment, setHrHead, recalculateHrHead,
  type BuHeadRow,
} from '@/services/orgHeads/orgHeadsService';
import { RefreshCw, Pencil, ShieldAlert } from 'lucide-react';

/**
 * Org Heads admin tab.
 *
 * Surfaces the BU-head and HR-head mapping that drives the Annual Review
 * reviewer chain. Two sections:
 *   1. Business Unit heads (one row per BU, auto/manual badge, recalc + change).
 *   2. HR Finalization (single card per company — pick HR BU, pick HR head,
 *      recalc from top of HR BU hierarchy).
 */
export function OrgHeadsTab({ companyId }: { companyId: string | null }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: profiles } = useProfiles();
  const { data: departments } = useDepartments();
  const { data: businessUnits } = useBusinessUnits();

  const buHeadsQ = useQuery({ queryKey: ['org-heads', 'bus'], queryFn: listBuHeads });
  const hrCfgQ   = useQuery({
    queryKey: ['org-heads', 'hr', companyId ?? 'global'],
    queryFn: () => getOrgHeadConfig(companyId),
  });

  // employees-by-BU index (active only)
  const employeesByBu = useMemo(() => {
    const deptToBu = new Map<string, string>();
    (departments ?? []).forEach((d: any) => { if (d.business_unit_id) deptToBu.set(d.id, d.business_unit_id); });
    const idx = new Map<string, Array<{ id: string; full_name: string; employee_code: string | null }>>();
    (profiles ?? []).forEach((p: any) => {
      if (!p.is_active || !p.department_id) return;
      const buId = deptToBu.get(p.department_id);
      if (!buId) return;
      if (!idx.has(buId)) idx.set(buId, []);
      idx.get(buId)!.push({ id: p.id, full_name: p.full_name ?? p.id, employee_code: p.employee_code ?? null });
    });
    idx.forEach(list => list.sort((a, b) => a.full_name.localeCompare(b.full_name)));
    return idx;
  }, [profiles, departments]);

  const profileById = useMemo(() => {
    const m = new Map<string, any>();
    (profiles ?? []).forEach((p: any) => m.set(p.id, p));
    return m;
  }, [profiles]);

  // ---------- Change-head dialog ----------
  const [target, setTarget] = useState<{ kind: 'bu' | 'hr'; bu?: BuHeadRow } | null>(null);
  const [pickUserId, setPickUserId] = useState('');
  const [pickReason, setPickReason] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const openChange = (kind: 'bu' | 'hr', bu?: BuHeadRow) => {
    setTarget({ kind, bu });
    setPickUserId('');
    setPickReason('');
    setSearchTerm('');
  };

  const pickerBuId = target?.kind === 'bu' ? target.bu?.id : hrCfgQ.data?.hr_business_unit_id ?? null;
  const pickerPool = pickerBuId ? employeesByBu.get(pickerBuId) ?? [] : [];
  const filteredPool = useMemo(() => {
    const t = searchTerm.trim().toLowerCase();
    if (!t) return pickerPool.slice(0, 200);
    return pickerPool.filter(p =>
      (p.full_name ?? '').toLowerCase().includes(t) ||
      (p.employee_code ?? '').toLowerCase().includes(t),
    ).slice(0, 200);
  }, [pickerPool, searchTerm]);

  const saveHead = useMutation({
    mutationFn: async () => {
      if (!target) return;
      if (target.kind === 'bu' && target.bu) {
        await setBuHead(target.bu.id, pickUserId, pickReason.trim());
      } else {
        await setHrHead(companyId, pickUserId, pickReason.trim());
      }
    },
    onSuccess: () => {
      toast({ title: 'Head updated' });
      qc.invalidateQueries({ queryKey: ['org-heads'] });
      setTarget(null);
    },
    onError: (e: Error) => toast({ title: 'Update failed', description: e.message, variant: 'destructive' }),
  });

  const recalcBu = useMutation({
    mutationFn: async (buId: string) => recalculateBuHead(buId),
    onSuccess: () => {
      toast({ title: 'Recalculated from hierarchy' });
      qc.invalidateQueries({ queryKey: ['org-heads', 'bus'] });
    },
    onError: (e: Error) => toast({ title: 'Recalculation failed', description: e.message, variant: 'destructive' }),
  });

  const recalcHr = useMutation({
    mutationFn: async () => recalculateHrHead(companyId),
    onSuccess: () => {
      toast({ title: 'HR head recalculated' });
      qc.invalidateQueries({ queryKey: ['org-heads', 'hr'] });
    },
    onError: (e: Error) => toast({ title: 'Recalculation failed', description: e.message, variant: 'destructive' }),
  });

  const setHrDept = useMutation({
    mutationFn: async (buId: string) => setHrDepartment(companyId, buId),
    onSuccess: () => {
      toast({ title: 'HR business unit set' });
      qc.invalidateQueries({ queryKey: ['org-heads', 'hr'] });
    },
    onError: (e: Error) => toast({ title: 'Update failed', description: e.message, variant: 'destructive' }),
  });

  const canSavePick = pickUserId && pickReason.trim().length >= 3;

  const renderHeadCell = (row: { head_user_id: string | null; head_source: 'auto' | 'manual'; head_updated_at: string | null }) => {
    const p = row.head_user_id ? profileById.get(row.head_user_id) : null;
    return (
      <div className="flex items-center gap-2">
        <div>
          {p ? (
            <>
              <div className="font-medium">{p.full_name}</div>
              <div className="text-xs text-muted-foreground">{p.employee_code ?? '—'}</div>
            </>
          ) : (
            <span className="text-muted-foreground inline-flex items-center gap-1">
              <ShieldAlert className="h-3.5 w-3.5" /> Not set
            </span>
          )}
        </div>
        <Badge variant={row.head_source === 'manual' ? 'default' : 'secondary'} className="ml-2">
          {row.head_source === 'manual' ? 'Manual' : 'Auto'}
        </Badge>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* ---------------- BU Heads ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Business Unit Heads</CardTitle>
          <CardDescription>
            The BU Head is the person at the top of the reporting hierarchy inside that Business Unit
            and is used for the BU Head Review stage of the Annual Review workflow. Use <em>Recalculate</em>
            to re-derive from the hierarchy, or <em>Change</em> to override manually. All changes are audit-logged.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {buHeadsQ.isLoading ? (
            <TableSkeleton rows={5} columns={4} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business Unit</TableHead>
                  <TableHead>Head</TableHead>
                  <TableHead className="w-[120px]">Active employees</TableHead>
                  <TableHead className="w-[220px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(buHeadsQ.data ?? []).map(bu => (
                  <TableRow key={bu.id}>
                    <TableCell className="font-medium">
                      {bu.name}
                      {bu.code && <span className="ml-2 text-xs text-muted-foreground">({bu.code})</span>}
                    </TableCell>
                    <TableCell>{renderHeadCell(bu)}</TableCell>
                    <TableCell>{employeesByBu.get(bu.id)?.length ?? 0}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm" variant="outline" className="mr-2"
                        disabled={recalcBu.isPending && recalcBu.variables === bu.id}
                        onClick={() => recalcBu.mutate(bu.id)}
                      >
                        <RefreshCw className="h-3.5 w-3.5 mr-1" /> Recalculate
                      </Button>
                      <Button size="sm" variant="default" onClick={() => openChange('bu', bu)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Change
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ---------------- HR Finalization ---------------- */}
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
                {renderHeadCell({
                  head_user_id: hrCfgQ.data?.hr_head_user_id ?? null,
                  head_source: (hrCfgQ.data?.hr_head_source ?? 'auto') as 'auto' | 'manual',
                  head_updated_at: hrCfgQ.data?.hr_head_updated_at ?? null,
                })}
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
            <Button
              size="sm"
              disabled={!hrCfgQ.data?.hr_business_unit_id}
              onClick={() => openChange('hr')}
            >
              <Pencil className="h-3.5 w-3.5 mr-1" /> Change HR head
            </Button>
          </div>
          {!hrCfgQ.data?.hr_business_unit_id && (
            <p className="text-xs text-muted-foreground">
              Select an HR Business Unit first so the system knows where to look for the HR head.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ---------------- Change-head dialog ---------------- */}
      <AlertDialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {target?.kind === 'bu' ? `Change head of ${target.bu?.name}` : 'Change HR head'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              The selected person becomes the {target?.kind === 'bu' ? 'BU' : 'HR'} head. The change is
              audit-logged and marked as manual until you recalculate from the hierarchy again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Search</Label>
              <Input
                placeholder="Type a name or employee code"
                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Showing active employees in the selected business unit.
              </p>
            </div>
            <div className="space-y-1">
              <Label>New head</Label>
              <Select value={pickUserId} onValueChange={setPickUserId}>
                <SelectTrigger><SelectValue placeholder="Pick someone" /></SelectTrigger>
                <SelectContent>
                  {filteredPool.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">No matches.</div>
                  )}
                  {filteredPool.map(p => (
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
              disabled={!canSavePick || saveHead.isPending}
              onClick={(e) => { e.preventDefault(); saveHead.mutate(); }}
            >
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}