import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, FileText, AlertTriangle, CheckCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface PropagationPreviewProps {
  data: {
    dry_run: boolean;
    kpis_to_update: number;
    employees_affected: number;
    skipped_count: number;
    fields_changed: Record<string, { old: any; new: any }>;
    employees: Array<{ id: string; name: string; kpi_count: number }>;
    skipped: Array<{ kpi_id: string; employee_id: string; reason: string; review_period: string; review_year: number }>;
  } | null;
  isLoading: boolean;
}

export function TemplatePropagationPreview({ data, isLoading }: PropagationPreviewProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span className="text-sm text-muted-foreground">Calculating impact...</span>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <FileText className="h-4 w-4 mx-auto mb-1 text-primary" />
            <p className="text-lg font-bold">{data.kpis_to_update}</p>
            <p className="text-xs text-muted-foreground">KPIs to Update</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <Users className="h-4 w-4 mx-auto mb-1 text-primary" />
            <p className="text-lg font-bold">{data.employees_affected}</p>
            <p className="text-xs text-muted-foreground">Employees</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <AlertTriangle className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
            <p className="text-lg font-bold">{data.skipped_count}</p>
            <p className="text-xs text-muted-foreground">Skipped</p>
          </CardContent>
        </Card>
      </div>

      {/* Fields Changed */}
      <div>
        <h4 className="text-sm font-medium mb-2">Fields Being Changed</h4>
        <div className="space-y-1">
          {Object.entries(data.fields_changed).map(([field, change]) => (
            <div key={field} className="flex items-center gap-2 text-sm">
              <CheckCircle className="h-3 w-3 text-primary" />
              <span className="font-medium capitalize">{field.replace(/_/g, ' ')}:</span>
              <span className="text-muted-foreground line-through">{String(change.old ?? '—')}</span>
              <span>→</span>
              <span className="text-foreground font-medium">{String(change.new ?? '—')}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Employee List */}
      {data.employees.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Affected Employees</h4>
          <ScrollArea className="max-h-[200px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-center">KPIs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.employees.map(emp => (
                  <TableRow key={emp.id}>
                    <TableCell className="text-sm">{emp.name}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{emp.kpi_count}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      )}

      {data.kpis_to_update === 0 && (
        <div className="text-center py-4 text-muted-foreground text-sm">
          No KPIs match the criteria for propagation.
        </div>
      )}
    </div>
  );
}
