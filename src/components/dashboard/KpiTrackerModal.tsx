import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';
import type { KPI, ReviewSubmission } from '@/hooks/useKpis';
import { renderBoldKpiText } from '@/components/ui/FormattedText';

interface KpiTrackerModalProps {
  isOpen: boolean;
  onClose: () => void;
  kpi: KPI | null;
  allKpis: KPI[];
  submissions: ReviewSubmission[];
  workflowStages?: string[];
}

const STAGE_COLUMN_MAP: Record<string, { key: string; label: string; remarkKey: string; remarkLabel: string }> = {
  self_review: { key: 'selfScore', label: 'Self', remarkKey: 'self_remarks', remarkLabel: 'Self' },
  manager_check: { key: 'managerScore', label: 'Manager', remarkKey: 'manager_remarks', remarkLabel: 'Manager' },
  skip_level_check: { key: 'skipScore', label: 'Skip-Level', remarkKey: 'skip_level_remarks', remarkLabel: 'Skip-Level' },
  hr_pms_review: { key: 'hrScore', label: 'HR PMS', remarkKey: 'hr_pms_remarks', remarkLabel: 'HR PMS' },
  audit: { key: 'auditorScore', label: 'Auditor', remarkKey: 'auditor_remarks', remarkLabel: 'Auditor' },
  management_review: { key: 'mgmtScore', label: 'Mgmt', remarkKey: 'management_remarks', remarkLabel: 'Management' },
};

const ALL_STAGES_ORDER = ['self_review', 'manager_check', 'skip_level_check', 'hr_pms_review', 'audit', 'management_review'];

function buildScoreColumns(stages: string[]): { key: string; label: string }[] {
  const cols: { key: string; label: string }[] = [];
  for (const stage of ALL_STAGES_ORDER) {
    if (stages.includes(stage)) {
      const col = STAGE_COLUMN_MAP[stage];
      if (col) cols.push({ key: col.key, label: col.label });
    }
  }
  cols.push({ key: 'finalScore', label: 'Final' });
  return cols;
}

const fullMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getMonthSortIndex(period: string): number {
  const first = period.split('-')[0];
  const idx = fullMonths.indexOf(first);
  if (idx >= 0) return idx;
  return shortMonths.indexOf(first);
}

interface RemarksEntry {
  level: string;
  text: string;
}

interface MonthEntry {
  month: string;
  target: number | null;
  achieved: number | null;
  finalAchieved: number | null;
  selfScore: number | null;
  managerScore: number | null;
  skipScore: number | null;
  hrScore: number | null;
  auditorScore: number | null;
  mgmtScore: number | null;
  finalScore: number | null;
  status: string;
  year: number;
  isNa: boolean;
  remarks: RemarksEntry[];
}

function getLast2Remarks(sub: ReviewSubmission, stages: string[]): RemarksEntry[] {
  // Traverse stages in reverse order to get the last 2 non-null remarks
  const reverseStages = [...stages].reverse();
  const result: RemarksEntry[] = [];
  for (const stage of reverseStages) {
    const mapping = STAGE_COLUMN_MAP[stage];
    if (!mapping) continue;
    const text = (sub as any)[mapping.remarkKey];
    if (text) {
      result.push({ level: mapping.remarkLabel, text });
      if (result.length >= 2) break;
    }
  }
  return result;
}

function getFinalAchieved(sub: ReviewSubmission | undefined): number | null {
  if (!sub) return null;
  return (
    sub.management_achieved_value ??
    sub.auditor_achieved_value ??
    sub.hr_pms_achieved_value ??
    sub.skip_level_achieved_value ??
    sub.manager_achieved_value ??
    sub.achieved_value ??
    null
  );
}

const getRatingColor = (score: number) => {
  if (score >= 5) return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200';
  if (score >= 4) return 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200';
  if (score >= 3) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200';
  if (score >= 2) return 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300';
  if (score >= 1) return 'bg-red-400 text-white dark:bg-red-600 dark:text-white';
  return 'bg-red-900 text-red-100 dark:bg-red-950 dark:text-red-200';
};

function ScoreBadge({ score, isNa }: { score: number | null; isNa: boolean }) {
  if (isNa) return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200 text-[10px]">N/A</Badge>;
  if (score == null) return <span className="text-muted-foreground">-</span>;
  return <Badge className={`${getRatingColor(score)} text-[10px]`}>{score.toFixed(1)}</Badge>;
}

const DEFAULT_STAGES = ['self_review', 'manager_check', 'skip_level_check', 'hr_pms_review', 'audit', 'management_review'];

