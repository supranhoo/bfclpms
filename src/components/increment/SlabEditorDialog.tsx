import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { MultiSelectFilter } from '@/components/review/MultiSelectFilter';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { isExactScopeDuplicate, slabSpecificity } from '@/lib/slabMatcher';
import { SLAB_DIMENSIONS } from '@/lib/slabDimensions';
import {
  useUpsertSlab,
  type IncrementSlabRow,
} from '@/hooks/useIncrementSlabs';

export interface SlabDraft {
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
  remarks: string;
}

type MastersMap = Partial<Record<
  'companies' | 'divisions' | 'business_units' | 'locations' | 'employee_categories' | 'levels',
  Array<{ id: string; name: string }>
>>;

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
    remarks: '',
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
    remarks: (s.extra_attributes as any)?.remarks ?? '',
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slab: IncrementSlabRow | null;
  assessmentYear: string;
  existingSlabs: IncrementSlabRow[];
  masters: MastersMap | undefined;
}

export function SlabEditorDialog({
  open,
  onOpenChange,
  slab,
  assessmentYear,
  existingSlabs,
  masters,
}: Props) {
  const { toast } = useToast();
  const upsert = useUpsertSlab();
  const isEdit = !!slab;

  const [draft, setDraft] = useState<SlabDraft>(emptyDraft());

  useEffect(() => {
    if (!open) return;
    setDraft(slab ? rowToDraft(slab) : emptyDraft());
  }, [open, slab]);

  const patch = (p: Partial<SlabDraft>) => setDraft((d) => ({ ...d, ...p }));

  const opts = (list?: Array<{ id: string; name: string }>) =>
    (list ?? []).map((o) => ({ value: o.id, label: o.name }));

  const spec = useMemo(() => slabSpecificity(draft as any), [draft]);

  const handleSave = async () => {
    if (Number(draft.rating_to) < Number(draft.rating_from)) {
      toast({ title: 'Invalid range', description: 'Rating To must be ≥ Rating From.', variant: 'destructive' });
      return;
    }
    if (draft.increment_percent < 0 || draft.increment_percent > 100) {
      toast({ title: 'Invalid %', description: 'Increment % must be between 0 and 100.', variant: 'destructive' });
      return;
    }
    const dupe = existingSlabs.find(
      (s) => s.id !== slab?.id && isExactScopeDuplicate(s as any, draft as any),
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
      id: slab?.id,
      assessment_year: assessmentYear,
      increment_period: `Jul ${assessmentYear.slice(0, 2)}–Jun ${assessmentYear.slice(-2)}`,
      rating_from: Number(draft.rating_from),
      rating_to: Number(draft.rating_to),
      increment_percent: Number(draft.increment_percent),
      prorate_on_doj: draft.prorate_on_doj,
      company_ids: draft.company_ids,
      division_ids: draft.division_ids,
      business_unit_ids: draft.business_unit_ids,
      location_ids: draft.location_ids,
      employee_category_ids: draft.employee_category_ids,
      level_ids: draft.level_ids,
      extra_attributes: {
        ...((slab?.extra_attributes as any) ?? {}),
        remarks: draft.remarks?.trim() ? draft.remarks.trim() : undefined,
      } as any,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Slab' : 'Add Slab'}</DialogTitle>
          <DialogDescription>
            Configure the rating band, increment %, and which employees this slab applies to.
            Leave a scope field empty to apply to every value of that dimension.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Rating block */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rating-from">Rating From</Label>
              <Input
                id="rating-from" type="number" step="0.01"
                value={draft.rating_from}
                onChange={(e) => patch({ rating_from: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rating-to">Rating To</Label>
              <Input
                id="rating-to" type="number" step="0.01"
                value={draft.rating_to}
                onChange={(e) => patch({ rating_to: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="increment-pct">Increment %</Label>
              <Input
                id="increment-pct" type="number" step="0.01"
                value={draft.increment_percent}
                onChange={(e) => patch({ increment_percent: Number(e.target.value) })}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={draft.prorate_on_doj}
              onCheckedChange={(v) => patch({ prorate_on_doj: Boolean(v) })}
            />
            <span>Prorate on Date of Joining</span>
          </label>

          {/* Scope block — driven by SLAB_DIMENSIONS config */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Scope</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SLAB_DIMENSIONS.map((dim) => {
                const Icon = dim.icon;
                const values = (draft[dim.slabKey as keyof SlabDraft] as string[]) ?? [];
                return (
                  <div key={dim.slabKey} className="space-y-1.5">
                    <Label>{dim.label}</Label>
                    <MultiSelectFilter
                      icon={<Icon className="h-3 w-3 text-muted-foreground" />}
                      label={dim.label}
                      options={opts(masters?.[dim.mastersKey])}
                      values={values}
                      onChange={(v) => patch({ [dim.slabKey]: v } as Partial<SlabDraft>)}
                      placeholder={dim.placeholder}
                      width="100%"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Remarks */}
          <div className="space-y-1.5">
            <Label htmlFor="remarks">Remarks (optional)</Label>
            <Textarea
              id="remarks" rows={2}
              value={draft.remarks}
              onChange={(e) => patch({ remarks: e.target.value })}
              placeholder="Internal notes about this slab"
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-[10px] px-1.5">Specificity {spec}/{SLAB_DIMENSIONS.length}</Badge>
            <span>
              When multiple slabs match an employee, the slab scoping the most dimensions wins.
            </span>
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={upsert.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={upsert.isPending}>
            {upsert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Slab
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}