import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus, Users } from 'lucide-react';

export interface PropagationResult {
  propagatedCount: number;
  details: Array<{
    employeeName: string;
    employeeCode: string | null;
    departmentName: string | null;
    oldScore: number | null;
    newScore: number | null;
    change: number | null;
  }>;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: PropagationResult | null;
}

export function PropagationSummaryDialog({ open, onOpenChange, result }: Props) {
  if (!result) return null;

  const increased = result.details.filter(d => d.change !== null && d.change > 0).length;
  const decreased = result.details.filter(d => d.change !== null && d.change < 0).length;
  const unchanged = result.details.filter(d => d.change === 0).length;
  const newEntries = result.details.filter(d => d.oldScore === null).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Propagation Summary
          </DialogTitle>
          <DialogDescription>
            Values propagated to {result.propagatedCount} employee KPI(s)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-4 gap-3">
            <Card>
              <CardContent className="py-3 text-center">
                <TrendingUp className="h-4 w-4 text-primary mx-auto mb-1" />
                <p className="text-lg font-bold">{increased}</p>
                <p className="text-xs text-muted-foreground">Improved</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3 text-center">
                <TrendingDown className="h-4 w-4 text-destructive mx-auto mb-1" />
                <p className="text-lg font-bold">{decreased}</p>
                <p className="text-xs text-muted-foreground">Declined</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3 text-center">
                <Minus className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
                <p className="text-lg font-bold">{unchanged}</p>
                <p className="text-xs text-muted-foreground">Unchanged</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3 text-center">
                <Users className="h-4 w-4 text-primary mx-auto mb-1" />
                <p className="text-lg font-bold">{newEntries}</p>
                <p className="text-xs text-muted-foreground">New</p>
              </CardContent>
            </Card>
          </div>

          {/* Details Table */}
          {result.details.length > 0 && (
            <div className="border rounded-md max-h-[350px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-center">Old Score</TableHead>
                    <TableHead className="text-center">New Score</TableHead>
                    <TableHead className="text-center">Change</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.details.map((d, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <span className="font-medium text-sm">{d.employeeName}</span>
                        {d.employeeCode && (
                          <span className="text-xs text-muted-foreground ml-1">({d.employeeCode})</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{d.departmentName || '—'}</TableCell>
                      <TableCell className="text-center">
                        {d.oldScore !== null ? (
                          <Badge variant="outline">{d.oldScore.toFixed(1)}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{d.newScore?.toFixed(1) || '—'}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {d.change !== null ? (
                          <span className={`text-sm font-medium ${
                            d.change > 0 ? 'text-primary' : d.change < 0 ? 'text-destructive' : 'text-muted-foreground'
                          }`}>
                            {d.change > 0 ? '+' : ''}{d.change.toFixed(1)}
                          </span>
                        ) : (
                          <Badge variant="outline" className="text-xs">New</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
