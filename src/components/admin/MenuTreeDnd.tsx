import { useMemo, useState, useCallback, useEffect } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, closestCenter, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { ChevronRight, ChevronDown, GripVertical, Lock, RotateCcw, AlertCircle, Link2, Copy, Check, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { validateMove } from '@/lib/menu/validateMove';
import type { MenuRegistryRow, ResolvedMenuNode } from '@/lib/menu/types';

/** Pending edit shape that the DnD tree emits/consumes. */
export type PendingMove = {
  /** Override-style fields (null = use default). */
  parent_key: string | null;
  sort_order: number;
  menu_level: number;
  module_key: string;
  /** Captured for audit display. */
  prev_parent_key: string | null;
  prev_sort_order: number;
  prev_menu_level: number;
  prev_module_key: string;
};

export type LabelDraft = { label: string };

type DropIntent =
  | { kind: 'before'; targetKey: string }
  | { kind: 'after';  targetKey: string }
  | { kind: 'inside'; targetKey: string }
  | { kind: 'module-root'; moduleKey: string };

type Props = {
  resolved: ResolvedMenuNode[];
  registryByKey: Record<string, MenuRegistryRow>;
  /** Effective tree AFTER pending moves are applied. */
  effective: ResolvedMenuNode[];
  pendingMoves: Record<string, PendingMove>;
  pendingLabels: Record<string, LabelDraft>;
  onApplyMove: (menuKey: string, move: PendingMove) => void;
  onLabelChange: (menuKey: string, value: string) => void;
  onResetItem: (menuKey: string) => void;
  /** Optional filter to a single module. */
  filterModule?: string | null;
  searchTerm: string;
  /** Multi-select state for the "Move under..." bulk action. */
  selectedKeys?: Set<string>;
  onToggleSelect?: (menuKey: string) => void;
  /** Called when admin clicks "Shortcut" on a locked/system row. */
  onCreateShortcut?: (menuKey: string) => void;
  /** Called when admin clicks "Delete" on a custom row. */
  onDeleteCustom?: (menuKey: string) => void;
  /** Bumps to expand-all / collapse-all every node. */
  expandAllSignal?: number;
  collapseAllSignal?: number;
  /** Only render nodes whose menu_level ∈ set (ancestors of visible nodes still
   *  render so the chain is intact). Group nodes (L1) always render. */
  visibleLevels?: Set<2 | 3 | 4>;
  /** One-shot: on mount expand the ancestor chain of this menu_key. */
  autoExpandKey?: string | null;
};

/** Knows how to render and DnD-edit the full resolved menu tree. */
export function MenuTreeDnd(p: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [hoverIntent, setHoverIntent] = useState<DropIntent | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Expand all / collapse all signals.
  useEffect(() => {
    if (p.expandAllSignal === undefined || p.expandAllSignal === 0) return;
    const all: Record<string, boolean> = {};
    for (const n of p.effective) all[n.menu_key] = true;
    setExpanded(all);
  }, [p.expandAllSignal]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (p.collapseAllSignal === undefined || p.collapseAllSignal === 0) return;
    setExpanded({});
  }, [p.collapseAllSignal]);

  // Auto-expand ancestor chain (one-shot).
  const effectiveByKeyForEffect = useMemo(
    () => Object.fromEntries(p.effective.map((n) => [n.menu_key, n])),
    [p.effective],
  );
  useEffect(() => {
    if (!p.autoExpandKey) return;
    const next: Record<string, boolean> = {};
    let cur: string | null = p.autoExpandKey;
    let guard = 0;
    while (cur && guard < 20) {
      next[cur] = true;
      cur = effectiveByKeyForEffect[cur]?.parent_key ?? null;
      guard++;
    }
    setExpanded((prev) => ({ ...prev, ...next }));
    // run once per autoExpandKey value when tree is loaded
  }, [p.autoExpandKey, p.effective.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const effectiveByKey = useMemo(
    () => Object.fromEntries(p.effective.map((n) => [n.menu_key, n])),
    [p.effective],
  );

  // module → roots (parent_key === null) → recursive children by parent_key
  const childrenByParent = useMemo(() => {
    const m = new Map<string, ResolvedMenuNode[]>();
    for (const n of p.effective) {
      const key = n.parent_key ?? `__root__:${n.module_key}`;
      const arr = m.get(key) ?? [];
      arr.push(n);
      m.set(key, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.sort_order - b.sort_order);
    return m;
  }, [p.effective]);

  const modules = useMemo(() => {
    const s = new Set<string>();
    for (const n of p.effective) s.add(n.module_key);
    return Array.from(s).sort();
  }, [p.effective]);

  const matchesSearch = useCallback(
    (n: ResolvedMenuNode): boolean => {
      if (!p.searchTerm) return true;
      const q = p.searchTerm.toLowerCase();
      return (
        n.label.toLowerCase().includes(q) ||
        n.menu_key.toLowerCase().includes(q) ||
        (n.route_path ?? '').toLowerCase().includes(q)
      );
    },
    [p.searchTerm],
  );

  // Visible-level filter: a node passes if its level is in the set OR any
  // descendant passes (ancestors of visible nodes always render).
  const matchesLevel = useCallback(
    (n: ResolvedMenuNode): boolean => {
      const levels = p.visibleLevels;
      if (!levels) return true;
      if (n.menu_level === 1) return true; // group nodes always render
      if (levels.has(n.menu_level as 2 | 3 | 4)) return true;
      const kids = childrenByParent.get(n.menu_key) ?? [];
      return kids.some((k) => matchesLevel(k));
    },
    [p.visibleLevels, childrenByParent],
  );

  // Compute drop validity for current activeKey + intent (mirrors DB trigger).
  const validation = useMemo(() => {
    if (!activeKey || !hoverIntent) return null;
    const source = p.registryByKey[activeKey];
    if (!source) return null;

    let parentKey: string | null;
    let targetModule: string;
    if (hoverIntent.kind === 'module-root') {
      parentKey = null;
      targetModule = hoverIntent.moduleKey;
    } else {
      const targetNode = effectiveByKey[hoverIntent.targetKey];
      if (!targetNode) return { ok: false as const, reason: 'Invalid target.' };
      if (hoverIntent.kind === 'inside') {
        parentKey = hoverIntent.targetKey;
        targetModule = targetNode.module_key;
      } else {
        parentKey = targetNode.parent_key;
        targetModule = targetNode.module_key;
      }
    }

    // Cross-module guard (mirror trigger)
    if (targetModule !== source.module_key && !source.is_cross_app_movable) {
      return { ok: false as const, reason: 'Cross-app moves not permitted for this item.' };
    }
    if (!source.is_movable) return { ok: false as const, reason: `${source.default_label} is locked.` };
    if (source.is_system_required) return { ok: false as const, reason: `${source.default_label} is system-required.` };

    if (parentKey === null) return { ok: true as const, parentKey, targetModule };

    // Re-use shared validator for parent/cycle/accepts_children
    const v = validateMove({
      source,
      targetParentKey: parentKey,
      registryByKey: p.registryByKey,
      resolvedByKey: effectiveByKey,
    });
    if (!v.ok) return { ok: false as const, reason: (v as { ok: false; reason: string }).reason };
    return { ok: true as const, parentKey, targetModule };
  }, [activeKey, hoverIntent, p.registryByKey, effectiveByKey]);

  function onDragStart(e: DragStartEvent) {
    setActiveKey(String(e.active.id));
    setHoverIntent(null);
    // Auto-expand the dragged item's siblings? Keep state as-is.
  }

  function onDragOver(e: any) {
    const over = e?.over;
    if (!over) { setHoverIntent(null); return; }
    const data = over.data?.current as DropIntent | undefined;
    setHoverIntent(data ?? null);
  }

  function onDragEnd(e: DragEndEvent) {
    const srcKey = String(e.active.id);
    const intent = (e.over?.data?.current as DropIntent | undefined) ?? null;
    setActiveKey(null);
    setHoverIntent(null);
    if (!intent) return;

    const cur = effectiveByKey[srcKey];
    if (!cur) return;

    let parentKey: string | null;
    let targetModule: string;
    let insertIndex = 0;

    if (intent.kind === 'module-root') {
      parentKey = null;
      targetModule = intent.moduleKey;
      const siblings = (childrenByParent.get(`__root__:${targetModule}`) ?? [])
        .filter((s) => s.menu_key !== srcKey);
      insertIndex = siblings.length; // append
    } else {
      const target = effectiveByKey[intent.targetKey];
      if (!target) return;
      if (intent.kind === 'inside') {
        parentKey = target.menu_key;
        targetModule = target.module_key;
        const siblings = (childrenByParent.get(parentKey) ?? [])
          .filter((s) => s.menu_key !== srcKey);
        insertIndex = siblings.length; // append at end
        setExpanded((prev) => ({ ...prev, [parentKey!]: true }));
      } else {
        parentKey = target.parent_key;
        targetModule = target.module_key;
        const parentKeyForGroup = parentKey ?? `__root__:${targetModule}`;
        const siblings = (childrenByParent.get(parentKeyForGroup) ?? [])
          .filter((s) => s.menu_key !== srcKey);
        const tgtIdx = siblings.findIndex((s) => s.menu_key === target.menu_key);
        insertIndex = intent.kind === 'before' ? tgtIdx : tgtIdx + 1;
      }
    }

    // Run validation one last time before staging.
    const source = p.registryByKey[srcKey];
    if (!source) return;
    if (targetModule !== source.module_key && !source.is_cross_app_movable) return;
    if (!source.is_movable || source.is_system_required) return;
    if (parentKey !== null) {
      const v = validateMove({
        source, targetParentKey: parentKey,
        registryByKey: p.registryByKey, resolvedByKey: effectiveByKey,
      });
      if (!v.ok) return;
    }

    // Derive new level: parent.level + 1, else 2 for module root.
    const newLevel = parentKey
      ? Math.min(4, (effectiveByKey[parentKey]?.menu_level ?? 1) + 1)
      : 2;

    // Renumber siblings 10,20,30…
    const parentKeyForGroup = parentKey ?? `__root__:${targetModule}`;
    const siblings = (childrenByParent.get(parentKeyForGroup) ?? [])
      .filter((s) => s.menu_key !== srcKey);
    const placed = [...siblings];
    placed.splice(insertIndex, 0, { ...cur, parent_key: parentKey, module_key: targetModule, menu_level: newLevel as 1|2|3|4 });

    // Emit a move for the dragged item AND any siblings whose sort changed.
    placed.forEach((n, i) => {
      const newSort = (i + 1) * 10;
      if (n.menu_key === srcKey) {
        p.onApplyMove(srcKey, {
          parent_key: parentKey,
          sort_order: newSort,
          menu_level: newLevel,
          module_key: targetModule,
          prev_parent_key: cur.parent_key,
          prev_sort_order: cur.sort_order,
          prev_menu_level: cur.menu_level,
          prev_module_key: cur.module_key,
        });
      } else if (n.sort_order !== newSort) {
        p.onApplyMove(n.menu_key, {
          parent_key: n.parent_key,
          sort_order: newSort,
          menu_level: n.menu_level,
          module_key: n.module_key,
          prev_parent_key: n.parent_key,
          prev_sort_order: n.sort_order,
          prev_menu_level: n.menu_level,
          prev_module_key: n.module_key,
        });
      }
    });
  }

  const visibleModules = p.filterModule ? [p.filterModule] : modules;

  return (
    <TooltipProvider>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => { setActiveKey(null); setHoverIntent(null); }}
      >
        <div className="space-y-4">
          {visibleModules.map((mod) => {
            const roots = (childrenByParent.get(`__root__:${mod}`) ?? []);
            return (
              <ModuleSection
                key={mod}
                moduleKey={mod}
                roots={roots}
                childrenByParent={childrenByParent}
                expanded={expanded}
                setExpanded={setExpanded}
                pendingMoves={p.pendingMoves}
                pendingLabels={p.pendingLabels}
                registryByKey={p.registryByKey}
                onLabelChange={p.onLabelChange}
                onResetItem={p.onResetItem}
                matchesSearch={matchesSearch}
                matchesLevel={matchesLevel}
                activeKey={activeKey}
                hoverIntent={hoverIntent}
                validationOk={validation?.ok ?? true}
                selectedKeys={p.selectedKeys}
                onToggleSelect={p.onToggleSelect}
                onCreateShortcut={p.onCreateShortcut}
                onDeleteCustom={p.onDeleteCustom}
              />
            );
          })}

          {/* Validation banner */}
          {activeKey && hoverIntent && validation && !validation.ok && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground shadow-lg text-sm">
              <AlertCircle className="h-4 w-4" />
              {validation.reason}
            </div>
          )}
        </div>

        <DragOverlay>
          {activeKey && effectiveByKey[activeKey] && (
            <div className="px-3 py-2 rounded-md border bg-card shadow-lg text-sm flex items-center gap-2">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
              {effectiveByKey[activeKey].label}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </TooltipProvider>
  );
}

// ---- Subcomponents ---------------------------------------------------------

function ModuleSection(props: {
  moduleKey: string;
  roots: ResolvedMenuNode[];
  childrenByParent: Map<string, ResolvedMenuNode[]>;
  expanded: Record<string, boolean>;
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  pendingMoves: Record<string, PendingMove>;
  pendingLabels: Record<string, LabelDraft>;
  registryByKey: Record<string, MenuRegistryRow>;
  onLabelChange: (menuKey: string, value: string) => void;
  onResetItem: (menuKey: string) => void;
  matchesSearch: (n: ResolvedMenuNode) => boolean;
  matchesLevel: (n: ResolvedMenuNode) => boolean;
  activeKey: string | null;
  hoverIntent: DropIntent | null;
  validationOk: boolean;
  selectedKeys?: Set<string>;
  onToggleSelect?: (menuKey: string) => void;
  onCreateShortcut?: (menuKey: string) => void;
  onDeleteCustom?: (menuKey: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `module-${props.moduleKey}`,
    data: { kind: 'module-root', moduleKey: props.moduleKey } satisfies DropIntent,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-lg border-2 transition-colors',
        isOver && props.validationOk ? 'border-primary bg-primary/5' : 'border-transparent',
      )}
    >
      <div className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground border-b">
        {props.moduleKey}
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[1000px]">
          {/* Column headers — share grid template with every TreeRow */}
          <div
            className="grid items-center gap-x-4 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b bg-muted/30 text-left"
            style={{
              gridTemplateColumns:
                '96px minmax(280px,1.4fr) minmax(220px,0.8fr) minmax(260px,1fr) 150px 96px',
            }}
          >
            <div>Controls</div>
            <div>Menu Name</div>
            <div>Menu_Key</div>
            <div>Route</div>
            <div>Status</div>
            <div>Actions</div>
          </div>
          <div className="p-2 space-y-0.5">
        {props.roots.length === 0 && (
          <div className="text-xs italic text-muted-foreground px-2 py-3">
            Empty — drop items here to add to this module.
          </div>
        )}
        {props.roots.map((n) => (
          <TreeRow
            key={n.menu_key}
            node={n}
            depth={0}
            {...props}
          />
        ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TreeRow(props: {
  node: ResolvedMenuNode;
  depth: number;
  childrenByParent: Map<string, ResolvedMenuNode[]>;
  expanded: Record<string, boolean>;
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  pendingMoves: Record<string, PendingMove>;
  pendingLabels: Record<string, LabelDraft>;
  registryByKey: Record<string, MenuRegistryRow>;
  onLabelChange: (menuKey: string, value: string) => void;
  onResetItem: (menuKey: string) => void;
  matchesSearch: (n: ResolvedMenuNode) => boolean;
  matchesLevel: (n: ResolvedMenuNode) => boolean;
  activeKey: string | null;
  hoverIntent: DropIntent | null;
  validationOk: boolean;
  selectedKeys?: Set<string>;
  onToggleSelect?: (menuKey: string) => void;
  onCreateShortcut?: (menuKey: string) => void;
  onDeleteCustom?: (menuKey: string) => void;
}) {
  const { node, depth } = props;
  const reg = props.registryByKey[node.menu_key];
  const kids = props.childrenByParent.get(node.menu_key) ?? [];
  const hasKids = kids.length > 0 || (reg?.accepts_children ?? false);
  const isExpanded = props.expanded[node.menu_key] ?? depth < 1;
  const isDirty = !!props.pendingMoves[node.menu_key] || !!props.pendingLabels[node.menu_key];
  const labelDraft = props.pendingLabels[node.menu_key];
  const matched = props.matchesSearch(node) ||
    kids.some((k) => walkMatch(k, props));
  const levelOk = props.matchesLevel(node);

  if (!matched || !levelOk) return null;

  return (
    <div>
      <DropZone
        id={`before-${node.menu_key}`}
        data={{ kind: 'before', targetKey: node.menu_key }}
        active={!!props.activeKey}
        valid={props.validationOk}
      />
      <RowBody {...props} reg={reg} hasKids={hasKids} isExpanded={isExpanded} isDirty={isDirty} labelDraft={labelDraft} depth={depth} />
      {isExpanded && kids.length > 0 && (
        <div>
          {kids.map((k) => (
            <TreeRow key={k.menu_key} {...props} node={k} depth={depth + 1} />
          ))}
        </div>
      )}
      {/* "after-last-child" zone — only emit for last sibling */}
    </div>
  );
}

function walkMatch(n: ResolvedMenuNode, p: { childrenByParent: Map<string, ResolvedMenuNode[]>; matchesSearch: (n: ResolvedMenuNode) => boolean; }): boolean {
  if (p.matchesSearch(n)) return true;
  return (p.childrenByParent.get(n.menu_key) ?? []).some((k) => walkMatch(k, p));
}

function RowBody(props: {
  node: ResolvedMenuNode;
  depth: number;
  reg: MenuRegistryRow | undefined;
  hasKids: boolean;
  isExpanded: boolean;
  isDirty: boolean;
  labelDraft: LabelDraft | undefined;
  activeKey: string | null;
  hoverIntent: DropIntent | null;
  validationOk: boolean;
  expanded: Record<string, boolean>;
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onLabelChange: (menuKey: string, value: string) => void;
  onResetItem: (menuKey: string) => void;
  selectedKeys?: Set<string>;
  onToggleSelect?: (menuKey: string) => void;
  onCreateShortcut?: (menuKey: string) => void;
  onDeleteCustom?: (menuKey: string) => void;
  childrenByParent?: Map<string, ResolvedMenuNode[]>;
}) {
  const { node, depth, reg, hasKids, isExpanded, isDirty, labelDraft } = props;

  const drag = useDraggable({ id: node.menu_key, disabled: !reg?.is_movable || reg?.is_system_required });
  const inside = useDroppable({
    id: `inside-${node.menu_key}`,
    data: { kind: 'inside', targetKey: node.menu_key } satisfies DropIntent,
    disabled: !reg?.accepts_children,
  });
  const after = useDroppable({
    id: `after-${node.menu_key}`,
    data: { kind: 'after', targetKey: node.menu_key } satisfies DropIntent,
  });

  const dragging = props.activeKey === node.menu_key;
  const isInsideHover = props.hoverIntent?.kind === 'inside' && props.hoverIntent.targetKey === node.menu_key;
  // Subtle "drop inside" affordance for container rows whenever ANY drag is active.
  const isContainerHint = !!props.activeKey && !dragging && (reg?.accepts_children ?? false);
  const selectable = !!props.onToggleSelect && !!reg && reg.is_movable && !reg.is_system_required;
  const isSelected = !!props.selectedKeys?.has(node.menu_key);

  const movability = !reg?.is_movable
    ? { label: 'Protected', tone: 'secondary' as const, icon: Lock }
    : reg.is_system_required
    ? { label: 'Protected', tone: 'secondary' as const, icon: Lock }
    : reg.is_cross_app_movable
    ? { label: 'Fully movable', tone: 'default' as const, icon: null }
    : { label: 'Within module', tone: 'outline' as const, icon: null };

  return (
    <div
      ref={drag.setNodeRef}
      style={{
        transform: CSS.Translate.toString(drag.transform),
        opacity: dragging ? 0.4 : 1,
        gridTemplateColumns:
          '96px minmax(280px,1.4fr) minmax(220px,0.8fr) minmax(260px,1fr) 150px 96px',
      }}
      className={cn(
        'group grid items-center gap-x-4 py-1 px-3 rounded-md min-h-[36px]',
        isDirty && 'bg-primary/5 ring-1 ring-primary/30',
        isSelected && 'bg-primary/10 ring-1 ring-primary/40',
      )}
    >
      {/* Controls cell: checkbox + expand + drag handle */}
      <div className="flex items-center gap-1 min-w-0 justify-start">
        <div className="w-5 shrink-0 flex items-center justify-center">
          {selectable ? (
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => props.onToggleSelect?.(node.menu_key)}
              aria-label={`Select ${node.label}`}
            />
          ) : null}
        </div>
        <button
          type="button"
          className="w-5 h-5 shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            props.setExpanded((prev) => ({ ...prev, [node.menu_key]: !isExpanded }));
          }}
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          {hasKids ? (isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />) : null}
        </button>
        <button
          type="button"
          {...drag.attributes}
          {...drag.listeners}
          className={cn(
            'cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0 w-4',
            (!reg?.is_movable || reg?.is_system_required) && 'opacity-30 cursor-not-allowed',
          )}
          aria-label="Drag"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>

      {/* Menu Name cell — "inside" droppable; indentation lives here only */}
      <div
        ref={inside.setNodeRef}
        style={{ paddingLeft: depth * 18 }}
        className={cn(
          'min-w-0 flex items-center gap-2 px-2 py-1 rounded-md border transition-colors justify-start',
          isInsideHover && props.validationOk && 'border-primary bg-primary/10',
          isInsideHover && !props.validationOk && 'border-destructive bg-destructive/10',
          !isInsideHover && isContainerHint && 'border-dashed border-primary/30',
          !isInsideHover && !isContainerHint && 'border-transparent',
        )}
      >
        {reg?.is_renamable ? (
          <Input
            value={labelDraft?.label ?? node.label}
            onChange={(e) => props.onLabelChange(node.menu_key, e.target.value)}
            className="h-7 text-sm border-0 shadow-none focus-visible:ring-1 px-1 bg-transparent min-w-0 flex-1"
          />
        ) : (
          <span className="text-sm truncate min-w-0 flex-1 text-left" title={node.label}>
            {node.label}
          </span>
        )}
      </div>

      {/* Menu_Key cell */}
      <div className="min-w-0 flex items-center justify-start overflow-hidden">
        <CopyableField value={node.menu_key} label="menu key" />
      </div>

      {/* Route cell */}
      <div className="min-w-0 flex items-center justify-start overflow-hidden">
        {node.route_path ? (
          <CopyableField value={node.route_path} label="route" />
        ) : (
          <span className="text-[11px] font-mono text-muted-foreground/60 italic truncate">
            {reg?.accepts_children ? 'Container' : '—'}
          </span>
        )}
      </div>

      {/* Status cell */}
      <div className="flex items-center justify-start min-w-0">
        <Badge variant={movability.tone} className="text-[10px] gap-1 shrink-0">
          {movability.icon && <movability.icon className="h-3 w-3" />}
          {movability.label}
        </Badge>
      </div>

      {/* Actions cell */}
      <div className="flex items-center justify-start gap-1 min-w-0">
        {props.onCreateShortcut
          && reg
          && (!reg.is_movable || reg.is_system_required)
          && reg.default_parent_key !== null /* skip top-level group nodes */
          && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button" variant="ghost" size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => props.onCreateShortcut?.(node.menu_key)}
                aria-label="Create shortcut"
              >
                <Link2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Create shortcut under a container</TooltipContent>
          </Tooltip>
        )}

        {isDirty && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button" variant="ghost" size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => props.onResetItem(node.menu_key)}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Revert pending change</TooltipContent>
          </Tooltip>
        )}

        {props.onDeleteCustom
          && reg
          && reg.is_custom
          && !reg.is_system_required
          && (() => {
            const childCount = props.childrenByParent?.get(node.menu_key)?.length ?? 0;
            const blocked = childCount > 0;
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      type="button" variant="ghost" size="icon"
                      className="h-6 w-6 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10 disabled:opacity-40"
                      onClick={() => !blocked && props.onDeleteCustom?.(node.menu_key)}
                      disabled={blocked}
                      aria-label="Delete custom tab"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {blocked ? 'Move or delete child items before deleting this tab.' : 'Delete custom tab'}
                </TooltipContent>
              </Tooltip>
            );
          })()}

        {/* "after" drop zone below the row */}
        <div ref={after.setNodeRef} className="sr-only">after</div>
      </div>
    </div>
  );
}

function CopyableField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard errors
    }
  };
  return (
    <div className="flex items-center gap-1 min-w-0 w-full">
      <Tooltip>
        <TooltipTrigger asChild>
          <code className="text-[11px] font-mono text-muted-foreground truncate leading-tight flex-1 min-w-0 cursor-default">
            {value}
          </code>
        </TooltipTrigger>
        <TooltipContent className="font-mono text-xs max-w-md break-all">{value}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center justify-center rounded p-0.5 hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
            aria-label={copied ? 'Copied' : `Copy ${label}`}
          >
            {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
          </button>
        </TooltipTrigger>
        <TooltipContent>{copied ? 'Copied' : `Copy ${label}`}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function DropZone(props: {
  id: string;
  data: DropIntent;
  active: boolean;
  valid: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: props.id, data: props.data });
  if (!props.active) return <div className="h-0.5" />;
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'h-1.5 mx-2 rounded-full transition-colors',
        isOver && props.valid && 'bg-primary',
        isOver && !props.valid && 'bg-destructive',
      )}
    />
  );
}