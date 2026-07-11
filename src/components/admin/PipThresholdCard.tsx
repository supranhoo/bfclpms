import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Save, Target } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getPipThreshold, setPipThreshold, parsePipThreshold, DEFAULT_PIP_THRESHOLD } from '@/lib/pmsSettings';

/**
 * Admin control for the PMS PIP (Performance Improvement Plan) threshold.
 * Employees whose monthly Final-Score-only average falls below this number
 * are flagged as PIP candidates in Reports → Monthly Scorecard → Trend.
 */
export function PipThresholdCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ['pms-pip-threshold'],
    queryFn: getPipThreshold,
  });
  const [draft, setDraft] = useState<string>('');

  useEffect(() => {
    if (data != null) setDraft(String(data));
  }, [data]);

  const parsed = parsePipThreshold(draft);
  const hasChanges = data != null && parsed !== data;
  const invalid = draft.trim() !== '' && !Number.isFinite(Number(draft));

  const save = useMutation({
    mutationFn: async () => setPipThreshold(parsed),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pms-pip-threshold'] });
      toast({ title: 'PIP threshold saved', description: `New threshold: ${parsed.toFixed(2)}` });
    },
    onError: (e: Error) => toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          PIP Threshold
        </CardTitle>
        <CardDescription>
          Employees whose <span className="font-medium">Final Score</span> monthly average
          falls below this value in the selected range are flagged as PIP candidates
          in the Monthly Scorecard Trend report. Default is {DEFAULT_PIP_THRESHOLD.toFixed(2)} on a 0–5 scale.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-xs">
          <Label htmlFor="pip-threshold" className="text-xs font-medium text-muted-foreground">
            Threshold (0.00 – 5.00)
          </Label>
          <Input
            id="pip-threshold"
            type="number"
            min={0}
            max={5}
            step={0.05}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={isLoading}
            className="mt-1"
          />
          {invalid && (
            <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
              <AlertTriangle className="h-3 w-3" />
              Enter a number between 0 and 5.
            </p>
          )}
        </div>
        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-sm text-muted-foreground">
            Current threshold: <span className="font-medium text-foreground">
              {data != null ? data.toFixed(2) : '—'}
            </span>
          </p>
          <Button
            onClick={() => save.mutate()}
            disabled={!hasChanges || save.isPending}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {save.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}