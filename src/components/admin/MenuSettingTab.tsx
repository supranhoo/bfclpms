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
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import {
  Menu as MenuIcon, RotateCcw, Save, History,
  AlertCircle, Eye, Sparkles, Database, Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUpdateSystemSetting, useSystemSetting } from '@/hooks/useSystemSettings';
import { useMenuRegistryAdmin } from '@/hooks/useResolvedMenu';
import { applyOverrides, groupByParent } from '@/lib/menu/applyOverrides';
import { MENU_CATALOG, MENU_CATALOG_BY_KEY } from '@/lib/menu/catalog';
import type { MenuOverrideRow, MenuRegistryRow, ResolvedMenuNode } from '@/lib/menu/types';
import { MenuTreeDnd, type PendingMove, type LabelDraft } from './MenuTreeDnd';

/** Menu Setting tab — Phase 3: full DnD reposition + rename + audit + reset. */
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
  const [pendingMoves, setPendingMoves] = useState<Record<string, PendingMove>>({});
  const [pendingLabels, setPendingLabels] = useState<Record<string, LabelDraft>>({});
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [search, setSearch] = useState('');

  const resolved = useMemo<ResolvedMenuNode[]>(() => {
    if (!registry.data) return [];
    return applyOverrides(registry.data, overrides.data ?? []);
  }, [registry.data, overrides.data]);

  const registryByKey = useMemo<Record<string, MenuRegistryRow>>(
    () => Object.fromEntries((registry.data ?? []).map((r) => [r.menu_key, r])),
    [registry.data],
  );

  // Apply pending drafts on top of resolved for the live tree.
  const effective = useMemo<ResolvedMenuNode[]>(() => {
    return resolved.map((n) => {
      const mv = pendingMoves[n.menu_key];
      const lb = pendingLabels[n.menu_key];
      if (!mv && !lb) return n;
      return {
        ...n,
        label: lb?.label ?? n.label,
        parent_key: mv?.parent_key ?? n.parent_key,
        sort_order: mv?.sort_order ?? n.sort_order,
        menu_level: (mv?.menu_level ?? n.menu_level) as 1|2|3|4,
        module_key: mv?.module_key ?? n.module_key,
        is_overridden: true,
      };
    });
  }, [resolved, drafts]);

  const effectiveGrouped = useMemo(() => groupByParent(effective), [effective]);
  const dirtyCount = Object.keys(pendingMoves).length + Object.keys(pendingLabels).length;

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
    setPendingLabels((prev) => {
      const next = { ...prev };
      const reg = registryByKey[menuKey];
      const trimmed = value.trim();
      const matchesDefault = reg && trimmed === reg.default_label;
      if (matchesDefault) delete next[menuKey];
      else next[menuKey] = { label: trimmed };
      return next;
    });
  }

  function applyMove(menuKey: string, move: PendingMove) {
    setPendingMoves((prev) => ({ ...prev, [menuKey]: move }));
  }

  function resetItem(menuKey: string) {
    setPendingMoves((prev) => {
      const n = { ...prev }; delete n[menuKey]; return n;
    });
    setPendingLabels((prev) => {
      const n = { ...prev }; delete n[menuKey]; return n;
    });
  }

  async function saveAll() {
    if (dirtyCount === 0) return;
    setSaving(true);
    try {
      const existingByKey = new Map<string, MenuOverrideRow>(
        (overrides.data ?? []).map((o) => [o.menu_key, o]),
      );
      const touchedKeys = new Set<string>([
        ...Object.keys(pendingMoves),
        ...Object.keys(pendingLabels),
      ]);
      const rows = Array.from(touchedKeys).map((menu_key) => {
        const reg = registryByKey[menu_key];
        const mv = pendingMoves[menu_key];
        const lb = pendingLabels[menu_key];
        const existing = existingByKey.get(menu_key);
        return {
          menu_key,
          client_id: null,
          custom_label: lb?.label
            ?? existing?.custom_label
            ?? reg?.default_label
            ?? null,
          custom_parent_key: mv ? mv.parent_key : (existing?.custom_parent_key ?? reg?.default_parent_key ?? null),
          custom_sort_order: mv ? mv.sort_order : (existing?.custom_sort_order ?? reg?.default_sort_order ?? null),
          custom_menu_level: mv ? mv.menu_level : (existing?.custom_menu_level ?? null),
          custom_module_key: mv ? mv.module_key : (existing?.custom_module_key ?? null),
          is_active: true,
          updated_by: profile?.id ?? null,
          updated_at: new Date().toISOString(),
        };
      });

      // Per-row upsert (the UNIQUE INDEX is on a COALESCE expression, so plain
      // upsert can't target it). Update existing rows; insert new ones.
      for (const r of rows) {
        const existing = existingByKey.get(r.menu_key);
        if (existing) {
          const { error } = await supabase
            .from('menu_overrides' as any)
            .update(r).eq('id', existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('menu_overrides' as any)
            .insert(r);
          if (error) throw error;
        }
      }

      // Audit
      const auditRows = rows.flatMap((r) => {
        const reg = registryByKey[r.menu_key];
        const prevO = existingByKey.get(r.menu_key);
        const entries: any[] = [];
        const prevLabel = prevO?.custom_label ?? reg?.default_label ?? null;
        const prevSort  = prevO?.custom_sort_order ?? reg?.default_sort_order ?? null;
        const prevParent = prevO?.custom_parent_key ?? reg?.default_parent_key ?? null;
        const prevLevel = prevO?.custom_menu_level ?? reg?.menu_level ?? null;
        const prevModule = prevO?.custom_module_key ?? reg?.module_key ?? null;
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
        if (r.custom_parent_key !== prevParent) {
          entries.push({
            menu_key: r.menu_key, client_id: null, field: 'parent',
            old_value: prevParent, new_value: r.custom_parent_key, changed_by: profile?.id ?? null,
          });
        }
        if (r.custom_menu_level !== prevLevel && r.custom_menu_level !== null) {
          entries.push({
            menu_key: r.menu_key, client_id: null, field: 'menu_level',
            old_value: String(prevLevel), new_value: String(r.custom_menu_level), changed_by: profile?.id ?? null,
          });
        }
        if (r.custom_module_key !== prevModule && r.custom_module_key !== null) {
          entries.push({
            menu_key: r.menu_key, client_id: null, field: 'module_key',
            old_value: prevModule, new_value: r.custom_module_key, changed_by: profile?.id ?? null,
          });
        }
        return entries;
      });
      if (auditRows.length > 0) {
        await supabase.from('menu_override_audit' as any).insert(auditRows);
      }

      toast.success(`Saved ${rows.length} change${rows.length === 1 ? '' : 's'}`);
      setPendingMoves({});
      setPendingLabels({});
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
      setPendingMoves({});
      setPendingLabels({});
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
                  Drag to reorder, nest, or shift between modules. Rename inline. Routes, permissions, and report keys never change.
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
              <Button variant="ghost" size="sm" onClick={() => { setPendingMoves({}); setPendingLabels({}); }}>Discard</Button>
              <Button size="sm" onClick={saveAll} disabled={saving} className="gap-2">
                <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        )}

        {/* DnD tree */}
        {!isEmpty && (
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search menu by name, key, or route…"
                    className="h-8 pl-7"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Drag the handle to reorder, drop on a row to nest, drop on a module to move across apps.
                </p>
              </div>

              <MenuTreeDnd
                resolved={resolved}
                effective={effective}
                registryByKey={registryByKey}
                pendingMoves={pendingMoves}
                pendingLabels={pendingLabels}
                onApplyMove={applyMove}
                onLabelChange={setLabelDraft}
                onResetItem={resetItem}
                searchTerm={search}
              />
            </CardContent>
          </Card>
        )}

        {/* Footer actions */}
        {!isEmpty && (
          <div className="flex items-center justify-end">
            <ResetAllButton onConfirm={resetAllOverrides} />
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

function ResetAllButton({ onConfirm }: { onConfirm: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => setOpen(true)}>
        <RotateCcw className="h-4 w-4" /> Reset all to defaults
      </Button>
      <ConfirmDestructiveDialog
        open={open}
        title="Reset all menu customizations?"
        description="Every rename and reorder will revert to defaults. This action is logged in the audit trail."
        confirmLabel="Reset everything"
        isLoading={busy}
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await onConfirm();
          } finally {
            setBusy(false);
            setOpen(false);
          }
        }}
      />
    </>
  );
}

function GroupEditor(props: {
  group: ResolvedMenuNode;
  children: ResolvedMenuNode[];
  registryByKey: Record<string, MenuRegistryRow>;
}) {
  // (legacy GroupEditor removed — replaced by MenuTreeDnd)
  return null;
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