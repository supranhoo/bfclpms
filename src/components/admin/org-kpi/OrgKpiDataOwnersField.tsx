/**
 * ADR-335 — single owner-picker used by both the Performance Console group
 * editor and the Admin KPI create/edit forms.
 *
 * mode="immediate": the KPI exists, picks are written straight away.
 * mode="pending":   the KPI does not exist yet, picks are held by the parent
 *                   and flushed after a successful save.
 */
import { useMemo, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X, Loader2 } from 'lucide-react';
import { ManagerCombobox } from '@/components/admin/ManagerCombobox';
import { useProfiles } from '@/hooks/useOrganization';
import {
  useOrgKpiOwners, useAssignOrgKpiOwner, useRemoveOrgKpiOwner,
} from '@/hooks/useOrgKpiDataOwner';
import {
  PendingOwner, addPendingOwner, removePendingOwner, isOwnerKeyReady,
} from './ownerAssignmentModel';

interface BaseProps {
  categoryId: string;
  kraName: string;
  kpiName: string;
  /** Hide the whole block until the ownership key is complete (default true). */
  requireKey?: boolean;
}

type Props =
  | (BaseProps & { mode?: 'immediate'; pending?: never; onPendingChange?: never })
  | (BaseProps & { mode: 'pending'; pending: PendingOwner[]; onPendingChange: (next: PendingOwner[]) => void });

export function OrgKpiDataOwnersField(props: Props) {
  const { categoryId, kraName, kpiName, requireKey = true } = props;
  const pendingMode = props.mode === 'pending';
  const [pick, setPick] = useState('none');
  const ready = isOwnerKeyReady({ categoryId, kraName, kpiName });

  const { data: owners, isLoading } = useOrgKpiOwners(categoryId, kraName, kpiName);
  const { data: profileData } = useProfiles({ enabled: true });
  const assign = useAssignOrgKpiOwner();
  const remove = useRemoveOrgKpiOwner();

  const people = useMemo(() => {
    const rows: any[] = (profileData as any)?.profiles ?? (profileData as any) ?? [];
    return (Array.isArray(rows) ? rows : [])
      .filter((p: any) => p?.is_active !== false)
      .map((p: any) => ({
        id: p.id,
        full_name: p.full_name ?? null,
        employee_code: p.employee_code ?? null,
      }));
  }, [profileData]);

  if (requireKey && !ready && !pendingMode) return null;

  const pendingList = pendingMode ? props.pending : [];
  const disabled = !pendingMode && !ready;

  const handlePick = (v: string) => {
    setPick('none');
    if (!v || v === 'none') return;
    if (pendingMode) {
      const person = people.find((p) => p.id === v);
      props.onPendingChange(
        addPendingOwner(props.pending, { id: v, label: person?.full_name || 'Unknown' }),
      );
      return;
    }
    assign.mutate({ categoryId, kraName, kpiName, ownerId: v });
  };

  return (
    <div className="space-y-1.5 min-w-0">
      <Label className="text-xs">Data entry owners</Label>
      <p className="text-[11px] text-muted-foreground">
        Only these people (and admins) can enter the central value for this KPI.
        {pendingMode
          ? ' Attached once the KPI is created.'
          : ' Saved immediately — not part of the monthly apply.'}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {isLoading && !pendingMode && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}

        {!pendingMode && (owners ?? []).map((o) => (
          <Badge key={o.id} variant="secondary" className="gap-1 break-all">
            {o.owner?.full_name || o.owner?.email || 'Unknown'}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-4 w-4"
              aria-label={`Remove ${o.owner?.full_name ?? 'owner'}`}
              disabled={remove.isPending}
              onClick={() => remove.mutate(o.id)}
            >
              <X className="h-3 w-3" />
            </Button>
          </Badge>
        ))}

        {pendingMode && pendingList.map((o) => (
          <Badge key={o.id} variant="secondary" className="gap-1 break-all">
            {o.label}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-4 w-4"
              aria-label={`Remove ${o.label}`}
              onClick={() => props.onPendingChange(removePendingOwner(props.pending, o.id))}
            >
              <X className="h-3 w-3" />
            </Button>
          </Badge>
        ))}

        {!pendingMode && !isLoading && (owners ?? []).length === 0 && (
          <span className="text-[11px] text-muted-foreground">No owner yet — admins only.</span>
        )}
        {pendingMode && pendingList.length === 0 && (
          <span className="text-[11px] text-muted-foreground">No owner yet — admins only.</span>
        )}
      </div>

      <ManagerCombobox
        value={pick}
        onValueChange={handlePick}
        profiles={people}
        placeholder={disabled ? 'Pick category, KRA and KPI first…' : 'Add a data entry owner…'}
        showNone={false}
        disabled={disabled}
      />
    </div>
  );
}
