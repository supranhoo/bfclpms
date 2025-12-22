import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import type { KPI, ReviewSubmission } from '@/hooks/useKpis';

interface KpiTrackerModalProps {
  isOpen: boolean;
  onClose: () => void;
  kpi: KPI | null;
  allKpis: KPI[];
  submissions: ReviewSubmission[];
}

const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

    return relatedKpis.map(k => {
      const sub = submissionMap.get(k.id);
      return {
        month: k.review_period || 'N/A',
        target: k.target_value || 0,
        achieved: sub?.achieved_value || 0,
        rating: sub?.final_score || sub?.self_score || 0,
        status: k.status,
      };
    }).sort((a, b) => {
      // Sort by month
      const [monthA] = a.month.split('-');
      const [monthB] = b.month.split('-');
      return monthOrder.indexOf(monthA) - monthOrder.indexOf(monthB);
    });
  }, [kpi, allKpis, submissions]);

  if (!kpi) return null;

  const getRatingColor = (score: number) => {
    if (score >= 4) return 'text-blue-600 bg-blue-100';
    if (score >= 3) return 'text-green-600 bg-green-100';
    if (score >= 2) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
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
          <DialogDescription>
            <span className="font-medium">{kpi.kra_name}</span> - {kpi.kpi_name}
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
                        <TableCell className="text-center font-semibold">{entry.achieved || '-'}</TableCell>
                        <TableCell className="text-center">
                          {entry.rating > 0 ? (
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
