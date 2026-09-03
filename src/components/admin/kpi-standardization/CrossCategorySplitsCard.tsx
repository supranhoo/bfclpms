/**
 * ADR-354 — "Same KPI, two categories" detector.
 *
 * Companion to the ADR-352a name-variant card. `list_split_kpi_name_variants()`
 * groups within a single category, so a KPI whose rows sit under two different
 * categories (e.g. "Production" vs "Production & Operations") still renders as
 * separate Org KPI Data Entry cards even after every name is normalised.
 *
 * Read-only by design: merging categories moves rows between cards and is an
 * explicit admin decision, not a one-click cleanup.
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FolderTree, RefreshCw } from 'lucide-react';
import {
  useCrossCategoryKpiTitleSplits,
  dominantCategory,
} from '@/hooks/useSplitKpiNameVariants';

export function CrossCategorySplitsCard() {
  const { groups, loading, error, refresh } = useCrossCategoryKpiTitleSplits();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderTree className="h-4 w-4 text-amber-600" />
              Same KPI, Two Categories
            </CardTitle>
            <CardDescription>
              One structured KPI title whose rows live under more than one KRA category.
              Org KPI Data Entry groups on category, so these stay separate cards even after
              the legacy names are normalised. Move the rows to the intended category from the
              Performance Console to merge them.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="py-3 text-sm text-destructive">{error}</p>
        ) : loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        ) : groups.length === 0 ? (
          <p className="py-4 text-center text-sm italic text-muted-foreground">
            No cross-category splits — every open KPI title sits in a single category.
          </p>
        ) : (
          <div className="max-h-[480px] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="text-xs">KRA</TableHead>
                  <TableHead className="text-xs">KPI title / categories</TableHead>
                  <TableHead className="text-xs text-right">Categories</TableHead>
                  <TableHead className="text-xs text-right">Open rows</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => {
                  const keep = dominantCategory(g);
                  return (
                    <TableRow key={`${g.kra_name}|${g.kpi_title}`}>
                      <TableCell className="max-w-[16rem] text-xs font-medium break-words">
                        {g.kra_name}
                      </TableCell>
                      <TableCell className="max-w-[26rem] text-xs">
                        <div className="break-words">{g.kpi_title}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {g.categories.map((c) => (
                            <Badge
                              key={c.category_id}
                              variant={c.category_id === keep?.category_id ? 'secondary' : 'outline'}
                              className="text-[10px] font-normal"
                              title={`${c.rows} row(s), ${c.name_variants} legacy name(s)`}
                            >
                              {c.category_name ?? '—'} · {c.rows}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{g.category_count}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{g.open_rows}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
