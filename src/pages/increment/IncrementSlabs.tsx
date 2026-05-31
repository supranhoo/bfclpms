import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { MultiSelectFilter } from '@/components/review/MultiSelectFilter';
import { useEligibilityMasters } from '@/hooks/useIncrementEligibility';
import { isExactScopeDuplicate, slabSpecificity } from '@/lib/slabMatcher';
import {
  useIncrementSlabs,
  useUpsertSlab,
  useDeleteSlab,
  useCopyPreviousYearSlabs,
  type IncrementSlabRow,
} from '@/hooks/useIncrementSlabs';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { Plus, Trash2, Loader2, Pencil, Building2, Network, Factory, MapPin, Users, Layers } from 'lucide-react';
import { generateAssessmentYears, getCurrentAssessmentYear } from '@/lib/assessmentYear';
import { useToast } from '@/hooks/use-toast';

type SlabDraft = Partial<IncrementSlabRow> & {
  rating_from: number;
  rating_to: number;
  increment_percent: number;
  prorate_on_doj: boolean;
  company_ids: string[];
  division_ids: string[];
  business_unit_ids: string[];
  location_ids: string[];
  employee_category_ids: string[];
  level_ids: string[];
};

function emptyDraft(): SlabDraft {
  return {
    rating_from: 0,
    rating_to: 0,
    increment_percent: 0,
    prorate_on_doj: true,
    company_ids: [],
    division_ids: [],
    business_unit_ids: [],
    location_ids: [],
    employee_category_ids: [],
    level_ids: [],
  };
}

