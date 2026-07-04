import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Plus, Trash2, GripVertical, ArrowDownWideNarrow, AlertTriangle, Eye } from 'lucide-react';
import type { CriterionOption, TemplateCriterion } from '@/types/annualReview';

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;

export interface CriterionOptionsDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  criterion: TemplateCriterion;
  onSave: (options: CriterionOption[]) => void;
  /** Translation read/write — only used when multilingual is true. */
  multilingual?: boolean;
  extraLangs?: string[]; // language codes excluding 'en'
  getTr?: (lang: string, key: string) => string;
  setTr?: (lang: string, key: string, value: string) => void;
}

export function CriterionOptionsDialog({
  open, onOpenChange, criterion, onSave,
  multilingual = false, extraLangs = [], getTr, setTr,
}: CriterionOptionsDialogProps) {
  const [options, setOptions] = useState<CriterionOption[]>(criterion.options ?? []);
  // Local buffer for translations so user can cancel.
  const [trBuf, setTrBuf] = useState<Record<string, Record<string, string>>>(() => {
    const seed: Record<string, Record<string, string>> = {};
    extraLangs.forEach((lang) => {
      seed[lang] = {};
      (criterion.options ?? []).forEach((o) => {
        // Prefer the namespaced key `option:<criterionId>:<optionId>:label`.
        // Fall back to the legacy `option:<optionId>:label` so translations
        // saved before the per-criterion namespacing fix still render.
        const ns = getTr?.(lang, `option:${criterion.id}:${o.id}:label`) ?? '';
        const legacy = ns ? '' : (getTr?.(lang, `option:${o.id}:label`) ?? '');
        seed[lang][o.id] = ns || legacy;
      });
    });
    return seed;
  });
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  const update = (i: number, patch: Partial<CriterionOption>) => {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  };
  const remove = (i: number) => {
    const removed = options[i];
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
    setTrBuf((prev) => {
      const next = { ...prev };
      extraLangs.forEach((lang) => {
        if (next[lang]) { const c = { ...next[lang] }; delete c[removed.id]; next[lang] = c; }
      });
      return next;
    });
  };
  const add = () => {
    setOptions((prev) => [...prev, { id: uid('o'), label: '', score: 0 }]);
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= options.length || from === to) return;
    setOptions((prev) => {
      const next = [...prev];
      const [it] = next.splice(from, 1);
      next.splice(to, 0, it);
      return next;
    });
  };
  const sortByScore = () => {
    setOptions((prev) => [...prev].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0)));
  };

  const setTrLocal = (lang: string, optId: string, value: string) => {
    setTrBuf((prev) => ({ ...prev, [lang]: { ...(prev[lang] ?? {}), [optId]: value } }));
  };

  // ----- Validation -----
  const issues = useMemo(() => {
    const list: string[] = [];
    const seenScores = new Map<number, number>();
    options.forEach((o) => {
      const s = Number(o.score);
      seenScores.set(s, (seenScores.get(s) ?? 0) + 1);
    });
    const dupScores = [...seenScores.entries()].filter(([, c]) => c > 1).map(([s]) => s);
    if (dupScores.length) list.push(`Duplicate scores: ${dupScores.join(', ')}`);
    const blank = options.filter((o) => !o.label.trim()).length;
    if (blank) list.push(`${blank} option${blank > 1 ? 's' : ''} missing label`);
    const outOfRange = options.filter((o) => Number(o.score) < 0 || Number(o.score) > 5);
    if (outOfRange.length) list.push(`${outOfRange.length} score(s) outside 0–5`);
    return list;
  }, [options]);

  const handleSave = () => {
    // Push translations to parent
    if (multilingual && setTr) {
      extraLangs.forEach((lang) => {
        Object.entries(trBuf[lang] ?? {}).forEach(([optId, val]) => {
          setTr(lang, `option:${criterion.id}:${optId}:label`, val);
        });
      });
    }
    onSave(options);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Custom Options</DialogTitle>
          <DialogDescription>
            Define custom multiple-choice options for <span className="font-semibold text-foreground">{criterion.name || 'this criterion'}</span>.
            If no options are defined, the system will use the default 0–5 numeric selector.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">{options.length} option{options.length === 1 ? '' : 's'}</Badge>
              {multilingual && extraLangs.length > 0 && (
                <Badge variant="outline" className="gap-1">EN + {extraLangs.map((l) => l.toUpperCase()).join(', ')}</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={sortByScore} className="h-9 gap-1.5" disabled={options.length < 2}>
                <ArrowDownWideNarrow className="h-4 w-4" /> Sort high → low
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setShowPreview((v) => !v)} className="h-9 gap-1.5">
                <Eye className="h-4 w-4" /> {showPreview ? 'Hide preview' : 'Show preview'}
              </Button>
            </div>
          </div>

          {/* Header row */}
          <div className="grid grid-cols-[24px_1fr_88px_40px] gap-2 px-1 text-xs text-muted-foreground">
            <div />
            <div>Option Label{multilingual && extraLangs.length > 0 ? ' (English + translations)' : ''}</div>
            <div className="text-right pr-2">Score (0–5)</div>
            <div />
          </div>

          {/* Options list */}
          <div className="space-y-2">
            {options.map((o, i) => (
              <Card
                key={o.id}
                className={`p-2 ${dragIndex === i ? 'opacity-60' : ''}`}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={() => { if (dragIndex !== null) { move(dragIndex, i); setDragIndex(null); } }}
                onDragEnd={() => setDragIndex(null)}
              >
                <div className="grid grid-cols-[24px_1fr_88px_40px] gap-2 items-start">
                  <button
                    type="button"
                    className="flex items-center justify-center h-10 w-6 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
                    aria-label="Drag to reorder"
                    title="Drag to reorder"
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                  <div className="space-y-1.5">
                    <Textarea
                      rows={2}
                      value={o.label}
                      placeholder="English label"
                      onChange={(e) => update(i, { label: e.target.value })}
                      className="resize-y min-h-[40px]"
                    />
                    {multilingual && extraLangs.map((lang) => (
                      <Textarea
                        key={lang}
                        rows={2}
                        dir="auto"
                        value={trBuf[lang]?.[o.id] ?? ''}
                        placeholder={`${lang.toUpperCase()} label`}
                        onChange={(e) => setTrLocal(lang, o.id, e.target.value)}
                        className="resize-y min-h-[40px]"
                      />
                    ))}
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={5}
                    step={1}
                    value={o.score}
                    onChange={(e) => update(i, { score: Number(e.target.value) })}
                    className="h-10 text-center"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => remove(i)}
                    className="h-10 w-10"
                    aria-label="Delete option"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </Card>
            ))}

            <Button
              type="button"
              variant="outline"
              onClick={add}
              className="w-full h-11 border-dashed gap-1.5"
            >
              <Plus className="h-4 w-4" /> Add Another Option
            </Button>
          </div>

          {/* Validation */}
          {issues.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="space-y-0.5">
                <p className="font-medium text-amber-700 dark:text-amber-300">Please review:</p>
                <ul className="list-disc pl-5 text-amber-700/90 dark:text-amber-200/90">
                  {issues.map((m) => <li key={m}>{m}</li>)}
                </ul>
              </div>
            </div>
          )}

          {/* Preview */}
          {showPreview && options.length > 0 && (
            <Card className="p-3 bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground">Reviewer Preview</p>
                <Badge variant="outline" className="text-[10px]">English</Badge>
              </div>
              <RadioGroup className="space-y-1.5">
                {options.map((o) => (
                  <label key={o.id} className="flex items-start gap-2 text-sm cursor-default">
                    <RadioGroupItem value={o.id} className="mt-0.5" disabled />
                    <span className="flex-1">{o.label || <span className="text-muted-foreground italic">(empty label)</span>}</span>
                    <Badge variant="secondary" className="shrink-0">{o.score}</Badge>
                  </label>
                ))}
              </RadioGroup>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save Options</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}