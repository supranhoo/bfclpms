import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Pencil, ChevronRight } from 'lucide-react';
import { SLAB_DIMENSIONS } from '@/lib/slabDimensions';
import type { IncrementSlabRow } from '@/hooks/useIncrementSlabs';

type MastersMap = Partial<Record<
  'companies' | 'divisions' | 'business_units' | 'locations' | 'employee_categories' | 'levels',
  Array<{ id: string; name: string }>
>>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slab: IncrementSlabRow | null;
  masters: MastersMap | undefined;
  onEdit: (slab: IncrementSlabRow) => void;
}

/**
 * Read-only side drawer showing the full multi-dimensional scope
 * of an increment slab. All dimensions render — empty arrays render
 * as "All <dimension>" so the user can clearly see what is unscoped.
 */
export function SlabScopeDrawer({ open, onOpenChange, slab, masters, onEdit }: Props) {
  if (!slab) return null;

  const resolveNames = (ids: string[], masterKey: keyof MastersMap): string[] => {
    const list = masters?.[masterKey] ?? [];
    const map = new Map(list.map((o) => [o.id, o.name]));
    return ids.map((id) => map.get(id) ?? id.slice(0, 8));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] overflow-y-auto">
        <SheetHeader className="space-y-2 text-left">
          <SheetTitle className="flex items-center gap-2">
            <span className="font-mono tabular-nums text-base">
              {Number(slab.rating_from).toFixed(2)} → {Number(slab.rating_to).toFixed(2)}
            </span>
            <Badge variant="secondary" className="text-xs">
              {Number(slab.increment_percent).toFixed(2)}%
            </Badge>
          </SheetTitle>
          <SheetDescription>
            Full scope of this increment slab. Empty dimensions apply to every value.
          </SheetDescription>
        </SheetHeader>

        <Separator className="my-4" />

        <div className="space-y-5">
          {SLAB_DIMENSIONS.map((dim) => {
            const ids = ((slab as any)[dim.slabKey] as string[] | null) ?? [];
            const names = resolveNames(ids, dim.mastersKey);
            const Icon = dim.icon;
            const isAll = ids.length === 0;
            return (
              <div key={dim.slabKey} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {dim.label}
                  </div>
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {isAll ? 'All' : `${ids.length} selected`}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 pl-6">
                  {isAll ? (
                    <span className="text-sm text-muted-foreground italic">
                      Applies to all {dim.label.toLowerCase()}s
                    </span>
                  ) : (
                    names.map((n, i) => (
                      <Badge key={`${n}-${i}`} variant="outline" className="font-normal">
                        {n}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <SheetFooter className="mt-6 gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              onEdit(slab);
            }}
          >
            <Pencil className="h-4 w-4 mr-2" />
            Edit Slab
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}