export default function IncrementSlabsPage() {
  const ayOptions = useMemo(() => generateAssessmentYears(2), []);
  const [year, setYear] = useState<string>(getCurrentAssessmentYear());
  const { data: slabs = [], isLoading } = useIncrementSlabs(year);
  const { data: masters } = useEligibilityMasters();
  const upsert = useUpsertSlab();
  const del = useDeleteSlab();
  const copy = useCopyPreviousYearSlabs();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const { toast } = useToast();

  const [editing, setEditing] = useState<{ open: boolean; id: string | null; draft: SlabDraft }>(
    { open: false, id: null, draft: emptyDraft() },
  );

  const openNew = () => setEditing({ open: true, id: null, draft: emptyDraft() });
  const openEdit = (s: IncrementSlabRow) =>
    setEditing({
      open: true,
      id: s.id,
      draft: {
        rating_from: Number(s.rating_from),
        rating_to: Number(s.rating_to),
        increment_percent: Number(s.increment_percent),
        prorate_on_doj: s.prorate_on_doj,
        company_ids: s.company_ids ?? [],
        division_ids: s.division_ids ?? [],
        business_unit_ids: s.business_unit_ids ?? [],
        location_ids: s.location_ids ?? [],
        employee_category_ids: s.employee_category_ids ?? [],
        level_ids: s.level_ids ?? [],
      },
    });

  const patchDraft = (patch: Partial<SlabDraft>) =>
    setEditing((e) => ({ ...e, draft: { ...e.draft, ...patch } }));

  const saveEditing = async () => {
    const d = editing.draft;
    if (d.rating_to < d.rating_from) {
      toast({ title: 'Invalid range', description: 'Rating To must be ≥ Rating From.', variant: 'destructive' });
      return;
    }
    if (d.increment_percent < 0 || d.increment_percent > 100) {
      toast({ title: 'Invalid %', description: 'Increment % must be between 0 and 100.', variant: 'destructive' });
      return;
    }
    // Exact-duplicate scope guard against existing slabs (excluding self).
    const dupe = slabs.find(
      (s) => s.id !== editing.id && isExactScopeDuplicate(s as any, d as any),
    );
    if (dupe) {
      toast({
        title: 'Duplicate slab',
        description: 'Another slab in this AY has the same rating band and identical scope.',
        variant: 'destructive',
      });
      return;
    }
    await upsert.mutateAsync({
      id: editing.id ?? undefined,
      assessment_year: year,
      increment_period: `Jul ${year.slice(0, 2)}–Jun ${year.slice(-2)}`,
      rating_from: Number(d.rating_from),
      rating_to: Number(d.rating_to),
      increment_percent: Number(d.increment_percent),
      prorate_on_doj: d.prorate_on_doj,
      company_ids: d.company_ids,
      division_ids: d.division_ids,
      business_unit_ids: d.business_unit_ids,
      location_ids: d.location_ids,
      employee_category_ids: d.employee_category_ids,
      level_ids: d.level_ids,
    });
    setEditing({ open: false, id: null, draft: emptyDraft() });
  };

  const onCopyPrev = () => {
    const idx = ayOptions.indexOf(year);
    if (idx > 0) copy.mutate({ fromYear: ayOptions[idx - 1], toYear: year });
  };

  const opts = (list?: Array<{ id: string; name: string }>) =>
    (list ?? []).map((o) => ({ value: o.id, label: o.name }));
  const nameOf = (list: Array<{ id: string; name: string }> | undefined, id: string) =>
    list?.find((x) => x.id === id)?.name ?? id.slice(0, 6);

  function scopeChips(s: IncrementSlabRow) {
    const chips: Array<{ label: string; values: string[]; list?: Array<{ id: string; name: string }> }> = [
      { label: 'Co',  values: s.company_ids ?? [],       list: masters?.companies },
      { label: 'Div', values: s.division_ids ?? [],      list: masters?.divisions },
      { label: 'BU',  values: s.business_unit_ids ?? [], list: masters?.business_units },
      { label: 'Loc', values: s.location_ids ?? [],      list: masters?.locations },
      { label: 'EmpCat', values: s.employee_category_ids ?? [], list: masters?.employee_categories },
      { label: 'Lvl', values: s.level_ids ?? [],         list: masters?.levels },
    ];
    const scoped = chips.filter((c) => c.values.length > 0);
    if (scoped.length === 0) return <span className="text-muted-foreground text-xs">All employees</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {scoped.map((c) => (
          <Badge key={c.label} variant="secondary" className="text-xs font-normal">
            {c.label}: {c.values.length === 1 ? nameOf(c.list, c.values[0]) : `${c.values.length} selected`}
          </Badge>
        ))}
      </div>
    );
  }

  const d = editing.draft;
  const specificity = slabSpecificity(d as any);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Increment Slabs"
        description="Rating bands and corresponding increment percentages per assessment year"
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Slabs for AY {year}</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ayOptions.map((y) => <SelectItem key={y} value={y}>AY {y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={onCopyPrev} disabled={copy.isPending}>Copy Previous Year</Button>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Add Slab</Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rating From</TableHead>
                  <TableHead>Rating To</TableHead>
                  <TableHead>Increment %</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Prorate on DOJ</TableHead>
                  <TableHead className="w-[120px]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slabs.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.rating_from}</TableCell>
                    <TableCell>{s.rating_to}</TableCell>
                    <TableCell>{s.increment_percent}%</TableCell>
                    <TableCell>{scopeChips(s)}</TableCell>
                    <TableCell>{s.prorate_on_doj ? 'Yes' : 'No'}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(s)} aria-label="Edit slab">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setConfirmDelete(s.id)}
                        aria-label="Delete slab"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {slabs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No slabs defined for this year.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ConfirmDestructiveDialog
        open={!!confirmDelete}
        onCancel={() => setConfirmDelete(null)}
        title="Delete slab?"
        description="This cannot be undone."
        onConfirm={() => {
          if (confirmDelete) del.mutate({ id: confirmDelete, assessment_year: year });
          setConfirmDelete(null);
        }}
      />

      <Sheet open={editing.open} onOpenChange={(o) => !o && setEditing({ open: false, id: null, draft: emptyDraft() })}>
        <SheetContent className="sm:max-w-lg w-full overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing.id ? 'Edit Slab' : 'Add Slab'}</SheetTitle>
            <SheetDescription>
              Define a rating band and (optionally) restrict which employees this slab applies to.
              Leave a dimension empty to apply to every value of that dimension.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Rating From</Label>
                <Input type="number" step="0.01" value={d.rating_from}
                  onChange={(e) => patchDraft({ rating_from: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Rating To</Label>
                <Input type="number" step="0.01" value={d.rating_to}
                  onChange={(e) => patchDraft({ rating_to: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Increment %</Label>
                <Input type="number" step="0.01" value={d.increment_percent}
                  onChange={(e) => patchDraft({ increment_percent: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Prorate on DOJ</Label>
                <div className="h-10 flex items-center">
                  <Checkbox checked={d.prorate_on_doj}
                    onCheckedChange={(v) => patchDraft({ prorate_on_doj: Boolean(v) })} />
                  <span className="ml-2 text-sm text-muted-foreground">
                    Prorate based on date of joining
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Apply to (empty = all)</Label>
                <Badge variant="outline" className="text-xs">
                  Specificity: {specificity} / 6
                </Badge>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Company</Label>
                <MultiSelectFilter icon={<Building2 className="h-3 w-3 text-muted-foreground" />} label="Company"
                  options={opts(masters?.companies)} values={d.company_ids}
                  onChange={(v) => patchDraft({ company_ids: v })} placeholder="All companies" width={320} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Division</Label>
                <MultiSelectFilter icon={<Network className="h-3 w-3 text-muted-foreground" />} label="Division"
                  options={opts(masters?.divisions)} values={d.division_ids}
                  onChange={(v) => patchDraft({ division_ids: v })} placeholder="All divisions" width={320} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Business Unit</Label>
                <MultiSelectFilter icon={<Factory className="h-3 w-3 text-muted-foreground" />} label="Business Unit"
                  options={opts(masters?.business_units)} values={d.business_unit_ids}
                  onChange={(v) => patchDraft({ business_unit_ids: v })} placeholder="All BUs" width={320} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Location</Label>
                <MultiSelectFilter icon={<MapPin className="h-3 w-3 text-muted-foreground" />} label="Location"
                  options={opts(masters?.locations)} values={d.location_ids}
                  onChange={(v) => patchDraft({ location_ids: v })} placeholder="All locations" width={320} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Employee Category</Label>
                <MultiSelectFilter icon={<Users className="h-3 w-3 text-muted-foreground" />} label="Employee Category"
                  options={opts(masters?.employee_categories)} values={d.employee_category_ids}
                  onChange={(v) => patchDraft({ employee_category_ids: v })} placeholder="All employee categories" width={320} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Level</Label>
                <MultiSelectFilter icon={<Layers className="h-3 w-3 text-muted-foreground" />} label="Level"
                  options={opts(masters?.levels)} values={d.level_ids}
                  onChange={(v) => patchDraft({ level_ids: v })} placeholder="All levels" width={320} />
              </div>

              <p className="text-xs text-muted-foreground pt-1">
                When multiple slabs match an employee, the slab scoping the most dimensions wins.
                Ties are broken by sort order, then most-recently updated.
              </p>
            </div>
          </div>

          <SheetFooter className="mt-6 gap-2">
            <Button variant="outline" onClick={() => setEditing({ open: false, id: null, draft: emptyDraft() })}>
              Cancel
            </Button>
            <Button onClick={saveEditing} disabled={upsert.isPending}>
              {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Slab
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}