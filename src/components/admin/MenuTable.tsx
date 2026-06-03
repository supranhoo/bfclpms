import { useMemo, useState } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ArrowRightLeft, ChevronLeft, ChevronRight, Link2, Lock, RotateCcw, Trash2,
} from 'lucide-react';
import type { MenuRegistryRow, ResolvedMenuNode } from '@/lib/menu/types';
import type { PendingMove, LabelDraft } from './MenuTreeDnd';

type Props = {
  effective: ResolvedMenuNode[];
  registryByKey: Record<string, MenuRegistryRow>;
  effectiveByKey: Record<string, ResolvedMenuNode>;
  pendingMoves: Record<string, PendingMove>;
  pendingLabels: Record<string, LabelDraft>;
  visibleLevels: Set<2 | 3 | 4>;
  searchTerm: string;
  selectedKeys: Set<string>;
  onToggleSelect: (k: string) => void;
  onLabelChange: (k: string, v: string) => void;
  onResetItem: (k: string) => void;
  onMoveItem: (k: string) => void;
  onCreateShortcut: (k: string) => void;
  onDeleteCustom: (k: string) => void;
};

const PAGE_SIZE = 25;

/** Beehive-style flat table view of the menu registry. Read-mostly; structural
 * changes go through the Move dialog and existing handlers. No drag/drop. */
export function MenuTable(p: Props) {
  const [page, setPage] = useState(1);

  const childrenByParent = useMemo(() => {
    const m = new Map<string, ResolvedMenuNode[]>();
    for (const n of p.effective) {
      if (!n.parent_key) continue;
      const arr = m.get(n.parent_key) ?? [];
      arr.push(n);
      m.set(n.parent_key, arr);
    }
    return m;
  }, [p.effective]);

  const rows = useMemo(() => {
    const q = p.searchTerm.trim().toLowerCase();
    return [...p.effective]
      .filter((n) => p.visibleLevels.has(n.menu_level as 2 | 3 | 4) || n.menu_level === 1)
      .filter((n) => {
        if (!q) return true;
        return (
          n.label.toLowerCase().includes(q) ||
          n.menu_key.toLowerCase().includes(q) ||
          (n.route_path ?? '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.menu_level - b.menu_level || a.sort_order - b.sort_order);
  }, [p.effective, p.visibleLevels, p.searchTerm]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function statusBadge(n: ResolvedMenuNode) {
    const reg = p.registryByKey[n.menu_key];
    if (!reg) return <Badge variant="outline">—</Badge>;
    if (reg.is_system_required || !reg.is_movable) {
      return (
        <Badge variant="secondary" className="gap-1 text-[10px]">
          <Lock className="h-3 w-3" /> Protected
        </Badge>
      );
    }
    if (reg.is_custom) {
      return <Badge className="text-[10px]" variant="default">Custom</Badge>;
    }
    return <Badge variant="outline" className="text-[10px]">Active</Badge>;
  }

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10"></TableHead>
            <TableHead>Menu Name</TableHead>
            <TableHead>Menu_Key</TableHead>
            <TableHead>Route</TableHead>
            <TableHead className="w-16">Level</TableHead>
            <TableHead>Parent</TableHead>
            <TableHead className="w-20">Icon</TableHead>
            <TableHead className="w-16">Order</TableHead>
            <TableHead className="w-24">Status</TableHead>
            <TableHead className="w-40 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paged.length === 0 && (
            <TableRow>
              <TableCell colSpan={10} className="text-center text-sm text-muted-foreground italic py-8">
                No menu items match your filters.
              </TableCell>
            </TableRow>
          )}
          {paged.map((n) => {
            const reg = p.registryByKey[n.menu_key];
            const isDirty = !!p.pendingMoves[n.menu_key] || !!p.pendingLabels[n.menu_key];
            const labelDraft = p.pendingLabels[n.menu_key];
            const selectable = !!reg && reg.is_movable && !reg.is_system_required;
            const isSelected = p.selectedKeys.has(n.menu_key);
            const parent = n.parent_key ? p.effectiveByKey[n.parent_key] : null;
            const isProtected = !!reg && (reg.is_system_required || !reg.is_movable);
            const isCustom = !!reg?.is_custom && !reg?.is_system_required;
            const childCount = childrenByParent.get(n.menu_key)?.length ?? 0;
            const deleteBlocked = childCount > 0;

            return (
              <TableRow key={n.menu_key} className={isDirty ? 'bg-primary/5' : ''}>
                <TableCell>
                  {selectable ? (
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => p.onToggleSelect(n.menu_key)}
                      aria-label={`Select ${n.label}`}
                    />
                  ) : null}
                </TableCell>
                <TableCell className="font-medium">
                  {reg?.is_renamable ? (
                    <Input
                      value={labelDraft?.label ?? n.label}
                      onChange={(e) => p.onLabelChange(n.menu_key, e.target.value)}
                      className="h-7 text-sm border-0 shadow-none focus-visible:ring-1 px-1 bg-transparent"
                    />
                  ) : (
                    <span className="text-sm">{n.label}</span>
                  )}
                </TableCell>
                <TableCell>
                  <code className="text-[11px] font-mono text-muted-foreground">{n.menu_key}</code>
                </TableCell>
                <TableCell>
                  {n.route_path ? (
                    <code className="text-[11px] font-mono text-muted-foreground">{n.route_path}</code>
                  ) : (
                    <span className="text-[11px] italic text-muted-foreground/60">
                      {reg?.accepts_children ? 'Container' : '—'}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-xs">L{n.menu_level}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {parent?.label ?? <span className="italic">—</span>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{n.icon_name ?? '—'}</TableCell>
                <TableCell className="text-xs">{n.sort_order}</TableCell>
                <TableCell>{statusBadge(n)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-0.5">
                    {!isProtected && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button" variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => p.onMoveItem(n.menu_key)}
                            aria-label="Move"
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Move to level / parent</TooltipContent>
                      </Tooltip>
                    )}
                    {isProtected && reg?.default_parent_key !== null && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button" variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => p.onCreateShortcut(n.menu_key)}
                            aria-label="Create shortcut"
                          >
                            <Link2 className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Create shortcut</TooltipContent>
                      </Tooltip>
                    )}
                    {isDirty && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button" variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => p.onResetItem(n.menu_key)}
                            aria-label="Revert"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Revert pending change</TooltipContent>
                      </Tooltip>
                    )}
                    {isCustom && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button
                              type="button" variant="ghost" size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10 disabled:opacity-40"
                              onClick={() => !deleteBlocked && p.onDeleteCustom(n.menu_key)}
                              disabled={deleteBlocked}
                              aria-label="Delete custom tab"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {deleteBlocked ? 'Move or delete child items first.' : 'Delete custom tab'}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {pageCount > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <span>
            Page {safePage} of {pageCount} · {rows.length} item{rows.length === 1 ? '' : 's'}
          </span>
          <Button
            type="button" variant="outline" size="icon" className="h-7 w-7"
            onClick={() => setPage((x) => Math.max(1, x - 1))}
            disabled={safePage <= 1}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button" variant="outline" size="icon" className="h-7 w-7"
            onClick={() => setPage((x) => Math.min(pageCount, x + 1))}
            disabled={safePage >= pageCount}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}