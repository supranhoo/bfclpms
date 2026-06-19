import { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Search, Library, Settings2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSelfReviewLibrary, useBundleFields } from '@/hooks/useSelfReviewLibrary';
import * as svc from '@/services/annualReview/selfReviewLibrary';
import type { SelfReviewLibraryEntry } from '@/types/annualReview';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** True when template has Hindi enabled — translations are imported only then. */
  includeHindi: boolean;
  canManage: boolean;
  onManage?: () => void;
  /** Called with the chosen field rows (bundles already expanded) in display order. */
  onInsert: (fields: SelfReviewLibraryEntry[]) => void;
}

export function SelfReviewLibraryPicker({ open, onOpenChange, includeHindi, canManage, onManage, onInsert }: Props) {
  const [tab, setTab] = useState<'field' | 'bundle'>('field');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const list = useSelfReviewLibrary({ search, category: category || undefined, kind: tab, limit: 200 });

  const categories = useMemo(() => {
    const s = new Set<string>();
    (list.data ?? []).forEach((e) => s.add(e.category));
    return Array.from(s);
  }, [list.data]);

  const reset = () => { setSelected({}); setSearch(''); setCategory(''); };
  const close = () => { reset(); onOpenChange(false); };

  async function handleInsert() {
    const picks = (list.data ?? []).filter((e) => selected[e.id]);
    if (picks.length === 0) return;
    if (tab === 'field') {
      onInsert(picks);
    } else {
      // expand each bundle into its child fields, preserving picker order
      const expanded: SelfReviewLibraryEntry[] = [];
      for (const b of picks) {
        const children = await svc.getBundleFields(b.id);
        expanded.push(...children);
      }
      onInsert(expanded);
    }
    close();
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Library className="h-5 w-5" /> Self Review Field Library
          </DialogTitle>
          <DialogDescription>
            Insert curated and saved questions into this template.
            {!includeHindi && <span className="block text-xs mt-1">Hindi translations skipped — enable Hindi in template settings to import them.</span>}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => { setTab(v as any); setSelected({}); }}>
          <div className="flex items-center justify-between gap-2">
            <TabsList>
              <TabsTrigger value="field">Fields</TabsTrigger>
              <TabsTrigger value="bundle">Bundles</TabsTrigger>
            </TabsList>
            {canManage && (
              <Button size="sm" variant="ghost" onClick={onManage}>
                <Settings2 className="h-4 w-4 mr-1" /> Manage library
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 mt-3">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8 h-9"
                placeholder="Search by label or key…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              <Badge
                variant={category === '' ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => setCategory('')}
              >All</Badge>
              {categories.map((c) => (
                <Badge
                  key={c}
                  variant={category === c ? 'default' : 'outline'}
                  className="cursor-pointer capitalize"
                  onClick={() => setCategory(c === category ? '' : c)}
                >{c.replace(/_/g, ' ')}</Badge>
              ))}
            </div>
          )}

          <TabsContent value={tab} className="mt-3">
            <ScrollArea className="h-[340px] rounded border">
              {list.isLoading ? (
                <div className="flex items-center justify-center h-40 text-muted-foreground">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading…
                </div>
              ) : (list.data ?? []).length === 0 ? (
                <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                  No entries match.
                </div>
              ) : (
                <ul className="divide-y">
                  {(list.data ?? []).map((e) => (
                    <li key={e.id} className="flex items-start gap-3 p-3 hover:bg-muted/40">
                      <Checkbox
                        checked={!!selected[e.id]}
                        onCheckedChange={(v) => setSelected((s) => ({ ...s, [e.id]: !!v }))}
                        aria-label={`Select ${e.label_en}`}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{e.label_en}</span>
                          {e.required && <Badge variant="secondary" className="text-[10px]">Required</Badge>}
                          <Badge variant="outline" className="text-[10px] capitalize">{e.category.replace(/_/g, ' ')}</Badge>
                          <Badge variant={e.is_builtin ? 'default' : 'outline'} className="text-[10px]">
                            {e.is_builtin ? 'Built-in' : 'Org'}
                          </Badge>
                          {tab === 'bundle' && <BundleSize bundleId={e.id} />}
                        </div>
                        {e.label_hi && <div className="text-xs text-muted-foreground mt-0.5" dir="auto">{e.label_hi}</div>}
                        {e.placeholder_en && <div className="text-xs text-muted-foreground mt-0.5 italic">{e.placeholder_en}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button disabled={selectedCount === 0} onClick={handleInsert}>
            Insert {selectedCount > 0 ? `${selectedCount} selected` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BundleSize({ bundleId }: { bundleId: string }) {
  const q = useBundleFields(bundleId);
  const n = q.data?.length ?? null;
  return <Badge variant="outline" className="text-[10px]">{n === null ? '…' : `${n} fields`}</Badge>;
}