import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, BookOpen, Save, ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { getTniThreshold, setTniThreshold, parseTniThreshold, DEFAULT_TNI_THRESHOLD } from '@/lib/pmsSettings';
import { getPipPolicySettings, PIP_POLICY_KEYS, DEFAULT_PIP_POLICY } from '@/lib/pip/pipPolicySettings';
import { supabase } from '@/integrations/supabase/client';

/**
 * ADR-252a — the TNI continuity parameters live on the TNI report itself,
 * directly under the period filter. Admins may edit inline; everyone else sees
 * the effective values read-only. RLS on `system_settings` remains the real
 * guard — the `readOnly` prop is a UI affordance only.
 */
export function TniThresholdInline({ readOnly = true }: { readOnly?: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

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

  const summary = (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <BookOpen className="h-4 w-4 text-muted-foreground" />
      <span className="font-medium">TNI Threshold Criteria</span>
      <Badge variant="secondary" className="text-xs">
        Threshold {data != null ? data.toFixed(2) : '—'} · minimum {policy?.consecutiveMonths ?? '—'} scored month(s)
      </Badge>
    </div>
  );

  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <Collapsible open={open} onOpenChange={setOpen}>
          <div className="flex items-center justify-between gap-3">
            {summary}
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1" aria-label="Toggle TNI threshold details">
                {readOnly ? 'Details' : 'Edit'}
                <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
          </div>

          <CollapsibleContent className="pt-3">
            <p className="text-xs text-muted-foreground">
              A KPI is reported as a training need only when its score is <span className="font-medium">at or below</span>{' '}
              this value in <span className="font-medium">every scored month</span> of the selected range. Unscored months
              are skipped. Default is {DEFAULT_TNI_THRESHOLD.toFixed(2)} on a 0–5 scale. The continuity window also sets the
              minimum number of scored months required before a PIP candidate can be flagged.
            </p>

            {!readOnly && (
              <>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 max-w-xl">
                  <div>
                    <Label htmlFor="tni-threshold" className="text-xs font-medium text-muted-foreground">
                      TNI threshold (0.00 – 5.00)
                    </Label>
                    <Input
                      id="tni-threshold" type="number" min={0} max={5} step={0.05}
                      value={draft} onChange={e => setDraft(e.target.value)} disabled={isLoading}
                      className="mt-1 h-11 md:h-10"
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
                      value={monthsDraft} onChange={e => setMonthsDraft(e.target.value)}
                      className="mt-1 h-11 md:h-10"
                    />
                    {monthsInvalid && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                        <AlertTriangle className="h-3 w-3" /> Enter a whole number between 1 and 24.
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button size="sm" onClick={() => save.mutate()} disabled={!hasChanges || save.isPending} className="gap-2">
                    <Save className="h-4 w-4" />
                    {save.isPending ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
