/**
 * ADR-352a — "Same KPI, several legacy names" detector.
 *
 * Lists groups where one structured KPI title is stored under multiple
 * `kpi_name` variants (which is why Org KPI Data Entry renders several
 * identical-looking cards). Normalisation reuses the reversible
 * `correct_kpis_range` engine — open rows only, May 2026+ (POLICY §88I).
 */
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Copy, RefreshCw, Wand2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  useSplitKpiNameVariants,
  nonCanonicalVariants,
  type SplitVariantGroup,
} from '@/hooks/useSplitKpiNameVariants';
import { useKpiRangeCorrection } from '@/hooks/useKpiRangeCorrection';

/** Correction window: the forward-only floor through the end of next year. */
const FROM = { period: 'May', year: 2026 };
const TO = { period: 'December', year: new Date().getFullYear() + 1 };

export function SplitNameVariantsCard() {
  const { groups, loading, error, refresh } = useSplitKpiNameVariants();
  const { apply, applying } = useKpiRangeCorrection();
  const { toast } = useToast();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const normalise = async (group: SplitVariantGroup) => {
    const key = `${group.category_id}|${group.kra_name}|${group.kpi_title}`;
    setBusyKey(key);
    let renamed = 0;
    let skipped = 0;
    for (const variant of nonCanonicalVariants(group)) {
      const res = await apply({
        categoryId: group.category_id,
        oldKra: group.kra_name,
        oldKpi: variant.kpi_name,
        newKra: group.kra_name,
        newKpi: group.canonical_kpi_name,
        definitionId: null,
        fromPeriod: FROM.period,
        fromYear: FROM.year,
        toPeriod: TO.period,
        toYear: TO.year,
        includeLocked: false,
      });
      if (!res) { setBusyKey(null); return; }
      renamed += res.kpi_rows_renamed;
      skipped += res.skipped_locked;
    }
    setBusyKey(null);
    toast({
      title: 'Names normalised',
      description: `${renamed} open row(s) renamed to "${group.canonical_kpi_name}"${skipped ? `, ${skipped} locked row(s) left untouched` : ''}.`,
    });
    void refresh();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Copy className="h-4 w-4 text-amber-600" />
              Same KPI, Several Legacy Names
            </CardTitle>
            <CardDescription>
              One structured KPI title stored under multiple old <code>kpi_name</code> variants.
              These render as duplicate cards on Org KPI Data Entry, each holding only part of the
              employees. Normalising renames the open rows to the shortest variant — locked or
              approved months are never touched.
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
            No split names detected — every open KPI title maps to a single stored name.
          </p>
        ) : (
          <div className="max-h-[480px] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="text-xs">Category / KRA</TableHead>
                  <TableHead className="text-xs">KPI title</TableHead>
                  <TableHead className="text-xs text-right">Names</TableHead>
                  <TableHead className="text-xs text-right">Open rows</TableHead>
                  <TableHead className="text-xs text-right whitespace-nowrap">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => {
                  const key = `${g.category_id}|${g.kra_name}|${g.kpi_title}`;
                  return (
                    <TableRow key={key}>
                      <TableCell className="text-xs">
                        <div className="text-muted-foreground">{g.category_name ?? '—'}</div>
                        <div className="font-medium">{g.kra_name}</div>
                      </TableCell>
                      <TableCell className="max-w-[26rem] text-xs">
                        <div className="break-words">{g.kpi_title}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {g.variants.map((v) => (
                            <Badge
                              key={v.kpi_name}
                              variant="outline"
                              className="max-w-[16rem] truncate text-[10px] font-normal"
                              title={v.kpi_name}
                            >
                              {v.kpi_name.slice(0, 40)}{v.kpi_name.length > 40 ? '…' : ''} · {v.rows}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{g.variant_count}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{g.open_rows}</TableCell>
                      <TableCell className="text-right text-xs whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={applying || busyKey !== null}
                          onClick={() => void normalise(g)}
                        >
                          <Wand2 className="mr-1 h-3 w-3" />
                          {busyKey === key ? 'Working…' : 'Normalise'}
                        </Button>
                      </TableCell>
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
