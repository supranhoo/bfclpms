/**
 * ADR-259 — Category folders → KRA list → KPI list drilldown.
 * Pure presentation: it receives an already-loaded tree and reports selection.
 */
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronRight, Folder, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BuConsoleCategoryNode, BuConsoleKraNode } from '@/hooks/useBuConsole';

interface Props {
  categories: BuConsoleCategoryNode[];
  selectedCategoryId: string | null;
  selectedKraKey: string | null;
  onSelectCategory: (categoryId: string) => void;
  onSelectKra: (kraKey: string) => void;
  onSelectKpi: (categoryId: string, kraName: string, kpiName: string) => void;
}

export function BuConsoleTree({
  categories,
  selectedCategoryId,
  selectedKraKey,
  onSelectCategory,
  onSelectKra,
  onSelectKpi,
}: Props) {
  const category = categories.find(c => c.category_id === selectedCategoryId) ?? null;
  const kra: BuConsoleKraNode | null =
    category?.kras.find(k => k.kra_key === selectedKraKey) ?? null;

  return (
    <div className="space-y-4">
      {/* Category folders */}
      <div className="flex flex-wrap gap-2">
        {categories.map(c => (
          <button
            key={c.category_id}
            type="button"
            onClick={() => onSelectCategory(c.category_id)}
            className={cn(
              'flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
              c.category_id === selectedCategoryId
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card hover:bg-accent',
            )}
          >
            <Folder className="h-4 w-4" />
            <span className="font-medium">{c.category_name}</span>
            <Badge variant="secondary">{c.kpi_count}</Badge>
          </button>
        ))}
        {categories.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No KPIs found for this scope and period.
          </p>
        )}
      </div>

      {/* KRA list */}
      {category && (
        <Card>
          <CardContent className="p-0 divide-y">
            {category.kras.map(k => (
              <button
                key={k.kra_key}
                type="button"
                onClick={() => onSelectKra(k.kra_key)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-accent',
                  k.kra_key === selectedKraKey && 'bg-accent',
                )}
              >
                <span className="font-medium">{k.kra_name}</span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Badge variant="outline">{k.kpi_count} KPIs</Badge>
                  <ChevronRight className="h-4 w-4" />
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* KPI list */}
      {category && kra && (
        <Card>
          <CardContent className="p-0 divide-y">
            {kra.kpis.map(kpi => (
              <div
                key={kpi.kpi_key}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{kpi.kpi_name}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {kpi.employee_count} employee{kpi.employee_count === 1 ? '' : 's'} mapped
                    {kpi.is_org_level && <Badge variant="secondary" className="ml-2">Org-level</Badge>}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onSelectKpi(category.category_id, kra.kra_name, kpi.kpi_name)}
                >
                  Open
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}