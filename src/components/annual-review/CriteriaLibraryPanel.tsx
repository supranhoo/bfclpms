import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { Loader2, Plus, Pencil, Trash2, Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  listCriteriaLibrary, upsertCriterion, deleteCriterion,
  type CriterionRow,
} from '@/services/annualReview/criteriaLibrary';
import {
  downloadCriteriaLibraryWorkbook, parseCriteriaPackWorkbook, slugifyCriterionKey,
} from '@/lib/annualReview/criteriaWorkbook';
import { CriteriaLibraryImportDialog } from './CriteriaLibraryImportDialog';
import { BfclFormsImportButton } from './BfclFormsImportDialog';
import {
  parseScoringBands, optionsToBands, defaultLadder, type ScoringBand,
} from '@/lib/annualReview/criteriaBands';

/**
 * Criteria Library editor. Holds bilingual qualitative questions used by the
 * Template Factory. Assignment to templates lives in `CriteriaMatrixPanel`.
 */
export function CriteriaLibraryPanel() {
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['annual-review-criteria-library'],
    queryFn: listCriteriaLibrary,
  });
  const [editing, setEditing] = useState<CriterionRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importSheets, setImportSheets] = useState<ReturnType<typeof parseCriteriaPackWorkbook> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const delMut = useMutation({
    mutationFn: (id: string) => deleteCriterion(id),
    onSuccess: () => {
      toast.success('Criterion deleted.');
      qc.invalidateQueries({ queryKey: ['annual-review-criteria-library'] });
      qc.invalidateQueries({ queryKey: ['annual-review-criteria-assignments'] });
      setDeleteId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const sheets = parseCriteriaPackWorkbook(buf);
      if (!sheets.length) {
        toast.error('No parsable sheets found. Check that a "Criteria" header exists.');
        return;
      }
      setImportSheets(sheets);
      setImportOpen(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Criteria Library</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Bilingual qualitative questions (Attendance, PPE, Quality …). Used by the Template Factory when
            it composes each template's criteria list. Actual assignment per Archetype × Grade × Dept lives
            in the Criteria Matrix below.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
          />
          <Button variant="outline" className="gap-2" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" /> Import bilingual pack
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            disabled={rows.length === 0}
            onClick={() => downloadCriteriaLibraryWorkbook(rows)}
          >
            <Download className="h-4 w-4" /> Export XLSX
          </Button>
          <Button onClick={() => setCreating(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New criterion
          </Button>
          <BfclFormsImportButton />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            No criteria yet. Import the bilingual pack or add one manually.
          </div>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Label (EN / HI)</TableHead>
                  <TableHead className="text-center">Max score</TableHead>
                  <TableHead>Flags</TableHead>
                  <TableHead className="w-[110px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.key}</TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{r.label_en}</div>
                      {r.label_hi && <div className="text-xs text-muted-foreground" dir="auto">{r.label_hi}</div>}
                    </TableCell>
                    <TableCell className="text-center font-mono">{Number(r.max_score)}</TableCell>
                    <TableCell className="space-x-1">
                      {r.is_common && <Badge variant="secondary">common</Badge>}
                      {r.is_active
                        ? <Badge variant="default">active</Badge>
                        : <Badge variant="outline">inactive</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteId(r.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <CriterionEditorDialog
        open={creating || !!editing}
        onOpenChange={(v) => { if (!v) { setCreating(false); setEditing(null); } }}
        existing={editing}
      />
      <ConfirmDestructiveDialog
        open={!!deleteId}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => deleteId && delMut.mutate(deleteId)}
        isLoading={delMut.isPending}
        title="Delete this criterion?"
        description="Also removes every matrix assignment that references it. Existing templates keep their embedded copy until the factory re-runs."
        confirmLabel="Delete"
      />

      {importSheets && (
        <CriteriaLibraryImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          sheets={importSheets}
        />
      )}
    </Card>
  );
}

// ── Editor dialog ────────────────────────────────────────────────

function CriterionEditorDialog({
  open, onOpenChange, existing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing: CriterionRow | null;
}) {
  const qc = useQueryClient();
  const [key, setKey] = useState(existing?.key ?? '');
  const [labelEn, setLabelEn] = useState(existing?.label_en ?? '');
  const [labelHi, setLabelHi] = useState(existing?.label_hi ?? '');
  const [maxScore, setMaxScore] = useState<number>(Number(existing?.max_score ?? 5));
  const [isCommon, setIsCommon] = useState(existing?.is_common ?? false);
  const [isActive, setIsActive] = useState(existing?.is_active ?? true);
  const [sortOrder, setSortOrder] = useState(existing?.sort_order ?? 0);
  const [bands, setBands] = useState<ScoringBand[]>(() => {
    const parsed = parseScoringBands((existing?.scoring_bands ?? null) as never);
    if (parsed.length) return parsed;
    return defaultLadder(Number(existing?.max_score ?? 5));
  });
  const [showJson, setShowJson] = useState(false);

  // When max_score changes, resize the bands ladder in place, preserving edits.
  const syncBandsToMax = (nextMax: number) => {
    setMaxScore(nextMax);
    setBands((prev) => {
      const byScore = new Map(prev.map((b) => [b.score, b]));
      const next: ScoringBand[] = [];
      for (let s = nextMax; s >= 0; s--) {
        next.push(byScore.get(s) ?? { score: s, label_en: '', label_hi: null });
      }
      return next;
    });
  };

  // Reset when the dialog re-opens for a different row.
  useState(() => { /* noop, react state above initializes from existing */ });

  const upsertMut = useMutation({
    mutationFn: async () => {
      if (!labelEn.trim()) throw new Error('English label is required.');
      const finalKey = key.trim() || slugifyCriterionKey(labelEn);
      const bandsJson = optionsToBands(bands);
      return upsertCriterion({
        ...(existing ? { id: existing.id } : {}),
        key: finalKey,
        label_en: labelEn.trim(),
        label_hi: labelHi.trim() || null,
        max_score: maxScore,
        is_common: isCommon,
        is_active: isActive,
        sort_order: sortOrder,
        scoring_bands: bandsJson as never,
      });
    },
    onSuccess: () => {
      toast.success(existing ? 'Criterion updated.' : 'Criterion created.');
      qc.invalidateQueries({ queryKey: ['annual-review-criteria-library'] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit criterion' : 'New criterion'}</DialogTitle>
          <DialogDescription>
            Bilingual label + max score. Scoring bands is optional JSON (e.g. `[{'{'}"score":5,"label":"Excellent"{'}'}]`).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Label>Key</Label>
              <Input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Auto-generated from EN label if blank"
                disabled={!!existing}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground mt-1">Immutable identifier.</p>
            </div>
            <div>
              <Label>Sort order</Label>
              <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value) || 0)} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Label (EN) *</Label>
              <Input value={labelEn} onChange={(e) => setLabelEn(e.target.value)} />
            </div>
            <div>
              <Label>Label (HI)</Label>
              <Input value={labelHi} onChange={(e) => setLabelHi(e.target.value)} dir="auto" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Max score</Label>
              <Input type="number" min={1} max={10} value={maxScore}
                     onChange={(e) => syncBandsToMax(Number(e.target.value) || 5)} />
            </div>
            <div className="flex items-end gap-2">
              <Switch checked={isCommon} onCheckedChange={setIsCommon} id="is_common" />
              <Label htmlFor="is_common">Is common (baseline everywhere)</Label>
            </div>
            <div className="flex items-end gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} id="is_active" />
              <Label htmlFor="is_active">Active</Label>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Rating labels (score → what the reviewer sees)</Label>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm"
                        onClick={() => setBands(defaultLadder(maxScore))}>
                  Reset to default ladder
                </Button>
                <Button type="button" variant="ghost" size="sm"
                        onClick={() => setShowJson((v) => !v)}>
                  {showJson ? 'Hide JSON' : 'Show JSON'}
                </Button>
              </div>
            </div>
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16 text-center">Score</TableHead>
                    <TableHead>Label (EN)</TableHead>
                    <TableHead>Label (HI)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bands.map((b, i) => (
                    <TableRow key={b.score}>
                      <TableCell className="text-center font-mono">{b.score}</TableCell>
                      <TableCell>
                        <Input
                          value={b.label_en}
                          onChange={(e) => setBands((prev) => prev.map((x, j) => j === i ? { ...x, label_en: e.target.value } : x))}
                          placeholder="e.g. Outstanding"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={b.label_hi ?? ''}
                          dir="auto"
                          onChange={(e) => setBands((prev) => prev.map((x, j) => j === i ? { ...x, label_hi: e.target.value } : x))}
                          placeholder="वैकल्पिक हिंदी लेबल"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {showJson && (
              <Textarea
                rows={5}
                readOnly
                value={JSON.stringify(optionsToBands(bands), null, 2)}
                className="font-mono text-xs"
              />
            )}
            <p className="text-xs text-muted-foreground">
              These labels populate the 0-{maxScore} buttons the reviewer clicks. Same criterion can be reused across departments — assign it in the Criteria Matrix.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={upsertMut.isPending} onClick={() => upsertMut.mutate()}>
            {upsertMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {existing ? 'Save changes' : 'Create criterion'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}