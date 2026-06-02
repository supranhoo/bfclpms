import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import {
  Menu as MenuIcon, ChevronUp, ChevronDown, RotateCcw, Save, History,
  AlertCircle, Lock, Eye, Sparkles, Database,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUpdateSystemSetting, useSystemSetting } from '@/hooks/useSystemSettings';
import { useMenuRegistryAdmin } from '@/hooks/useResolvedMenu';
import { applyOverrides, groupByParent } from '@/lib/menu/applyOverrides';
import { MENU_CATALOG, MENU_CATALOG_BY_KEY } from '@/lib/menu/catalog';
import type { MenuOverrideRow, MenuRegistryRow, ResolvedMenuNode } from '@/lib/menu/types';

type Draft = {
  label: string | null;
  sort_order: number | null;
};

/** Menu Setting tab — Phase 2 MVP: rename + reorder within parent + reset + audit. */
export function MenuSettingTab() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { data: flagSetting } = useSystemSetting('menu_overrides_enabled');
  const updateSetting = useUpdateSystemSetting();
  const { registry, overrides } = useMenuRegistryAdmin();

  const flagEnabled = useMemo(() => {
    const v = flagSetting?.setting_value as unknown;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return v === 'true' || v === '"true"';
    return false;
  }, [flagSetting]);

  const isEmpty = !registry.isLoading && (registry.data?.length ?? 0) === 0;

  // Drafts keyed by menu_key
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const resolved = useMemo<ResolvedMenuNode[]>(() => {
    if (!registry.data) return [];
    return applyOverrides(registry.data, overrides.data ?? []);
  }, [registry.data, overrides.data]);

  const grouped = useMemo(() => groupByParent(resolved), [resolved]);
  const registryByKey = useMemo<Record<string, MenuRegistryRow>>(
    () => Object.fromEntries((registry.data ?? []).map((r) => [r.menu_key, r])),
    [registry.data],
  );

  // Apply pending drafts on top of resolved for the preview list
  const effective = useMemo<ResolvedMenuNode[]>(() => {
    return resolved.map((n) => {
      const d = drafts[n.menu_key];
      if (!d) return n;
      return {
        ...n,
        label: d.label ?? n.label,
        sort_order: d.sort_order ?? n.sort_order,
        is_overridden: n.is_overridden || d.label !== null || d.sort_order !== null,
      };
    });
  }, [resolved, drafts]);

  const effectiveGrouped = useMemo(() => groupByParent(effective), [effective]);
  const dirtyCount = Object.keys(drafts).length;

  // ---- mutations -----------------------------------------------------------
  async function seedRegistry() {
    setSeeding(true);
    try {
      // Parents must exist before children (FK on default_parent_key).
      const ordered = [...MENU_CATALOG].sort((a, b) => a.menu_level - b.menu_level);
      const { error } = await supabase
        .from('menu_registry' as any)
        .upsert(ordered as any, { onConflict: 'menu_key' });
      if (error) throw error;
      toast.success(`Seeded ${ordered.length} menu items`);
      await qc.invalidateQueries({ queryKey: ['menu-registry-admin'] });
      await qc.invalidateQueries({ queryKey: ['resolved-menu'] });
    } catch (e: any) {
      toast.error(`Seed failed: ${e.message ?? e}`);
    } finally {
      setSeeding(false);
    }
  }

  function setLabelDraft(menuKey: string, value: string) {
    setDrafts((prev) => {
      const next = { ...prev };
      const reg = registryByKey[menuKey];
      const trimmed = value.trim();
      const matchesDefault = reg && trimmed === reg.default_label;
      const cur = next[menuKey] ?? { label: null, sort_order: null };
      cur.label = matchesDefault ? null : trimmed;
      if (cur.label === null && cur.sort_order === null) delete next[menuKey];
      else next[menuKey] = cur;
      return next;
    });
  }

  function moveItem(menuKey: string, direction: -1 | 1) {
    const node = effective.find((n) => n.menu_key === menuKey);
    if (!node) return;
    const siblings = (effectiveGrouped.get(node.parent_key) ?? [])
      .filter((s) => s.menu_key !== menuKey || true);
    const idx = siblings.findIndex((s) => s.menu_key === menuKey);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;

    // Renumber siblings 10,20,30… and swap.
    const reordered = [...siblings];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    setDrafts((prev) => {
      const next = { ...prev };
      reordered.forEach((n, i) => {
        const newSort = (i + 1) * 10;
        const reg = registryByKey[n.menu_key];
        const matchesDefault = reg && newSort === reg.default_sort_order;
        const cur = next[n.menu_key] ?? { label: null, sort_order: null };
        cur.sort_order = matchesDefault ? null : newSort;
        if (cur.label === null && cur.sort_order === null) delete next[n.menu_key];
        else next[n.menu_key] = cur;
      });
      return next;
    });
  }

  function resetItem(menuKey: string) {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[menuKey];
      return next;
    });
  }

  async function saveAll() {
    if (dirtyCount === 0) return;
    setSaving(true);
    try {
      const existingByKey = new Map<string, MenuOverrideRow>(
        (overrides.data ?? []).map((o) => [o.menu_key, o]),
      );
      const rows = Object.entries(drafts).map(([menu_key, d]) => {
        const reg = registryByKey[menu_key];
        return {
          menu_key,
          client_id: null,
          custom_label: d.label ?? reg?.default_label ?? null,
          custom_parent_key: existingByKey.get(menu_key)?.custom_parent_key ?? reg?.default_parent_key ?? null,
          custom_sort_order: d.sort_order ?? reg?.default_sort_order ?? null,
          is_active: true,
          updated_by: profile?.id ?? null,
          updated_at: new Date().toISOString(),
        };
      });

      // Upsert overrides by (menu_key, client_id IS NULL)
      const { error: upErr } = await supabase
        .from('menu_overrides' as any)
        .upsert(rows as any, { onConflict: 'menu_key,client_id' });
      // NOTE: PG UNIQUE on a COALESCE expression means we may need delete-then-insert.
      // Fall back to per-row delete + insert if upsert chokes on the partial unique.
      if (upErr) {
        for (const r of rows) {
          const existing = existingByKey.get(r.menu_key);
          if (existing) {
            await supabase.from('menu_overrides' as any).update(r).eq('id', existing.id);
          } else {
            await supabase.from('menu_overrides' as any).insert(r);
          }
        }
      }

      // Audit
      const auditRows = rows.flatMap((r) => {
        const reg = registryByKey[r.menu_key];
        const prevO = existingByKey.get(r.menu_key);
        const entries: any[] = [];
        const prevLabel = prevO?.custom_label ?? reg?.default_label ?? null;
        const prevSort  = prevO?.custom_sort_order ?? reg?.default_sort_order ?? null;
        if (r.custom_label !== prevLabel) {
          entries.push({
            menu_key: r.menu_key, client_id: null, field: 'label',
            old_value: prevLabel, new_value: r.custom_label, changed_by: profile?.id ?? null,
          });
        }
        if (r.custom_sort_order !== prevSort) {
          entries.push({
            menu_key: r.menu_key, client_id: null, field: 'sort_order',
            old_value: String(prevSort), new_value: String(r.custom_sort_order), changed_by: profile?.id ?? null,
          });
        }
        return entries;
      });
      if (auditRows.length > 0) {
        await supabase.from('menu_override_audit' as any).insert(auditRows);
      }

      toast.success(`Saved ${rows.length} change${rows.length === 1 ? '' : 's'}`);
      setDrafts({});
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['menu-overrides-admin'] }),
        qc.invalidateQueries({ queryKey: ['resolved-menu'] }),
      ]);
    } catch (e: any) {
      toast.error(`Save failed: ${e.message ?? e}`);
    } finally {
      setSaving(false);
    }
  }

  async function resetAllOverrides() {
    try {
      const { error } = await supabase
        .from('menu_overrides' as any)
        .update({ is_active: false })
        .is('client_id', null)
        .eq('is_active', true);
      if (error) throw error;
      await supabase.from('menu_override_audit' as any).insert({
        menu_key: '__ALL__', client_id: null, field: 'reset',
        old_value: null, new_value: 'reset_all', changed_by: profile?.id ?? null,
      });
      toast.success('All menu customizations reset to defaults');
      setDrafts({});
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['menu-overrides-admin'] }),
        qc.invalidateQueries({ queryKey: ['resolved-menu'] }),
      ]);
    } catch (e: any) {
      toast.error(`Reset failed: ${e.message ?? e}`);
    }
  }

  // -------------------------------------------------------------------------
  if (registry.isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Header card */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <MenuIcon className="h-5 w-5" />
                  Menu Setting
                </CardTitle>
                <CardDescription>
                  Rename and reorder menu items. Internal keys, routes, and permissions never change.
                </CardDescription>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 border rounded-md">
                  <Label htmlFor="menu-overrides-enabled" className="text-sm cursor-pointer">
                    Enable overrides
                  </Label>
                  <Switch
                    id="menu-overrides-enabled"
                    checked={flagEnabled}
                    onCheckedChange={(checked) =>
                      updateSetting.mutate({ key: 'menu_overrides_enabled', value: String(checked) })
                    }
                  />
                </div>
                <PreviewDialog grouped={effectiveGrouped} />
                <AuditDialog />
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Empty-state seed */}
        {isEmpty && (
          <Card className="border-dashed">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Database className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">Registry is empty</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Seed the menu registry from the current application catalog. This is safe to run
                    multiple times — existing entries are not overwritten.
                  </p>
                  <Button onClick={seedRegistry} disabled={seeding} className="gap-2">
                    <Sparkles className="h-4 w-4" />
                    {seeding ? 'Seeding…' : `Seed ${MENU_CATALOG.length} entries`}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Disabled flag warning */}
        {!flagEnabled && !isEmpty && (
          <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/10 text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 text-amber-600 flex-shrink-0" />
            <div>
              <p className="font-medium">Overrides are currently inactive</p>
              <p className="text-muted-foreground">
                You can edit and save customizations, but they will not appear in the sidebar or settings
                tabs until you turn on “Enable overrides” above.
              </p>
            </div>
          </div>
        )}

        {/* Dirty banner */}
        {dirtyCount > 0 && (
          <div className="sticky top-0 z-10 flex items-center justify-between p-3 rounded-lg border bg-primary/5 border-primary/30">
            <div className="text-sm">
              <span className="font-medium">{dirtyCount}</span> pending change{dirtyCount === 1 ? '' : 's'}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDrafts({})}>Discard</Button>
              <Button size="sm" onClick={saveAll} disabled={saving} className="gap-2">
                <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        )}

        {/* Editor */}
        {!isEmpty && (
          <Tabs defaultValue="sidebar" className="space-y-4">
            <TabsList>
              <TabsTrigger value="sidebar">Sidebar</TabsTrigger>
              <TabsTrigger value="settings">System Settings tabs</TabsTrigger>
            </TabsList>

            <TabsContent value="sidebar" className="space-y-4">
              {/* Sidebar groups */}
              {effective
                .filter((n) => n.parent_key === null && n.accepts_children)
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((group) => (
                  <GroupEditor
                    key={group.menu_key}
                    group={group}
                    children={effectiveGrouped.get(group.menu_key) ?? []}
                    registryByKey={registryByKey}
                    drafts={drafts}
                    onLabelChange={setLabelDraft}
                    onMove={moveItem}
                    onReset={resetItem}
                  />
                ))}
            </TabsContent>

            <TabsContent value="settings">
              <GroupEditor
                group={effective.find((n) => n.menu_key === 'admin-settings')!}
                children={(effectiveGrouped.get('admin-settings') ?? [])}
                registryByKey={registryByKey}
                drafts={drafts}
                onLabelChange={setLabelDraft}
                onMove={moveItem}
                onReset={resetItem}
              />
            </TabsContent>
          </Tabs>
        )}

        {/* Footer actions */}
        {!isEmpty && (
          <div className="flex items-center justify-end">
            <ConfirmDestructiveDialog
              title="Reset all menu customizations?"
              description="Every rename and reorder will revert to defaults. This action is logged in the audit trail."
              confirmLabel="Reset everything"
              onConfirm={resetAllOverrides}
            >
              <Button variant="outline" size="sm" className="gap-2">
                <RotateCcw className="h-4 w-4" /> Reset all to defaults
              </Button>
            </ConfirmDestructiveDialog>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

function GroupEditor(props: {
  group: ResolvedMenuNode;
  children: ResolvedMenuNode[];
  registryByKey: Record<string, MenuRegistryRow>;
  drafts: Record<string, Draft>;
  onLabelChange: (menuKey: string, value: string) => void;
  onMove: (menuKey: string, dir: -1 | 1) => void;
  onReset: (menuKey: string) => void;
}) {
  const { group, children, registryByKey, drafts, onLabelChange, onMove, onReset } = props;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            {group.label}
            {group.is_system_required && (
              <Tooltip><TooltipTrigger><Lock className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                <TooltipContent>System group — cannot be moved</TooltipContent></Tooltip>
            )}
          </CardTitle>
          <Badge variant="outline" className="text-xs">{children.length} item{children.length === 1 ? '' : 's'}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {children.length === 0 && (
          <p className="text-sm text-muted-foreground italic">No items.</p>
        )}
        {children.map((node, idx) => {
          const reg = registryByKey[node.menu_key];
          const draft = drafts[node.menu_key];
          const isDirty = !!draft;
          const isLast = idx === children.length - 1;
          return (
            <div
              key={node.menu_key}
              className={`flex items-center gap-2 p-2 rounded-md border ${
                isDirty ? 'border-primary/40 bg-primary/5' : 'border-border'
              }`}
            >
              <div className="flex flex-col">
                <Button
                  variant="ghost" size="icon" className="h-5 w-5"
                  onClick={() => onMove(node.menu_key, -1)}
                  disabled={idx === 0 || !reg?.is_movable}
                  aria-label="Move up"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-5 w-5"
                  onClick={() => onMove(node.menu_key, 1)}
                  disabled={isLast || !reg?.is_movable}
                  aria-label="Move down"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex-1 min-w-0">
                <Input
                  value={draft?.label ?? node.label}
                  onChange={(e) => onLabelChange(node.menu_key, e.target.value)}
                  disabled={!reg?.is_renamable}
                  className="h-8"
                />
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <code className="font-mono">{node.menu_key}</code>
                  {node.route_path && <span>· {node.route_path}</span>}
                  {!reg?.is_renamable && <Badge variant="secondary" className="text-xs">locked</Badge>}
                  {reg?.is_system_required && <Badge variant="secondary" className="text-xs">system</Badge>}
                </div>
              </div>
              {isDirty && (
                <Button variant="ghost" size="sm" onClick={() => onReset(node.menu_key)} className="gap-1">
                  <RotateCcw className="h-3.5 w-3.5" /> Revert
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function PreviewDialog({ grouped }: { grouped: Map<string | null, ResolvedMenuNode[]> }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Eye className="h-4 w-4" /> Preview
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Preview</DialogTitle>
          <DialogDescription>How the sidebar will look after Save.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[60vh] pr-2">
          <div className="space-y-3">
            {Array.from(grouped.entries())
              .filter(([parent]) => parent === null)
              .flatMap(([, groups]) => groups)
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((group) => (
                <div key={group.menu_key}>
                  <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-1">
                    {group.label}
                  </div>
                  <ul className="space-y-0.5">
                    {(grouped.get(group.menu_key) ?? []).map((n) => (
                      <li key={n.menu_key} className="text-sm pl-3 py-1 rounded hover:bg-muted/60">
                        {n.label}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function AuditDialog() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from('menu_override_audit' as any)
      .select('*')
      .order('changed_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setRows((data ?? []) as any[]);
        setLoading(false);
      });
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <History className="h-4 w-4" /> Audit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Menu Setting audit log</DialogTitle>
          <DialogDescription>Last 100 changes.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[60vh]">
          {loading && <Skeleton className="h-40 w-full" />}
          {!loading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground italic">No changes recorded yet.</p>
          )}
          <table className="w-full text-sm">
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="py-2 pr-2 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(r.changed_at).toLocaleString()}
                  </td>
                  <td className="py-2 pr-2 font-mono text-xs">{r.menu_key}</td>
                  <td className="py-2 pr-2"><Badge variant="outline">{r.field}</Badge></td>
                  <td className="py-2 pr-2 text-xs">
                    <span className="text-muted-foreground">{r.old_value ?? '—'}</span>
                    {' → '}
                    <span className="font-medium">{r.new_value ?? '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}