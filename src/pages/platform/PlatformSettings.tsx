import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MinimalHeader } from '@/components/layout/MinimalHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState, useEffect } from 'react';
import { Building2, Boxes, KeyRound, ShieldCheck, ScrollText, Layers, Download, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, BarChart3, Pencil, Plus } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useEntitlement } from '@/hooks/useEntitlement';
import { bucketByDay, aggregateByPathname, presetRange, defaultFilters, type PresetKey } from '@/lib/platformTelemetryAgg';
import { LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const PAGE_SIZE = 50;
const AUDIT_EVENT_TYPES = ['grant', 'revoke', 'update', 'would_deny', 'admin_view', 'deny'] as const;

/** Loose parser matching `useEntitlement` — JSONB can decode to boolean, plain
 *  string `"true"`, or a double-quoted string `"\"true\""`. */
function parseFlag(raw: unknown): boolean {
  return raw === true || raw === 'true' || raw === '"true"';
}

function useHubFlag() {
  return useQuery({
    queryKey: ['platform-settings', 'flag'],
    queryFn: async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'hub_platform_settings_enabled')
        .maybeSingle();
      return data?.setting_value ?? null;
    },
  });
}

function usePilotFlag() {
  return useQuery({
    queryKey: ['platform-settings', 'pilot-flag'],
    queryFn: async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'hub_enforcement_pilot_enabled')
        .maybeSingle();
      return data?.setting_value ?? null;
    },
  });
}

function MasterSwitchBanner({ enabled }: { enabled: boolean }) {
  if (enabled) {
    return (
      <Alert className="border-green-500/40">
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        <AlertTitle>Master switch is ON</AlertTitle>
        <AlertDescription>
          Toggles are saved and observe-mode logging is active. No PMS behavior is blocked.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Master switch is OFF</AlertTitle>
      <AlertDescription>
        Toggles are saved, but observe-mode logging is inactive and PMS behavior is unchanged.
        Turn the Master switch ON in the Overview tab to activate logging.
      </AlertDescription>
    </Alert>
  );
}

function useRows<T = Record<string, unknown>>(table: string, orderBy = 'created_at') {
  return useQuery({
    queryKey: ['platform-settings', table],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table as never)
        .select('*')
        .order(orderBy as never, { ascending: true })
        .limit(PAGE_SIZE);
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });
}

function LoadingRows() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
    </div>
  );
}

