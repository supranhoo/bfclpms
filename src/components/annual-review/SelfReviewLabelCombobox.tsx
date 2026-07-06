import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { useSelfReviewLibrary } from '@/hooks/useSelfReviewLibrary';
import type { SelfReviewLibraryEntry } from '@/types/annualReview';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onPickLibraryEntry: (entry: SelfReviewLibraryEntry) => void;
  placeholder?: string;
}

/** Free-text input with inline suggestions from the Self Review Field library. */
export function SelfReviewLabelCombobox({ value, onChange, onPickLibraryEntry, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const q = useSelfReviewLibrary({ kind: 'field', search: value.length >= 2 ? value : undefined, limit: 8 });
  const matches = useMemo(() => (q.data ?? []).slice(0, 8), [q.data]);
  const showPanel = open && value.length >= 2 && matches.length > 0;

  return (
    <Popover open={showPanel} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          className="h-9"
          value={value}
          placeholder={placeholder}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
        />
      </PopoverAnchor>
      <PopoverContent
        className="p-0 w-[--radix-popover-trigger-width]"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <ul className="max-h-60 overflow-y-auto">
          {matches.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-muted/60 text-sm"
                onMouseDown={(e) => { e.preventDefault(); onPickLibraryEntry(m); setOpen(false); }}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{m.label_en}</span>
                  <Badge variant="outline" className="text-[10px] capitalize">{m.category.replace(/_/g, ' ')}</Badge>
                  {m.is_builtin && <Badge variant="default" className="text-[10px]">Built-in</Badge>}
                </div>
                {m.label_hi && <div className="text-xs text-muted-foreground" dir="auto">{m.label_hi}</div>}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}