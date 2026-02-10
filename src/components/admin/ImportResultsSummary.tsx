import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, X, CheckCircle2, AlertCircle, MinusCircle } from 'lucide-react';
import * as XLSX from 'xlsx';

export interface ImportRowResult {
  row: number;
  employeeCode: string;
  employeeName: string;
  status: 'success' | 'failed' | 'skipped';
  message: string;
}

interface ImportResultsSummaryProps {
  results: ImportRowResult[];
  importType: 'employee' | 'kpi' | 'kpi-background';
  onDismiss: () => void;
}

export default function ImportResultsSummary({ results, importType, onDismiss }: ImportResultsSummaryProps) {
  const totalCount = results.length;
  const successCount = results.filter(r => r.status === 'success').length;
  const failedCount = results.filter(r => r.status === 'failed').length;
  const skippedCount = results.filter(r => r.status === 'skipped').length;

  const failedOrSkipped = results.filter(r => r.status !== 'success');

  const handleDownload = () => {
    const exportData = failedOrSkipped.map(r => ({
      'Row Number': r.row,
      'Employee Code': r.employeeCode,
      'Employee Name': r.employeeName,
      'Status': r.status.charAt(0).toUpperCase() + r.status.slice(1),
      'Error Message': r.message,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    // Auto-size columns
    ws['!cols'] = [
      { wch: 12 },
      { wch: 16 },
      { wch: 24 },
      { wch: 10 },
      { wch: 60 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Import Results');
    const typeLabel = importType === 'employee' ? 'employees' : 'kpis';
    XLSX.writeFile(wb, `import-errors-${typeLabel}-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (totalCount === 0) return null;

  return (
    <Card className={`border-2 ${
      failedCount > 0 ? 'border-destructive/40' : 'border-green-300 dark:border-green-700'
    }`}>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {failedCount > 0 ? (
            <AlertCircle className="h-5 w-5 text-destructive" />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          )}
          Import Results
        </CardTitle>
        {failedOrSkipped.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-1.5" />
            Download Error Report
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats row */}
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-lg border bg-muted/50 p-3 text-center">
            <div className="text-2xl font-bold text-foreground">{totalCount}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </div>
          <div className="rounded-lg border bg-green-50 dark:bg-green-950/30 p-3 text-center">
            <div className="text-2xl font-bold text-green-600">{successCount}</div>
            <div className="text-xs text-muted-foreground">Success</div>
          </div>
          <div className="rounded-lg border bg-destructive/10 p-3 text-center">
            <div className="text-2xl font-bold text-destructive">{failedCount}</div>
            <div className="text-xs text-muted-foreground">Failed</div>
          </div>
          <div className="rounded-lg border bg-yellow-50 dark:bg-yellow-950/30 p-3 text-center">
            <div className="text-2xl font-bold text-yellow-600">{skippedCount}</div>
            <div className="text-xs text-muted-foreground">Skipped</div>
          </div>
        </div>

        {/* Error table */}
        {failedOrSkipped.length > 0 && (
          <div>
            <p className="text-sm font-medium text-destructive mb-2">
              Issues ({failedOrSkipped.length}):
            </p>
            <div className="max-h-64 overflow-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Row</TableHead>
                    <TableHead className="w-24">Code</TableHead>
                    <TableHead className="w-36">Name</TableHead>
                    <TableHead className="w-20">Status</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {failedOrSkipped.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{r.row}</TableCell>
                      <TableCell className="font-mono text-xs">{r.employeeCode || '-'}</TableCell>
                      <TableCell className="text-xs">{r.employeeName || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === 'failed' ? 'destructive' : 'secondary'} className="text-xs">
                          {r.status === 'failed' ? (
                            <><AlertCircle className="h-3 w-3 mr-1" />Failed</>
                          ) : (
                            <><MinusCircle className="h-3 w-3 mr-1" />Skipped</>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <Button variant="outline" size="sm" onClick={onDismiss} className="w-full">
          <X className="h-4 w-4 mr-1.5" />
          Dismiss
        </Button>
      </CardContent>
    </Card>
  );
}
