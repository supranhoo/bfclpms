import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, CheckCircle2, Loader2, PlayCircle, Search } from 'lucide-react';
import { useKpiAliases, type KpiDefinition } from '@/hooks/useKpiRegistry';
import {
  CORRECTION_FLOOR,
  MONTH_NAMES,
  periodKey,
  useKpiRangeCorrection,
  type RangeDryRunRow,
} from '@/hooks/useKpiRangeCorrection';
import { useToast } from '@/hooks/use-toast';

const YEARS = [2026, 2027];

interface VariantPreview {
  kraName: string;
  kpiName: string;
  rows: RangeDryRunRow[];
  total: number;
  locked: number;
  org: number;
}

/**
 * ADR-330 — "Apply to KPI rows" for one canonical definition.
 *
 * Renames every linked variant to the canonical wording across a month range
 * in one reversible action per variant. Metadata linking alone never touched
 * `kpis.kpi_name`, which is why reports kept showing old text.
 */
export function ApplyRegistryDialog({
  open,
  onClose,
  definition,
  onApplied,
}: {
  open: boolean;
  onClose: () => void;
  definition: KpiDefinition | null;
  onApplied?: () => void;
}) {
  const { data: aliases, loading: aliasesLoading } = useKpiAliases(open && definition ? definition.id : undefined);
  const { dryRun, apply, previewing, applying } = useKpiRangeCorrection();
  const { toast } = useToast();

  const [fromPeriod, setFromPeriod] = useState('May');
  const [fromYear, setFromYear] = useState(2026);
  const [toPeriod, setToPeriod] = useState('June');
  const [toYear, setToYear] = useState(2027);
  const [previews, setPreviews] = useState<VariantPreview[] | null>(null);

  useEffect(() => {
    if (!open) setPreviews(null);
  }, [open]);

  // Variants that actually need renaming (canonical wording is a no-op).
  const variants = useMemo(() => {
    if (!definition) return [];
    return aliases
      .filter(a => !(a.variant_kra_name === definition.canonical_kra_name
        && a.variant_kpi_name === definition.canonical_kpi_name))
      .map(a => ({ kraName: a.variant_kra_name, kpiName: a.variant_kpi_name }));
  }, [aliases, definition]);

  const fromKey = periodKey(fromPeriod, fromYear);
  const toKey = periodKey(toPeriod, toYear);
  const rangeInvalid = fromKey > toKey;
  const belowFloor = fromKey < CORRECTION_FLOOR;

  const handlePreview = async () => {
    if (!definition) return;
    const results: VariantPreview[] = [];
    for (const v of variants) {
      const rows = await dryRun({
        categoryId: definition.category_id,
        oldKra: v.kraName,
        oldKpi: v.kpiName,
        fromPeriod, fromYear, toPeriod, toYear,
      });
      results.push({
        kraName: v.kraName,
        kpiName: v.kpiName,
        rows,
        total: rows.reduce((s, r) => s + Number(r.kpi_rows || 0), 0),
        locked: rows.reduce((s, r) => s + Number(r.locked_rows || 0), 0),
        org: rows.reduce((s, r) => s + Number(r.org_rows || 0), 0),
      });
    }
    setPreviews(results);
  };

  const totalRows = previews?.reduce((s, p) => s + p.total, 0) ?? 0;

  const handleApply = async () => {
    if (!definition || !previews) return;
    let renamed = 0;
    let failures = 0;
    for (const p of previews) {
      if (p.total === 0) continue;
      const res = await apply({
        categoryId: definition.category_id,
        oldKra: p.kraName,
        oldKpi: p.kpiName,
        newKra: definition.canonical_kra_name,
        newKpi: definition.canonical_kpi_name,
        definitionId: definition.id,
        fromPeriod, fromYear, toPeriod, toYear,
      });
      if (res?.ok) renamed += res.kpi_rows_renamed; else failures += 1;
    }
    if (failures > 0) {
      toast({
        title: 'Partially applied',
        description: `${renamed} rows renamed, ${failures} variant(s) failed. Reversible from the History tab.`,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Standardisation applied',
        description: `${renamed} KPI rows now carry the canonical name. Reversible from the History tab.`,
      });
    }
    setPreviews(null);
    onApplied?.();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Apply canonical name to KPI rows</DialogTitle>
          <DialogDescription className="break-words">
            Rewrites every linked variant to <strong>{definition?.canonical_kra_name}</strong> /{' '}
            {definition?.canonical_kpi_name} across the selected months. Targets, weightages, scores
            and workflow status are never changed.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">From month</Label>
            <Select value={fromPeriod} onValueChange={v => { setFromPeriod(v); setPreviews(null); }}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">From year</Label>
            <Select value={String(fromYear)} onValueChange={v => { setFromYear(Number(v)); setPreviews(null); }}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">To month</Label>
            <Select value={toPeriod} onValueChange={v => { setToPeriod(v); setPreviews(null); }}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">To year</Label>
            <Select value={String(toYear)} onValueChange={v => { setToYear(Number(v)); setPreviews(null); }}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {rangeInvalid && (
          <p className="flex items-center gap-1 text-xs text-destructive">
            <AlertTriangle className="h-3 w-3" /> The end month is before the start month.
          </p>
        )}
        {belowFloor && !rangeInvalid && (
          <p className="flex items-center gap-1 text-xs text-amber-600">
            <AlertTriangle className="h-3 w-3" /> Months before May 2026 are frozen and will be skipped.
          </p>
        )}

        <div className="rounded-md border p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm">
              {aliasesLoading
                ? 'Loading linked variants…'
                : `${variants.length} variant name${variants.length === 1 ? '' : 's'} will be rewritten`}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreview}
              disabled={previewing || rangeInvalid || variants.length === 0}
            >
              {previewing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Search className="h-4 w-4 mr-1" />}
              Preview impact
            </Button>
          </div>

          {!aliasesLoading && variants.length === 0 && (
            <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              Every linked alias already matches the canonical wording — nothing to rename.
            </p>
          )}

          {previews && (
            <div className="mt-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Variant</TableHead>
                    <TableHead className="text-right">KPI rows</TableHead>
                    <TableHead className="text-right">Org rows</TableHead>
                    <TableHead className="text-right">Locked</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previews.map(p => (
                    <TableRow key={`${p.kraName}::${p.kpiName}`}>
                      <TableCell className="text-xs break-words max-w-[420px]">
                        <div className="font-medium">{p.kraName}</div>
                        <div className="text-muted-foreground">{p.kpiName}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{p.total}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.org}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.locked > 0 ? <Badge variant="outline">{p.locked}</Badge> : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-2 text-xs text-muted-foreground">
                {totalRows} KPI row{totalRows === 1 ? '' : 's'} will be renamed. Locked rows are
                text-only edits: the name changes, the approved score does not.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={applying}>Cancel</Button>
          <Button onClick={handleApply} disabled={applying || !previews || totalRows === 0}>
            {applying ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <PlayCircle className="h-4 w-4 mr-1" />}
            Apply to {totalRows} row{totalRows === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
