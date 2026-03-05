import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, CheckCircle2, Wrench, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface FixSummary {
  dry_run: boolean;
  phase1: { count: number; description: string };
  phase2: { count: number; description: string };
  phase3: { count: number; description: string };
  total_fixes: number;
  unique_kpis: number;
  unique_employees: number;
  by_level: Record<string, number>;
  applied_count?: number;
  fixes: Array<{
    kpi_id: string;
    kpi_name: string;
    level: string;
    old_score: number;
    new_score: number;
  }>;
}

const LEVEL_LABELS: Record<string, string> = {
  self_score: 'Self',
  manager_score: 'Manager',
  skip_level_score: 'Skip-Level',
  hr_pms_score: 'HR PMS',
  auditor_score: 'Auditor',
  management_score: 'Management',
  final_score: 'Final',
};

export function FixCorruptedScoresDialog() {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<FixSummary | null>(null);
  const { toast } = useToast();

  const runFix = useMutation({
    mutationFn: async (dryRun: boolean) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.functions.invoke('fix-corrupted-binary-scores', {
        body: { dry_run: dryRun, performed_by: user?.id },
      });
      if (error) throw error;
      return data as FixSummary;
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const handleDryRun = async () => {
    const result = await runFix.mutateAsync(true);
    setPreview(result);
  };

  const handleApply = async () => {
    const result = await runFix.mutateAsync(false);
    setPreview(result);
    toast({
      title: 'Scores Corrected',
      description: `Applied ${result.applied_count || result.total_fixes} fixes across ${result.unique_kpis} KPIs.`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setPreview(null); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="justify-between h-auto py-3">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            <span>Fix Corrupted Scores</span>
          </div>
          <Badge variant="secondary" className="ml-2">Data Fix</Badge>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Fix Corrupted Binary/Tiered KPI Scores
          </DialogTitle>
          <DialogDescription>
            Corrects scores that were saved as 0 due to a scoring engine bug. Run a preview first to see affected records.
          </DialogDescription>
        </DialogHeader>

        {!preview ? (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">What this fixes</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p><strong>Phase 1:</strong> Binary KPIs where achieved=5 but score was saved as 0</p>
                <p><strong>Phase 2:</strong> Binary KPIs where achieved=0 means "good" (0 incidents) but score=0</p>
                <p><strong>Phase 3:</strong> Tiered KPIs with incorrect score-to-option mapping</p>
                <p className="text-xs mt-2 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  All changes are logged to the audit trail for traceability.
                </p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <Card>
                  <CardContent className="pt-4 text-center">
                    <div className="text-2xl font-bold">{preview.total_fixes}</div>
                    <div className="text-xs text-muted-foreground">Total Fixes</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <div className="text-2xl font-bold">{preview.unique_kpis}</div>
                    <div className="text-xs text-muted-foreground">KPIs Affected</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <div className="text-2xl font-bold">{preview.unique_employees}</div>
                    <div className="text-xs text-muted-foreground">Employees</div>
                  </CardContent>
                </Card>
              </div>

              {/* Phase breakdown */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Phase 1: {preview.phase1.description}</span>
                  <Badge variant={preview.phase1.count > 0 ? 'destructive' : 'secondary'}>
                    {preview.phase1.count}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Phase 2: {preview.phase2.description}</span>
                  <Badge variant={preview.phase2.count > 0 ? 'destructive' : 'secondary'}>
                    {preview.phase2.count}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Phase 3: {preview.phase3.description}</span>
                  <Badge variant={preview.phase3.count > 0 ? 'destructive' : 'secondary'}>
                    {preview.phase3.count}
                  </Badge>
                </div>
              </div>

              {/* By level */}
              {Object.keys(preview.by_level).length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Fixes by Review Level</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(preview.by_level).map(([level, count]) => (
                        <Badge key={level} variant="outline">
                          {LEVEL_LABELS[level] || level}: {count}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Applied confirmation */}
              {!preview.dry_run && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 text-primary">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="text-sm font-medium">
                    Successfully applied {preview.applied_count || preview.total_fixes} corrections.
                    All changes logged to audit trail.
                  </span>
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          {!preview ? (
            <Button onClick={handleDryRun} disabled={runFix.isPending}>
              {runFix.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Preview Changes (Dry Run)
            </Button>
          ) : preview.dry_run ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPreview(null)}>
                Back
              </Button>
              <Button
                onClick={handleApply}
                disabled={runFix.isPending || preview.total_fixes === 0}
                variant="destructive"
              >
                {runFix.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Apply {preview.total_fixes} Fixes
              </Button>
            </div>
          ) : (
            <Button variant="outline" onClick={() => { setOpen(false); setPreview(null); }}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
