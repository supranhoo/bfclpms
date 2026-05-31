import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  useIncrementSlabs,
  useUpsertSlab,
  useDeleteSlab,
  useCopyPreviousYearSlabs,
  type IncrementSlabRow,
} from '@/hooks/useIncrementSlabs';
import { ConfirmDestructiveDialog } from '@/components/common/ConfirmDestructiveDialog';
import { Plus, Trash2, Loader2 } from 'lucide-react';

function buildAYOptions(): string[] {
  const now = new Date();
  const baseYear = now.getMonth() + 1 >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const years: string[] = [];
  for (let i = -1; i <= 2; i++) {
    const start = baseYear + i;
    years.push(`${start}-${String(start + 1).slice(-2)}`);
  }
  return years;
}

type Draft = Partial<IncrementSlabRow> & { _key: string };

export default function IncrementSlabsPage() {
  const ayOptions = useMemo(buildAYOptions, []);
  const [year, setYear] = useState<string>(ayOptions[1]);
  const { data: slabs = [], isLoading } = useIncrementSlabs(year);
  const upsert = useUpsertSlab();
  const del = useDeleteSlab();
  const copy = useCopyPreviousYearSlabs();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const addRow = () => {
    setDrafts((d) => [
      ...d,
      { _key: crypto.randomUUID(), rating_from: 0, rating_to: 0, increment_percent: 0, prorate_on_doj: true },
    ]);
  };

  const updateDraft = (k: string, patch: Partial<Draft>) =>
    setDrafts((d) => d.map((x) => (x._key === k ? { ...x, ...patch } : x)));

  const saveDraft = async (draft: Draft) => {
    await upsert.mutateAsync({
      assessment_year: year,
      rating_from: Number(draft.rating_from ?? 0),
      rating_to: Number(draft.rating_to ?? 0),
      increment_percent: Number(draft.increment_percent ?? 0),
      prorate_on_doj: draft.prorate_on_doj ?? true,
      increment_period: `Jul ${year.slice(0, 2)}–Jun ${year.slice(-2)}`,
    });
    setDrafts((d) => d.filter((x) => x._key !== draft._key));
  };

  const onCopyPrev = () => {
    const idx = ayOptions.indexOf(year);
    if (idx > 0) copy.mutate({ fromYear: ayOptions[idx - 1], toYear: year });
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
            <Button onClick={addRow}><Plus className="h-4 w-4 mr-2" />Add Row</Button>
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
                    <TableCell>{s.prorate_on_doj ? 'Yes' : 'No'}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setConfirmDelete(s.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {drafts.map((d) => (
                  <TableRow key={d._key} className="bg-muted/30">
                    <TableCell>
                      <Input
                        type="number" step="0.01"
                        value={d.rating_from ?? 0}
                        onChange={(e) => updateDraft(d._key, { rating_from: Number(e.target.value) })}
                        className="w-24"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" step="0.01"
                        value={d.rating_to ?? 0}
                        onChange={(e) => updateDraft(d._key, { rating_to: Number(e.target.value) })}
                        className="w-24"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" step="0.01"
                        value={d.increment_percent ?? 0}
                        onChange={(e) => updateDraft(d._key, { increment_percent: Number(e.target.value) })}
                        className="w-24"
                      />
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={d.prorate_on_doj ?? true}
                        onCheckedChange={(v) => updateDraft(d._key, { prorate_on_doj: Boolean(v) })}
                      />
                    </TableCell>
                    <TableCell>
                      <Button size="sm" onClick={() => saveDraft(d)} disabled={upsert.isPending}>
                        Save
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {slabs.length === 0 && drafts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
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
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
        title="Delete slab?"
        description="This cannot be undone."
        onConfirm={() => {
          if (confirmDelete) del.mutate({ id: confirmDelete, assessment_year: year });
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}