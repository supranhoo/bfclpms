import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ClipboardList } from 'lucide-react';

interface KpiRow {
  id: string;
  category_name: string | null;
  kra_name: string | null;
  kpi_name: string | null;
  weightage: number | null;
  status: string | null;
}

const statusColors: Record<string, string> = {
  open: 'bg-muted text-muted-foreground',
  self_review: 'bg-yellow-500/10 text-yellow-700 border-yellow-200',
  manager_review: 'bg-blue-500/10 text-blue-700 border-blue-200',
  auditor_review: 'bg-purple-500/10 text-purple-700 border-purple-200',
  management_review: 'bg-orange-500/10 text-orange-700 border-orange-200',
  completed: 'bg-green-500/10 text-green-700 border-green-200',
};

export default function KraSummaryTab({ kpis }: { kpis: KpiRow[] }) {
  if (kpis.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            KRA Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground italic">No KPIs assigned for the current review period.</p>
        </CardContent>
      </Card>
    );
  }

  const totalWeightage = kpis.reduce((s, k) => s + (k.weightage || 0), 0);
  const statusCounts = kpis.reduce((acc, k) => {
    const st = k.status || 'open';
    acc[st] = (acc[st] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Total KPIs</p>
          <p className="text-xl font-bold text-foreground">{kpis.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Total Weightage</p>
          <p className="text-xl font-bold text-foreground">{totalWeightage}%</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Completed</p>
          <p className="text-xl font-bold text-green-600">{statusCounts['completed'] || 0}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Pending</p>
          <p className="text-xl font-bold text-yellow-600">{kpis.length - (statusCounts['completed'] || 0)}</p>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            Assigned KPIs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Category / KRA</TableHead>
                  <TableHead className="min-w-[200px]">KPI</TableHead>
                  <TableHead>Weightage</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kpis.map((k, i) => (
                  <TableRow key={k.id}>
                    <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                    <TableCell className="align-top">
                      {k.category_name && (
                        <Badge variant="outline" className="text-xs mb-1">{k.category_name}</Badge>
                      )}
                      <div className="text-sm font-medium leading-snug">{k.kra_name || '—'}</div>
                    </TableCell>
                    <TableCell className="text-sm">{k.kpi_name || '—'}</TableCell>
                    <TableCell className="text-sm font-medium">{k.weightage ?? 0}%</TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${statusColors[k.status || 'open'] || statusColors.open}`}>
                        {(k.status || 'open').replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
