import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, BookOpen, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getTniThreshold, setTniThreshold, parseTniThreshold, DEFAULT_TNI_THRESHOLD } from '@/lib/pmsSettings';
import { getPipPolicySettings, PIP_POLICY_KEYS, DEFAULT_PIP_POLICY } from '@/lib/pip/pipPolicySettings';
import { supabase } from '@/integrations/supabase/client';

/**
 * ADR-252 — admin controls for the two continuity parameters (Zero-Hardcoding):
 *  - TNI threshold (KPI score at or below this in every scored month)
 *  - PIP consecutive months (default window + minimum scored months)
 */
export function TniThresholdCard() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({ queryKey: ['tni-threshold'], queryFn: getTniThreshold });
  const { data: policy } = useQuery({ queryKey: ['pip-policy-settings'], queryFn: getPipPolicySettings });

  const [draft, setDraft] = useState('');
  const [monthsDraft, setMonthsDraft] = useState('');

  useEffect(() => { if (data != null) setDraft(String(data)); }, [data]);
  useEffect(() => { if (policy?.consecutiveMonths != null) setMonthsDraft(String(policy.consecutiveMonths)); }, [policy?.consecutiveMonths]);

  const parsed = parseTniThreshold(draft);
  const monthsParsed = Math.min(24, Math.max(1, Math.round(Number(monthsDraft) || DEFAULT_PIP_POLICY.consecutiveMonths)));
  const invalid = draft.trim() !== '' && !Number.isFinite(Number(draft));
  const monthsInvalid = monthsDraft.trim() !== '' && !Number.isFinite(Number(monthsDraft));
  const hasChanges =
    (data != null && parsed !== data) ||
    (policy != null && monthsParsed !== policy.consecutiveMonths);

  const save = useMutation({
    mutationFn: async () => {
      await setTniThreshold(parsed);
      const { error } = await supabase
        .from('system_settings')
        .upsert(
          { setting_key: PIP_POLICY_KEYS.consecutiveMonths, setting_value: monthsParsed as unknown as never },
          { onConflict: 'setting_key' },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tni-threshold'] });
      qc.invalidateQueries({ queryKey: ['pip-policy-settings'] });
      qc.invalidateQueries({ queryKey: ['tni-qualified-kpis'] });
      toast({
        title: 'TNI / PIP continuity settings saved',
        description: `Threshold ${parsed.toFixed(2)} · minimum ${monthsParsed} scored month(s)`,
      });
    },
    onError: (e: Error) => toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          TNI Threshold & Continuity Window
        </CardTitle>
        <CardDescription>
          A KPI is reported as a training need only when its score is <span className="font-medium">at or below</span>{' '}
          this value in <span className="font-medium">every scored month</span> of the selected range. Unscored months
          are skipped. Default is {DEFAULT_TNI_THRESHOLD.toFixed(2)} on a 0–5 scale. The continuity window also sets the
          minimum number of scored months required before a PIP candidate can be flagged.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 max-w-xl">
          <div>
            <Label htmlFor="tni-threshold" className="text-xs font-medium text-muted-foreground">
              TNI threshold (0.00 – 5.00)
            </Label>
            <Input
              id="tni-threshold" type="number" min={0} max={5} step={0.05}
              value={draft} onChange={e => setDraft(e.target.value)} disabled={isLoading} className="mt-1"
            />
            {invalid && (
              <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                <AlertTriangle className="h-3 w-3" /> Enter a number between 0 and 5.
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="pip-consecutive-months" className="text-xs font-medium text-muted-foreground">
              Consecutive months (1 – 24)
            </Label>
            <Input
              id="pip-consecutive-months" type="number" min={1} max={24} step={1}
              value={monthsDraft} onChange={e => setMonthsDraft(e.target.value)} className="mt-1"
            />
            {monthsInvalid && (
              <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                <AlertTriangle className="h-3 w-3" /> Enter a whole number between 1 and 24.
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-sm text-muted-foreground">
            Current: <span className="font-medium text-foreground">{data != null ? data.toFixed(2) : '—'}</span>{' '}
            over <span className="font-medium text-foreground">{policy?.consecutiveMonths ?? '—'}</span> month(s)
          </p>
          <Button onClick={() => save.mutate()} disabled={!hasChanges || save.isPending} className="gap-2">
            <Save className="h-4 w-4" />
            {save.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}