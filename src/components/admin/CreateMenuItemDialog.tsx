import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  Folder, FileText, Settings, Star, BarChart3, Users, Briefcase, Building2, Target,
  Shield, ClipboardList, ClipboardCheck, Calendar, GraduationCap, Library, Package,
  Eye, MessageSquare, Mail, Layers, Upload, GitBranch, GitMerge, LayoutDashboard,
  Home, Bookmark, Bell, Box, CheckCircle2, Compass, Flag, Globe, Heart, Info, Key,
  LinkIcon, Lock, Map, Pin, Search, Send, Server, ShoppingCart, Tag, Zap,
  type LucideIcon,
} from 'lucide-react';
import type { MenuRegistryRow, ResolvedMenuNode } from '@/lib/menu/types';
import {
  validateCreate, createCustomMenuItem, type DestinationType, generateMenuKey,
  computeDepth,
} from '@/lib/menu/customMenu';
import { KNOWN_ROUTES } from '@/lib/menu/knownRoutes';

const ICONS: Record<string, LucideIcon> = {
  Folder, FileText, Settings, Star, BarChart3, Users, Briefcase, Building2, Target,
  Shield, ClipboardList, ClipboardCheck, Calendar, GraduationCap, Library, Package,
  Eye, MessageSquare, Mail, Layers, Upload, GitBranch, GitMerge, LayoutDashboard,
  Home, Bookmark, Bell, Box, CheckCircle2, Compass, Flag, Globe, Heart, Info, Key,
  LinkIcon, Lock, Map, Pin, Search, Send, Server, ShoppingCart, Tag, Zap,
};

const COLOR_TOKENS: Array<{ key: string; label: string; cls: string }> = [
  { key: '',            label: 'Default',     cls: 'bg-foreground' },
  { key: 'primary',     label: 'Primary',     cls: 'bg-primary' },
  { key: 'secondary',   label: 'Secondary',   cls: 'bg-secondary' },
  { key: 'accent',      label: 'Accent',      cls: 'bg-accent' },
  { key: 'destructive', label: 'Destructive', cls: 'bg-destructive' },
  { key: 'muted',       label: 'Muted',       cls: 'bg-muted' },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  registry: MenuRegistryRow[];
  resolvedByKey: Record<string, ResolvedMenuNode>;
}