function SearchableTable<T extends Record<string, unknown>>({
  rows, columns, searchKeys,
}: {
  rows: T[];
  columns: { key: keyof T; label: string; render?: (v: unknown, row: T) => React.ReactNode }[];
  searchKeys: (keyof T)[];
}) {
  const [q, setQ] = useState('');
  const filtered = q
    ? rows.filter((r) =>
        searchKeys.some((k) => String(r[k] ?? '').toLowerCase().includes(q.toLowerCase())),
      )
    : rows;

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-sm"
      />
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => <TableHead key={String(c.key)}>{c.label}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={columns.length} className="text-center text-muted-foreground py-6">No rows</TableCell></TableRow>
            ) : filtered.map((r, i) => (
              <TableRow key={i}>
                {columns.map((c) => (
                  <TableCell key={String(c.key)}>
                    {c.render ? c.render(r[c.key], r) : String(r[c.key] ?? '—')}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {rows.length} rows (page size {PAGE_SIZE}). Read-only in Phase 1.
      </p>
    </div>
  );
}

function OverviewTab() {
  const qc = useQueryClient();
  const { user, hasRole } = useAuth();
  const canWrite = hasRole('platform_owner');
  const flag = useHubFlag();
  const enabled = parseFlag(flag.data);
  const [confirmOff, setConfirmOff] = useState(false);
  const pilotFlag = usePilotFlag();
  const pilotEnabled = parseFlag(pilotFlag.data);
  const [confirmPilot, setConfirmPilot] = useState<null | boolean>(null);

  const mut = useMutation({
    mutationFn: async (next: boolean) => {
      const before = enabled;
      const { error: upErr } = await supabase
        .from('system_settings')
        .upsert(
          { setting_key: 'hub_platform_settings_enabled', setting_value: next as unknown as never },
          { onConflict: 'setting_key' },
        );
      if (upErr) throw upErr;
      await supabase.from('entitlement_audit').insert({
        actor_id: user?.id ?? null,
        event_type: 'update',
        entity_type: 'flag',
        entity_key: 'hub_platform_settings_enabled',
        before: { is_enabled: before },
        after: { is_enabled: next },
        reason: 'platform_settings master switch',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-settings', 'flag'] });
      qc.invalidateQueries({ queryKey: ['platform-settings', 'audit'] });
      qc.invalidateQueries({ queryKey: ['hub-entitlement-snapshot'] });
      toast.success('Master switch updated');
    },
    onError: (e: Error) => toast.error(`Update failed: ${e.message}`),
  });

  const pilotMut = useMutation({
    mutationFn: async (next: boolean) => {
      const before = pilotEnabled;
      const { error: upErr } = await supabase
        .from('system_settings')
        .upsert(
          { setting_key: 'hub_enforcement_pilot_enabled', setting_value: next as unknown as never },
          { onConflict: 'setting_key' },
        );
      if (upErr) throw upErr;
      await supabase.from('entitlement_audit').insert({
        actor_id: user?.id ?? null,
        event_type: 'update',
        entity_type: 'flag',
        entity_key: 'hub_enforcement_pilot_enabled',
        before: { is_enabled: before },
        after: { is_enabled: next, allowlist: ['pms.data.export'] },
        reason: 'platform_settings enforcement pilot toggle',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-settings', 'pilot-flag'] });
      qc.invalidateQueries({ queryKey: ['platform-settings', 'audit'] });
      qc.invalidateQueries({ queryKey: ['hub-enforcement-pilot'] });
      toast.success('Enforcement pilot updated');
    },
    onError: (e: Error) => toast.error(`Pilot update failed: ${e.message}`),
  });

  const handleToggle = (next: boolean) => {
    if (!next) {
      setConfirmOff(true);
      return;
    }
    mut.mutate(true);
  };

  const clients = useRows<{ client_key: string; display_name: string; deployment_mode: string; is_active: boolean }>('clients', 'client_key');

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Master switch</CardTitle>
          <CardDescription>Hub Platform Settings shell</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Badge variant={enabled ? 'default' : 'secondary'}>
              {enabled ? 'ENABLED' : 'DISABLED'}
            </Badge>
            <Switch
              checked={enabled}
              disabled={!canWrite || mut.isPending || flag.isLoading}
              onCheckedChange={handleToggle}
              aria-label="Toggle Hub Platform master switch"
            />
            {!canWrite && (
              <span className="text-xs text-muted-foreground">platform_owner only</span>
            )}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {enabled
              ? 'Entitlement toggles are saved and observe-mode logging is active. No PMS behavior is blocked.'
              : 'Entitlement toggles are saved but observe-mode logging is inactive. The entitlement resolver returns allow-all — PMS behavior is identical to pre-Phase-1. Turning this ON does not block any PMS action; it only enables would_deny telemetry.'}
          </p>
          <AlertDialog open={confirmOff} onOpenChange={setConfirmOff}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Turn Master switch OFF?</AlertDialogTitle>
                <AlertDialogDescription>
                  This hides the Platform Settings page on next reload and stops all observe-mode
                  logging. Existing entitlement rows are preserved. PMS behavior is unaffected
                  either way.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    setConfirmOff(false);
                    mut.mutate(false);
                  }}
                >
                  Turn OFF
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Enforcement pilot</CardTitle>
          <CardDescription>Phase 3 — single action: <code>pms.data.export</code></CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Badge variant={pilotEnabled ? 'destructive' : 'secondary'}>
              {pilotEnabled ? 'ENABLED' : 'DISABLED'}
            </Badge>
            <Switch
              checked={pilotEnabled}
              disabled={!canWrite || !enabled || pilotMut.isPending || pilotFlag.isLoading}
              onCheckedChange={(next) => setConfirmPilot(next)}
              aria-label="Toggle enforcement pilot"
            />
            {!canWrite && (
              <span className="text-xs text-muted-foreground">platform_owner only</span>
            )}
            {!enabled && canWrite && (
              <span className="text-xs text-muted-foreground">Master switch must be ON</span>
            )}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            When ON, the <strong>Export Pending</strong> button (<code>pms.data.export</code>) is blocked
            in the UI for users whose action entitlement is OFF. All other wrapped actions remain
            observe-only. Kill-switch: turn this OFF for instant rollback — the button returns to
            normal behavior on the next render.
          </p>
          <AlertDialog open={confirmPilot !== null} onOpenChange={(o) => !o && setConfirmPilot(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {confirmPilot ? 'Enable enforcement pilot?' : 'Disable enforcement pilot?'}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {confirmPilot
                    ? 'Enabling will start blocking pms.data.export in UI for users whose action entitlement is OFF. No other action is affected. You can disable instantly to roll back.'
                    : 'Disabling restores observe-only behavior immediately. pms.data.export will work again on the next render.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    const next = !!confirmPilot;
                    setConfirmPilot(null);
                    pilotMut.mutate(next);
                  }}
                >
                  {confirmPilot ? 'Enable' : 'Disable'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Deployment</CardTitle>
          <CardDescription>Active clients</CardDescription>
        </CardHeader>
        <CardContent>
          {clients.isLoading ? <LoadingRows /> : (
            <ul className="space-y-2 text-sm">
              {(clients.data ?? []).map((c) => (
                <li key={c.client_key} className="flex justify-between border-b pb-1">
                  <span>{c.display_name} <span className="text-muted-foreground">({c.client_key})</span></span>
                  <Badge variant="outline">{c.deployment_mode}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type ClientRow = {
  client_key: string;
  display_name: string;
  deployment_mode: string;
  is_active: boolean;
  entitlement_source: string | null;
};

const CLIENT_NAME_MAX = 80;
const CLIENT_KEY_MAX = 40;
const CLIENT_MODES = ['saas', 'on_prem', 'hybrid'] as const;
type ClientMode = (typeof CLIENT_MODES)[number];

/** Lowercase slug: alphanumerics + hyphens, collapsed, trimmed, max 40. */
function slugifyClientKey(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, CLIENT_KEY_MAX);
}

const KEY_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

function ClientsTab() {
  const qc = useQueryClient();
  const { user, hasRole } = useAuth();
  const canWrite = hasRole('platform_owner');
  const { data, isLoading } = useRows<ClientRow>('clients', 'client_key');
  const [editing, setEditing] = useState<ClientRow | null>(null);
  const [name, setName] = useState('');

  useEffect(() => {
    if (editing) setName(editing.display_name ?? '');
  }, [editing]);

  const mut = useMutation({
    mutationFn: async (next: string) => {
      if (!editing) return;
      const before = editing.display_name;
      const { error } = await supabase
        .from('clients')
        .update({ display_name: next })
        .eq('client_key', editing.client_key);
      if (error) throw error;
      await supabase.from('entitlement_audit').insert({
        actor_id: user?.id ?? null,
        event_type: 'update',
        entity_type: 'client',
        entity_key: editing.client_key,
        before: { name: before },
        after: { name: next },
        reason: 'platform_settings_client_name_update',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-settings', 'clients'] });
      qc.invalidateQueries({ queryKey: ['platform-settings', 'audit'] });
      setEditing(null);
      toast.success('Client name updated');
    },
    onError: (e: Error) => toast.error(`Update failed: ${e.message}`),
  });

  const trimmed = name.trim();
  const valid = trimmed.length > 0 && trimmed.length <= CLIENT_NAME_MAX;
  const dirty = editing ? trimmed !== editing.display_name : false;

  if (isLoading) return <LoadingRows />;
  return (
    <>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="w-20 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No rows</TableCell></TableRow>
            ) : (data ?? []).map((c) => (
              <TableRow key={c.client_key}>
                <TableCell className="font-mono text-xs">{c.client_key}</TableCell>
                <TableCell>{c.display_name}</TableCell>
                <TableCell><Badge variant="outline">{c.deployment_mode}</Badge></TableCell>
                <TableCell>{c.is_active ? '✓' : '—'}</TableCell>
                <TableCell>{c.entitlement_source ?? '—'}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(c)}
                    disabled={!canWrite}
                    aria-label={`Edit ${c.client_key} name`}
                    title={canWrite ? 'Edit display name' : 'platform_owner only'}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Client Name</DialogTitle>
            <DialogDescription>
              Only the display name can be changed. Key, mode, status, and source are immutable in this phase.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Client key (read-only)</Label>
              <Input value={editing?.client_key ?? ''} readOnly disabled className="font-mono" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="client-display-name">Display name</Label>
              <Input
                id="client-display-name"
                value={name}
                maxLength={CLIENT_NAME_MAX}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. BFCL"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                {trimmed.length}/{CLIENT_NAME_MAX} characters · cannot be blank
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={mut.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => mut.mutate(trimmed)}
              disabled={!valid || !dirty || !canWrite || mut.isPending}
            >
              {mut.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Writes a `entitlement_audit` row capturing the before/after state of an
 * entitlement toggle. Observe-mode: this does not enforce anything — it is
 * only telemetry. RLS restricts the write to platform_owner.
 */
async function toggleEntitlement(opts: {
  table: 'client_module_entitlements' | 'client_action_entitlements';
  id: string;
  clientId: string | null;
  entityType: 'module' | 'action';
  entityKey: string;
  nextEnabled: boolean;
  actorId: string | null;
}) {
  const { table, id, clientId, entityType, entityKey, nextEnabled, actorId } = opts;
  const { data: before, error: readErr } = await supabase
    .from(table)
    .select('id, is_enabled')
    .eq('id', id)
    .maybeSingle();
  if (readErr) throw readErr;

  const { error: updErr } = await supabase
    .from(table)
    .update({ is_enabled: nextEnabled })
    .eq('id', id);
  if (updErr) throw updErr;

  const { error: auditErr } = await supabase.from('entitlement_audit').insert({
    actor_id: actorId,
    event_type: 'update',
    entity_type: entityType,
    entity_key: entityKey,
    client_id: clientId,
    before: { is_enabled: before?.is_enabled ?? null },
    after: { is_enabled: nextEnabled },
    reason: 'platform_settings toggle',
  });
  if (auditErr) throw auditErr;
}

function ModuleEntitlementsTab() {
  const qc = useQueryClient();
  const { user, hasRole } = useAuth();
  const canWrite = hasRole('platform_owner');
  const [q, setQ] = useState('');
  const flag = useHubFlag();
  const hubOn = parseFlag(flag.data);

  const { data, isLoading } = useQuery({
    queryKey: ['platform-settings', 'cme-joined'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_module_entitlements')
        .select('id, module_key, is_enabled, valid_from, valid_until, client_id, clients(client_key, display_name)')
        .order('module_key', { ascending: true })
        .limit(PAGE_SIZE);
      if (error) throw error;
      return data ?? [];
    },
  });

  const mut = useMutation({
    mutationFn: toggleEntitlement,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-settings', 'cme-joined'] });
      qc.invalidateQueries({ queryKey: ['platform-settings', 'audit'] });
      qc.invalidateQueries({ queryKey: ['hub-entitlement-snapshot'] });
      toast.success('Entitlement updated (observe-only, not enforced)');
    },
    onError: (e: Error) => toast.error(`Toggle failed: ${e.message}`),
  });

  const rows = (data ?? []).filter((r) =>
    !q || r.module_key.toLowerCase().includes(q.toLowerCase()) ||
    (r.clients?.client_key ?? '').toLowerCase().includes(q.toLowerCase()),
  );

  if (isLoading) return <LoadingRows />;
  return (
    <div className="space-y-3">
      <MasterSwitchBanner enabled={hubOn} />
      <Input placeholder="Search module or client…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Module</TableHead>
              <TableHead>Valid from</TableHead>
              <TableHead>Valid until</TableHead>
              <TableHead className="text-right">Enabled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No rows</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.clients?.display_name ?? '—'} <span className="text-muted-foreground">({r.clients?.client_key ?? '—'})</span></TableCell>
                <TableCell><code className="text-xs">{r.module_key}</code></TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.valid_from ?? '—'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.valid_until ?? '—'}</TableCell>
                <TableCell className="text-right">
                  <Switch
                    checked={!!r.is_enabled}
                    disabled={!canWrite || mut.isPending}
                    onCheckedChange={(next) => mut.mutate({
                      table: 'client_module_entitlements',
                      id: r.id,
                      clientId: r.client_id,
                      entityType: 'module',
                      entityKey: r.module_key,
                      nextEnabled: next,
                      actorId: user?.id ?? null,
                    })}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Observe-only — flipping OFF logs a record but does NOT block any PMS behavior. Enforcement begins in a future phase.
      </p>
    </div>
  );
}

function ActionEntitlementsTab() {
  const qc = useQueryClient();
  const { user, hasRole } = useAuth();
  const canWrite = hasRole('platform_owner');
  const [q, setQ] = useState('');
  const flag = useHubFlag();
  const hubOn = parseFlag(flag.data);

  const { data, isLoading } = useQuery({
    queryKey: ['platform-settings', 'cae-joined'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_action_entitlements')
        .select('id, action_key, is_enabled, client_id, clients(client_key), action_registry(label, risk_level, module_key)')
        .order('action_key', { ascending: true })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const mut = useMutation({
    mutationFn: toggleEntitlement,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-settings', 'cae-joined'] });
      qc.invalidateQueries({ queryKey: ['platform-settings', 'audit'] });
      qc.invalidateQueries({ queryKey: ['hub-entitlement-snapshot'] });
      toast.success('Entitlement updated (observe-only, not enforced)');
    },
    onError: (e: Error) => toast.error(`Toggle failed: ${e.message}`),
  });

  const rows = (data ?? []).filter((r) => {
    if (!q) return true;
    const needle = q.toLowerCase();
    return (
      r.action_key.toLowerCase().includes(needle) ||
      (r.action_registry?.label ?? '').toLowerCase().includes(needle) ||
      (r.action_registry?.module_key ?? '').toLowerCase().includes(needle) ||
      (r.clients?.client_key ?? '').toLowerCase().includes(needle)
    );
  });

  if (isLoading) return <LoadingRows />;
  return (
    <div className="space-y-3">
      <MasterSwitchBanner enabled={hubOn} />
      <Input placeholder="Search action, module or client…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Module</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Risk</TableHead>
              <TableHead className="text-right">Enabled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No rows</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.clients?.client_key ?? '—'}</TableCell>
                <TableCell>{r.action_registry?.module_key ?? '—'}</TableCell>
                <TableCell>
                  <div className="font-medium">{r.action_registry?.label ?? r.action_key}</div>
                  <code className="text-xs text-muted-foreground">{r.action_key}</code>
                </TableCell>
                <TableCell><Badge variant="outline">{r.action_registry?.risk_level ?? '—'}</Badge></TableCell>
                <TableCell className="text-right">
                  <Switch
                    checked={!!r.is_enabled}
                    disabled={!canWrite || mut.isPending}
                    onCheckedChange={(next) => mut.mutate({
                      table: 'client_action_entitlements',
                      id: r.id,
                      clientId: r.client_id,
                      entityType: 'action',
                      entityKey: r.action_key,
                      nextEnabled: next,
                      actorId: user?.id ?? null,
                    })}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Observe-only — toggling does NOT block the action in PMS. Phase 3 will enforce one action at a time.
      </p>
    </div>
  );
}

function RegistriesTab() {
  const modules = useRows<Record<string, unknown>>('module_registry', 'sort_order');
  const actions = useRows<Record<string, unknown>>('action_registry', 'action_key');
  const caps = useRows<Record<string, unknown>>('capability_registry', 'capability_key');

  return (
    <Tabs defaultValue="modules" className="space-y-4">
      <TabsList>
        <TabsTrigger value="modules">Modules</TabsTrigger>
        <TabsTrigger value="actions">Actions</TabsTrigger>
        <TabsTrigger value="capabilities">Capabilities</TabsTrigger>
      </TabsList>
      <TabsContent value="modules">
        {modules.isLoading ? <LoadingRows /> : (
          <SearchableTable
            rows={modules.data ?? []}
            searchKeys={['module_key', 'label'] as never}
            columns={[
              { key: 'module_key' as never, label: 'Key' },
              { key: 'label' as never, label: 'Label' },
              { key: 'description' as never, label: 'Description' },
              { key: 'is_system' as never, label: 'System', render: (v) => v ? '✓' : '—' },
            ]}
          />
        )}
      </TabsContent>
      <TabsContent value="actions">
        {actions.isLoading ? <LoadingRows /> : (
          <SearchableTable
            rows={actions.data ?? []}
            searchKeys={['action_key', 'label', 'module_key'] as never}
            columns={[
              { key: 'action_key' as never, label: 'Key' },
              { key: 'module_key' as never, label: 'Module' },
              { key: 'label' as never, label: 'Label' },
              { key: 'risk_level' as never, label: 'Risk', render: (v) => <Badge variant="outline">{String(v)}</Badge> },
            ]}
          />
        )}
      </TabsContent>
      <TabsContent value="capabilities">
        {caps.isLoading ? <LoadingRows /> : (
          <SearchableTable
            rows={caps.data ?? []}
            searchKeys={['capability_key', 'label'] as never}
            columns={[
              { key: 'capability_key' as never, label: 'Key' },
              { key: 'module_key' as never, label: 'Module' },
              { key: 'label' as never, label: 'Label' },
              { key: 'description' as never, label: 'Description' },
            ]}
          />
        )}
      </TabsContent>
    </Tabs>
  );
}

/** CSV helper — escape per RFC 4180. Pure, exported for unit tests. */
export function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.join(',');
  const body = rows.map((r) => columns.map((c) => esc(r[c])).join(',')).join('\n');
  return `${header}\n${body}`;
}

/** Group rows by a string key and return descending counts. Pure, exported for tests. */
export function aggregateByKey<T extends Record<string, unknown>>(
  rows: T[],
  key: keyof T,
): Array<{ key: string; count: number }> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = r[key] == null ? '—' : String(r[key]);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([k, count]) => ({ key: k, count }))
    .sort((a, b) => b.count - a.count);
}

const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;

type WouldDenyRow = {
  id: string;
  created_at: string;
  actor_id: string | null;
  entity_key: string;
  client_id: string | null;
  reason: string | null;
  after?: Record<string, unknown> | null;
};

function Sparkline({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const W = 320;
  const H = 60;
  const bw = data.length ? W / data.length : 0;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      {data.map((d, i) => {
        const h = (d.count / max) * (H - 4);
        return (
          <rect
            key={d.date}
            x={i * bw + 1}
            y={H - h}
            width={Math.max(1, bw - 2)}
            height={h}
            className="fill-primary/70"
          >
            <title>{`${d.date}: ${d.count}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function KpiCard({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-7 w-16" /> : <div className="text-2xl font-bold">{value.toLocaleString()}</div>}
      </CardContent>
    </Card>
  );
}

function TelemetryTab() {
  const { hasRole } = useAuth();
  const { snapshot } = useEntitlement();
  const isOwner = hasRole('platform_owner');
  const [page, setPage] = useState(0);
  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(defaultFrom);
  const [until, setUntil] = useState(today);
  const [clientId, setClientId] = useState<string>('all');
  const [moduleKey, setModuleKey] = useState<string>('all');
  const [risk, setRisk] = useState<string>('all');
  const [actionSearch, setActionSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [routeFilter, setRouteFilter] = useState<string>('');
  const [trendRange, setTrendRange] = useState<'7d' | '30d' | 'custom'>('30d');

  const clientsQ = useQuery({
    queryKey: ['telemetry', 'clients'],
    queryFn: async () => {
      const { data } = await supabase.from('clients').select('id, client_key, display_name').order('client_key');
      return data ?? [];
    },
  });
  const modulesQ = useQuery({
    queryKey: ['telemetry', 'modules'],
    queryFn: async () => {
      const { data } = await supabase.from('module_registry').select('module_key, label').order('module_key');
      return data ?? [];
    },
  });
  const actionRegistryQ = useQuery({
    queryKey: ['telemetry', 'action_registry'],
    queryFn: async () => {
      const { data } = await supabase.from('action_registry').select('action_key, label, module_key, risk_level');
      return data ?? [];
    },
  });

  const actionMeta = (actionRegistryQ.data ?? []).reduce<Record<string, { label?: string | null; module_key?: string | null; risk_level?: string | null }>>((acc, r) => {
    acc[r.action_key] = { label: r.label, module_key: r.module_key, risk_level: r.risk_level };
    return acc;
  }, {});
  const clientMeta = (clientsQ.data ?? []).reduce<Record<string, { client_key: string; display_name: string }>>((acc, c) => {
    acc[c.id] = { client_key: c.client_key, display_name: c.display_name };
    return acc;
  }, {});

  // Action keys matching active filters (module/risk/actionSearch) — used to constrain server-side queries.
  const filteredActionKeys = (actionRegistryQ.data ?? [])
    .filter((a) => moduleKey === 'all' || a.module_key === moduleKey)
    .filter((a) => risk === 'all' || a.risk_level === risk)
    .filter((a) => !actionSearch.trim() || a.action_key.toLowerCase().includes(actionSearch.trim().toLowerCase()))
    .map((a) => a.action_key);
  const constrainByActionKeys = moduleKey !== 'all' || risk !== 'all' || !!actionSearch.trim();

  // KPI counts (head queries)
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const last7 = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  last7.setHours(0, 0, 0, 0);
  const last30 = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
  last30.setHours(0, 0, 0, 0);

  // Aggregate window (trend + breakdown cards). `custom` uses the events-table
  // From/Until inputs; otherwise the chip-driven 7d/30d window.
  const aggFromDate =
    trendRange === '7d' ? presetRange('last7').from
    : trendRange === '30d' ? presetRange('last30').from
    : from;
  const aggUntilDate =
    trendRange === 'custom' ? until
    : presetRange('last30').until; // today
  const aggFromISO = new Date(`${aggFromDate}T00:00:00`).toISOString();
  const aggUntilEnd = new Date(`${aggUntilDate}T23:59:59.999`).toISOString();

  const kpiQ = useQuery({
    queryKey: ['telemetry', 'kpi'],
    queryFn: async () => {
      const ranges = [
        startOfToday.toISOString(),
        last7.toISOString(),
        last30.toISOString(),
      ];
      const [tToday, t7, t30, tAll] = await Promise.all([
        supabase.from('entitlement_audit').select('*', { count: 'exact', head: true }).eq('event_type', 'would_deny').gte('created_at', ranges[0]),
        supabase.from('entitlement_audit').select('*', { count: 'exact', head: true }).eq('event_type', 'would_deny').gte('created_at', ranges[1]),
        supabase.from('entitlement_audit').select('*', { count: 'exact', head: true }).eq('event_type', 'would_deny').gte('created_at', ranges[2]),
        supabase.from('entitlement_audit').select('*', { count: 'exact', head: true }).eq('event_type', 'would_deny'),
      ]);
      return { today: tToday.count ?? 0, last7: t7.count ?? 0, last30: t30.count ?? 0, all: tAll.count ?? 0 };
    },
  });

  // Window rows for aggregates + trend chart (capped at 5000).
  const aggQ = useQuery({
    queryKey: ['telemetry', 'agg', aggFromISO, aggUntilEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entitlement_audit')
        .select('id, created_at, actor_id, entity_key, client_id, after')
        .eq('event_type', 'would_deny')
        .gte('created_at', aggFromISO)
        .lte('created_at', aggUntilEnd)
        .order('created_at', { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as WouldDenyRow[];
    },
  });

  // Resolve user labels for actors appearing in the 30-day window.
  const actorIds = Array.from(new Set((aggQ.data ?? []).map((r) => r.actor_id).filter((x): x is string => !!x)));
  const profilesQ = useQuery({
    queryKey: ['telemetry', 'profiles', actorIds.sort().join(',')],
    enabled: actorIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, email').in('id', actorIds);
      return (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>;
    },
  });
  const profileMeta = (profilesQ.data ?? []).reduce<Record<string, { full_name: string | null; email: string | null }>>((acc, p) => {
    acc[p.id] = { full_name: p.full_name, email: p.email };
    return acc;
  }, {});

  // Recent events (server-side filtered + paginated)
  const eventsQ = useQuery({
    queryKey: ['telemetry', 'events', { page, from, until, clientId, moduleKey, risk, actionSearch, userSearch, routeFilter, akeys: constrainByActionKeys ? filteredActionKeys.length : 0 }],
    queryFn: async () => {
      let q = supabase
        .from('entitlement_audit')
        .select('id, created_at, actor_id, entity_key, client_id, reason, after', { count: 'exact' })
        .eq('event_type', 'would_deny')
        .order('created_at', { ascending: false });
      if (from) q = q.gte('created_at', new Date(from).toISOString());
      if (until) {
        const end = new Date(until);
        end.setHours(23, 59, 59, 999);
        q = q.lte('created_at', end.toISOString());
      }
      if (clientId !== 'all') q = q.eq('client_id', clientId);
      if (constrainByActionKeys) {
        if (filteredActionKeys.length === 0) return { rows: [] as WouldDenyRow[], total: 0 };
        q = q.in('entity_key', filteredActionKeys);
      }
      if (routeFilter.trim()) {
        q = q.eq('after->>pathname', routeFilter.trim());
      }
      const start = page * PAGE_SIZE;
      const { data, count, error } = await q.range(start, start + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as WouldDenyRow[], total: count ?? 0 };
    },
    enabled: !actionRegistryQ.isLoading,
  });

  // Client-side user filter (since profiles are resolved client-side).
  const userFilter = (row: WouldDenyRow) => {
    if (!userSearch.trim()) return true;
    if (!row.actor_id) return false;
    const p = profileMeta[row.actor_id];
    const needle = userSearch.trim().toLowerCase();
    return (
      (p?.full_name ?? '').toLowerCase().includes(needle) ||
      (p?.email ?? '').toLowerCase().includes(needle)
    );
  };

  // Aggregates over the 30-day window
  const aggRows = aggQ.data ?? [];
  const topActions = aggregateByKey(aggRows, 'entity_key').slice(0, 10);
  const topUsers = aggregateByKey(aggRows.filter((r) => r.actor_id), 'actor_id').slice(0, 10);
  const byClient = aggregateByKey(aggRows, 'client_id').slice(0, 10);
  const byModule = aggregateByKey(
    aggRows.map((r) => ({ module_key: actionMeta[r.entity_key]?.module_key ?? '—' })),
    'module_key',
  ).slice(0, 10);
  const byRoute = aggregateByPathname(aggRows).slice(0, 10);

  // Daily trend buckets across the selected aggregation window
  const daily = bucketByDay(aggRows, aggFromDate, aggUntilDate);
  const aggCapped = aggRows.length >= 5000;

  const exportCsv = async () => {
    try {
      let q = supabase
        .from('entitlement_audit')
        .select('id, created_at, actor_id, entity_key, client_id, reason, after')
        .eq('event_type', 'would_deny')
        .order('created_at', { ascending: false })
        .limit(10000);
      if (from) q = q.gte('created_at', new Date(from).toISOString());
      if (until) {
        const end = new Date(until);
        end.setHours(23, 59, 59, 999);
        q = q.lte('created_at', end.toISOString());
      }
      if (clientId !== 'all') q = q.eq('client_id', clientId);
      if (constrainByActionKeys) q = q.in('entity_key', filteredActionKeys);
      if (routeFilter.trim()) q = q.eq('after->>pathname', routeFilter.trim());
      const { data, error } = await q;
      if (error) throw error;
      const enriched = ((data ?? []) as WouldDenyRow[]).filter(userFilter).map((r) => ({
        created_at: r.created_at,
        action_key: r.entity_key,
        action_label: actionMeta[r.entity_key]?.label ?? '',
        module_key: actionMeta[r.entity_key]?.module_key ?? '',
        risk_level: actionMeta[r.entity_key]?.risk_level ?? '',
        client_key: r.client_id ? clientMeta[r.client_id]?.client_key ?? '' : '',
        actor_id: r.actor_id ?? '',
        user_name: r.actor_id ? profileMeta[r.actor_id]?.full_name ?? '' : '',
        user_email: r.actor_id ? profileMeta[r.actor_id]?.email ?? '' : '',
        pathname: (r.after?.pathname as string | undefined) ?? '',
        search: (r.after?.search as string | undefined) ?? '',
        source: (r.after?.source as string | undefined) ?? '',
        reason: r.reason ?? '',
      }));
      const cols = ['created_at', 'action_key', 'action_label', 'module_key', 'risk_level', 'client_key', 'user_name', 'user_email', 'actor_id', 'pathname', 'search', 'source', 'reason'];
      const csv = toCsv(enriched, cols);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `would_deny_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${enriched.length} rows`);
    } catch (e) {
      toast.error(`Export failed: ${(e as Error).message}`);
    }
  };

  if (!isOwner) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Platform owner only</AlertTitle>
        <AlertDescription>This telemetry view is restricted to platform_owner.</AlertDescription>
      </Alert>
    );
  }

  const rows = (eventsQ.data?.rows ?? []).filter(userFilter);
  const total = eventsQ.data?.total ?? 0;
  const maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  return (
    <div className="space-y-4">
      <Alert className="border-blue-500/40">
        <CheckCircle2 className="h-4 w-4 text-blue-600" />
        <AlertTitle>Observe-only telemetry</AlertTitle>
        <AlertDescription>
          No PMS action is currently blocked. Data sourced from <code>entitlement_audit</code> where{' '}
          <code>event_type = would_deny</code>. Used to size the impact before any future enforcement.
        </AlertDescription>
      </Alert>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <KpiCard label="Today" value={kpiQ.data?.today ?? 0} loading={kpiQ.isLoading} />
        <KpiCard label="Last 7 days" value={kpiQ.data?.last7 ?? 0} loading={kpiQ.isLoading} />
        <KpiCard label="Last 30 days" value={kpiQ.data?.last30 ?? 0} loading={kpiQ.isLoading} />
        <KpiCard label="All time" value={kpiQ.data?.all ?? 0} loading={kpiQ.isLoading} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm">would_deny — daily trend</CardTitle>
              <CardDescription>
                {trendRange === 'custom'
                  ? `Custom: ${aggFromDate} → ${aggUntilDate}`
                  : trendRange === '7d' ? 'Last 7 days' : 'Last 30 days'}
                {aggCapped && ' · showing first 5000 events in window'}
              </CardDescription>
            </div>
            <div className="flex gap-1">
              <Button variant={trendRange === '7d' ? 'default' : 'outline'} size="sm" onClick={() => setTrendRange('7d')}>7d</Button>
              <Button variant={trendRange === '30d' ? 'default' : 'outline'} size="sm" onClick={() => setTrendRange('30d')}>30d</Button>
              <Button variant={trendRange === 'custom' ? 'default' : 'outline'} size="sm" onClick={() => setTrendRange('custom')}>Custom</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {aggQ.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" fontSize={10} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis fontSize={10} allowDecimals={false} />
                  <RTooltip contentStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Top would-be-blocked actions (30d)</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Action</TableHead><TableHead>Module</TableHead><TableHead className="text-right">Count</TableHead></TableRow></TableHeader>
              <TableBody>
                {topActions.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4">No data</TableCell></TableRow>
                ) : topActions.map((t) => (
                  <TableRow key={t.key} className="cursor-pointer hover:bg-muted/40" onClick={() => { setActionSearch(t.key); setPage(0); }}>
                    <TableCell><div className="font-medium text-xs">{actionMeta[t.key]?.label ?? t.key}</div><code className="text-[10px] text-muted-foreground">{t.key}</code></TableCell>
                    <TableCell className="text-xs">{actionMeta[t.key]?.module_key ?? '—'}</TableCell>
                    <TableCell className="text-right">{t.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Top users (30d)</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>User</TableHead><TableHead className="text-right">Count</TableHead></TableRow></TableHeader>
              <TableBody>
                {topUsers.length === 0 ? (
                  <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-4">No data</TableCell></TableRow>
                ) : topUsers.map((u) => (
                  <TableRow key={u.key} className="cursor-pointer hover:bg-muted/40" onClick={() => { setUserSearch(profileMeta[u.key]?.email ?? profileMeta[u.key]?.full_name ?? u.key); setPage(0); }}>
                    <TableCell className="text-xs">
                      <div className="font-medium">{profileMeta[u.key]?.full_name ?? '—'}</div>
                      <div className="text-muted-foreground">{profileMeta[u.key]?.email ?? u.key}</div>
                    </TableCell>
                    <TableCell className="text-right">{u.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">By client / module (30d)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-xs font-medium mb-1">Client</div>
              <Table>
                <TableBody>
                  {byClient.length === 0 ? (
                    <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-2 text-xs">No data</TableCell></TableRow>
                  ) : byClient.map((c) => (
                    <TableRow key={c.key} className="cursor-pointer hover:bg-muted/40" onClick={() => { if (c.key !== '—') { setClientId(c.key); setPage(0); } }}>
                      <TableCell className="text-xs">{c.key === '—' ? '— (none)' : clientMeta[c.key]?.client_key ?? c.key}</TableCell>
                      <TableCell className="text-right text-xs">{c.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div>
              <div className="text-xs font-medium mb-1">Module</div>
              <Table>
                <TableBody>
                  {byModule.length === 0 ? (
                    <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-2 text-xs">No data</TableCell></TableRow>
                  ) : byModule.map((m) => (
                    <TableRow key={m.key} className="cursor-pointer hover:bg-muted/40" onClick={() => { if (m.key !== '—') { setModuleKey(m.key); setPage(0); } }}>
                      <TableCell className="text-xs">{m.key}</TableCell>
                      <TableCell className="text-right text-xs">{m.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">By page / route</CardTitle>
          <CardDescription>Click a row to filter the events table. Rows captured before Phase 2D are grouped under "Not captured".</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Page / Route</TableHead><TableHead className="text-right">Count</TableHead></TableRow></TableHeader>
            <TableBody>
              {byRoute.length === 0 ? (
                <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-4">No data</TableCell></TableRow>
              ) : byRoute.map((r) => (
                <TableRow
                  key={r.key}
                  className={r.key === 'Not captured' ? '' : 'cursor-pointer hover:bg-muted/40'}
                  onClick={() => { if (r.key !== 'Not captured') { setRouteFilter(r.key); setPage(0); } }}
                >
                  <TableCell className="text-xs">
                    {r.key === 'Not captured'
                      ? <span className="text-muted-foreground italic">Not captured</span>
                      : <code className="text-[11px]">{r.key}</code>}
                  </TableCell>
                  <TableCell className="text-right text-xs">{r.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Recent would_deny events</CardTitle>
          <CardDescription>Filtered, paginated. Click breakdown rows above to drill in.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Presets:</span>
            {(['today', 'last7', 'last30'] as PresetKey[]).map((p) => (
              <Button
                key={p}
                size="sm"
                variant="outline"
                onClick={() => {
                  const r = presetRange(p);
                  setFrom(r.from);
                  setUntil(r.until);
                  setPage(0);
                }}
              >
                {p === 'today' ? 'Today' : p === 'last7' ? 'Last 7 days' : 'Last 30 days'}
              </Button>
            ))}
            <Button size="sm" variant={risk === 'high' ? 'default' : 'outline'} onClick={() => { setRisk(risk === 'high' ? 'all' : 'high'); setPage(0); }}>High-risk</Button>
            <Button size="sm" variant={risk === 'critical' ? 'default' : 'outline'} onClick={() => { setRisk(risk === 'critical' ? 'all' : 'critical'); setPage(0); }}>Critical</Button>
            {snapshot.clientId && (
              <Button
                size="sm"
                variant={clientId === snapshot.clientId ? 'default' : 'outline'}
                onClick={() => { setClientId(clientId === snapshot.clientId ? 'all' : snapshot.clientId!); setPage(0); }}
              >
                Current client
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={() => {
                const d = defaultFilters();
                setFrom(d.from); setUntil(d.until);
                setClientId(d.clientId); setModuleKey(d.moduleKey); setRisk(d.risk);
                setActionSearch(d.actionSearch); setUserSearch(d.userSearch);
                setRouteFilter(d.routeFilter); setPage(0);
              }}
            >
              Clear all filters
            </Button>
          </div>
          {routeFilter && (
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="secondary">Route filter</Badge>
              <code className="text-[11px]">{routeFilter}</code>
              <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => { setRouteFilter(''); setPage(0); }}>clear</Button>
            </div>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">From</label>
              <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} className="w-40" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Until</label>
              <Input type="date" value={until} onChange={(e) => { setUntil(e.target.value); setPage(0); }} className="w-40" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Client</label>
              <Select value={clientId} onValueChange={(v) => { setClientId(v); setPage(0); }}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All clients</SelectItem>
                  {(clientsQ.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.client_key}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Module</label>
              <Select value={moduleKey} onValueChange={(v) => { setModuleKey(v); setPage(0); }}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All modules</SelectItem>
                  {(modulesQ.data ?? []).map((m) => <SelectItem key={m.module_key} value={m.module_key}>{m.module_key}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Risk</label>
              <Select value={risk} onValueChange={(v) => { setRisk(v); setPage(0); }}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All risks</SelectItem>
                  {RISK_LEVELS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Action key contains</label>
              <Input value={actionSearch} onChange={(e) => { setActionSearch(e.target.value); setPage(0); }} placeholder="pms." className="w-44" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">User name/email</label>
              <Input value={userSearch} onChange={(e) => { setUserSearch(e.target.value); setPage(0); }} placeholder="search" className="w-44" />
            </div>
            <div className="ml-auto">
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <Download className="h-4 w-4 mr-1" />Export CSV
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Page</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eventsQ.isLoading ? (
                  <TableRow><TableCell colSpan={8}><LoadingRows /></TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No rows</TableCell></TableRow>
                ) : rows.map((r) => {
                  const meta = actionMeta[r.entity_key] ?? {};
                  const prof = r.actor_id ? profileMeta[r.actor_id] : undefined;
                  const pathname = (r.after?.pathname as string | undefined) ?? '';
                  const search = (r.after?.search as string | undefined) ?? '';
                  const source = (r.after?.source as string | undefined) ?? '';
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium">{prof?.full_name ?? '—'}</div>
                        <div className="text-muted-foreground">{prof?.email ?? r.actor_id ?? '—'}</div>
                      </TableCell>
                      <TableCell className="text-xs">{r.client_id ? clientMeta[r.client_id]?.client_key ?? '—' : '—'}</TableCell>
                      <TableCell className="text-xs">{meta.module_key ?? '—'}</TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium">{meta.label ?? r.entity_key}</div>
                        <code className="text-[10px] text-muted-foreground">{r.entity_key}</code>
                      </TableCell>
                      <TableCell className="text-xs max-w-[12rem] truncate" title={`${pathname}${search}`}>
                        {pathname
                          ? <code className="text-[10px]">{pathname}{search}</code>
                          : <span className="text-muted-foreground italic">Not captured</span>}
                      </TableCell>
                      <TableCell><Badge variant="outline">{meta.risk_level ?? '—'}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{source || r.reason || '—'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Page {page + 1} of {maxPage + 1} · {total} matching rows</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" disabled={page >= maxPage} onClick={() => setPage((p) => Math.min(maxPage, p + 1))}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AuditTab() {
  const { hasRole } = useAuth();
  const canExport = hasRole('platform_owner');
  const [page, setPage] = useState(0);
  const [eventType, setEventType] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');

  const buildQuery = () => {
    let q = supabase
      .from('entitlement_audit')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });
    if (eventType !== 'all') q = q.eq('event_type', eventType);
    if (search.trim()) q = q.ilike('entity_key', `%${search.trim()}%`);
    if (from) q = q.gte('created_at', new Date(from).toISOString());
    if (until) {
      const end = new Date(until);
      end.setHours(23, 59, 59, 999);
      q = q.lte('created_at', end.toISOString());
    }
    return q;
  };

  const { data, isLoading } = useQuery({
    queryKey: ['platform-settings', 'audit', { page, eventType, search, from, until }],
    queryFn: async () => {
      const start = page * PAGE_SIZE;
      const { data, count, error } = await buildQuery().range(start, start + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  const exportCsv = async () => {
    try {
      const { data, error } = await buildQuery().limit(10000);
      if (error) throw error;
      const cols = ['created_at', 'event_type', 'entity_type', 'entity_key', 'client_id', 'actor_id', 'reason', 'before', 'after'];
      const csv = toCsv((data ?? []) as Array<Record<string, unknown>>, cols);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `entitlement_audit_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${(data ?? []).length} rows`);
    } catch (e) {
      toast.error(`Export failed: ${(e as Error).message}`);
    }
  };

  const total = data?.total ?? 0;
  const rows = data?.rows ?? [];
  const maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Event</label>
          <Select value={eventType} onValueChange={(v) => { setEventType(v); setPage(0); }}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              {AUDIT_EVENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Entity key contains</label>
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="e.g. pms.admin.users" className="w-56" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">From</label>
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} className="w-40" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Until</label>
          <Input type="date" value={until} onChange={(e) => { setUntil(e.target.value); setPage(0); }} className="w-40" />
        </div>
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!canExport}>
            <Download className="h-4 w-4 mr-1" />Export CSV
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Before → After</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6}><LoadingRows /></TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No rows</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</TableCell>
                <TableCell><Badge variant="outline">{r.event_type}</Badge></TableCell>
                <TableCell>{r.entity_type}</TableCell>
                <TableCell><code className="text-xs">{r.entity_key}</code></TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                  {r.before ? JSON.stringify(r.before) : '—'} → {r.after ? JSON.stringify(r.after) : '—'}
                </TableCell>
                <TableCell className="text-xs">{r.reason ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Page {page + 1} of {maxPage + 1} · {total} rows total
        </span>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" disabled={page >= maxPage} onClick={() => setPage((p) => Math.min(maxPage, p + 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function PlatformSettings() {
  return (
    <div className="min-h-screen bg-muted/30">
      <MinimalHeader />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Platform Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Hub-level configuration. Phase 2: writable entitlement toggles (observe-only — no PMS enforcement yet).
          </p>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="overview"><Layers className="h-4 w-4 mr-1" />Overview</TabsTrigger>
            <TabsTrigger value="clients"><Building2 className="h-4 w-4 mr-1" />Clients</TabsTrigger>
            <TabsTrigger value="modules"><Boxes className="h-4 w-4 mr-1" />Module Entitlements</TabsTrigger>
            <TabsTrigger value="actions"><KeyRound className="h-4 w-4 mr-1" />Action Entitlements</TabsTrigger>
            <TabsTrigger value="registries"><ShieldCheck className="h-4 w-4 mr-1" />Registries</TabsTrigger>
            <TabsTrigger value="audit"><ScrollText className="h-4 w-4 mr-1" />Audit Logs</TabsTrigger>
            <TabsTrigger value="telemetry"><BarChart3 className="h-4 w-4 mr-1" />Telemetry</TabsTrigger>
          </TabsList>
          <TabsContent value="overview"><OverviewTab /></TabsContent>
          <TabsContent value="clients"><Card><CardContent className="pt-6"><ClientsTab /></CardContent></Card></TabsContent>
          <TabsContent value="modules"><Card><CardContent className="pt-6"><ModuleEntitlementsTab /></CardContent></Card></TabsContent>
          <TabsContent value="actions"><Card><CardContent className="pt-6"><ActionEntitlementsTab /></CardContent></Card></TabsContent>
          <TabsContent value="registries"><Card><CardContent className="pt-6"><RegistriesTab /></CardContent></Card></TabsContent>
          <TabsContent value="audit"><Card><CardContent className="pt-6"><AuditTab /></CardContent></Card></TabsContent>
          <TabsContent value="telemetry"><Card><CardContent className="pt-6"><TelemetryTab /></CardContent></Card></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}