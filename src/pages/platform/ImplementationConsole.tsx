import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Building2, Globe, Mail, Send, FileText, CheckSquare, ScrollText, UserCog } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MinimalHeader } from '@/components/layout/MinimalHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

type Client = { id: string; client_key: string; display_name: string; is_active: boolean };

async function writeAudit(opts: {
  actorId: string | undefined;
  clientId: string;
  clientKey: string;
  entityType: string;
  /** Logical action — recorded in `reason` to stay within the entitlement_audit event_type CHECK constraint. */
  action: 'update' | 'secret_rotate' | 'checklist_check' | 'test_email_send';
  before: unknown;
  after: unknown;
}) {
  await supabase.from('entitlement_audit').insert({
    actor_id: opts.actorId,
    event_type: 'update',
    entity_type: opts.entityType,
    entity_key: opts.clientKey,
    client_id: opts.clientId,
    before: opts.before as any,
    after: opts.after as any,
    reason: `impl_console_${opts.action}_${opts.entityType}`,
  });
}

export default function ImplementationConsole() {
  const { user, hasRole } = useAuth();
  const isOwner = hasRole('platform_owner');

  // Load clients visible to me (platform_owner = all; implementation_admin = assigned only via RLS join)
  const { data: clients, isLoading } = useQuery({
    queryKey: ['impl-console', 'clients', user?.id, isOwner],
    queryFn: async () => {
      if (isOwner) {
        const { data, error } = await supabase
          .from('clients')
          .select('id, client_key, display_name, is_active')
          .order('display_name');
        if (error) throw error;
        return data as Client[];
      }
      const { data, error } = await supabase
        .from('client_implementer_assignments')
        .select('client_id, clients!inner(id, client_key, display_name, is_active)')
        .eq('user_id', user!.id);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.clients).filter(Boolean) as Client[];
    },
    enabled: !!user?.id,
  });

  const [activeClientId, setActiveClientId] = useState<string | undefined>();
  const activeClient = useMemo(
    () => clients?.find((c) => c.id === (activeClientId ?? clients?.[0]?.id)),
    [clients, activeClientId],
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <MinimalHeader />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Implementation Console</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Scoped client setup for the implementation team. Platform-level controls remain in Platform Settings.
            </p>
          </div>
          <div className="min-w-[240px]">
            <Label className="text-xs text-muted-foreground">Active client</Label>
            <Select value={activeClient?.id} onValueChange={setActiveClientId}>
              <SelectTrigger><SelectValue placeholder="Pick a client" /></SelectTrigger>
              <SelectContent>
                {(clients ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.display_name} <span className="text-muted-foreground ml-1">({c.client_key})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {(clients ?? []).length === 0 && (
          <Alert><AlertDescription>You have no clients assigned yet. Ask a platform owner to assign you in Platform Settings → Clients → Implementers.</AlertDescription></Alert>
        )}

        {activeClient && (
          <Tabs defaultValue="profile" className="space-y-4">
            <TabsList className="flex-wrap h-auto gap-1">
              <TabsTrigger value="assigned"><UserCog className="h-4 w-4 mr-1" />Assigned Clients</TabsTrigger>
              <TabsTrigger value="profile"><Building2 className="h-4 w-4 mr-1" />Profile</TabsTrigger>
              <TabsTrigger value="urls"><Globe className="h-4 w-4 mr-1" />URLs &amp; Domains</TabsTrigger>
              <TabsTrigger value="comms"><Mail className="h-4 w-4 mr-1" />Communications</TabsTrigger>
              <TabsTrigger value="sender"><Send className="h-4 w-4 mr-1" />Sender Identity</TabsTrigger>
              <TabsTrigger value="test"><Send className="h-4 w-4 mr-1" />Test Email</TabsTrigger>
              <TabsTrigger value="templates"><FileText className="h-4 w-4 mr-1" />Notification Templates</TabsTrigger>
              <TabsTrigger value="checklist"><CheckSquare className="h-4 w-4 mr-1" />Setup Checklist</TabsTrigger>
              <TabsTrigger value="logs"><ScrollText className="h-4 w-4 mr-1" />Delivery Logs</TabsTrigger>
            </TabsList>

            <TabsContent value="assigned"><AssignedClientsTab clients={clients ?? []} /></TabsContent>
            <TabsContent value="profile"><ProfileTab client={activeClient} actorId={user?.id} /></TabsContent>
            <TabsContent value="urls"><Placeholder title="URLs &amp; Domains" hint="Activates after the Client URL/Domain Binding phase ships its config table." /></TabsContent>
            <TabsContent value="comms"><Placeholder title="Communications" hint="Activates after the Communications foundation phase ships its config table." /></TabsContent>
            <TabsContent value="sender"><SenderIdentityTab client={activeClient} actorId={user?.id} /></TabsContent>
            <TabsContent value="test"><Placeholder title="Test Email" hint="Activates after the per-client SMTP secret rotation edge function is enabled in the next phase." /></TabsContent>
            <TabsContent value="templates"><Placeholder title="Notification Templates" hint="Activates after the Communications foundation phase ships per-client templates." /></TabsContent>
            <TabsContent value="checklist"><ChecklistTab client={activeClient} actorId={user?.id} /></TabsContent>
            <TabsContent value="logs"><Placeholder title="Delivery Logs" hint="Activates after per-client email dispatching is wired in the Communications foundation phase." /></TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}

function Placeholder({ title, hint }: { title: string; hint: string }) {
  return (
    <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent>
      <p className="text-sm text-muted-foreground">{hint}</p>
    </CardContent></Card>
  );
}

function AssignedClientsTab({ clients }: { clients: Client[] }) {
  return (
    <Card><CardHeader><CardTitle>Assigned Clients ({clients.length})</CardTitle></CardHeader><CardContent>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {clients.map((c) => (
          <div key={c.id} className="border rounded-lg p-3">
            <div className="font-medium">{c.display_name}</div>
            <div className="text-xs text-muted-foreground">{c.client_key}</div>
            <Badge variant={c.is_active ? 'default' : 'secondary'} className="mt-2">
              {c.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        ))}
      </div>
    </CardContent></Card>
  );
}

function ProfileTab({ client, actorId }: { client: Client; actorId?: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState(client.display_name);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim() || name === client.display_name) return;
    setSaving(true);
    try {
      const before = { display_name: client.display_name };
      const { error } = await supabase.from('clients').update({ display_name: name.trim() }).eq('id', client.id);
      if (error) throw error;
      await writeAudit({ actorId, clientId: client.id, clientKey: client.client_key, entityType: 'client', action: 'update', before, after: { display_name: name.trim() } });
      toast({ title: 'Saved', description: 'Display name updated.' });
      qc.invalidateQueries({ queryKey: ['impl-console', 'clients'] });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <Card><CardHeader><CardTitle>Client Profile</CardTitle></CardHeader><CardContent className="space-y-4">
      <div>
        <Label>Display Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid sm:grid-cols-2 gap-4 text-sm text-muted-foreground">
        <div><Label className="text-xs">Client key (immutable)</Label><div className="font-mono">{client.client_key}</div></div>
        <div><Label className="text-xs">Status (platform-owner only)</Label><div>{client.is_active ? 'Active' : 'Inactive'}</div></div>
      </div>
      <Button onClick={save} disabled={saving || name === client.display_name || !name.trim()}>{saving ? 'Saving…' : 'Save'}</Button>
    </CardContent></Card>
  );
}

function SenderIdentityTab({ client, actorId }: { client: Client; actorId?: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ['impl-console', 'smtp', client.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_smtp_config')
        .select('client_id, from_name, from_email, reply_to, provider, smtp_host, smtp_port, smtp_username, secret_set_at, secret_fingerprint, updated_at')
        .eq('client_id', client.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState<any>({});
  const merged = { ...(data ?? {}), ...form };
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const payload: any = {
        client_id: client.id,
        from_name: merged.from_name ?? null,
        from_email: merged.from_email ?? null,
        reply_to: merged.reply_to ?? null,
        provider: merged.provider ?? null,
        smtp_host: merged.smtp_host ?? null,
        smtp_port: merged.smtp_port ? Number(merged.smtp_port) : null,
        smtp_username: merged.smtp_username ?? null,
        updated_by: actorId,
      };
      const { error } = await supabase.from('client_smtp_config').upsert(payload, { onConflict: 'client_id' });
      if (error) throw error;
      await writeAudit({ actorId, clientId: client.id, clientKey: client.client_key, entityType: 'client_smtp', action: 'update', before: data ?? {}, after: payload });
      toast({ title: 'Saved', description: 'Sender identity updated.' });
      qc.invalidateQueries({ queryKey: ['impl-console', 'smtp', client.id] });
      setForm({});
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  if (isLoading) return <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>;

  return (
    <Card><CardHeader><CardTitle>Sender Identity</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div><Label>From name</Label><Input value={merged.from_name ?? ''} onChange={(e) => setForm({ ...form, from_name: e.target.value })} /></div>
        <div><Label>From email</Label><Input value={merged.from_email ?? ''} onChange={(e) => setForm({ ...form, from_email: e.target.value })} placeholder="notify@your-domain.com" /></div>
        <div><Label>Reply-to</Label><Input value={merged.reply_to ?? ''} onChange={(e) => setForm({ ...form, reply_to: e.target.value })} /></div>
        <div>
          <Label>Provider</Label>
          <Select value={merged.provider ?? ''} onValueChange={(v) => setForm({ ...form, provider: v })}>
            <SelectTrigger><SelectValue placeholder="Choose provider" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="lovable">Lovable</SelectItem>
              <SelectItem value="smtp">SMTP</SelectItem>
              <SelectItem value="resend">Resend</SelectItem>
              <SelectItem value="sendgrid">SendGrid</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>SMTP host</Label><Input value={merged.smtp_host ?? ''} onChange={(e) => setForm({ ...form, smtp_host: e.target.value })} /></div>
        <div><Label>SMTP port</Label><Input type="number" value={merged.smtp_port ?? ''} onChange={(e) => setForm({ ...form, smtp_port: e.target.value })} /></div>
        <div><Label>SMTP username</Label><Input value={merged.smtp_username ?? ''} onChange={(e) => setForm({ ...form, smtp_username: e.target.value })} /></div>
      </div>
      <div className="rounded-md border p-3 bg-muted/30 text-sm">
        <div className="font-medium mb-1">SMTP / API Secret</div>
        <div className="text-muted-foreground">
          {data?.secret_set_at ? (
            <>Last rotated {formatDistanceToNow(new Date(data.secret_set_at))} ago · fingerprint ••••{data?.secret_fingerprint ?? '----'}</>
          ) : (
            <>Not set</>
          )}
          <div className="mt-1 text-xs">Secrets are write-only and never displayed. Rotation is handled by an edge function planned in the next phase.</div>
        </div>
      </div>
      <Button onClick={save} disabled={saving || Object.keys(form).length === 0}>{saving ? 'Saving…' : 'Save'}</Button>
    </CardContent></Card>
  );
}

function ChecklistTab({ client, actorId }: { client: Client; actorId?: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ['impl-console', 'checklist', client.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_setup_checklist')
        .select('id, item_key, item_label, done, done_at, notes, sort_order')
        .eq('client_id', client.id).order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  const toggle = async (row: any, next: boolean) => {
    try {
      const { error } = await supabase
        .from('client_setup_checklist')
        .update({ done: next, done_by: next ? actorId : null, done_at: next ? new Date().toISOString() : null })
        .eq('id', row.id);
      if (error) throw error;
      await writeAudit({ actorId, clientId: client.id, clientKey: client.client_key, entityType: 'client_setup_checklist', action: 'checklist_check', before: { item_key: row.item_key, done: row.done }, after: { item_key: row.item_key, done: next } });
      qc.invalidateQueries({ queryKey: ['impl-console', 'checklist', client.id] });
    } catch (e: any) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    }
  };

  if (isLoading) return <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>;

  const total = data?.length ?? 0;
  const done = data?.filter((r) => r.done).length ?? 0;

  return (
    <Card><CardHeader><CardTitle>Setup Checklist ({done}/{total})</CardTitle></CardHeader><CardContent>
      <ul className="divide-y">
        {(data ?? []).map((row) => (
          <li key={row.id} className="py-2 flex items-start gap-3">
            <Checkbox checked={!!row.done} onCheckedChange={(v) => toggle(row, !!v)} className="mt-1" />
            <div className="flex-1">
              <div className={row.done ? 'line-through text-muted-foreground' : ''}>{row.item_label}</div>
              {row.done && row.done_at && (
                <div className="text-xs text-muted-foreground">Completed {formatDistanceToNow(new Date(row.done_at))} ago</div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </CardContent></Card>
  );
}