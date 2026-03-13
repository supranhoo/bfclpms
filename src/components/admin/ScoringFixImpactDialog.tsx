import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ArrowUp, ArrowDown, Minus, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { calculateRating, RatingThresholds } from '@/lib/ratingCalculation';
import { RATING_SCALE } from '@/lib/reviewConstants';
import type { KPI } from '@/hooks/useKpis';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const FISCAL_ORDER = [6,7,8,9,10,11,0,1,2,3,4,5]; // Jul-Jun

interface ScoringIssue {
  kpi: KPI;
  type: string;
  severity: string;
  description: string;
  suggestedFix: string;
  employeeName: string;
  employeeCode: string;
}

interface SiblingWithSubmission {
  kpiId: string;
  month: string;
  year: number;
  achievedValue: number | null;
  currentScore: number | null;
  currentRating: string | null;
  simulatedScore: number | null;
  simulatedRating: string | null;
  scoreChange: number | null;
  selected: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issues: ScoringIssue[];
  onComplete: () => void;
  readOnly?: boolean;
}

function getNewCriteriaForIssue(issue: ScoringIssue): string {
  if (issue.type === 'INVERTED_CRITERIA') {
    return issue.kpi.criteria === 'Higher is Better' ? 'Lower is Better' : 'Higher is Better';
  }
  // MISSING_CRITERIA: auto-detect from thresholds
  const r5 = issue.kpi.r5 != null ? parseFloat(issue.kpi.r5) : null;
  const r1 = issue.kpi.r1 != null ? parseFloat(issue.kpi.r1) : null;
  if (r5 !== null && r1 !== null && !isNaN(r5) && !isNaN(r1)) {
    return r5 >= r1 ? 'Higher is Better' : 'Lower is Better';
  }
  return 'Higher is Better';
}

function simulateRating(kpi: KPI, achievedValue: number | null, newCriteria: string): { score: number; label: string } | null {
  if (achievedValue === null) return null;
  const thresholds: RatingThresholds = {
    r5: kpi.r5, r4: kpi.r4, r3: kpi.r3,
    r2: kpi.r2, r1: kpi.r1, r0: (kpi as any).r0,
  };
  const result = calculateRating(
    achievedValue,
    kpi.target_value,
    thresholds,
    newCriteria,
    kpi.weightage || 0,
    (kpi.uom_type as any) || 'numeric',
    kpi.qualitative_options as any,
    kpi.uom,
    (kpi as any).threshold_mode || 'absolute'
  );
  const entry = RATING_SCALE[result.rating];
  return { score: result.rating, label: entry?.shortLabel || `${result.rating}` };
}

function getFiscalStartYear(month: string, year: number): number {
  const idx = MONTHS.indexOf(month);
  return idx >= 6 ? year : year - 1;
}

