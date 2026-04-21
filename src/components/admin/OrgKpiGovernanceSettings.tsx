import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Layers } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const APP_SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

export function OrgKpiGovernanceSettings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['org-kpi-governance-flags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('enable_org_kpi_autopull, enable_org_kpi_auto_inherit, enable_org_kpi_forward_sync')
        .eq('id', APP_SETTINGS_ID)
        .maybeSingle();
      if (error) throw error;
      return data as {
        enable_org_kpi_autopull: boolean;
        enable_org_kpi_auto_inherit: boolean;
        enable_org_kpi_forward_sync: boolean;
      } | null;
    },
  });

  const [autopull, setAutopull] = useState(false);
  const [autoInherit, setAutoInherit] = useState(true);
  const [forwardSync, setForwardSync] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setAutopull(!!data.enable_org_kpi_autopull);
      setAutoInherit(!!data.enable_org_kpi_auto_inherit);
      setForwardSync(data.enable_org_kpi_forward_sync ?? true);
    }
  }, [data]);

  const updateFlag = async (
    field: 'enable_org_kpi_autopull' | 'enable_org_kpi_auto_inherit' | 'enable_org_kpi_forward_sync',
    value: boolean,
    setter: (v: boolean) => void,
  ) => {
    setSaving(field);
    const previous =
      field === 'enable_org_kpi_autopull' ? autopull
      : field === 'enable_org_kpi_auto_inherit' ? autoInherit
      : forwardSync;
    setter(value);
    try {
      const { error } = await supabase
        .from('app_settings')
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq('id', APP_SETTINGS_ID);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['org-kpi-governance-flags'] });
      toast({ title: 'Setting updated', description: `${field} → ${value ? 'ON' : 'OFF'}` });
    } catch (err: any) {
      setter(previous);
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5" />
          Org KPI Governance
        </CardTitle>
        <CardDescription>
          Controls automatic Org KPI inheritance and propagation behaviour for newly-created employee KPIs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-4 rounded-lg border">
          <div className="space-y-1 pr-4">
            <Label htmlFor="auto-inherit" className="text-base font-medium">
              Auto-Inherit Org KPI Status on KPI Creation
            </Label>
            <p className="text-sm text-muted-foreground">
              When ON, any new KPI matching an existing Org KPI signature (Category + KRA + KPI name in the same period) automatically becomes Org-level, inheriting scope and data ownership. Recommended.
            </p>
          </div>
          <Switch
            id="auto-inherit"
            checked={autoInherit}
            disabled={isLoading || saving === 'enable_org_kpi_auto_inherit'}
            onCheckedChange={(v) => updateFlag('enable_org_kpi_auto_inherit', v, setAutoInherit)}
          />
        </div>

        <div className="flex items-center justify-between p-4 rounded-lg border">
          <div className="space-y-1 pr-4">
            <Label htmlFor="auto-pull" className="text-base font-medium">
              Auto-Pull Propagated Org KPI Values
            </Label>
            <p className="text-sm text-muted-foreground">
              When ON, newly-created Org-level KPIs (e.g. mid-month joiners) are automatically pre-filled with the existing propagated achieved value and advanced from "KRA Set" to "Self Review".
            </p>
          </div>
          <Switch
            id="auto-pull"
            checked={autopull}
            disabled={isLoading || saving === 'enable_org_kpi_autopull'}
            onCheckedChange={(v) => updateFlag('enable_org_kpi_autopull', v, setAutopull)}
          />
        </div>

        <div className="flex items-center justify-between p-4 rounded-lg border">
          <div className="space-y-1 pr-4">
            <Label htmlFor="forward-sync" className="text-base font-medium">
              Auto Forward-Sync Org KPI Status
            </Label>
            <p className="text-sm text-muted-foreground">
              When ON, promoting or demoting a KPI to/from Org-level automatically cascades the change (and scope) to all matching KPIs in <strong>future open periods</strong>. Locked periods are skipped. Demotions also delete orphaned draft Org values in those future periods. Recommended.
            </p>
          </div>
          <Switch
            id="forward-sync"
            checked={forwardSync}
            disabled={isLoading || saving === 'enable_org_kpi_forward_sync'}
            onCheckedChange={(v) => updateFlag('enable_org_kpi_forward_sync', v, setForwardSync)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
