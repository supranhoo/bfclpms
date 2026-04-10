import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, RefreshCw, Wrench } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface RepairResult {
  repaired: number;
  null_values_fixed: number;
  skipped: number;
  total_checked: number;
  errors: string[];
  message?: string;
}

export function DataRepairTab() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<RepairResult | null>(null);

  const handleRunRepair = async () => {
    setIsRunning(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('repair-orphaned-propagations', {
        body: { limit: 200 },
      });

      if (error) throw error;

      setResult(data as RepairResult);
      toast({
        title: 'Repair completed',
        description: `Repaired: ${data.repaired}, Skipped: ${data.skipped}, NULL values fixed: ${data.null_values_fixed}`,
      });
    } catch (err: any) {
      toast({
        title: 'Repair failed',
        description: err.message || 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Repair Orphaned Propagations
          </CardTitle>
          <CardDescription>
            Fixes org-level KPIs stuck at "KRA Set" stage where org data was saved but never propagated to employee review submissions. 
            This creates the missing review_submission records and advances KPI status to "Self Review".
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <p className="text-muted-foreground">
              This also resets NULL-value entries that were incorrectly marked as propagated. 
              Each run processes up to 200 records. Run multiple times if needed.
            </p>
          </div>

          <Button onClick={handleRunRepair} disabled={isRunning}>
            {isRunning ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Running Repair…
              </>
            ) : (
              <>
                <Wrench className="h-4 w-4" />
                Run Repair
              </>
            )}
          </Button>

          {result && (
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="font-medium text-sm">Repair Results</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="text-center p-2 rounded bg-muted/50">
                  <div className="text-lg font-bold">{result.repaired}</div>
                  <div className="text-xs text-muted-foreground">Repaired</div>
                </div>
                <div className="text-center p-2 rounded bg-muted/50">
                  <div className="text-lg font-bold">{result.null_values_fixed}</div>
                  <div className="text-xs text-muted-foreground">NULL Fixed</div>
                </div>
                <div className="text-center p-2 rounded bg-muted/50">
                  <div className="text-lg font-bold">{result.skipped}</div>
                  <div className="text-xs text-muted-foreground">Skipped</div>
                </div>
                <div className="text-center p-2 rounded bg-muted/50">
                  <div className="text-lg font-bold">{result.total_checked}</div>
                  <div className="text-xs text-muted-foreground">Checked</div>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-destructive">Errors ({result.errors.length}):</span>
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-destructive/80 font-mono">{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
