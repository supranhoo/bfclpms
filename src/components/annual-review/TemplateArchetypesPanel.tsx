import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Pencil, Plus, Trash2, Download } from 'lucide-react';
import { toast } from 'sonner';
import {
  listArchetypes, updateArchetype, parseCriteria, parseStringArray, parseStageWeights,
  GRADE_BUCKETS, STAGE_KEYS,
  type ArchetypeRow, type ArchetypeCriterion, type GradeBucket, type StageKey,
} from '@/services/annualReview/templateArchetypes';
import { downloadArchetypesWorkbook } from '@/lib/annualReview/factoryWorkbook';
import type { Json } from '@/integrations/supabase/types';

/**
 * Template Archetypes panel (P3). Bilingual editor for the 4 canonical
 * archetypes (A/B/C/D) used by the Template Factory. Admin can edit:
 *   - EN/HI names + descriptions
 *   - Default qualitative criteria (bilingual list; B/C/D share by convention)
 *   - Default stage weights (Self → Dept Head → BU Head)
 *   - Applicable grade buckets (M/W/T/other)
 *   - Display mode + active flag
 * Code + enabled_stages are locked (system-managed).
 */
export function TemplateArchetypesPanel() {
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['annual-review-template-archetypes'],
    queryFn: listArchetypes,
  });
  const [editing, setEditing] = useState<ArchetypeRow | null>(null);

  const stageWeightSummary = (raw: Json | null) => {
    const w = parseStageWeights(raw);
    return `${w.self}/${w.dept_head}/${w.bu_head}`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Template Archetypes</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              The 4 canonical templates the Factory generates from. A = KRA-based; B/C/D = no-KRA by grade family (share qualitative criteria).
            </p>
          </div>
          <Button
            variant="outline"
            className="gap-2"
            disabled={rows.length === 0}
            onClick={() => downloadArchetypesWorkbook(rows)}
          >
            <Download className="h-4 w-4" /> Export XLSX
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Code</TableHead>
                <TableHead>Name (EN / HI)</TableHead>
                <TableHead>Grade Buckets</TableHead>
                <TableHead>Criteria</TableHead>
                <TableHead className="w-32">Stage Weights<br/><span className="text-[10px] font-normal text-muted-foreground">Self/Dept/BU</span></TableHead>
                <TableHead className="w-24">Mode</TableHead>
                <TableHead className="w-20">Active</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const buckets = parseStringArray(r.applies_to_grade_buckets);
                const criteria = parseCriteria(r.default_criteria);
                return (
                  <TableRow key={r.id}>
                    <TableCell><Badge variant="outline" className="font-mono">{r.code}</Badge></TableCell>
                    <TableCell>
                      <div className="font-medium">{r.name_en}</div>
                      {r.name_hi && <div className="text-xs text-muted-foreground">{r.name_hi}</div>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {buckets.length === 0
                          ? <span className="text-xs text-muted-foreground">—</span>
                          : buckets.map((b) => <Badge key={b} variant="secondary" className="text-xs">{b}</Badge>)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{criteria.length} item{criteria.length === 1 ? '' : 's'}</span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{stageWeightSummary(r.default_stage_weights)}</TableCell>
                    <TableCell className="text-xs">{r.display_mode}</TableCell>
                    <TableCell>
                      {r.is_active
                        ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Active</Badge>
                        : <Badge variant="outline">Off</Badge>}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => setEditing(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {editing && (
        <ArchetypeEditorDialog
          row={editing}
          open
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['annual-review-template-archetypes'] });
            setEditing(null);
          }}
        />
      )}
    </Card>
  );
}

// ── Editor Dialog ─────────────────────────────────────────────────

