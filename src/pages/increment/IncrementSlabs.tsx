import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useEligibilityMasters } from '@/hooks/useIncrementEligibility';
import { describeScope, slabSpecificity, type EmployeeDims } from '@/lib/slabMatcher';
import { SLAB_DIMENSIONS } from '@/lib/slabDimensions';
import {
  useIncrementSlabs,
  useDeleteSlab,
  useCopyPreviousYearSlabs,
  type IncrementSlabRow,
} from '@/hooks/useIncrementSlabs';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { Plus, Trash2, Loader2, Pencil } from 'lucide-react';
import { generateAssessmentYears, getCurrentAssessmentYear } from '@/lib/assessmentYear';
import { SlabEditorDialog } from '@/components/increment/SlabEditorDialog';

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

  const openCreate = () => { setEditingSlab(null); setEditorOpen(true); };
  const openEdit = (s: IncrementSlabRow) => { setEditingSlab(s); setEditorOpen(true); };

  const onCopyPrev = () => {
    const idx = ayOptions.indexOf(year);
    if (idx > 0) copy.mutate({ fromYear: ayOptions[idx - 1], toYear: year });
  };

  /** Resolve master id → display name for the row scope summary. */
  const nameResolvers = useMemo(() => {
    const map = new Map<keyof EmployeeDims, Map<string, string>>();
    for (const dim of SLAB_DIMENSIONS) {
      const inner = new Map<string, string>();
      for (const o of masters?.[dim.mastersKey] ?? []) inner.set(o.id, o.name);
      map.set(dim.empKey, inner);
    }
    return map;
  }, [masters]);

  const resolveName = (dim: keyof EmployeeDims, id: string): string | undefined =>
    nameResolvers.get(dim)?.get(id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Increment Slabs"
        description="Rating bands and corresponding increment percentages per assessment year"
      />

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between space-y-0">
          <CardTitle>Slabs for AY {year}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ayOptions.map((y) => <SelectItem key={y} value={y}>AY {y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={onCopyPrev} disabled={copy.isPending}>
              Copy Previous Year
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />Add Slab
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Rating Band</TableHead>
                  <TableHead className="w-[120px]">Increment</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead className="w-[90px] text-center">Specificity</TableHead>
                  <TableHead className="w-[140px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slabs.map((s) => {
                  const spec = slabSpecificity(s as any);
                  const scope = describeScope(s as any, resolveName);
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-sm tabular-nums">
                        {Number(s.rating_from).toFixed(2)} → {Number(s.rating_to).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{Number(s.increment_percent).toFixed(2)}%</span>
                          {s.prorate_on_doj && (
                            <span className="text-[10px] text-muted-foreground">pro-rata on DOJ</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          className="text-sm text-muted-foreground line-clamp-2"
                          title={scope}
                        >
                          {scope}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-[10px] px-1.5">
                          {spec}/{SLAB_DIMENSIONS.length}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => openEdit(s)}
                            aria-label="View / Edit slab"
                            title="View / Edit"
                          >
                            <Pencil className="h-3.5 w-3.5 mr-1" />
                            View / Edit
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8"
                            onClick={() => setConfirmDelete(s.id)}
                            aria-label="Delete slab"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {slabs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No slabs defined for this year. Click <strong>Add Slab</strong> to create one.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Click <strong>View / Edit</strong> to open the full slab configuration. Leave a scope
            field empty in the editor to apply the slab to every value of that dimension. When
            multiple slabs match an employee, the slab scoping the most dimensions wins
            (specificity badge).
          </p>
        </CardContent>
      </Card>

      <SlabEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        slab={editingSlab}
        assessmentYear={year}
        existingSlabs={slabs}
        masters={masters}
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
  );
}