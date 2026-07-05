import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { ParsedCriteriaSheet } from '@/lib/annualReview/criteriaWorkbook';
import { slugifyCriterionKey } from '@/lib/annualReview/criteriaWorkbook';
import { useDepartments, useBusinessUnits } from '@/hooks/useSafetyOrg';
import { upsertCriterion, saveCriteriaAssignment } from '@/services/annualReview/criteriaLibrary';
import { parseBandsBlock } from '@/lib/annualReview/bfclFormsWorkbook';
import { optionsToBands } from '@/lib/annualReview/criteriaBands';

const ARCHETYPES = ['A', 'B', 'C', 'D'] as const;
const GRADE_BUCKETS = ['M', 'W', 'T', 'other'] as const;

interface SheetMapping {
  archetype: string;    // '' = any
  grade_bucket: string; // '' = any
  grade_code: string;   // '' = any
  departmentIds: string[]; // empty = wildcard (dept = null)
  isCommon: boolean;
  skip: boolean;
}

/**
 * Guided importer for the BFCL bilingual pack. For each parsed sheet, admin picks:
 *  - Archetype code (A/B/C/D or Any)
 *  - Grade bucket (M/W/T/other or Any)
 *  - Optional exact grade code (e.g. M4)
 *  - Departments to assign to (empty = wildcard)
 *  - "Mark all as common" toggle
 * On commit, per-sheet:
 *   1. Upsert library rows keyed by slug(label_en). Existing keys re-used; label_hi
 *      is filled in if the DB row lacks one.
 *   2. For each department (or [null] if none), upsert one assignment row with
 *      the sheet's weight_pct and is_enabled=true.
 * Idempotent — reruns update existing rows.
 */
