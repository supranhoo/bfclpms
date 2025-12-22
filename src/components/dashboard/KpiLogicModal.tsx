import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { KPI } from '@/hooks/useKpis';

interface KpiLogicModalProps {
  isOpen: boolean;
  onClose: () => void;
  kpi: KPI | null;
}

export function KpiLogicModal({ isOpen, onClose, kpi }: KpiLogicModalProps) {
  if (!kpi) return null;

  const thresholds = [
    { rating: 5, label: 'Exceptional', value: kpi.r5, color: 'bg-blue-100 text-blue-700' },
    { rating: 4, label: 'Exceeds', value: kpi.r4, color: 'bg-green-100 text-green-700' },
    { rating: 3, label: 'Meets', value: kpi.r3, color: 'bg-yellow-100 text-yellow-700' },
    { rating: 2, label: 'Below', value: kpi.r2, color: 'bg-orange-100 text-orange-700' },
    { rating: 1, label: 'Needs Improvement', value: kpi.r1, color: 'bg-red-100 text-red-700' },
    { rating: 0, label: 'Not Achieved', value: kpi.r0, color: 'bg-red-200 text-red-800' },
  ].filter(t => t.value !== null && t.value !== undefined);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>KPI Rating Logic</DialogTitle>
          <DialogDescription>
            <span className="font-medium">{kpi.kra_name}</span> - {kpi.kpi_name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* KPI Details */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
            <div>
              <span className="text-xs text-muted-foreground block">Target</span>
              <span className="font-semibold">{kpi.target_value} {kpi.uom}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Criteria</span>
              <span className="font-semibold text-sm">{kpi.criteria || 'Higher is Better'}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Weightage</span>
              <span className="font-semibold">{kpi.weightage}%</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Frequency</span>
              <span className="font-semibold">{kpi.frequency || 'Monthly'}</span>
            </div>
          </div>

          {/* Rating Thresholds */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Rating Thresholds</h4>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rating</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Threshold Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {thresholds.map((t) => (
                    <TableRow key={t.rating}>
                      <TableCell>
                        <Badge className={t.color}>{t.rating}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{t.label}</TableCell>
                      <TableCell>{t.value} {kpi.uom}</TableCell>
                    </TableRow>
                  ))}
                  {thresholds.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-4 text-muted-foreground">
                        No rating thresholds defined
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Source of Data */}
          {kpi.source_of_data && (
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-2">Source of Data</h4>
              <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                {kpi.source_of_data}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