export function ScoringFixImpactDialog({ open, onOpenChange, issues, onComplete, readOnly = false }: Props) {
  const [siblings, setSiblings] = useState<SiblingWithSubmission[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isBulk = issues.length > 1;
  const primaryIssue = issues[0];
  const primaryKpi = primaryIssue?.kpi;

  // Fetch siblings + submissions when dialog opens
  useEffect(() => {
    if (!open || issues.length === 0) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const allSiblings: SiblingWithSubmission[] = [];

        for (const issue of issues) {
          const kpi = issue.kpi;
          const newCriteria = getNewCriteriaForIssue(issue);
          const fiscalStart = getFiscalStartYear(kpi.review_period || '', kpi.review_year || 0);

          // Fetch all siblings (including the KPI itself)
          const { data: kpiSiblings } = await supabase
            .from('kpis')
            .select('id, review_period, review_year, target_value, weightage, r5, r4, r3, r2, r1, uom, uom_type, qualitative_options, threshold_mode, criteria')
            .eq('employee_id', kpi.employee_id)
            .eq('kra_name', kpi.kra_name)
            .eq('kpi_name', kpi.kpi_name);

          if (!kpiSiblings || cancelled) continue;

          const fiscalSiblings = kpiSiblings.filter(s => {
            const mIdx = MONTHS.indexOf(s.review_period || '');
            if (mIdx === -1 || !s.review_year) return false;
            return getFiscalStartYear(s.review_period!, s.review_year!) === fiscalStart;
          });

          const siblingIds = fiscalSiblings.map(s => s.id);
          
          // Fetch submissions
          const { data: submissions } = await supabase
            .from('review_submissions')
            .select('kpi_id, achieved_value, self_score, self_rating')
            .in('kpi_id', siblingIds);

          const subMap = new Map(submissions?.map(s => [s.kpi_id, s]) || []);

          for (const sib of fiscalSiblings) {
            // Skip duplicates in bulk mode
            if (allSiblings.some(s => s.kpiId === sib.id)) continue;

            const sub = subMap.get(sib.id);
            const achievedValue = sub?.achieved_value ?? null;
            const currentScore = sub?.self_score ?? null;
            const currentRating = sub?.self_rating ?? null;

            const sim = simulateRating(sib as any, achievedValue, newCriteria);

            allSiblings.push({
              kpiId: sib.id,
              month: sib.review_period || '',
              year: sib.review_year || 0,
              achievedValue,
              currentScore,
              currentRating,
              simulatedScore: sim?.score ?? null,
              simulatedRating: sim?.label ?? null,
              scoreChange: sim && currentScore !== null ? sim.score - currentScore : null,
              selected: true,
            });
          }
        }

        // Sort by fiscal order
        allSiblings.sort((a, b) => {
          const aIdx = FISCAL_ORDER.indexOf(MONTHS.indexOf(a.month));
          const bIdx = FISCAL_ORDER.indexOf(MONTHS.indexOf(b.month));
          if (a.year !== b.year) return a.year - b.year;
          return aIdx - bIdx;
        });

        if (!cancelled) setSiblings(allSiblings);
      } catch (err) {
        console.error('Impact analysis failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [open, issues]);

  const toggleMonth = (kpiId: string) => {
    setSiblings(prev => prev.map(s => s.kpiId === kpiId ? { ...s, selected: !s.selected } : s));
  };

  const toggleAll = (checked: boolean) => {
    setSiblings(prev => prev.map(s => ({ ...s, selected: checked })));
  };

  const selectedCount = siblings.filter(s => s.selected).length;
  const scoreChanges = useMemo(() => {
    const withChanges = siblings.filter(s => s.selected && s.scoreChange !== null);
    return {
      increased: withChanges.filter(s => s.scoreChange! > 0).length,
      decreased: withChanges.filter(s => s.scoreChange! < 0).length,
      unchanged: withChanges.filter(s => s.scoreChange === 0).length,
      total: withChanges.length,
    };
  }, [siblings]);

  const handleApply = async () => {
    const selectedIds = siblings.filter(s => s.selected).map(s => s.kpiId);
    if (selectedIds.length === 0) return;

    setApplying(true);
    try {
      for (const issue of issues) {
        const newCriteria = getNewCriteriaForIssue(issue);
        const relevantIds = selectedIds; // All selected siblings get the fix

        const { error } = await supabase
          .from('kpis')
          .update({ criteria: newCriteria })
          .in('id', relevantIds);
        if (error) throw error;

        // Audit log
        await supabase.from('kpi_audit_logs').insert({
          kpi_id: issue.kpi.id,
          action: 'SCORING_HEALTH_FIX',
          performed_by: user?.id || '',
          old_value: { criteria: issue.kpi.criteria } as any,
          new_value: { criteria: newCriteria } as any,
          metadata: {
            fix_type: issue.type === 'INVERTED_CRITERIA' ? 'inverted_criteria' : 'missing_criteria',
            months_applied: selectedIds.length,
            months_skipped: siblings.length - selectedIds.length,
            source: 'scoring_health_check_impact_preview',
          } as any,
        });
      }

      queryClient.invalidateQueries({ queryKey: ['kpis-by-period'] });
      queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
      toast({
        title: 'Fix applied',
        description: `Updated ${selectedIds.length} month(s) across ${issues.length} KPI(s).`,
      });
      onComplete();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Fix failed', description: err.message, variant: 'destructive' });
    } finally {
      setApplying(false);
    }
  };

  const scoreDisplay = (score: number | null, rating: string | null) => {
    if (score === null) return <span className="text-muted-foreground">—</span>;
    const entry = RATING_SCALE[score];
    return (
      <span className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry?.dotColor || '#6B7280' }} />
        <span className="font-medium">{score}</span>
        <span className="text-muted-foreground text-xs">({entry?.shortLabel || rating || ''})</span>
      </span>
    );
  };

  const allSelected = siblings.length > 0 && siblings.every(s => s.selected);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            {readOnly ? 'Impact Preview' : 'Impact Preview — Fix'} — {isBulk ? `${issues.length} KPIs` : primaryKpi?.kpi_name}
          </DialogTitle>
          <DialogDescription>
            {isBulk
              ? `Review score impact across ${issues.length} KPIs across all fiscal months.`
              : `${primaryIssue?.employeeName} — ${primaryIssue?.description}`}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Analyzing impact...</span>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {!readOnly && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={(checked) => toggleAll(!!checked)}
                      />
                    </TableHead>
                  )}
                  <TableHead>Month</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead className="text-right">Achieved</TableHead>
                  <TableHead>Current Score</TableHead>
                  {!readOnly && <TableHead>Simulated Score</TableHead>}
                  {!readOnly && <TableHead className="w-16 text-center">Change</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {siblings.map(sib => (
                  <TableRow key={sib.kpiId} className={!readOnly && !sib.selected ? 'opacity-50' : ''}>
                    {!readOnly && (
                      <TableCell>
                        <Checkbox
                          checked={sib.selected}
                          onCheckedChange={() => toggleMonth(sib.kpiId)}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">{sib.month}</TableCell>
                    <TableCell>{sib.year}</TableCell>
                    <TableCell className="text-right">
                      {sib.achievedValue !== null ? sib.achievedValue : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>{scoreDisplay(sib.currentScore, sib.currentRating)}</TableCell>
                    {!readOnly && <TableCell>{scoreDisplay(sib.simulatedScore, sib.simulatedRating)}</TableCell>}
                    {!readOnly && (
                      <TableCell className="text-center">
                        {sib.scoreChange === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : sib.scoreChange > 0 ? (
                          <span className="text-green-600 flex items-center justify-center gap-0.5">
                            <ArrowUp className="h-3.5 w-3.5" />+{sib.scoreChange}
                          </span>
                        ) : sib.scoreChange < 0 ? (
                          <span className="text-destructive flex items-center justify-center gap-0.5">
                            <ArrowDown className="h-3.5 w-3.5" />{sib.scoreChange}
                          </span>
                        ) : (
                          <Minus className="h-3.5 w-3.5 text-muted-foreground mx-auto" />
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {siblings.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={readOnly ? 4 : 7} className="text-center text-muted-foreground py-6">
                      No fiscal siblings found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Summary */}
        {!loading && siblings.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 text-sm border-t pt-3">
            <span className="text-muted-foreground">
              {selectedCount} of {siblings.length} months selected
            </span>
            {scoreChanges.total > 0 && (
              <>
                {scoreChanges.increased > 0 && (
                  <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                    {scoreChanges.increased} improved
                  </Badge>
                )}
                {scoreChanges.decreased > 0 && (
                  <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                    {scoreChanges.decreased} decreased
                  </Badge>
                )}
                {scoreChanges.unchanged > 0 && (
                  <Badge variant="outline">{scoreChanges.unchanged} unchanged</Badge>
                )}
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={applying || selectedCount === 0 || loading}>
            {applying && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Apply Fix to {selectedCount} Month{selectedCount !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
