import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { listCriteriaLibrary, type CriterionRow } from '@/services/annualReview/criteriaLibrary';
import { bandsToBilingualOptions } from '@/lib/annualReview/criteriaBands';
import type { TemplateCriterion } from '@/types/annualReview';

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;

export function rowToCriterion(r: CriterionRow): {
  criterion: TemplateCriterion;
  hiTranslations: Record<string, string>;
} {
  const id = uid('crit');
  const options = bandsToBilingualOptions(r.scoring_bands, r.max_score ?? 5);
  const hi: Record<string, string> = {};
  if (r.label_hi && r.label_hi.trim()) {
    hi[`criterion:${id}:name`] = r.label_hi;
  }
  for (const o of options) {
    const lh = (o as { label_hi?: string | null }).label_hi;
    if (lh && lh.trim()) {
      hi[`option:${id}:${o.id}:label`] = lh;
    }
  }
  const criterion = {
    id,
    name: r.label_en,
    description: '',
    weight: 0,
    reviewer_stages: ['self', 'manager', 'skip_manager', 'bu_head', 'hr'],
    enable_remarks: true,
    enable_evidence: false,
    options,
    // Preserve payload for exports / bilingual rendering.
    key: r.key,
    label_en: r.label_en,
    label_hi: r.label_hi,
    max_score: r.max_score,
    scoring_bands: r.scoring_bands,
  } as unknown as TemplateCriterion;
  return { criterion, hiTranslations: hi };
}

export function CriteriaLibraryPickerDialog({
  open, onOpenChange, existingKeys, onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existingKeys: string[];
  onAdd: (criteria: TemplateCriterion[], hiTranslations: Record<string, string>) => void;
}) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['criteria-library-picker'],
    queryFn: listCriteriaLibrary,
    enabled: open,
  });
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  const existing = useMemo(() => new Set(existingKeys), [existingKeys]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) =>
      !needle ||
      r.label_en.toLowerCase().includes(needle) ||
      (r.label_hi ?? '').toLowerCase().includes(needle) ||
      r.key.toLowerCase().includes(needle),
    );
  }, [rows, q]);

  const confirm = () => {
    const mapped = rows.filter((r) => picked[r.id]).map(rowToCriterion);
    const criteria = mapped.map((m) => m.criterion);
    const hiTranslations = mapped.reduce<Record<string, string>>((acc, m) => {
      Object.assign(acc, m.hiTranslations);
      return acc;
    }, {});
    if (criteria.length) onAdd(criteria, hiTranslations);
    setPicked({});
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Criteria from Library</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Search by name or key…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="border rounded-md max-h-[420px] overflow-auto divide-y">
            {isLoading ? (
              <div className="p-6 flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading library…
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No criteria found.</div>
            ) : filtered.map((r) => {
              const alreadyAdded = existing.has(r.key);
              return (
                <label key={r.id} className={`flex items-start gap-3 p-3 hover:bg-muted/40 cursor-pointer ${alreadyAdded ? 'opacity-50' : ''}`}>
                  <Checkbox
                    className="mt-1"
                    checked={!!picked[r.id]}
                    disabled={alreadyAdded}
                    onCheckedChange={(v) => setPicked((p) => ({ ...p, [r.id]: !!v }))}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.label_en}</div>
                    {r.label_hi && <div className="text-xs text-muted-foreground truncate" dir="auto">{r.label_hi}</div>}
                    <div className="text-[10px] text-muted-foreground mt-0.5">key: {r.key} · max {r.max_score ?? 5}{alreadyAdded ? ' · already added' : ''}</div>
                  </div>
                </label>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Imported criteria arrive with weight 0 — set weights so System + Criteria = 100%.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={confirm} disabled={Object.values(picked).every((v) => !v)}>
            Add Selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}