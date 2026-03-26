import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ClipboardList, ChevronRight, ChevronDown } from 'lucide-react';

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
  kra_set: 'bg-muted text-muted-foreground',
  self_review: 'bg-yellow-500/10 text-yellow-700 border-yellow-200',
  manager_review: 'bg-blue-500/10 text-blue-700 border-blue-200',
  manager_check: 'bg-blue-500/10 text-blue-700 border-blue-200',
  auditor_review: 'bg-purple-500/10 text-purple-700 border-purple-200',
  audit: 'bg-purple-500/10 text-purple-700 border-purple-200',
  management_review: 'bg-orange-500/10 text-orange-700 border-orange-200',
  approved: 'bg-green-500/10 text-green-700 border-green-200',
  completed: 'bg-green-500/10 text-green-700 border-green-200',
};

interface KraGroup {
  key: string;
  category_name: string;
  kra_name: string;
  kpis: KpiRow[];
  kpiCount: number;
  totalWeightage: number;
  status: 'Completed' | 'In Progress' | 'Pending';
}

function deriveKraStatus(kpis: KpiRow[]): 'Completed' | 'In Progress' | 'Pending' {
  const allApproved = kpis.every(k => k.status === 'approved' || k.status === 'completed');
  if (allApproved) return 'Completed';
  const anyStarted = kpis.some(k => k.status && k.status !== 'open' && k.status !== 'kra_set');
  return anyStarted ? 'In Progress' : 'Pending';
}

const kraStatusColors: Record<string, string> = {
  Completed: 'bg-green-500/10 text-green-700 border-green-200',
  'In Progress': 'bg-yellow-500/10 text-yellow-700 border-yellow-200',
  Pending: 'bg-muted text-muted-foreground',
};

export default function KraSummaryTab({ kpis }: { kpis: KpiRow[] }) {
  const [expandedKras, setExpandedKras] = useState<Set<string>>(new Set());

  const kraGroups = useMemo<KraGroup[]>(() => {
    const map = new Map<string, KpiRow[]>();
    for (const kpi of kpis) {
      const key = `${kpi.category_name || ''}||${kpi.kra_name || ''}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(kpi);
    }
    return Array.from(map.entries()).map(([key, group]) => ({
      key,
      category_name: group[0].category_name || '—',
      kra_name: group[0].kra_name || '—',
      kpis: group,
      kpiCount: group.length,
      totalWeightage: group.reduce((s, k) => s + (k.weightage || 0), 0),
      status: deriveKraStatus(group),
    }));
  }, [kpis]);

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
  const completedKras = kraGroups.filter(g => g.status === 'Completed').length;

  const toggleExpand = (key: string) => {
    setExpandedKras(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Total KRAs</p>
          <p className="text-xl font-bold text-foreground">{kraGroups.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Total KPIs</p>
          <p className="text-xl font-bold text-foreground">{kpis.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Total Weightage</p>
          <p className="text-xl font-bold text-foreground">{totalWeightage}%</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Completed KRAs</p>
          <p className="text-xl font-bold text-green-600">{completedKras} / {kraGroups.length}</p>
        </Card>
      </div>

      {/* KRA Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            Assigned KRAs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>#</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="min-w-[200px]">KRA Name</TableHead>
                  <TableHead>KPIs</TableHead>
                  <TableHead>Total Weightage</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kraGroups.map((group, i) => {
                  const isExpanded = expandedKras.has(group.key);
                  return (
                    <Collapsible key={group.key} open={isExpanded} onOpenChange={() => toggleExpand(group.key)} asChild>
                      <>
                        <CollapsibleTrigger asChild>
                          <TableRow className="cursor-pointer hover:bg-muted/50">
                            <TableCell className="w-8 px-2">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{group.category_name}</Badge>
                            </TableCell>
                            <TableCell className="text-sm font-medium">{group.kra_name}</TableCell>
                            <TableCell className="text-sm font-medium">{group.kpiCount}</TableCell>
                            <TableCell className="text-sm font-medium">{group.totalWeightage}%</TableCell>
                            <TableCell>
                              <Badge className={`text-xs ${kraStatusColors[group.status]}`}>
                                {group.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        </CollapsibleTrigger>
                        <CollapsibleContent asChild>
                          <>
                            {group.kpis.map(kpi => (
                              <TableRow key={kpi.id} className="bg-muted/30">
                                <TableCell />
                                <TableCell />
                                <TableCell />
                                <TableCell className="text-sm pl-6 text-muted-foreground">↳ {kpi.kpi_name || '—'}</TableCell>
                                <TableCell />
                                <TableCell className="text-sm text-muted-foreground">{kpi.weightage ?? 0}%</TableCell>
                                <TableCell>
                                  <Badge className={`text-xs ${statusColors[kpi.status || 'open'] || statusColors.open}`}>
                                    {(kpi.status || 'open').replace(/_/g, ' ')}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </>
                        </CollapsibleContent>
                      </>
                    </Collapsible>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
