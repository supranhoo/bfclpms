import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useEligibilityMasters } from '@/hooks/useIncrementEligibility';
import { slabSpecificity } from '@/lib/slabMatcher';
import { SLAB_DIMENSIONS } from '@/lib/slabDimensions';
import {
  useIncrementSlabs,
  useDeleteSlab,
  useCopyPreviousYearSlabs,
  type IncrementSlabRow,
} from '@/hooks/useIncrementSlabs';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { Plus, Trash2, Pencil, TrendingUp, Eye, Copy, LayersIcon as Layers, Inbox } from 'lucide-react';
import { generateAssessmentYears, getCurrentAssessmentYear } from '@/lib/assessmentYear';
import { SlabEditorDialog } from '@/components/increment/SlabEditorDialog';
import { SlabScopeDrawer } from '@/components/increment/SlabScopeDrawer';
import { cn } from '@/lib/utils';

export default function IncrementSlabsPage() {
  const ayOptions = useMemo(() => generateAssessmentYears(2), []);
  const [year, setYear] = useState<string>(getCurrentAssessmentYear());
  const { data: slabs = [], isLoading } = useIncrementSlabs(year);
  const { data: masters } = useEligibilityMasters();
  const del = useDeleteSlab();
  const copy = useCopyPreviousYearSlabs();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSlab, setEditingSlab] = useState<IncrementSlabRow | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [scopeSlab, setScopeSlab] = useState<IncrementSlabRow | null>(null);

  const openCreate = () => { setEditingSlab(null); setEditorOpen(true); };
  const openEdit = (s: IncrementSlabRow) => { setEditingSlab(s); setEditorOpen(true); };
  const openScope = (s: IncrementSlabRow) => { setScopeSlab(s); setScopeOpen(true); };

  const onCopyPrev = () => {
    const idx = ayOptions.indexOf(year);
    if (idx > 0) copy.mutate({ fromYear: ayOptions[idx - 1], toYear: year });
  };

  /** Compact scope summary: up to 2 dimension chips + "+N more". */
  const renderCompactScope = (s: IncrementSlabRow) => {
    const scoped = SLAB_DIMENSIONS
      .map((d) => {
        const ids = ((s as any)[d.slabKey] as string[] | null) ?? [];
        return { label: d.label, count: ids.length };
      })
      .filter((x) => x.count > 0);

    if (scoped.length === 0) {
      return (
        <Badge variant="secondary" className="font-normal text-xs">
          All employees
        </Badge>
      );
    }

    const visible = scoped.slice(0, 2);
    const extra = scoped.length - visible.length;
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {visible.map((v) => (
          <Badge key={v.label} variant="outline" className="font-normal text-xs">
            {v.label}: {v.count}
          </Badge>
        ))}
        {extra > 0 && (
          <span className="text-xs text-muted-foreground">+{extra} more</span>
        )}
      </div>
    );
  };

  // Stat strip values — derived from existing data only.
  const stats = useMemo(() => {
    const total = slabs.length;
    const avg = total === 0 ? 0
      : slabs.reduce((acc, s) => acc + Number(s.increment_percent), 0) / total;
    const fullyScoped = slabs.filter((s) => slabSpecificity(s as any) === SLAB_DIMENSIONS.length).length;
    const orgWide = slabs.filter((s) => slabSpecificity(s as any) === 0).length;
    return { total, avg, fullyScoped, orgWide };
  }, [slabs]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-5">
        {/* ── Page header ───────────────────────────────────────── */}
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" />
              Increment configuration
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Increment Slabs
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Define rating bands and the corresponding increment percentage for each
              assessment year. The most specifically-scoped matching slab wins for each employee.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-[150px] bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ayOptions.map((y) => (
                  <SelectItem key={y} value={y}>AY {y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={onCopyPrev}
              disabled={copy.isPending || ayOptions.indexOf(year) <= 0}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy Previous Year
            </Button>
            <Button onClick={openCreate} className="shadow-sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Slab
            </Button>
          </div>
        </header>

        {/* ── Stat strip ────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile label="Total Slabs" value={stats.total.toString()} />
          <StatTile
            label="Average Increment"
            value={`${stats.avg.toFixed(2)}%`}
            tone="primary"
          />
          <StatTile label="Fully Scoped (6/6)" value={stats.fullyScoped.toString()} />
          <StatTile label="Organisation-wide" value={stats.orgWide.toString()} />
        </div>

        {/* ── Table card ────────────────────────────────────────── */}
        <Card className="shadow-sm border-border/70">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Slabs for AY {year}</span>
                <Badge variant="secondary" className="ml-1 text-[10px] font-normal">
                  {slabs.length}
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground hidden md:inline">
                Higher specificity wins on ties · pro-rata applies from Date of Joining
              </span>
            </div>

            <div className="relative overflow-x-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[160px]">Rating Band</TableHead>
                    <TableHead className="w-[140px]">Increment</TableHead>
                    <TableHead className="min-w-[280px]">Scope</TableHead>
                    <TableHead className="w-[160px]">Specificity</TableHead>
                    <TableHead className="w-[200px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 5 }).map((__, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-5 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : slabs.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={5} className="py-16">
                        <div className="flex flex-col items-center justify-center gap-3 text-center">
                          <div className="rounded-full bg-muted p-3">
                            <Inbox className="h-6 w-6 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-medium">No slabs defined for AY {year}</p>
                            <p className="text-sm text-muted-foreground">
                              Create your first slab or copy bands from the previous year.
                            </p>
                          </div>
                          <div className="flex gap-2 pt-1">
                            <Button variant="outline" onClick={onCopyPrev} disabled={ayOptions.indexOf(year) <= 0}>
                              <Copy className="h-4 w-4 mr-2" />
                              Copy Previous Year
                            </Button>
                            <Button onClick={openCreate}>
                              <Plus className="h-4 w-4 mr-2" />
                              Add Slab
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    slabs.map((s, idx) => {
                      const spec = slabSpecificity(s as any);
                      return (
                        <TableRow
                          key={s.id}
                          className={cn(
                            'transition-colors',
                            idx % 2 === 1 && 'bg-muted/20',
                            'hover:bg-muted/40',
                          )}
                        >
                          <TableCell>
                            <div className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 font-mono text-sm tabular-nums">
                              <span>{Number(s.rating_from).toFixed(2)}</span>
                              <span className="text-muted-foreground">→</span>
                              <span>{Number(s.rating_to).toFixed(2)}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col leading-tight">
                              <span className="text-base font-semibold text-foreground tabular-nums">
                                {Number(s.increment_percent).toFixed(2)}%
                              </span>
                              {s.prorate_on_doj && (
                                <span className="text-[10px] text-muted-foreground">
                                  pro-rata on DOJ
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              {renderCompactScope(s)}
                              <Button
                                variant="link"
                                size="sm"
                                onClick={() => openScope(s)}
                                className="h-auto p-0 text-xs"
                              >
                                <Eye className="h-3 w-3 mr-1" />
                                View scope
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <SpecificityMeter value={spec} max={SLAB_DIMENSIONS.length} />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openEdit(s)}
                                    aria-label="View or edit slab"
                                  >
                                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                                    Edit
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Open full slab configuration</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => setConfirmDelete(s.id)}
                                    aria-label="Delete slab"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete slab</TooltipContent>
                              </Tooltip>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Leave a scope field empty in the editor to apply the slab to every value of that dimension.
          When multiple slabs match an employee, the slab scoping the most dimensions wins.
        </p>

        <SlabEditorDialog
          open={editorOpen}
          onOpenChange={setEditorOpen}
          slab={editingSlab}
          assessmentYear={year}
          existingSlabs={slabs}
          masters={masters}
        />

        <SlabScopeDrawer
          open={scopeOpen}
          onOpenChange={setScopeOpen}
          slab={scopeSlab}
          masters={masters}
          onEdit={openEdit}
        />

        <ConfirmDestructiveDialog
          open={!!confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          title="Delete slab?"
          description="This cannot be undone."
          onConfirm={() => {
            if (confirmDelete) {
              del.mutate({ id: confirmDelete, assessment_year: year });
            }
            setConfirmDelete(null);
          }}
        />
      </div>
    </TooltipProvider>
  );
}

/* ───────────────────────── helpers ───────────────────────── */

function StatTile({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'primary';
}) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-card px-4 py-3 shadow-sm',
        tone === 'primary' && 'border-primary/30 bg-primary/5',
      )}
    >
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          'mt-1 text-xl font-semibold tabular-nums',
          tone === 'primary' ? 'text-primary' : 'text-foreground',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function SpecificityMeter({ value, max }: { value: number; max: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {Array.from({ length: max }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-2 w-2 rounded-full',
              i < value ? 'bg-primary' : 'bg-muted',
            )}
          />
        ))}
      </div>
      <span className="text-xs font-medium tabular-nums text-muted-foreground">
        {value}/{max}
      </span>
    </div>
  );
}