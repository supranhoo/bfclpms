import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Link2, AlertCircle, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import {
  createShortcutMenuItem, validateShortcut, computeDepth, deriveShortcutRoute,
} from '@/lib/menu/customMenu';
import type { MenuRegistryRow, ResolvedMenuNode } from '@/lib/menu/types';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** The locked/system source row to create a shortcut for. */
  source: MenuRegistryRow | null;
  registry: MenuRegistryRow[];
  registryByKey: Record<string, MenuRegistryRow>;
  resolvedByKey: Record<string, ResolvedMenuNode>;
  effective: ResolvedMenuNode[];
}

/**
 * Lets an admin re-expose a locked/system menu item under any valid container
 * by creating a `custom-shortcut-<src>` registry row. Original row is untouched.
 */
export function CreateShortcutDialog(p: Props) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [parentKey, setParentKey] = useState<string>('');
  const [label, setLabel] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (p.open && p.source) {
      setLabel(p.source.default_label);
      setParentKey('');
      setSearch('');
    }
  }, [p.open, p.source]);

  const route = useMemo(
    () => (p.source ? deriveShortcutRoute(p.source) : null),
    [p.source],
  );

  // Candidate parents: any container that passes validateShortcut.
  const candidates = useMemo(() => {
    if (!p.source) return [] as ResolvedMenuNode[];
    return p.effective
      .filter((n) => n.accepts_children)
      .filter((n) =>
        validateShortcut({
          source: p.source!,
          parentKey: n.menu_key,
          registryByKey: p.registryByKey,
          resolvedByKey: Object.fromEntries(p.effective.map((x) => [x.menu_key, x])),
        }).ok,
      );
  }, [p.source, p.effective, p.registryByKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (n) => n.label.toLowerCase().includes(q) || n.menu_key.toLowerCase().includes(q),
    );
  }, [candidates, search]);

  async function submit() {
    if (!p.source || !parentKey) return;
    setBusy(true);
    try {
      const existingKeys = p.registry.map((r) => r.menu_key);
      const parentDepth = computeDepth(parentKey, p.registryByKey, p.resolvedByKey);
      const { menuKey } = await createShortcutMenuItem(
        {
          source: p.source,
          parentKey,
          createdBy: profile?.id ?? null,
          label,
        },
        existingKeys,
        parentDepth,
      );
      toast.success(`Shortcut created: ${menuKey}`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['menu-registry-admin'] }),
        qc.invalidateQueries({ queryKey: ['resolved-menu'] }),
        qc.invalidateQueries({ queryKey: ['menu-access-config'] }),
      ]);
      p.onOpenChange(false);
    } catch (e: any) {
      toast.error(`Failed: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" /> Create shortcut
          </DialogTitle>
          <DialogDescription>
            The original item stays where it is. A new admin-only shortcut will appear under the chosen container.
          </DialogDescription>
        </DialogHeader>

        {p.source && (
          <div className="space-y-3">
            <div className="rounded-md border p-3 bg-muted/30 text-sm">
              <div className="flex items-center gap-2 mb-1">
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">{p.source.default_label}</span>
                <Badge variant="outline" className="text-[10px]">locked source</Badge>
              </div>
              <div className="text-xs text-muted-foreground font-mono truncate">
                {p.source.menu_key}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Route: <span className="font-mono">{route ?? '(container only)'}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="shortcut-label">Shortcut label</Label>
              <Input
                id="shortcut-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={60}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Place under</Label>
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
                  <div>No containers accept this shortcut (depth or rules).</div>
                </div>
              ) : (
                <ScrollArea className="h-56 rounded-md border">
                  <div className="p-1">
                    {filtered.map((n) => {
                      const sel = parentKey === n.menu_key;
                      return (
                        <button
                          key={n.menu_key}
                          type="button"
                          onClick={() => setParentKey(n.menu_key)}
                          className={cn(
                            'w-full text-left px-3 py-2 rounded-md flex items-center justify-between gap-2 hover:bg-accent',
                            sel && 'bg-primary/10 ring-1 ring-primary/40',
                          )}
                        >
                          <div className="min-w-0">
                            <div className="text-sm truncate">{n.label}</div>
                            <div className="text-[10px] font-mono text-muted-foreground truncate">
                              {n.menu_key} · L{n.menu_level}
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
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => p.onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!parentKey || busy || !label.trim()}>
            {busy ? 'Creating…' : 'Create shortcut'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}