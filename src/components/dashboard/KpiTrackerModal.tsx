import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import type { KPI, ReviewSubmission } from '@/hooks/useKpis';
import { renderBoldKpiText } from '@/components/ui/FormattedText';

interface KpiTrackerModalProps {
  isOpen: boolean;
  onClose: () => void;
  kpi: KPI | null;
  allKpis: KPI[];
  submissions: ReviewSubmission[];
}

const fullMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getMonthSortIndex(period: string): number {
  const first = period.split('-')[0];
  const idx = fullMonths.indexOf(first);
  if (idx >= 0) return idx;
  return shortMonths.indexOf(first);
}

export function KpiTrackerModal({ isOpen, onClose, kpi, allKpis, submissions }: KpiTrackerModalProps) {
  // Build monthly history from related KPIs (same name across different periods)
  const monthlyData = useMemo(() => {
    if (!kpi) return [];
    
    // Find all KPIs with the same name for this employee
    const relatedKpis = allKpis.filter(k => 
      k.employee_id === kpi.employee_id &&
      k.kpi_name === kpi.kpi_name &&
      k.kra_name === kpi.kra_name
    );

    const submissionMap = new Map(submissions.map(s => [s.kpi_id, s]));

    // Deduplicate by period + year to avoid showing same month twice
    const periodMap = new Map<string, {
      month: string;
      target: number | null;
      achieved: number | null;
      rating: number | null;
      status: string;
      year: number;
      isNa: boolean;
    }>();

    relatedKpis.forEach(k => {
      const periodKey = `${k.review_period}-${k.review_year}`;
      if (!periodMap.has(periodKey)) {
        const sub = submissionMap.get(k.id);
        const isNa = sub?.is_na === true;
        periodMap.set(periodKey, {
          month: k.review_period || 'N/A',
          target: isNa ? null : (k.target_value || 0),
          achieved: isNa ? null : (sub ? (sub.achieved_value ?? null) : null),
          rating: isNa ? null : (sub ? (sub.final_score ?? sub.management_score ?? sub.auditor_score ?? sub.manager_score ?? sub.self_score ?? null) : null),
          status: k.status || 'open',
          year: k.review_year || new Date().getFullYear(),
          isNa,
        });
      }
    });

    return Array.from(periodMap.values()).sort((a, b) => {
      // Sort by year first, then by month
      if (a.year !== b.year) return a.year - b.year;
      return getMonthSortIndex(a.month) - getMonthSortIndex(b.month);
    });
  }, [kpi, allKpis, submissions]);

  if (!kpi) return null;

  const getRatingColor = (score: number) => {
    if (score >= 4) return 'text-blue-600 bg-blue-100 dark:bg-blue-900 dark:text-blue-200';
    if (score >= 3) return 'text-green-600 bg-green-100 dark:bg-green-900 dark:text-green-200';
    if (score >= 2) return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900 dark:text-yellow-200';
    return 'text-red-600 bg-red-100 dark:bg-red-900 dark:text-red-200';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
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
                  <Line 
                    type="monotone" 
                    dataKey="target" 
                    stroke="hsl(var(--muted-foreground))" 
                    strokeDasharray="5 5"
                    name="Target"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="achieved" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    name="Achieved"
                  />
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
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-center">Month</TableHead>
                    <TableHead className="text-center">Target</TableHead>
                    <TableHead className="text-center">Achieved</TableHead>
                    <TableHead className="text-center">Rating</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyData.length > 0 ? (
                    monthlyData.map((entry, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-center font-medium">{entry.month}</TableCell>
                        <TableCell className="text-center">{entry.target}</TableCell>
                        <TableCell className="text-center font-semibold">
                          {entry.isNa ? (
                            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200">N/A</Badge>
                          ) : entry.achieved != null ? entry.achieved : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {entry.isNa ? (
                            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200">N/A</Badge>
                          ) : entry.rating != null ? (
                            <Badge className={getRatingColor(entry.rating)}>
                              {entry.rating.toFixed(1)}
                            </Badge>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-xs font-semibold uppercase text-muted-foreground">
                            {entry.status.replace('_', ' ')}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
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
