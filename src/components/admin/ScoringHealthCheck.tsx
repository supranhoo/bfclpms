import { useState, useMemo, useCallback } from 'react';
import { ShieldCheck, AlertTriangle, AlertCircle, Info, ChevronDown, ChevronRight, Wrench, CheckCircle2, Loader2, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import type { KPI } from '@/hooks/useKpis';
import { ScoringFixImpactDialog } from '@/components/admin/ScoringFixImpactDialog';
import { AdminKpiEditDialog } from '@/components/admin/AdminKpiEditDialog';

// ─── Types ───────────────────────────────────────────────────────────────────

type IssueSeverity = 'critical' | 'high' | 'medium';

type IssueType =
  | 'INVERTED_CRITERIA'
  | 'MISSING_THRESHOLDS'
  | 'MISSING_QUALITATIVE_OPTIONS'
  | 'MISSING_TARGET'
  | 'MISSING_CRITERIA';

export interface ScoringIssue {
  kpi: KPI;
  type: IssueType;
  severity: IssueSeverity;
  description: string;
  suggestedFix: string;
  employeeName: string;
  employeeCode: string;
}

interface Props {
  kpis: KPI[];
  selectedPeriod: string;
  selectedYear: string;
}

// ─── Detection Logic ─────────────────────────────────────────────────────────

function detectIssues(kpis: KPI[]): ScoringIssue[] {
  const issues: ScoringIssue[] = [];

  for (const kpi of kpis) {
    const emp = (kpi as any).profiles as { full_name?: string; employee_code?: string } | null;
    const employeeName = emp?.full_name || 'Unknown';
    const employeeCode = emp?.employee_code || '';
    const uomType = kpi.uom_type;
    const isNumeric = !uomType || uomType === 'numeric';

    if (isNumeric) {
      const r5 = kpi.r5 != null ? parseFloat(kpi.r5) : null;
      const r4 = kpi.r4 != null ? parseFloat(kpi.r4) : null;
      const r3 = kpi.r3 != null ? parseFloat(kpi.r3) : null;
      const r2 = kpi.r2 != null ? parseFloat(kpi.r2) : null;
      const r1 = kpi.r1 != null ? parseFloat(kpi.r1) : null;

      const hasAnyThreshold = [r5, r4, r3, r2, r1].some(v => v !== null && !isNaN(v));

      if (!hasAnyThreshold) {
        issues.push({
          kpi, type: 'MISSING_THRESHOLDS', severity: 'high',
          description: 'No rating thresholds (R5–R1) are defined for this numeric KPI.',
          suggestedFix: 'Define at minimum R5, R3, and R1 thresholds in the KPI editor.',
          employeeName, employeeCode,
        });
      } else if (r5 !== null && !isNaN(r5) && r1 !== null && !isNaN(r1)) {
        const criteria = kpi.criteria;
        if (criteria === 'Higher is Better' && r5 < r1) {
          issues.push({
            kpi, type: 'INVERTED_CRITERIA', severity: 'critical',
            description: `Criteria is "Higher is Better" but R5 (${r5}) < R1 (${r1}). Thresholds are descending — scoring engine will produce incorrect ratings.`,
            suggestedFix: 'Flip criteria to "Lower is Better".',
            employeeName, employeeCode,
          });
        } else if (criteria === 'Lower is Better' && r5 > r1) {
          issues.push({
            kpi, type: 'INVERTED_CRITERIA', severity: 'critical',
            description: `Criteria is "Lower is Better" but R5 (${r5}) > R1 (${r1}). Thresholds are ascending — scoring engine will produce incorrect ratings.`,
            suggestedFix: 'Flip criteria to "Higher is Better".',
            employeeName, employeeCode,
          });
        }
      }

      if (kpi.criteria == null) {
        issues.push({
          kpi, type: 'MISSING_CRITERIA', severity: 'medium',
          description: 'No scoring criteria set. Engine defaults to "Higher is Better" which may be wrong.',
          suggestedFix: 'Set criteria based on threshold direction.',
          employeeName, employeeCode,
        });
      }

      if (kpi.target_value == null && !hasAnyThreshold) {
        issues.push({
          kpi, type: 'MISSING_TARGET', severity: 'medium',
          description: 'No target value defined and no thresholds set. Scoring engine has no basis to calculate a rating.',
          suggestedFix: 'Set a target value or define R5–R1 thresholds in the KPI editor.',
          employeeName, employeeCode,
        });
      }
    } else {
      // binary / tiered
      const opts = kpi.qualitative_options;
      if (!opts || (Array.isArray(opts) && opts.length === 0)) {
        issues.push({
          kpi, type: 'MISSING_QUALITATIVE_OPTIONS', severity: 'high',
          description: `This ${uomType} KPI has no qualitative options configured. Scoring cannot be performed.`,
          suggestedFix: 'Add qualitative scoring options in the KPI editor.',
          employeeName, employeeCode,
        });
      }
    }
  }

  return issues;
}

// ─── Fiscal Year Sibling Query ───────────────────────────────────────────────

async function getFiscalSiblingIds(kpi: KPI): Promise<string[]> {
  const period = kpi.review_period;
  const year = kpi.review_year;
  if (!period || !year) return [];

  // Determine fiscal year range (July Y1 → June Y2)
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const monthIdx = MONTHS.indexOf(period);
  let fiscalStartYear: number;
  if (monthIdx >= 6) { // Jul-Dec
    fiscalStartYear = year;
  } else { // Jan-Jun
    fiscalStartYear = year - 1;
  }

  // Query siblings across both calendar years of the fiscal cycle
  const { data, error } = await supabase
    .from('kpis')
    .select('id, review_period, review_year')
    .eq('employee_id', kpi.employee_id)
    .eq('kra_name', kpi.kra_name)
    .eq('kpi_name', kpi.kpi_name)
    .neq('id', kpi.id);

  if (error || !data) return [];

  return data
    .filter(s => {
      const sMonthIdx = MONTHS.indexOf(s.review_period || '');
      if (sMonthIdx === -1 || !s.review_year) return false;
      const sFiscalStart = sMonthIdx >= 6 ? s.review_year : s.review_year - 1;
      return sFiscalStart === fiscalStartYear;
    })
    .map(s => s.id);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ScoringHealthCheck({ kpis, selectedPeriod, selectedYear }: Props) {
  const [open, setOpen] = useState(false);
  const [fixedIds, setFixedIds] = useState<Set<string>>(new Set());
  const [fixingAll, setFixingAll] = useState<IssueType | null>(null);
  const [impactIssues, setImpactIssues] = useState<ScoringIssue[]>([]);
  const [impactOpen, setImpactOpen] = useState(false);
  const [editKpi, setEditKpi] = useState<KPI | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const issues = useMemo(() => detectIssues(kpis), [kpis]);

  const criticalIssues = useMemo(() => issues.filter(i => i.severity === 'critical'), [issues]);
  const highIssues = useMemo(() => issues.filter(i => i.severity === 'high'), [issues]);
  const mediumIssues = useMemo(() => issues.filter(i => i.severity === 'medium'), [issues]);

  const activeIssues = useMemo(() => issues.filter(i => !fixedIds.has(i.kpi.id + i.type)), [issues, fixedIds]);

  // ─── Open impact preview for single fix ──────────────────────────────────

  const handleFix = (issue: ScoringIssue) => {
    setImpactIssues([issue]);
    setImpactOpen(true);
  };

  // ─── Fix All → open bulk impact preview ──────────────────────────────────

  const fixAll = useCallback((type: IssueType) => {
    const fixable = activeIssues.filter(i => i.type === type && (type === 'INVERTED_CRITERIA' || type === 'MISSING_CRITERIA'));
    if (fixable.length === 0) return;
    setImpactIssues(fixable);
    setImpactOpen(true);
  }, [activeIssues]);

  // ─── Impact dialog complete callback ─────────────────────────────────────

  const handleImpactComplete = useCallback(() => {
    for (const issue of impactIssues) {
      setFixedIds(prev => new Set(prev).add(issue.kpi.id + issue.type));
    }
    setImpactIssues([]);
    queryClient.invalidateQueries({ queryKey: ['kpis-by-period'] });
    queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
  }, [impactIssues, queryClient]);

  // ─── KPI Editor ──────────────────────────────────────────────────────────

  const handleEdit = (issue: ScoringIssue) => {
    setEditKpi(issue.kpi);
  };

  const handleEditClose = () => {
    setEditKpi(null);
    queryClient.invalidateQueries({ queryKey: ['kpis-by-period'] });
    queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
  };

  // ─── Invalidate on close ─────────────────────────────────────────────────

  const handleOpenChange = useCallback((isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen && fixedIds.size > 0) {
      queryClient.invalidateQueries({ queryKey: ['kpis-by-period'] });
      queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
      setFixedIds(new Set());
    }
  }, [fixedIds, queryClient]);

  // ─── Render helpers ──────────────────────────────────────────────────────

  const severityIcon = (s: IssueSeverity) => {
    if (s === 'critical') return <AlertTriangle className="h-4 w-4 text-destructive" />;
    if (s === 'high') return <AlertCircle className="h-4 w-4 text-orange-500" />;
    return <Info className="h-4 w-4 text-yellow-500" />;
  };

  const severityBadge = (s: IssueSeverity) => {
    const variants: Record<IssueSeverity, string> = {
      critical: 'bg-destructive/10 text-destructive border-destructive/20',
      high: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
      medium: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
    };
    return <Badge variant="outline" className={variants[s]}>{s.charAt(0).toUpperCase() + s.slice(1)}</Badge>;
  };

  const canAutoFix = (type: IssueType) => type === 'INVERTED_CRITERIA' || type === 'MISSING_CRITERIA';
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="relative">
            <ShieldCheck className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Health Check</span>
            {issues.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                {issues.length > 99 ? '99+' : issues.length}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Scan KPIs for scoring logic issues</TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Scoring Health Check
            </DialogTitle>
            <DialogDescription>
              {selectedPeriod !== 'all' ? selectedPeriod : 'All Periods'} {selectedYear !== 'all' ? selectedYear : ''} — {kpis.length} KPIs scanned
            </DialogDescription>
          </DialogHeader>

          {/* Summary Banner */}
          <Card className="border-dashed">
            <CardContent className="py-3 px-4">
              {activeIssues.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  All KPIs have valid scoring configurations. No issues detected.
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-medium">{activeIssues.length} issue{activeIssues.length !== 1 ? 's' : ''} found</span>
                  {criticalIssues.filter(i => !fixedIds.has(i.kpi.id + i.type)).length > 0 && (
                    <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                      {criticalIssues.filter(i => !fixedIds.has(i.kpi.id + i.type)).length} Critical
                    </Badge>
                  )}
                  {highIssues.filter(i => !fixedIds.has(i.kpi.id + i.type)).length > 0 && (
                    <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20">
                      {highIssues.filter(i => !fixedIds.has(i.kpi.id + i.type)).length} High
                    </Badge>
                  )}
                  {mediumIssues.filter(i => !fixedIds.has(i.kpi.id + i.type)).length > 0 && (
                    <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                      {mediumIssues.filter(i => !fixedIds.has(i.kpi.id + i.type)).length} Medium
                    </Badge>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tabs by Severity */}
          {issues.length > 0 && (
            <Tabs defaultValue="critical" className="flex-1 overflow-hidden flex flex-col">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="critical" className="gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Critical ({criticalIssues.filter(i => !fixedIds.has(i.kpi.id + i.type)).length})
                </TabsTrigger>
                <TabsTrigger value="high" className="gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" />
                  High ({highIssues.filter(i => !fixedIds.has(i.kpi.id + i.type)).length})
                </TabsTrigger>
                <TabsTrigger value="medium" className="gap-1.5">
                  <Info className="h-3.5 w-3.5" />
                  Medium ({mediumIssues.filter(i => !fixedIds.has(i.kpi.id + i.type)).length})
                </TabsTrigger>
              </TabsList>

              <IssueTabContent
                value="critical"
                issues={criticalIssues}
                fixedIds={fixedIds}
                fixingIds={fixingIds}
                fixingAll={fixingAll}
                onFix={handleFix}
                onFixAll={fixAll}
                canAutoFix={canAutoFix}
                severityIcon={severityIcon}
                severityBadge={severityBadge}
              />
              <IssueTabContent
                value="high"
                issues={highIssues}
                fixedIds={fixedIds}
                fixingIds={fixingIds}
                fixingAll={fixingAll}
                onFix={handleFix}
                onFixAll={fixAll}
                canAutoFix={canAutoFix}
                severityIcon={severityIcon}
                severityBadge={severityBadge}
              />
              <IssueTabContent
                value="medium"
                issues={mediumIssues}
                fixedIds={fixedIds}
                fixingIds={fixingIds}
                fixingAll={fixingAll}
                onFix={handleFix}
                onFixAll={fixAll}
                canAutoFix={canAutoFix}
                severityIcon={severityIcon}
                severityBadge={severityBadge}
              />
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Issue Tab Content ───────────────────────────────────────────────────────

interface IssueTabContentProps {
  value: string;
  issues: ScoringIssue[];
  fixedIds: Set<string>;
  fixingIds: Set<string>;
  fixingAll: IssueType | null;
  onFix: (issue: ScoringIssue) => void;
  onFixAll: (type: IssueType) => void;
  canAutoFix: (type: IssueType) => boolean;
  severityIcon: (s: IssueSeverity) => React.ReactNode;
  severityBadge: (s: IssueSeverity) => React.ReactNode;
}

function IssueTabContent({ value, issues, fixedIds, fixingIds, fixingAll, onFix, onFixAll, canAutoFix, severityIcon, severityBadge }: IssueTabContentProps) {
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set());

  const activeIssues = issues.filter(i => !fixedIds.has(i.kpi.id + i.type));

  // Group by employee
  const grouped = useMemo(() => {
    const map = new Map<string, ScoringIssue[]>();
    activeIssues.forEach(issue => {
      const key = issue.kpi.employee_id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(issue);
    });
    return Array.from(map.entries()).sort((a, b) => a[1][0].employeeName.localeCompare(b[1][0].employeeName));
  }, [activeIssues]);

  // Group fixable types
  const fixableTypes = useMemo(() => {
    const types = new Set(activeIssues.filter(i => canAutoFix(i.type)).map(i => i.type));
    return Array.from(types);
  }, [activeIssues, canAutoFix]);

  const toggleEmployee = (id: string) => {
    setExpandedEmployees(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (activeIssues.length === 0) {
    return (
      <TabsContent value={value} className="flex-1 overflow-auto">
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 mr-2" />
          No issues in this category
        </div>
      </TabsContent>
    );
  }

  return (
    <TabsContent value={value} className="flex-1 overflow-auto space-y-2">
      {/* Fix All buttons */}
      {fixableTypes.length > 0 && (
        <div className="flex gap-2 flex-wrap pb-1">
          {fixableTypes.map(type => {
            const count = activeIssues.filter(i => i.type === type).length;
            return (
              <Button
                key={type}
                variant="outline"
                size="sm"
                onClick={() => onFixAll(type)}
                disabled={fixingAll !== null}
                className="gap-1.5"
              >
                {fixingAll === type ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
                Fix All {type.replace(/_/g, ' ').toLowerCase()} ({count})
              </Button>
            );
          })}
        </div>
      )}

      {/* Grouped by employee */}
      {grouped.map(([empId, empIssues]) => {
        const emp = empIssues[0];
        const isExpanded = expandedEmployees.has(empId);

        return (
          <Collapsible key={empId} open={isExpanded} onOpenChange={() => toggleEmployee(empId)}>
            <CollapsibleTrigger className="flex items-center gap-2 w-full px-3 py-2 rounded-md hover:bg-accent text-left text-sm">
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span className="font-medium">{emp.employeeName}</span>
              {emp.employeeCode && <span className="text-muted-foreground">({emp.employeeCode})</span>}
              <Badge variant="outline" className="ml-auto">{empIssues.length} issue{empIssues.length !== 1 ? 's' : ''}</Badge>
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-6 space-y-1 pb-2">
              {empIssues.map(issue => {
                const fixKey = issue.kpi.id + issue.type;
                const isFixing = fixingIds.has(fixKey);
                const isFixed = fixedIds.has(fixKey);

                return (
                  <div key={fixKey} className="flex items-start gap-3 px-3 py-2 rounded-md border bg-card text-sm">
                    <div className="pt-0.5">{severityIcon(issue.severity)}</div>
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{issue.kpi.kpi_name}</span>
                        <span className="text-muted-foreground text-xs">({issue.kpi.kra_name})</span>
                      </div>
                      <p className="text-muted-foreground text-xs">{issue.description}</p>
                      <p className="text-xs"><span className="text-primary font-medium">Suggested:</span> {issue.suggestedFix}</p>
                    </div>
                    {canAutoFix(issue.type) && !isFixed && (
                      <Button variant="outline" size="sm" onClick={() => onFix(issue)} disabled={isFixing} className="shrink-0 gap-1">
                        {isFixing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
                        Fix
                      </Button>
                    )}
                    {isFixed && (
                      <Badge className="bg-green-500/10 text-green-600 border-green-500/20 shrink-0" variant="outline">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Fixed
                      </Badge>
                    )}
                  </div>
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </TabsContent>
  );
}
