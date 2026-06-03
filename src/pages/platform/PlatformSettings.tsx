import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MinimalHeader } from '@/components/layout/MinimalHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useState } from 'react';
import { Building2, Boxes, KeyRound, ShieldCheck, ScrollText, Layers } from 'lucide-react';

const PAGE_SIZE = 50;

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

function ModuleEntitlementsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['platform-settings', 'cme-joined'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_module_entitlements')
        .select('id, module_key, is_enabled, valid_from, valid_until, clients(client_key, display_name)')
        .limit(PAGE_SIZE);
      if (error) throw error;
      type Row = { id: string; module_key: string; is_enabled: boolean; valid_from: string | null; valid_until: string | null; clients: { client_key: string; display_name: string } | null };
      return (data ?? []).map((r: Row) => ({
        ...r,
        client_key: r.clients?.client_key ?? '—',
        client_name: r.clients?.display_name ?? '—',
      }));
    },
  });
  if (isLoading) return <LoadingRows />;
  return (
    <SearchableTable
      rows={(data ?? []) as Array<Record<string, unknown>>}
      searchKeys={['client_key', 'module_key'] as never}
      columns={[
        { key: 'client_name' as never, label: 'Client' },
        { key: 'module_key' as never, label: 'Module' },
        { key: 'is_enabled' as never, label: 'Enabled', render: (v) => v ? <Badge>ON</Badge> : <Badge variant="secondary">OFF</Badge> },
        { key: 'valid_from' as never, label: 'Valid from' },
        { key: 'valid_until' as never, label: 'Valid until' },
      ]}
    />
  );
}

function ActionEntitlementsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['platform-settings', 'cae-joined'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_action_entitlements')
        .select('id, action_key, is_enabled, clients(client_key), action_registry(label, risk_level, module_key)')
        .limit(500);
      if (error) throw error;
      type Row = { id: string; action_key: string; is_enabled: boolean; clients: { client_key: string } | null; action_registry: { label: string; risk_level: string; module_key: string } | null };
      return (data ?? []).map((r: Row) => ({
        ...r,
        client_key: r.clients?.client_key ?? '—',
        label: r.action_registry?.label ?? r.action_key,
        module_key: r.action_registry?.module_key ?? '—',
        risk_level: r.action_registry?.risk_level ?? '—',
      }));
    },
  });
  if (isLoading) return <LoadingRows />;
  return (
    <SearchableTable
      rows={(data ?? []) as Array<Record<string, unknown>>}
      searchKeys={['action_key', 'label', 'module_key', 'client_key'] as never}
      columns={[
        { key: 'client_key' as never, label: 'Client' },
        { key: 'module_key' as never, label: 'Module' },
        { key: 'action_key' as never, label: 'Action key' },
        { key: 'label' as never, label: 'Label' },
        { key: 'risk_level' as never, label: 'Risk', render: (v) => <Badge variant="outline">{String(v)}</Badge> },
        { key: 'is_enabled' as never, label: 'Enabled', render: (v) => v ? <Badge>ON</Badge> : <Badge variant="secondary">OFF</Badge> },
      ]}
    />
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