import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ClipboardList, ChevronRight, ChevronDown, GitMerge } from 'lucide-react';
import { useCanonicalResolver } from '@/hooks/useCanonicalResolver';
import {
  canonicalGroupKey,
  canonicalDisplayNames,
  signatureKey,
  type CanonicalSignature,
} from '@/lib/canonicalGrouping';

interface KpiRow {
  id: string;
  category_id?: string | null;
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
  /** Canonical names from registry, when matched */
  canonicalKraName: string | null;
  isCanonical: boolean;
  aliasKraNames: string[];
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

  // Build the canonical-resolution input (only KPIs with full signatures).
  const signatures = useMemo<CanonicalSignature[]>(
    () =>
      kpis
        .filter(k => k.category_id && k.kra_name && k.kpi_name)
        .map(k => ({
          category_id: k.category_id as string,
          kra_name: k.kra_name as string,
          kpi_name: k.kpi_name as string,
        })),
    [kpis],
  );
  const { data: resolverMap } = useCanonicalResolver(signatures);

  const kraGroups = useMemo<KraGroup[]>(() => {
    const resolver = resolverMap ?? new Map();
    const map = new Map<string, { kpis: KpiRow[]; canonicalKra: string | null; firstKraText: string; firstCategory: string }>();

    for (const kpi of kpis) {
      const sig: CanonicalSignature | null =
        kpi.category_id && kpi.kra_name && kpi.kpi_name
          ? { category_id: kpi.category_id, kra_name: kpi.kra_name, kpi_name: kpi.kpi_name }
          : null;

      let key: string;
      let canonicalKra: string | null = null;
      if (sig) {
        const groupKey = canonicalGroupKey(sig, resolver);
        if (groupKey.startsWith('def:')) {
          // Group at the KRA level, not KPI level: collapse all KPIs that
          // resolve to the same canonical KRA name within the same category.
          const display = canonicalDisplayNames(sig, resolver);
          canonicalKra = display.kra_name;
          key = `def-kra:${kpi.category_id}|${display.kra_name}`;
        } else {
          key = `raw-kra:${kpi.category_id || ''}|${(kpi.kra_name || '').trim().toLowerCase()}`;
        }
      } else {
        key = `raw-kra:${kpi.category_id || ''}|${(kpi.kra_name || '').trim().toLowerCase()}`;
      }

      if (!map.has(key)) {
        map.set(key, {
          kpis: [],
          canonicalKra,
          firstKraText: kpi.kra_name || '—',
          firstCategory: kpi.category_name || '—',
        });
      }
      map.get(key)!.kpis.push(kpi);
    }

    return Array.from(map.entries()).map(([key, group]) => {
      const displayKra = group.canonicalKra ?? group.firstKraText;
      const aliasNames = Array.from(
        new Set(
          group.kpis
            .map(k => k.kra_name || '')
            .filter(name => name && name.trim().toLowerCase() !== displayKra.trim().toLowerCase()),
        ),
      );
      return {
        key,
        category_name: group.firstCategory,
        kra_name: displayKra,
        canonicalKraName: group.canonicalKra,
        isCanonical: group.canonicalKra !== null,
        aliasKraNames: aliasNames,
        kpis: group.kpis,
        kpiCount: group.kpis.length,
        totalWeightage: group.kpis.reduce((s, k) => s + (k.weightage || 0), 0),
        status: deriveKraStatus(group.kpis),
      };
    });
  }, [kpis, resolverMap]);

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
                            <TableCell className="text-sm font-medium">
                              <div className="flex items-center gap-1.5">
                                <span>{group.kra_name}</span>
                                {group.isCanonical && group.aliasKraNames.length > 0 && (
                                  <TooltipProvider delayDuration={150}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="inline-flex items-center" aria-label="Merged variants">
                                          <GitMerge className="h-3 w-3 text-muted-foreground" />
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="max-w-xs">
                                        <p className="text-xs font-medium mb-1">Standardized KRA</p>
                                        <p className="text-xs text-muted-foreground">
                                          Also known as:{' '}
                                          {group.aliasKraNames.join(', ')}
                                        </p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                            </TableCell>
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