export function CreateMenuItemDialog({ open, onOpenChange, registry, resolvedByKey }: Props) {
  const qc = useQueryClient();
  const { profile } = useAuth();

  const [name, setName] = useState('');
  const [level, setLevel] = useState<2 | 3 | 4>(2);
  const [parentKey, setParentKey] = useState<string>('');
  const [destinationType, setDestinationType] = useState<DestinationType>('container');
  const [routePath, setRoutePath] = useState<string>('');
  const [iconName, setIconName] = useState<string>('Folder');
  const [color, setColor] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const registryByKey = useMemo(
    () => Object.fromEntries(registry.map((r) => [r.menu_key, r])),
    [registry],
  );

  const parentOptions = useMemo(() => {
    return registry.filter((r) => {
      if (!r.accepts_children) return false;
      return computeDepth(r.menu_key, registryByKey, resolvedByKey) === level - 1;
    });
  }, [registry, registryByKey, resolvedByKey, level]);

  const parentLabel = parentKey ? (resolvedByKey[parentKey]?.label ?? registryByKey[parentKey]?.default_label ?? parentKey) : '';
  const previewPath = parentLabel ? `${parentLabel} > ${name || 'New Tab'}` : (name || 'New Tab');

  function reset() {
    setName(''); setLevel(2); setParentKey(''); setDestinationType('container');
    setRoutePath(''); setIconName('Folder'); setColor(''); setBusy(false);
  }

  async function handleCreate() {
    const existingKeys = registry.map((r) => r.menu_key);
    const finalRoute = destinationType === 'existing-route' || destinationType === 'external-link'
      ? routePath
      : null;

    const v = validateCreate({
      name, level, parentKey, destinationType, routePath: finalRoute,
      registryByKey, resolvedByKey, existingKeys,
    });
    if (!v.ok) {
      toast.error((v as { ok: false; reason: string }).reason);
      return;
    }

    setBusy(true);
    try {
      const previewKey = generateMenuKey(name, existingKeys);
      await createCustomMenuItem(
        {
          name, level, parentKey, destinationType,
          routePath: finalRoute, iconName, color: color || null,
          createdBy: profile?.id ?? null,
        },
        existingKeys,
      );
      toast.success(`Created "${name}" (${previewKey})`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['menu-registry-admin'] }),
        qc.invalidateQueries({ queryKey: ['resolved-menu'] }),
        qc.invalidateQueries({ queryKey: ['menu-access-config'] }),
      ]);
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`Create failed: ${e.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  const SelectedIcon = ICONS[iconName] ?? Folder;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Create custom menu tab</DialogTitle>
          <DialogDescription>
            Add a new tab to the sidebar. menu_key is generated automatically and never changes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="ctm-name">Tab name</Label>
            <Input id="ctm-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Compliance Hub" />
          </div>

          {/* Level + Parent */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Level</Label>
              <Select value={String(level)} onValueChange={(v) => { setLevel(Number(v) as 2|3|4); setParentKey(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">Section item (inside a top group)</SelectItem>
                  <SelectItem value="3">Sub-tab (inside a section item)</SelectItem>
                  <SelectItem value="4">Deep tab (inside a sub-tab)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Parent / location</Label>
              <Select value={parentKey} onValueChange={setParentKey}>
                <SelectTrigger><SelectValue placeholder={`Choose a depth-${level - 1} parent…`} /></SelectTrigger>
                <SelectContent>
                  {parentOptions.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      No container at depth {level - 1} can accept children.
                    </div>
                  )}
                  {parentOptions.map((p) => (
                    <SelectItem key={p.menu_key} value={p.menu_key}>
                      {resolvedByKey[p.menu_key]?.label ?? p.default_label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Destination */}
          <div className="space-y-1.5">
            <Label>Destination</Label>
            <Select value={destinationType} onValueChange={(v) => { setDestinationType(v as DestinationType); setRoutePath(''); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="container">Container only (expands children)</SelectItem>
                <SelectItem value="existing-route">Link to existing route</SelectItem>
                <SelectItem value="custom-page">Custom placeholder page</SelectItem>
                <SelectItem value="external-link">External link (https only)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {destinationType === 'existing-route' && (
            <div className="space-y-1.5">
              <Label>Route</Label>
              <Select value={routePath} onValueChange={setRoutePath}>
                <SelectTrigger><SelectValue placeholder="Pick a route…" /></SelectTrigger>
                <SelectContent>
                  <ScrollArea className="h-64">
                    {KNOWN_ROUTES.map((r) => (
                      <SelectItem key={r.path} value={r.path}>
                        {r.label} <span className="text-xs text-muted-foreground ml-1">{r.path}</span>
                      </SelectItem>
                    ))}
                  </ScrollArea>
                </SelectContent>
              </Select>
            </div>
          )}

          {destinationType === 'external-link' && (
            <div className="space-y-1.5">
              <Label>External URL</Label>
              <Input value={routePath} onChange={(e) => setRoutePath(e.target.value)} placeholder="https://example.com" />
            </div>
          )}

          {/* Icon + Color */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Icon</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <SelectedIcon className="h-4 w-4" />
                    <span>{iconName}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2">
                  <ScrollArea className="h-56">
                    <div className="grid grid-cols-6 gap-1">
                      {Object.entries(ICONS).map(([nm, Ic]) => (
                        <button
                          key={nm}
                          type="button"
                          onClick={() => setIconName(nm)}
                          className={`flex items-center justify-center h-8 w-8 rounded hover:bg-accent ${iconName === nm ? 'bg-accent ring-1 ring-primary' : ''}`}
                          title={nm}
                        >
                          <Ic className="h-4 w-4" />
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-1.5">
                {COLOR_TOKENS.map((c) => (
                  <button
                    key={c.key || 'default'}
                    type="button"
                    title={c.label}
                    onClick={() => setColor(c.key)}
                    className={`h-7 w-7 rounded-full border ${c.cls} ${color === c.key ? 'ring-2 ring-ring ring-offset-1' : ''}`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs flex items-center gap-2">
            <span className="font-medium">Preview:</span>
            <SelectedIcon className="h-3.5 w-3.5" />
            <span>{previewPath}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={busy || !name || !parentKey}>
            {busy ? 'Creating…' : 'Create tab'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}