interface EditorProps {
  row: ArchetypeRow;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function ArchetypeEditorDialog({ row, open, onClose, onSaved }: EditorProps) {
  const [nameEn, setNameEn] = useState(row.name_en);
  const [nameHi, setNameHi] = useState(row.name_hi ?? '');
  const [descEn, setDescEn] = useState(row.description_en ?? '');
  const [descHi, setDescHi] = useState(row.description_hi ?? '');
  const [displayMode, setDisplayMode] = useState<'bilingual' | 'en_only' | 'hi_only'>(
    (row.display_mode as 'bilingual' | 'en_only' | 'hi_only') ?? 'bilingual',
  );
  const [active, setActive] = useState(row.is_active);
  const [buckets, setBuckets] = useState<GradeBucket[]>(
    parseStringArray(row.applies_to_grade_buckets).filter((b): b is GradeBucket =>
      (GRADE_BUCKETS as readonly string[]).includes(b),
    ),
  );
  const [stageWeights, setStageWeights] = useState(parseStageWeights(row.default_stage_weights));
  const [criteria, setCriteria] = useState<ArchetypeCriterion[]>(parseCriteria(row.default_criteria));

  useEffect(() => {
    setNameEn(row.name_en);
    setNameHi(row.name_hi ?? '');
    setDescEn(row.description_en ?? '');
    setDescHi(row.description_hi ?? '');
    setDisplayMode((row.display_mode as 'bilingual' | 'en_only' | 'hi_only') ?? 'bilingual');
    setActive(row.is_active);
    setBuckets(
      parseStringArray(row.applies_to_grade_buckets).filter((b): b is GradeBucket =>
        (GRADE_BUCKETS as readonly string[]).includes(b),
      ),
    );
    setStageWeights(parseStageWeights(row.default_stage_weights));
    setCriteria(parseCriteria(row.default_criteria));
  }, [row]);

  const stageTotal = useMemo(
    () => STAGE_KEYS.reduce((s, k) => s + (stageWeights[k] || 0), 0),
    [stageWeights],
  );

  const mut = useMutation({
    mutationFn: async () => {
      if (!nameEn.trim()) throw new Error('English name is required.');
      if (stageTotal !== 100) throw new Error(`Stage weights must sum to 100 (currently ${stageTotal}).`);
      const cleanCriteria = criteria
        .filter((c) => c.key.trim() && c.label_en.trim())
        .map((c) => ({
          key: c.key.trim(),
          label_en: c.label_en.trim(),
          label_hi: (c.label_hi ?? '').trim(),
          max_score: Number(c.max_score) || 5,
        }));
      return updateArchetype(row.id, {
        name_en: nameEn.trim(),
        name_hi: nameHi.trim() || null,
        description_en: descEn.trim() || null,
        description_hi: descHi.trim() || null,
        display_mode: displayMode,
        is_active: active,
        applies_to_grade_buckets: buckets as unknown as Json,
        default_stage_weights: stageWeights as unknown as Json,
        default_criteria: cleanCriteria as unknown as Json,
      });
    },
    onSuccess: () => { toast.success('Archetype saved.'); onSaved(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const toggleBucket = (b: GradeBucket) =>
    setBuckets((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]));

  const addCriterion = () =>
    setCriteria((prev) => [
      ...prev,
      { key: `criterion_${prev.length + 1}`, label_en: '', label_hi: '', max_score: 5 },
    ]);
  const updateCriterion = (i: number, patch: Partial<ArchetypeCriterion>) =>
    setCriteria((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const removeCriterion = (i: number) =>
    setCriteria((prev) => prev.filter((_, idx) => idx !== i));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Archetype {row.code}</DialogTitle>
          <DialogDescription>
            Code and workflow chain (Self → Dept Head → BU Head) are system-managed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Names */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Name (English) *</Label>
              <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Name (हिन्दी)</Label>
              <Input value={nameHi} onChange={(e) => setNameHi(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Description (English)</Label>
              <Textarea rows={2} value={descEn} onChange={(e) => setDescEn(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Description (हिन्दी)</Label>
              <Textarea rows={2} value={descHi} onChange={(e) => setDescHi(e.target.value)} />
            </div>
          </div>

          {/* Grade buckets + display mode + active */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t pt-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Applies to grade buckets</Label>
              <div className="flex flex-wrap gap-3">
                {GRADE_BUCKETS.map((b) => (
                  <label key={b} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={buckets.includes(b)}
                      onCheckedChange={() => toggleBucket(b)}
                    />
                    <span>{b}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Display Mode</Label>
              <Select value={displayMode} onValueChange={(v) => setDisplayMode(v as 'bilingual' | 'en_only' | 'hi_only')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bilingual">Bilingual (EN + HI)</SelectItem>
                  <SelectItem value="en_only">English only</SelectItem>
                  <SelectItem value="hi_only">हिन्दी only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between md:col-span-3 border-t pt-3">
              <div>
                <Label>Active</Label>
                <p className="text-xs text-muted-foreground">Inactive archetypes are hidden from the Factory.</p>
              </div>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          </div>

          {/* Stage weights */}
          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label>Default Stage Weights (%)</Label>
              <span className={`text-xs font-mono ${stageTotal === 100 ? 'text-emerald-600' : 'text-red-600'}`}>
                Total: {stageTotal}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {STAGE_KEYS.map((k) => (
                <div key={k} className="space-y-1">
                  <Label className="text-xs capitalize text-muted-foreground">
                    {k === 'self' ? 'Self' : k === 'dept_head' ? 'Dept Head' : 'BU Head'}
                  </Label>
                  <Input
                    type="number" min={0} max={100}
                    value={stageWeights[k]}
                    onChange={(e) => setStageWeights((prev) => ({
                      ...prev, [k]: Number(e.target.value) || 0,
                    }))}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Criteria */}
          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label>Default Qualitative Criteria</Label>
              <Button size="sm" variant="outline" onClick={addCriterion}>
                <Plus className="h-4 w-4 mr-1" />Add row
              </Button>
            </div>
            {criteria.length === 0 && (
              <p className="text-xs text-muted-foreground">No criteria — this archetype relies purely on system-scored KPIs.</p>
            )}
            {criteria.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Key</TableHead>
                    <TableHead>Label (EN)</TableHead>
                    <TableHead>Label (हिन्दी)</TableHead>
                    <TableHead className="w-20">Max</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {criteria.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Input
                          className="font-mono text-xs"
                          value={c.key}
                          onChange={(e) => updateCriterion(i, { key: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={c.label_en}
                          onChange={(e) => updateCriterion(i, { label_en: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={c.label_hi ?? ''}
                          onChange={(e) => updateCriterion(i, { label_hi: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number" min={1} max={10}
                          value={c.max_score}
                          onChange={(e) => updateCriterion(i, { max_score: Number(e.target.value) || 5 })}
                        />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => removeCriterion(i)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}