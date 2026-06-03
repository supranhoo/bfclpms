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
import { useState } from 'react';
import { Building2, Boxes, KeyRound, ShieldCheck, ScrollText, Layers, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

const PAGE_SIZE = 50;
const AUDIT_EVENT_TYPES = ['grant', 'revoke', 'update', 'would_deny', 'admin_view'] as const;

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
  const flag = useQuery({
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
  const clients = useRows<{ client_key: string; display_name: string; deployment_mode: string; is_active: boolean }>('clients', 'client_key');

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Master switch</CardTitle>
          <CardDescription>Hub Platform Settings shell</CardDescription>
        </CardHeader>
        <CardContent>
          <Badge variant={String(flag.data) === '"true"' || flag.data === true ? 'default' : 'secondary'}>
            {String(flag.data) === '"true"' || flag.data === true ? 'ENABLED' : 'DISABLED'}
          </Badge>
          <p className="mt-3 text-sm text-muted-foreground">
            When disabled, this page is hidden and the entitlement resolver returns allow-all — PMS behavior is identical to pre-Phase-1.
          </p>
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

function ClientsTab() {
  const { data, isLoading } = useRows<Record<string, unknown>>('clients', 'client_key');
  if (isLoading) return <LoadingRows />;
  return (
    <SearchableTable
      rows={data ?? []}
      searchKeys={['client_key', 'display_name'] as never}
      columns={[
        { key: 'client_key' as never, label: 'Key' },
        { key: 'display_name' as never, label: 'Name' },
        { key: 'deployment_mode' as never, label: 'Mode', render: (v) => <Badge variant="outline">{String(v)}</Badge> },
        { key: 'is_active' as never, label: 'Active', render: (v) => v ? '✓' : '—' },
        { key: 'entitlement_source' as never, label: 'Source' },
      ]}
    />
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

function AuditTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['platform-settings', 'audit'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entitlement_audit')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);
      if (error) throw error;
      return data ?? [];
    },
  });
  if (isLoading) return <LoadingRows />;
  return (
    <SearchableTable
      rows={(data ?? []) as Array<Record<string, unknown>>}
      searchKeys={['event_type', 'entity_type', 'entity_key'] as never}
      columns={[
        { key: 'created_at' as never, label: 'When', render: (v) => new Date(String(v)).toLocaleString() },
        { key: 'event_type' as never, label: 'Event', render: (v) => <Badge variant="outline">{String(v)}</Badge> },
        { key: 'entity_type' as never, label: 'Entity' },
        { key: 'entity_key' as never, label: 'Key' },
        { key: 'reason' as never, label: 'Reason' },
      ]}
    />
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
            Hub-level configuration. Phase 1: read-only / observe mode. No PMS behavior changes from this screen.
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
          </TabsList>
          <TabsContent value="overview"><OverviewTab /></TabsContent>
          <TabsContent value="clients"><Card><CardContent className="pt-6"><ClientsTab /></CardContent></Card></TabsContent>
          <TabsContent value="modules"><Card><CardContent className="pt-6"><ModuleEntitlementsTab /></CardContent></Card></TabsContent>
          <TabsContent value="actions"><Card><CardContent className="pt-6"><ActionEntitlementsTab /></CardContent></Card></TabsContent>
          <TabsContent value="registries"><Card><CardContent className="pt-6"><RegistriesTab /></CardContent></Card></TabsContent>
          <TabsContent value="audit"><Card><CardContent className="pt-6"><AuditTab /></CardContent></Card></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}