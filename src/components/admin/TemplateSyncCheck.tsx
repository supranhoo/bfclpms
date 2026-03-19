import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { usePropagateTemplateChange, KpiTemplate } from '@/hooks/useKpiTemplates';
import { TemplatePropagationPreview } from './TemplatePropagationPreview';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { RefreshCw, Loader2, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

const STRUCTURAL_FIELDS = [
  'target_value', 'weightage', 'uom', 'criteria', 'source_of_data',
  'frequency', 'uom_type', 'qualitative_options', 'threshold_mode',
  'kra_name', 'kpi_name', 'r5', 'r4', 'r3', 'r2', 'r1', 'r0',
  'require_resubmit_reason',
] as const;

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = [currentYear - 1, currentYear, currentYear + 1];

interface TemplateSyncCheckProps {
  template: KpiTemplate;
}

interface Mismatch {
  field: string;
  templateValue: any;
  kpiValue: any;
}

export function TemplateSyncCheck({ template }: TemplateSyncCheckProps) {
  const [checking, setChecking] = useState(false);
  const [mismatches, setMismatches] = useState<Mismatch[] | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [effectiveMonth, setEffectiveMonth] = useState(() => MONTH_NAMES[new Date().getMonth()]);
  const [effectiveYear, setEffectiveYear] = useState(() => currentYear);
  const { toast } = useToast();
  const propagate = usePropagateTemplateChange();

  const checkSync = async () => {
    setChecking(true);
    setMismatches(null);
    setPreviewData(null);
    try {
      // Get a sample linked KPI
      const { data: sampleKpis, error } = await supabase
        .from('kpis')
        .select('*')
        .eq('source_template_id', template.id)
        .neq('status', 'approved')
        .limit(1);

      if (error) throw error;
      if (!sampleKpis || sampleKpis.length === 0) {
        setMismatches([]);
        toast({ title: 'No linked KPIs found to compare against.' });
        setChecking(false);
        return;
      }

      const kpi = sampleKpis[0] as any;
      const found: Mismatch[] = [];

      for (const field of STRUCTURAL_FIELDS) {
        const tVal = (template as any)[field] ?? null;
        const kVal = kpi[field] ?? null;

        // JSON comparison for objects
        if (typeof tVal === 'object' || typeof kVal === 'object') {
          if (JSON.stringify(tVal) !== JSON.stringify(kVal)) {
            found.push({ field, templateValue: tVal, kpiValue: kVal });
          }
        } else if (String(tVal) !== String(kVal)) {
          found.push({ field, templateValue: tVal, kpiValue: kVal });
        }
      }

      setMismatches(found);
    } catch (err: any) {
      toast({ title: 'Sync check failed', description: err.message, variant: 'destructive' });
    }
    setChecking(false);
  };

  const handleSyncPreview = async () => {
    if (!mismatches || mismatches.length === 0) return;

    const fieldsChanged: Record<string, { old: any; new: any }> = {};
    for (const m of mismatches) {
      // Push template value TO the KPIs (old = kpi value, new = template value)
      fieldsChanged[m.field] = { old: m.kpiValue, new: m.templateValue };
    }

    try {
      const result = await propagate.mutateAsync({
        template_id: template.id,
        fields_changed: fieldsChanged,
        effective_month: effectiveMonth,
        effective_year: effectiveYear,
        dry_run: true,
      });
      setPreviewData(result);
      setShowConfirm(true);
    } catch (err: any) {
      toast({ title: 'Preview failed', description: err.message, variant: 'destructive' });
    }
  };

  const handleSync = async () => {
    if (!mismatches || mismatches.length === 0) return;
    setSyncing(true);

    const fieldsChanged: Record<string, { old: any; new: any }> = {};
    for (const m of mismatches) {
      fieldsChanged[m.field] = { old: m.kpiValue, new: m.templateValue };
    }

    try {
      await propagate.mutateAsync({
        template_id: template.id,
        fields_changed: fieldsChanged,
        effective_month: effectiveMonth,
        effective_year: effectiveYear,
        dry_run: false,
      });
      setMismatches(null);
      setPreviewData(null);
    } catch (err: any) {
      toast({ title: 'Sync failed', description: err.message, variant: 'destructive' });
    }
    setSyncing(false);
    setShowConfirm(false);
  };

  const fmt = (v: any) => v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={checkSync}
          disabled={checking}
        >
          {checking ? (
            <><Loader2 className="h-3 w-3 animate-spin mr-1" />Checking...</>
          ) : (
            <><RefreshCw className="h-3 w-3 mr-1" />Check Template-KPI Sync</>
          )}
        </Button>
      </div>

      {mismatches !== null && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            {mismatches.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle className="h-4 w-4 text-green-600" />
                Template and linked KPIs are in sync.
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <span className="font-medium">{mismatches.length} field{mismatches.length !== 1 ? 's' : ''} out of sync</span>
                </div>
                <div className="space-y-1">
                  {mismatches.map(m => (
                    <div key={m.field} className="text-xs flex items-center gap-1 flex-wrap">
                      <Badge variant="outline" className="text-xs capitalize">{m.field.replace(/_/g, ' ')}</Badge>
                      <span className="text-muted-foreground">KPI: {fmt(m.kpiValue)}</span>
                      <ArrowRight className="h-3 w-3 shrink-0" />
                      <span className="font-medium">Template: {fmt(m.templateValue)}</span>
                    </div>
                  ))}
                </div>

                {/* Effective month for sync */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Effective From</Label>
                    <Select value={effectiveMonth} onValueChange={setEffectiveMonth}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MONTH_NAMES.map(m => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Year</Label>
                    <Select value={String(effectiveYear)} onValueChange={v => setEffectiveYear(Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {YEAR_OPTIONS.map(y => (
                          <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  size="sm"
                  onClick={handleSyncPreview}
                  disabled={propagate.isPending}
                >
                  {propagate.isPending ? (
                    <><Loader2 className="h-3 w-3 animate-spin mr-1" />Previewing...</>
                  ) : 'Sync All Fields to KPIs'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Full Sync</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>This will push all template values to linked KPIs, overwriting any per-employee customizations for these fields.</p>
                {previewData && (
                  <TemplatePropagationPreview data={previewData} isLoading={false} />
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSync} disabled={syncing}>
              {syncing ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Syncing...</> : 'Sync Now'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
