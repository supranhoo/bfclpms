import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  useAnnualReviewRatingSlabs,
  useSaveAnnualReviewRatingSlabs,
} from '@/hooks/useAnnualReviewRatingSlabs';
import { validateSlabBands, describeSlab, type RatingSlab } from '@/lib/annualReview/ratingSlab';

/**
 * ADR-212 — Admin editor for the Final Rating (/5) → increment slab bands used
 * by the Annual Review Report. Bands are half-open: an exact boundary value
 * falls into the higher slab.
 */
export function RatingSlabSettingsCard() {
  const { data, isLoading } = useAnnualReviewRatingSlabs();
  const save = useSaveAnnualReviewRatingSlabs();
  const [rows, setRows] = useState<RatingSlab[]>([]);

  useEffect(() => { if (data) setRows(data.map((r) => ({ ...r }))); }, [data]);

  const patch = (i: number, p: Partial<RatingSlab>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...p } : r)));

  const validation = validateSlabBands(rows);

  const onSave = () => {
    if (!validation.valid) { toast.error(validation.errors[0]); return; }
    const sorted = [...rows].sort((a, b) => a.rating_from - b.rating_from);
    save.mutate({ slabs: sorted }, {
      onSuccess: () => toast.success('Rating slabs saved.'),
      onError: (e) => toast.error((e as Error).message),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rating Slabs (Final Rating /5 → Increment %)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground max-w-3xl">
          Drives the <b>Final Rating (/5)</b> and <b>Slab %</b> columns in the Annual Review
          Report. Bands are half-open — a rating equal to a boundary falls into the
          <b> higher </b> slab (e.g. exactly 3.00 → the 3.00–3.50 band). Leave the
          &ldquo;To&rdquo; value blank on the highest band to make it open-ended.
        </p>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading slabs…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-32">From (≥)</TableHead>
                <TableHead className="w-32">To (&lt;)</TableHead>
                <TableHead className="w-32">Increment %</TableHead>
                <TableHead>Band</TableHead>
                <TableHead className="w-16" />
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={r.id ?? `new-${i}`}>
                    <TableCell>
                      <Input
                        type="number" step="0.01" value={r.rating_from}
                        onChange={(e) => patch(i, { rating_from: Number(e.target.value) })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" step="0.01"
                        placeholder="open-ended"
                        value={r.rating_to ?? ''}
                        onChange={(e) => patch(i, { rating_to: e.target.value === '' ? null : Number(e.target.value) })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" step="0.01" value={r.increment_percent}
                        onChange={(e) => patch(i, { increment_percent: Number(e.target.value) })}
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {describeSlab(r)} → {r.increment_percent}%
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                        aria-label="Remove slab"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {!validation.valid && rows.length > 0 && (
          <ul className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            {validation.errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setRows((prev) => [...prev, { rating_from: 0, rating_to: null, increment_percent: 0, is_active: true }])}
          >
            <Plus className="h-4 w-4 mr-2" /> Add slab
          </Button>
          <Button onClick={onSave} disabled={save.isPending || !validation.valid}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save slabs
          </Button>
          <Label className="text-xs text-muted-foreground">Admin / HR PMS only</Label>
        </div>
      </CardContent>
    </Card>
  );
}