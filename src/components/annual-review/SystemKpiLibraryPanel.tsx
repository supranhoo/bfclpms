import { useState, useEffect } from 'react';
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  listSystemKpis, upsertSystemKpi, deleteSystemKpi, parseScoringRules,
  UOM_TYPES, type SystemKpiRow, type ScoringRules, type ScoringBand,
} from '@/services/annualReview/systemKpiLibrary';
import type { Json } from '@/integrations/supabase/types';

/**
 * KPI Library editor (P2). Admin CRUD for the canonical system KPIs used by
 * the Template Factory. Bilingual (EN + HI) in one row. Scoring rules editor
 * lets the admin declare 6 bands (score 5..0) mapped to thresholds.
 */
export function SystemKpiLibraryPanel() {
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['annual-review-system-kpis'],
    queryFn: listSystemKpis,
  });
  const [editing, setEditing] = useState<SystemKpiRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const delMut = useMutation({
    mutationFn: (id: string) => deleteSystemKpi(id),
    onSuccess: () => {
      toast.success('KPI deleted.');
      qc.invalidateQueries({ queryKey: ['annual-review-system-kpis'] });
      setDeleteId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>System KPI Library</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Canonical, bilingual system KPIs (Safety, 5S, Training, Production …). Reused across every
            department template. Edits here propagate the next time the Template Factory runs.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New KPI
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            No KPIs yet. Seed the library or add one manually.
          </div>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Name (EN / HI)</TableHead>
                  <TableHead>UoM</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Bands</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[110px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const rules = parseScoringRules(r.scoring_rules);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.key}</TableCell>
                      <TableCell>
                        <div className="font-medium">{r.name_en}</div>
                        {r.name_hi && <div className="text-xs text-muted-foreground">{r.name_hi}</div>}
                      </TableCell>
                      <TableCell><Badge variant="outline">{r.uom_type}</Badge></TableCell>
                      <TableCell className="text-xs">
                        {rules.direction === 'higher_better' ? '▲ higher' : '▼ lower'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {rules.bands.length ? `${rules.bands.length} bands` : '—'}
                      </TableCell>
                      <TableCell>
                        {r.is_active
                          ? <Badge variant="default">Active</Badge>
                          : <Badge variant="secondary">Inactive</Badge>}
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
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <KpiEditorDialog
        open={creating || !!editing}
        onOpenChange={(v) => { if (!v) { setCreating(false); setEditing(null); } }}
        existing={editing}
      />
      <ConfirmDestructiveDialog
        open={!!deleteId}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => deleteId && delMut.mutate(deleteId)}
        isLoading={delMut.isPending}
        title="Delete this system KPI?"
        description="Removes the KPI from the library and cascades weight-matrix rows. Existing templates keep their embedded copy."
        confirmLabel="Delete"
      />
    </Card>
  );
}

// ── Editor dialog ────────────────────────────────────────────────

function emptyBands(): ScoringBand[] {
  return [5, 4, 3, 2, 1, 0].map((score) => ({ score, threshold: 0 }));
}

function KpiEditorDialog({
  open, onOpenChange, existing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing: SystemKpiRow | null;
}) {
  const qc = useQueryClient();
  const [key, setKey] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameHi, setNameHi] = useState('');
  const [descEn, setDescEn] = useState('');
  const [descHi, setDescHi] = useState('');
  const [uom, setUom] = useState<string>('count');
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState(0);
  const [rules, setRules] = useState<ScoringRules>({ direction: 'higher_better', bands: emptyBands() });

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setKey(existing.key);
      setNameEn(existing.name_en);
      setNameHi(existing.name_hi ?? '');
      setDescEn(existing.description_en ?? '');
      setDescHi(existing.description_hi ?? '');
      setUom(existing.uom_type ?? 'count');
      setIsActive(existing.is_active);
      setSortOrder(existing.sort_order ?? 0);
      const parsed = parseScoringRules(existing.scoring_rules);
      setRules({
        direction: parsed.direction,
        bands: parsed.bands.length ? parsed.bands : emptyBands(),
      });
    } else {
      setKey(''); setNameEn(''); setNameHi(''); setDescEn(''); setDescHi('');
      setUom('count'); setIsActive(true); setSortOrder(0);
      setRules({ direction: 'higher_better', bands: emptyBands() });
    }
  }, [open, existing]);

  const upsertMut = useMutation({
    mutationFn: async () => {
      if (!key.trim()) throw new Error('Key is required.');
      if (!nameEn.trim()) throw new Error('English name is required.');
      return upsertSystemKpi({
        ...(existing ? { id: existing.id } : {}),
        key: key.trim(),
        name_en: nameEn.trim(),
        name_hi: nameHi.trim() || null,
        description_en: descEn.trim() || null,
        description_hi: descHi.trim() || null,
        uom_type: uom,
        is_active: isActive,
        sort_order: sortOrder,
        scoring_rules: rules as unknown as Json,
      });
    },
    onSuccess: () => {
      toast.success(existing ? 'KPI updated.' : 'KPI created.');
      qc.invalidateQueries({ queryKey: ['annual-review-system-kpis'] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit system KPI' : 'New system KPI'}</DialogTitle>
          <DialogDescription>
            Bilingual name and description. Scoring rules define how a raw measurement converts to a 0–5 score.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Key <span className="text-destructive">*</span></Label>
              <Input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="e.g. lti_rate"
                disabled={!!existing}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground mt-1">Immutable identifier used by templates.</p>
            </div>
            <div>
              <Label>UoM</Label>
              <Select value={uom} onValueChange={setUom}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UOM_TYPES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sort order</Label>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Name (EN) <span className="text-destructive">*</span></Label>
              <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
            </div>
            <div>
              <Label>Name (HI)</Label>
              <Input value={nameHi} onChange={(e) => setNameHi(e.target.value)} dir="auto" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Description (EN)</Label>
              <Textarea rows={3} value={descEn} onChange={(e) => setDescEn(e.target.value)} />
            </div>
            <div>
              <Label>Description (HI)</Label>
              <Textarea rows={3} value={descHi} onChange={(e) => setDescHi(e.target.value)} dir="auto" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <Label>Active (available to the Template Factory)</Label>
          </div>

          <div className="border rounded-md p-3 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Scoring rules</Label>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Direction:</span>
                <Select
                  value={rules.direction}
                  onValueChange={(v) => setRules({ ...rules, direction: v as ScoringRules['direction'] })}
                >
                  <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="higher_better">▲ Higher is better</SelectItem>
                    <SelectItem value="lower_better">▼ Lower is better</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              For each band, enter the threshold value that maps to the score. Example: LTI rate (lower better)
              → 5=0, 4=1, 3=2… means 0 LTIs earns 5, 1 LTI earns 4, etc.
            </p>
            <div className="grid grid-cols-[80px_1fr] gap-2 items-center">
              <div className="text-xs font-semibold text-muted-foreground">Score</div>
              <div className="text-xs font-semibold text-muted-foreground">Threshold</div>
              {rules.bands.map((b, idx) => (
                <>
                  <div key={`s-${b.score}`} className="text-sm font-mono">{b.score}</div>
                  <Input
                    key={`t-${b.score}`}
                    type="number"
                    value={b.threshold}
                    onChange={(e) => {
                      const next = [...rules.bands];
                      next[idx] = { ...b, threshold: Number(e.target.value) };
                      setRules({ ...rules, bands: next });
                    }}
                  />
                </>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={upsertMut.isPending} onClick={() => upsertMut.mutate()}>
            {upsertMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {existing ? 'Save changes' : 'Create KPI'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}