import { useMemo, useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, ArrowRightLeft, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { validateMove } from '@/lib/menu/validateMove';
import type { MenuRegistryRow, ResolvedMenuNode } from '@/lib/menu/types';
import type { PendingMove } from './MenuTreeDnd';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedKeys: string[];
  registryByKey: Record<string, MenuRegistryRow>;
  effective: ResolvedMenuNode[];
  effectiveByKey: Record<string, ResolvedMenuNode>;
  onApplyMove: (menuKey: string, move: PendingMove) => void;
};

/**
 * Explicit "Move to level / parent" — Beehive-style. Pick target level first,
 * then pick a parent at level-1. Stages PendingMoves; commit via main Save.
 */
export function MoveToDialog(p: Props) {
  const [targetLevel, setTargetLevel] = useState<2 | 3 | 4>(2);
  const [targetParent, setTargetParent] = useState<string | null>(null);
  const [orderInput, setOrderInput] = useState<string>('');
  const [search, setSearch] = useState('');

  const selectedSources = useMemo(
    () => p.selectedKeys.map((k) => p.registryByKey[k]).filter(Boolean) as MenuRegistryRow[],
    [p.selectedKeys, p.registryByKey],
  );
  const movable = useMemo(
    () => selectedSources.filter((s) => s.is_movable && !s.is_system_required),
    [selectedSources],
  );
  const locked = useMemo(
    () => selectedSources.filter((s) => !s.is_movable || s.is_system_required),
    [selectedSources],
  );

  // Candidate parents = nodes at level === targetLevel - 1, accepting children,
  // and validateMove passes for every movable source.
  const candidates = useMemo(() => {
    if (movable.length === 0) return [] as ResolvedMenuNode[];
    const parentLevel = targetLevel - 1;
    return p.effective
      .filter((n) => n.accepts_children && n.menu_level === parentLevel)
      .filter((n) => !p.selectedKeys.includes(n.menu_key))
      .filter((n) =>
        movable.every(
          (src) =>
            validateMove({
              source: src,
              targetParentKey: n.menu_key,
              registryByKey: p.registryByKey,
              resolvedByKey: p.effectiveByKey,
            }).ok,
        ),
      );
  }, [p.effective, p.effectiveByKey, p.registryByKey, p.selectedKeys, movable, targetLevel]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (n) => n.label.toLowerCase().includes(q) || n.menu_key.toLowerCase().includes(q),
    );
  }, [candidates, search]);

  // Reset parent when level changes or dialog opens.
  useEffect(() => {
    setTargetParent(null);
    setOrderInput('');
  }, [targetLevel, p.open]);

  // Default order to (max sibling sort)+10 when parent picked.
  useEffect(() => {
    if (!targetParent) return;
    const siblings = p.effective.filter(
      (n) => n.parent_key === targetParent && !p.selectedKeys.includes(n.menu_key),
    );
    const max = siblings.reduce((m, n) => Math.max(m, n.sort_order), 0);
    setOrderInput(String(max + 10));
  }, [targetParent, p.effective, p.selectedKeys]);

  function ancestorPath(key: string | null): string {
    if (!key) return '—';
    const out: string[] = [];
    let cur: string | null = key;
    let guard = 0;
    while (cur && guard < 20) {
      const n = p.effectiveByKey[cur];
      if (!n) break;
      out.unshift(n.label);
      cur = n.parent_key;
      guard++;
    }
    return out.join(' > ');
  }

  function apply() {
    if (!targetParent) return;
    const tgt = p.effectiveByKey[targetParent];
    if (!tgt) return;
    const baseOrder = Number(orderInput) || 10;
    movable.forEach((src, i) => {
      const cur = p.effectiveByKey[src.menu_key];
      if (!cur) return;
      p.onApplyMove(src.menu_key, {
        parent_key: tgt.menu_key,
        sort_order: baseOrder + i * 10,
        menu_level: targetLevel,
        module_key: tgt.module_key,
        prev_parent_key: cur.parent_key,
        prev_sort_order: cur.sort_order,
        prev_menu_level: cur.menu_level,
        prev_module_key: cur.module_key,
      });
    });
    p.onOpenChange(false);
  }

  const firstSrc = movable[0];
  const previewCurrent = firstSrc ? ancestorPath(firstSrc.menu_key) : '—';
  const previewNew = firstSrc && targetParent
    ? `${ancestorPath(targetParent)} > ${p.effectiveByKey[firstSrc.menu_key]?.label ?? firstSrc.default_label}`
    : '—';

  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" /> Move to level / parent
          </DialogTitle>
          <DialogDescription>
            Pick a target level and a parent. Only valid containers are listed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {movable.map((s) => (
              <Badge key={s.menu_key} variant="secondary" className="text-xs">
                {s.default_label}
              </Badge>
            ))}
          </div>

          {locked.length > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/10 text-xs">
              <AlertCircle className="h-4 w-4 mt-0.5 text-amber-600 flex-shrink-0" />
              <div className="space-y-1">
                <p className="font-medium">
                  {locked.length} protected item{locked.length === 1 ? '' : 's'} cannot be moved
                </p>
                <p className="text-muted-foreground">
                  Use “Create shortcut” on each protected row to expose it under a container.
                </p>
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs font-medium">Target level</Label>
            <div className="flex gap-2 mt-1.5">
              {[2, 3, 4].map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setTargetLevel(lvl as 2 | 3 | 4)}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-sm border transition-colors',
                    targetLevel === lvl
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card hover:bg-accent border-border',
                  )}
                >
                  Level {lvl}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs font-medium">Target parent</Label>
            <div className="relative mt-1.5">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search containers…"
                className="h-8 pl-7"
              />
            </div>
            {filtered.length === 0 ? (
              <div className="mt-2 flex items-start gap-2 p-3 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/10 text-xs">
                <AlertCircle className="h-4 w-4 mt-0.5 text-amber-600 flex-shrink-0" />
                <p className="text-muted-foreground">
                  No container at Level {targetLevel - 1} accepts all selected items.
                </p>
              </div>
            ) : (
              <ScrollArea className="h-48 mt-2 rounded-md border">
                <div className="p-1">
                  {filtered.map((n) => {
                    const sel = targetParent === n.menu_key;
                    return (
                      <button
                        key={n.menu_key}
                        type="button"
                        onClick={() => setTargetParent(n.menu_key)}
                        className={cn(
                          'w-full text-left px-3 py-1.5 rounded-md flex items-center justify-between gap-2 hover:bg-accent',
                          sel && 'bg-primary/10 ring-1 ring-primary/40',
                        )}
                      >
                        <div className="min-w-0">
                          <div className="text-sm truncate">{n.label}</div>
                          <div className="text-[10px] font-mono text-muted-foreground truncate">
                            {n.menu_key} · L{n.menu_level} · {n.module_key}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>

          <div>
            <Label className="text-xs font-medium">Order</Label>
            <Input
              type="number"
              value={orderInput}
              onChange={(e) => setOrderInput(e.target.value)}
              className="h-8 mt-1.5 w-32"
              placeholder="10"
            />
          </div>

          <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
            <div><span className="text-muted-foreground">Current: </span>{previewCurrent}</div>
            <div><span className="text-muted-foreground">New: </span>{previewNew}</div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => p.onOpenChange(false)}>Cancel</Button>
          <Button onClick={apply} disabled={!targetParent || movable.length === 0}>
            Apply move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}