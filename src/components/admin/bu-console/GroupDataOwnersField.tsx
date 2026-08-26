/**
 * ADR-322 — pick the people who may enter this org-level KPI's value, from the
 * same dialog that sets its scope.
 *
 * Ownership is period-agnostic (category + KRA + KPI name), so it is written
 * immediately and is deliberately NOT part of the monthly "Apply to" change
 * set — see POLICY §KPI-SCOPE-SINGLE-VOCABULARY.
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

interface Props {
  categoryId: string;
  kraName: string;
  kpiName: string;
}

export function GroupDataOwnersField({ categoryId, kraName, kpiName }: Props) {
  const [pick, setPick] = useState('none');
  const ready = !!categoryId && !!kraName && !!kpiName;

  const { data: owners, isLoading } = useOrgKpiOwners(categoryId, kraName, kpiName);
  const { data: profileData } = useProfiles({ enabled: ready });
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

  if (!ready) return null;

  return (
    <div className="space-y-1.5 min-w-0">
      <Label className="text-xs">Data entry owners</Label>
      <p className="text-[11px] text-muted-foreground">
        Only these people (and admins) can enter the central value for this KPI. Saved immediately —
        not part of the monthly apply.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        {(owners ?? []).map((o) => (
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
        {!isLoading && (owners ?? []).length === 0 && (
          <span className="text-[11px] text-muted-foreground">No owner yet — admins only.</span>
        )}
      </div>

      <ManagerCombobox
        value={pick}
        onValueChange={(v) => {
          setPick('none');
          if (!v || v === 'none') return;
          assign.mutate({ categoryId, kraName, kpiName, ownerId: v });
        }}
        profiles={people}
        placeholder="Add a data entry owner…"
        showNone={false}
      />
    </div>
  );
}