export function CriteriaLibraryImportDialog({
  open, onOpenChange, sheets,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sheets: ParsedCriteriaSheet[];
}) {
  const qc = useQueryClient();
  const { data: businessUnits = [] } = useBusinessUnits();
  const [buId, setBuId] = useState<string>('');
  const { data: departments = [] } = useDepartments(buId || null);

  const [mappings, setMappings] = useState<Record<string, SheetMapping>>(() => {
    const init: Record<string, SheetMapping> = {};
    sheets.forEach((s) => {
      // Rough heuristics from BFCL sheet names
      const lower = s.name.toLowerCase();
      const bucket = lower.includes('blue collar') || lower.includes('- w') ? 'W'
                   : lower.includes('- m') ? 'M' : '';
      const arch = bucket === 'M' ? 'B' : bucket === 'W' ? 'C' : '';
      init[s.name] = {
        archetype: arch, grade_bucket: bucket, grade_code: '',
        departmentIds: [], isCommon: lower.startsWith('generic'), skip: false,
      };
    });
    return init;
  });

  const totalPlannedRows = useMemo(() => sheets.reduce((n, s) => {
    const m = mappings[s.name];
    if (!m || m.skip) return n;
    const deptFactor = Math.max(1, m.departmentIds.length);
    return n + s.rows.length * deptFactor;
  }, 0), [sheets, mappings]);

  const commitMut = useMutation({
    mutationFn: async () => {
      // First: get all existing library rows so we can dedupe by key.
      const { data: existingLib, error: libErr } = await supabase
        .from('annual_review_criteria_library').select('id, key, label_hi');
      if (libErr) throw libErr;
      const byKey = new Map(existingLib?.map((r) => [r.key, r]) ?? []);

      let insertedCrit = 0, updatedCrit = 0, insertedAsg = 0;
      for (const sheet of sheets) {
        const m = mappings[sheet.name];
        if (!m || m.skip) continue;
        for (const row of sheet.rows) {
          if (!row.label_en) continue;
          const key = slugifyCriterionKey(row.label_en);
          const existing = byKey.get(key);
          // Parse the bilingual "5 - EN / HI\n4 - …" block into scoring bands
          // so the reviewer sees the workbook's rating labels (not the default
          // English ladder). Falls back silently when the cell is blank.
          const parsedBands = parseBandsBlock(row.rating_desc ?? '');
          const maxFromBands = parsedBands.reduce((m2, b) => Math.max(m2, b.score), 0);
          const maxScore = Math.max(5, maxFromBands);
          const bandsJson = parsedBands.length ? optionsToBands(parsedBands) : undefined;
          const upserted = await upsertCriterion({
            ...(existing ? { id: existing.id } : {}),
            key,
            label_en: row.label_en,
            label_hi: existing?.label_hi || row.label_hi || null,
            max_score: maxScore,
            is_common: m.isCommon,
            ...(bandsJson !== undefined ? { scoring_bands: bandsJson } : {}),
          } as never);
          byKey.set(key, { id: upserted.id, key: upserted.key, label_hi: upserted.label_hi });
          if (existing) updatedCrit += 1; else insertedCrit += 1;

          const targetDepts: (string | null)[] = m.departmentIds.length ? m.departmentIds : [null];
          for (const deptId of targetDepts) {
            await saveCriteriaAssignment({
              criterion_id: upserted.id,
              archetype_code: m.archetype || null,
              grade_bucket: m.grade_bucket || null,
              grade_code: m.grade_code || null,
              department_id: deptId,
              sub_unit_id: null,
              weight_pct: Number(row.weight_pct) || 0,
              is_enabled: true,
            });
            insertedAsg += 1;
          }
        }
      }
      return { insertedCrit, updatedCrit, insertedAsg };
    },
    onSuccess: (res) => {
      toast.success(
        `Import complete: ${res.insertedCrit} new + ${res.updatedCrit} updated criteria, ${res.insertedAsg} assignment rows.`,
      );
      qc.invalidateQueries({ queryKey: ['annual-review-criteria-library'] });
      qc.invalidateQueries({ queryKey: ['annual-review-criteria-assignments'] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patch = (name: string, p: Partial<SheetMapping>) => {
    setMappings((prev) => ({ ...prev, [name]: { ...prev[name], ...p } }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import bilingual criteria pack</DialogTitle>
          <DialogDescription>
            Map each sheet to an archetype + grade + department set. Departments left empty apply as
            wildcards (all departments). Re-running the import updates existing rows in place.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="max-w-sm">
            <Label>Business Unit (for department picker)</Label>
            <Select value={buId || 'any'} onValueChange={(v) => setBuId(v === 'any' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Pick BU…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">— None (wildcard) —</SelectItem>
                {businessUnits.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4">
            {sheets.map((s) => {
              const m = mappings[s.name];
              if (!m) return null;
              return (
                <div key={s.name} className="border rounded-md p-3 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.rows.length} question rows</div>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={m.skip} onCheckedChange={(v) => patch(s.name, { skip: Boolean(v) })} />
                      <span>Skip this sheet</span>
                    </label>
                  </div>
                  {!m.skip && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div>
                          <Label>Archetype</Label>
                          <Select value={m.archetype || 'any'}
                                  onValueChange={(v) => patch(s.name, { archetype: v === 'any' ? '' : v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="any">— Any —</SelectItem>
                              {ARCHETYPES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Grade bucket</Label>
                          <Select value={m.grade_bucket || 'any'}
                                  onValueChange={(v) => patch(s.name, { grade_bucket: v === 'any' ? '' : v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="any">— Any —</SelectItem>
                              {GRADE_BUCKETS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Grade code (exact)</Label>
                          <input
                            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                            placeholder="e.g. M4 (optional)"
                            value={m.grade_code}
                            onChange={(e) => patch(s.name, { grade_code: e.target.value.trim() })}
                          />
                        </div>
                        <div className="flex items-end gap-2">
                          <Checkbox
                            checked={m.isCommon}
                            onCheckedChange={(v) => patch(s.name, { isCommon: Boolean(v) })}
                            id={`${s.name}-common`}
                          />
                          <Label htmlFor={`${s.name}-common`}>Mark as common</Label>
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <Label>Departments {m.departmentIds.length > 0
                            ? <span className="text-xs text-muted-foreground">({m.departmentIds.length})</span>
                            : <span className="text-xs text-muted-foreground">(none = wildcard)</span>}
                          </Label>
                          {departments.length > 0 && (
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => patch(s.name, { departmentIds: departments.map((d) => d.id) })}>All</Button>
                              <Button size="sm" variant="outline" onClick={() => patch(s.name, { departmentIds: [] })}>None</Button>
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-1 border rounded p-2 max-h-40 overflow-y-auto">
                          {departments.length === 0 && (
                            <div className="col-span-full text-xs text-muted-foreground text-center py-2">
                              {buId ? 'No departments in this BU.' : 'Pick a Business Unit above (optional).'}
                            </div>
                          )}
                          {departments.map((d) => (
                            <label key={d.id} className="flex items-center gap-2 text-sm cursor-pointer p-1 hover:bg-muted rounded">
                              <Checkbox
                                checked={m.departmentIds.includes(d.id)}
                                onCheckedChange={() => patch(s.name, {
                                  departmentIds: m.departmentIds.includes(d.id)
                                    ? m.departmentIds.filter((x) => x !== d.id)
                                    : [...m.departmentIds, d.id],
                                })}
                              />
                              <span className="truncate">{d.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-sm">
            <Badge variant="outline">Planned rows to write: {totalPlannedRows}</Badge>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={commitMut.isPending || totalPlannedRows === 0} onClick={() => commitMut.mutate()}>
            {commitMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Commit import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}