import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
import { Plus, Trash2, Loader2, Save, X, Building2, Network, Factory, MapPin, Users, Layers } from 'lucide-react';
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

function rowToDraft(s: IncrementSlabRow): SlabDraft {
  return {
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
  };
}

function draftsEqual(a: SlabDraft, b: SlabDraft): boolean {
  if (a.rating_from !== b.rating_from) return false;
  if (a.rating_to !== b.rating_to) return false;
  if (a.increment_percent !== b.increment_percent) return false;
  if (a.prorate_on_doj !== b.prorate_on_doj) return false;
  const keys: (keyof SlabDraft)[] = [
    'company_ids', 'division_ids', 'business_unit_ids',
    'location_ids', 'employee_category_ids', 'level_ids',
  ];
  for (const k of keys) {
    const av = [...((a[k] as string[]) ?? [])].sort();
    const bv = [...((b[k] as string[]) ?? [])].sort();
    if (av.length !== bv.length) return false;
    for (let i = 0; i < av.length; i++) if (av[i] !== bv[i]) return false;
  }
  return true;
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

  // Per-row drafts for existing slabs. Absent key = clean (use source).
  const [drafts, setDrafts] = useState<Record<string, SlabDraft>>({});
  // Single unsaved "new" row at the top of the table.
  const [newDraft, setNewDraft] = useState<SlabDraft | null>(null);

  const getDraft = (s: IncrementSlabRow): SlabDraft => drafts[s.id] ?? rowToDraft(s);
  const isDirty = (s: IncrementSlabRow): boolean =>
    !!drafts[s.id] && !draftsEqual(drafts[s.id], rowToDraft(s));

  const patchExisting = (id: string, source: IncrementSlabRow, patch: Partial<SlabDraft>) => {
    setDrafts((prev) => {
      const base = prev[id] ?? rowToDraft(source);
      return { ...prev, [id]: { ...base, ...patch } };
    });
  };

  const patchNew = (patch: Partial<SlabDraft>) => {
    setNewDraft((prev) => ({ ...(prev ?? emptyDraft()), ...patch }));
  };

  const cancelExisting = (id: string) => {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const validateAndSave = async (d: SlabDraft, id: string | null): Promise<boolean> => {
    if (d.rating_to < d.rating_from) {
      toast({ title: 'Invalid range', description: 'Rating To must be ≥ Rating From.', variant: 'destructive' });
      return false;
    }
    if (d.increment_percent < 0 || d.increment_percent > 100) {
      toast({ title: 'Invalid %', description: 'Increment % must be between 0 and 100.', variant: 'destructive' });
      return false;
    }
    const dupe = slabs.find((s) => s.id !== id && isExactScopeDuplicate(s as any, d as any));
    if (dupe) {
      toast({
        title: 'Duplicate slab',
        description: 'Another slab in this AY has the same rating band and identical scope.',
        variant: 'destructive',
      });
      return false;
    }
    await upsert.mutateAsync({
      id: id ?? undefined,
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
    return true;
  };

  const saveExisting = async (s: IncrementSlabRow) => {
    const d = drafts[s.id];
    if (!d) return;
    const ok = await validateAndSave(d, s.id);
    if (ok) cancelExisting(s.id);
  };

  const saveNew = async () => {
    if (!newDraft) return;
    const ok = await validateAndSave(newDraft, null);
    if (ok) setNewDraft(null);
  };

  const onCopyPrev = () => {
    const idx = ayOptions.indexOf(year);
    if (idx > 0) copy.mutate({ fromYear: ayOptions[idx - 1], toYear: year });
  };

  const opts = (list?: Array<{ id: string; name: string }>) =>
    (list ?? []).map((o) => ({ value: o.id, label: o.name }));

  // ---- Row renderer (inline-edit cells) ----------------------------------
  const renderEditableRow = (
    key: string,
    d: SlabDraft,
    onPatch: (p: Partial<SlabDraft>) => void,
    onSave: () => void,
    onCancel: () => void,
    onDelete: (() => void) | null,
    dirty: boolean,
    isNew: boolean,
  ) => {
    const spec = slabSpecificity(d as any);
    return (
      <TableRow key={key} className={isNew ? 'bg-primary/5' : dirty ? 'bg-amber-50/40 dark:bg-amber-950/10' : undefined}>
        <TableCell className="sticky left-0 bg-inherit">
          <Input
            type="number" step="0.01" className="h-9 w-20"
            value={d.rating_from}
            onChange={(e) => onPatch({ rating_from: Number(e.target.value) })}
          />
        </TableCell>
        <TableCell>
          <Input
            type="number" step="0.01" className="h-9 w-20"
            value={d.rating_to}
            onChange={(e) => onPatch({ rating_to: Number(e.target.value) })}
          />
        </TableCell>
        <TableCell>
          <Input
            type="number" step="0.01" className="h-9 w-20"
            value={d.increment_percent}
            onChange={(e) => onPatch({ increment_percent: Number(e.target.value) })}
          />
        </TableCell>
        <TableCell>
          <MultiSelectFilter
            icon={<Building2 className="h-3 w-3 text-muted-foreground" />}
            label="Company" options={opts(masters?.companies)} values={d.company_ids}
            onChange={(v) => onPatch({ company_ids: v })} placeholder="All companies" width={190}
          />
        </TableCell>
        <TableCell>
          <MultiSelectFilter
            icon={<Network className="h-3 w-3 text-muted-foreground" />}
            label="Division" options={opts(masters?.divisions)} values={d.division_ids}
            onChange={(v) => onPatch({ division_ids: v })} placeholder="All divisions" width={190}
          />
        </TableCell>
        <TableCell>
          <MultiSelectFilter
            icon={<Factory className="h-3 w-3 text-muted-foreground" />}
            label="BU" options={opts(masters?.business_units)} values={d.business_unit_ids}
            onChange={(v) => onPatch({ business_unit_ids: v })} placeholder="All BUs" width={190}
          />
        </TableCell>
        <TableCell>
          <MultiSelectFilter
            icon={<MapPin className="h-3 w-3 text-muted-foreground" />}
            label="Location" options={opts(masters?.locations)} values={d.location_ids}
            onChange={(v) => onPatch({ location_ids: v })} placeholder="All locations" width={190}
          />
        </TableCell>
        <TableCell>
          <MultiSelectFilter
            icon={<Users className="h-3 w-3 text-muted-foreground" />}
            label="Emp Category" options={opts(masters?.employee_categories)} values={d.employee_category_ids}
            onChange={(v) => onPatch({ employee_category_ids: v })} placeholder="All emp categories" width={210}
          />
        </TableCell>
        <TableCell>
          <MultiSelectFilter
            icon={<Layers className="h-3 w-3 text-muted-foreground" />}
            label="Level" options={opts(masters?.levels)} values={d.level_ids}
            onChange={(v) => onPatch({ level_ids: v })} placeholder="All levels" width={170}
          />
        </TableCell>
        <TableCell className="text-center">
          <Checkbox
            checked={d.prorate_on_doj}
            onCheckedChange={(v) => onPatch({ prorate_on_doj: Boolean(v) })}
          />
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="text-[10px] px-1.5">{spec}/6</Badge>
            <Button
              variant="ghost" size="icon" className="h-8 w-8"
              onClick={onSave}
              disabled={(!dirty && !isNew) || upsert.isPending}
              aria-label="Save slab"
              title="Save"
            >
              {upsert.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Save className="h-4 w-4 text-primary" />}
            </Button>
            {(dirty || isNew) && (
              <Button
                variant="ghost" size="icon" className="h-8 w-8"
                onClick={onCancel}
                aria-label="Discard changes"
                title="Discard changes"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost" size="icon" className="h-8 w-8"
                onClick={onDelete}
                aria-label="Delete slab"
                title="Delete"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  };

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
            <Button onClick={() => setNewDraft(emptyDraft())} disabled={!!newDraft}>
              <Plus className="h-4 w-4 mr-2" />Add Slab
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[1500px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background w-24">Rating From</TableHead>
                    <TableHead className="w-24">Rating To</TableHead>
                    <TableHead className="w-24">Increment %</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Division</TableHead>
                    <TableHead>Business Unit</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Employee Category</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead className="w-28 text-center">Prorate on DOJ</TableHead>
                    <TableHead className="w-44">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {newDraft && renderEditableRow(
                    '__new__',
                    newDraft,
                    patchNew,
                    saveNew,
                    () => setNewDraft(null),
                    null,
                    false,
                    true,
                  )}
                  {slabs.map((s) => {
                    const d = getDraft(s);
                    const dirty = isDirty(s);
                    return renderEditableRow(
                      s.id,
                      d,
                      (p) => patchExisting(s.id, s, p),
                      () => saveExisting(s),
                      () => cancelExisting(s.id),
                      () => setConfirmDelete(s.id),
                      dirty,
                      false,
                    );
                  })}
                  {slabs.length === 0 && !newDraft && (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                        No slabs defined for this year. Click <strong>Add Slab</strong> to create one.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Leave a scope column empty to apply the slab to every value of that dimension.
            When multiple slabs match an employee, the slab scoping the most dimensions wins
            (badge shows specificity out of 6).
          </p>
        </CardContent>
      </Card>

      <ConfirmDestructiveDialog
        open={!!confirmDelete}
        onCancel={() => setConfirmDelete(null)}
        title="Delete slab?"
        description="This cannot be undone."
        onConfirm={() => {
          if (confirmDelete) {
            del.mutate({ id: confirmDelete, assessment_year: year });
            // drop any pending draft for the deleted row
            cancelExisting(confirmDelete);
          }
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}