export function KpiTrackerModal({ isOpen, onClose, kpi, allKpis, submissions, workflowStages }: KpiTrackerModalProps) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const activeStages = workflowStages || DEFAULT_STAGES;
  const scoreColumns = useMemo(() => buildScoreColumns(activeStages), [activeStages]);

  const monthlyData = useMemo(() => {
    if (!kpi) return [];
    
    const relatedKpis = allKpis.filter(k => 
      k.employee_id === kpi.employee_id &&
      k.kpi_name === kpi.kpi_name &&
      k.kra_name === kpi.kra_name
    );

    const submissionMap = new Map(submissions.map(s => [s.kpi_id, s]));

    const periodMap = new Map<string, MonthEntry>();

    relatedKpis.forEach(k => {
      const periodKey = `${k.review_period}-${k.review_year}`;
      if (!periodMap.has(periodKey)) {
        const sub = submissionMap.get(k.id);
        const isNa = sub?.is_na === true;
        periodMap.set(periodKey, {
          month: k.review_period || 'N/A',
          target: isNa ? null : (k.target_value || 0),
          achieved: isNa ? null : (sub ? (sub.achieved_value ?? null) : null),
          finalAchieved: isNa ? null : getFinalAchieved(sub),
          selfScore: isNa ? null : (sub?.self_score ?? null),
          managerScore: isNa ? null : (sub?.manager_score ?? null),
          skipScore: isNa ? null : (sub?.skip_level_score ?? null),
          hrScore: isNa ? null : (sub?.hr_pms_score ?? null),
          auditorScore: isNa ? null : (sub?.auditor_score ?? null),
          mgmtScore: isNa ? null : (sub?.management_score ?? null),
          finalScore: isNa ? null : (k.status === 'approved' ? (sub?.final_score ?? null) : null),
          status: k.status || 'open',
          year: k.review_year || new Date().getFullYear(),
          isNa,
          remarks: sub && !isNa ? getLast2Remarks(sub, activeStages) : [],
        });
      }
    });

    return Array.from(periodMap.values()).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return getMonthSortIndex(a.month) - getMonthSortIndex(b.month);
    });
  }, [kpi, allKpis, submissions, activeStages]);

  const toggleRow = (idx: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  if (!kpi) return null;

  const totalCols = 4 + scoreColumns.length; // expand + month + target + achieved + scores + status

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <DialogTitle>KPI Tracker Sheet</DialogTitle>
            {kpi.uom && (
              <Badge variant="secondary" className="text-xs">
                {kpi.uom}
              </Badge>
            )}
          </div>
          <DialogDescription className="whitespace-pre-wrap">
            <span className="font-medium">{renderBoldKpiText(kpi.kra_name)}</span> - {renderBoldKpiText(kpi.kpi_name)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Trend Chart */}
          <div className="h-64 border rounded-lg p-4">
            <h3 className="text-sm font-bold text-muted-foreground uppercase mb-4">Annual Performance Trend</h3>
            {monthlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyData}>
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="target" stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" name="Target" />
                  <Line type="monotone" dataKey="finalAchieved" stroke="hsl(var(--primary))" strokeWidth={2} name="Achieved (Final)" connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                No historical data available
              </div>
            )}
          </div>

          {/* Monthly Detail Table */}
          <div>
            <h3 className="text-lg font-bold text-foreground mb-3">Monthly Detail Log</h3>
            <div className="border rounded-lg overflow-hidden overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-center w-8"></TableHead>
                    <TableHead className="text-center">Month</TableHead>
                    <TableHead className="text-center">Target</TableHead>
                    <TableHead className="text-center">Achieved</TableHead>
                    {scoreColumns.map(col => (
                      <TableHead key={col.key} className="text-center">{col.label}</TableHead>
                    ))}
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyData.length > 0 ? (
                    monthlyData.map((entry, idx) => {
                      const hasRemarks = entry.remarks.length > 0;
                      const isExpanded = expandedRows.has(idx);
                      return (
                        <>
                          <TableRow key={idx} className={hasRemarks ? 'cursor-pointer' : ''} onClick={() => hasRemarks && toggleRow(idx)}>
                            <TableCell className="text-center p-2">
                              {hasRemarks ? (
                                isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground mx-auto" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground mx-auto" />
                              ) : null}
                            </TableCell>
                            <TableCell className="text-center font-medium whitespace-nowrap">{entry.month}</TableCell>
                            <TableCell className="text-center">{entry.isNa ? '-' : entry.target}</TableCell>
                            <TableCell className="text-center font-semibold">
                              {entry.isNa ? (
                                <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200">N/A</Badge>
                              ) : entry.achieved != null ? entry.achieved : '-'}
                            </TableCell>
                            {scoreColumns.map(col => (
                              <TableCell key={col.key} className="text-center">
                                <ScoreBadge score={(entry as any)[col.key]} isNa={entry.isNa} />
                              </TableCell>
                            ))}
                            <TableCell className="text-center">
                              <span className="text-xs font-semibold uppercase text-muted-foreground">
                                {entry.status.replace('_', ' ')}
                              </span>
                            </TableCell>
                          </TableRow>
                          {hasRemarks && isExpanded && (
                            <TableRow key={`${idx}-remarks`} className="bg-muted/30">
                              <TableCell colSpan={totalCols + 1} className="py-2 px-4">
                                <div className="flex flex-col gap-1.5">
                                  {entry.remarks.map((r, ri) => (
                                    <div key={ri} className="flex items-start gap-2 text-xs">
                                      <MessageSquare className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                                      <span className="font-semibold text-foreground">{r.level}:</span>
                                      <span className="text-muted-foreground">{r.text}</span>
                                    </div>
                                  ))}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={totalCols + 1} className="text-center py-8 text-muted-foreground">
                        No monthly data available
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
