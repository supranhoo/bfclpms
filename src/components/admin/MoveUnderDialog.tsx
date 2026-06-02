import { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, FolderInput, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { validateMove } from '@/lib/menu/validateMove';
import type { MenuRegistryRow, ResolvedMenuNode } from '@/lib/menu/types';
import type { PendingMove } from './MenuTreeDnd';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** menu_keys currently selected in the tree. */
  selectedKeys: string[];
  registryByKey: Record<string, MenuRegistryRow>;
  effective: ResolvedMenuNode[];
  effectiveByKey: Record<string, ResolvedMenuNode>;
  /** Stage a move for one menu_key. */
  onApplyMove: (menuKey: string, move: PendingMove) => void;
};

/**
 * Bulk "Move under…" — pick one parent container and nest all selected items
 * underneath it as children, sorted 10, 20, 30…. Mirrors DnD validation.
 */
export function MoveUnderDialog(p: Props) {
  const [search, setSearch] = useState('');
  const [targetKey, setTargetKey] = useState<string | null>(null);

  const selectedSources = useMemo(
    () => p.selectedKeys.map((k) => p.registryByKey[k]).filter(Boolean) as MenuRegistryRow[],
    [p.selectedKeys, p.registryByKey],
  );

  // Split selection: movable rows go through bulk move; locked/system rows
  // must be re-exposed via the "Create shortcut" action instead.
  const movableSources = useMemo(
    () => selectedSources.filter((s) => s.is_movable && !s.is_system_required),
    [selectedSources],
  );
  const lockedSources = useMemo(
    () => selectedSources.filter((s) => !s.is_movable || s.is_system_required),
    [selectedSources],
  );

  // Candidate parents: anything that accepts children AND passes validateMove
  // for EVERY MOVABLE source. Exclude the selected items themselves.
  const candidates = useMemo(() => {
    if (movableSources.length === 0) return [] as ResolvedMenuNode[];
    return p.effective
      .filter((n) => n.accepts_children)
      .filter((n) => !p.selectedKeys.includes(n.menu_key))
      .filter((n) =>
        movableSources.every(
          (src) =>
            validateMove({
              source: src,
              targetParentKey: n.menu_key,
              registryByKey: p.registryByKey,
              resolvedByKey: p.effectiveByKey,
            }).ok,
        ),
      );
  }, [p.effective, p.effectiveByKey, p.registryByKey, p.selectedKeys, movableSources]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (n) =>
        n.label.toLowerCase().includes(q) ||
        n.menu_key.toLowerCase().includes(q),
    );
  }, [candidates, search]);

  function apply() {
    if (!targetKey) return;
    const target = p.effectiveByKey[targetKey];
    if (!target) return;
    const newLevel = Math.min(4, (target.menu_level ?? 1) + 1);
    // Stage moves with sequential sort (10,20,30…) under the chosen parent.
    movableSources.forEach((src, i) => {
      const cur = p.effectiveByKey[src.menu_key];
      if (!cur) return;
      p.onApplyMove(src.menu_key, {
        parent_key: target.menu_key,
        sort_order: (i + 1) * 10,
        menu_level: newLevel,
        module_key: target.module_key,
        prev_parent_key: cur.parent_key,
        prev_sort_order: cur.sort_order,
        prev_menu_level: cur.menu_level,
        prev_module_key: cur.module_key,
      });
    });
    p.onOpenChange(false);
  }

  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderInput className="h-5 w-5" /> Move under…
          </DialogTitle>
          <DialogDescription>
            Nest {p.selectedKeys.length} selected item{p.selectedKeys.length === 1 ? '' : 's'} under a container.
            Only containers that accept all selected items are listed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {movableSources.map((s) => (
              <Badge key={s.menu_key} variant="secondary" className="text-xs">
                {s.default_label}
              </Badge>
            ))}
          </div>

          {lockedSources.length > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/10 text-xs">
              <AlertCircle className="h-4 w-4 mt-0.5 text-amber-600 flex-shrink-0" />
              <div className="space-y-1">
                <p className="font-medium">
                  {lockedSources.length} locked item{lockedSources.length === 1 ? '' : 's'} cannot be moved
                </p>
                <div className="flex flex-wrap gap-1">
                  {lockedSources.map((s) => (
                    <Badge key={s.menu_key} variant="outline" className="text-[10px]">
                      {s.default_label}
                    </Badge>
                  ))}
                </div>
                <p className="text-muted-foreground">
                  Use “Create shortcut” on each locked row to expose it under a container instead.
                </p>
              </div>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search containers…"
              className="h-8 pl-7"
            />
          </div>

          {filtered.length === 0 ? (
            <div className="flex items-start gap-2 p-3 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/10 text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 text-amber-600 flex-shrink-0" />
              <div>
                <p className="font-medium">No valid containers</p>
                <p className="text-muted-foreground text-xs">
                  No container accepts all selected items (depth, cross-module, or cycle rules).
                </p>
              </div>
            </div>
          ) : (
            <ScrollArea className="h-64 rounded-md border">
              <div className="p-1">
                {filtered.map((n) => {
                  const sel = targetKey === n.menu_key;
                  return (
                    <button
                      key={n.menu_key}
                      type="button"
                      onClick={() => setTargetKey(n.menu_key)}
                      className={cn(
                        'w-full text-left px-3 py-2 rounded-md flex items-center justify-between gap-2 hover:bg-accent',
                        sel && 'bg-primary/10 ring-1 ring-primary/40',
                      )}
                    >
                      <div className="min-w-0">
                        <div className="text-sm truncate">{n.label}</div>
                        <div className="text-[10px] font-mono text-muted-foreground truncate">
                          {n.menu_key} · L{n.menu_level} · {n.module_key}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        → L{Math.min(4, n.menu_level + 1)}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => p.onOpenChange(false)}>Cancel</Button>
          <Button onClick={apply} disabled={!targetKey || movableSources.length === 0}>
            Move {movableSources.length} item{movableSources.length === 1 ? '' : 's'} under selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}