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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';

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
            <TabsContent value="test"><TestEmailTab client={activeClient} actorId={user?.id} /></TabsContent>
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
            <>Last rotated {formatDistanceToNow(new Date(data.secret_set_at))} ago · fingerprint <span className="font-mono">{data?.secret_fingerprint ?? '--------'}</span></>
          ) : (
            <>Not set</>
          )}
          <div className="mt-1 text-xs">Secrets are write-only and never displayed. Use Replace secret to rotate.</div>
        </div>
        <div className="mt-3">
          <RotateSecretButton client={client} disabled={!merged.provider || merged.provider === 'lovable'} onDone={() => qc.invalidateQueries({ queryKey: ['impl-console', 'smtp', client.id] })} />
          {merged.provider === 'lovable' && (
            <div className="text-xs text-muted-foreground mt-2">Lovable provider uses the platform-managed key; no per-client secret needed.</div>
          )}
        </div>
      </div>
      <Button onClick={save} disabled={saving || Object.keys(form).length === 0}>{saving ? 'Saving…' : 'Save'}</Button>
    </CardContent></Card>
  );
}

function RotateSecretButton({ client, disabled, onDone }: { client: Client; disabled?: boolean; onDone: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (confirm !== 'ROTATE' || secret.length < 8) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('impl-console-rotate-smtp-secret', {
        body: { client_id: client.id, secret },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: 'Secret rotated', description: 'Stored securely; never displayed.' });
      // Auto-tick checklist item
      await tickChecklist(client, 'smtp_secret');
      qc.invalidateQueries({ queryKey: ['impl-console', 'checklist', client.id] });
      onDone();
      setOpen(false); setSecret(''); setConfirm('');
    } catch (e: any) {
      toast({ title: 'Rotate failed', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <>
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => setOpen(true)}>Replace secret</Button>
      <Dialog open={open} onOpenChange={(v) => { if (!busy) setOpen(v); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace SMTP / API secret</DialogTitle>
            <DialogDescription>
              The previous secret is overwritten. The new value is stored encrypted and never displayed again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>New secret</Label>
              <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="new-password" />
            </div>
            <div>
              <Label>Type <span className="font-mono">ROTATE</span> to confirm</Label>
              <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy || confirm !== 'ROTATE' || secret.length < 8}>{busy ? 'Rotating…' : 'Rotate'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

async function tickChecklist(client: Client, item_key: string) {
  const { data: row } = await supabase
    .from('client_setup_checklist')
    .select('id, done')
    .eq('client_id', client.id).eq('item_key', item_key).maybeSingle();
  if (!row || row.done) return;
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('client_setup_checklist').update({
    done: true, done_by: user?.id ?? null, done_at: new Date().toISOString(),
  }).eq('id', row.id);
  await supabase.from('entitlement_audit').insert({
    actor_id: user?.id, event_type: 'update',
    entity_type: 'client_setup_checklist', entity_key: client.client_key, client_id: client.id,
    before: { item_key, done: false }, after: { item_key, done: true, auto: true },
    reason: 'impl_console_checklist_check_client_setup_checklist',
  });
}

function TestEmailTab({ client, actorId }: { client: Client; actorId?: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: smtp } = useQuery({
    queryKey: ['impl-console', 'smtp', client.id],
    queryFn: async () => {
      const { data } = await supabase.from('client_smtp_config')
        .select('from_email, provider, secret_set_at')
        .eq('client_id', client.id).maybeSingle();
      return data;
    },
  });

  // Current-hour usage
  const bucketHour = useMemo(() => {
    const d = new Date(); d.setMinutes(0, 0, 0); return d.toISOString();
  }, []);
  const { data: bucket, refetch: refetchBucket } = useQuery({
    queryKey: ['impl-console', 'rate', client.id, bucketHour, actorId],
    queryFn: async () => {
      const { data } = await supabase.from('impl_console_rate_buckets')
        .select('count')
        .eq('actor_id', actorId!).eq('client_id', client.id)
        .eq('action', 'test_email_send').eq('bucket_hour', bucketHour)
        .maybeSingle();
      return data?.count ?? 0;
    },
    enabled: !!actorId,
  });

  const { data: recent, refetch: refetchRecent } = useQuery({
    queryKey: ['impl-console', 'test-history', client.client_key],
    queryFn: async () => {
      const { data } = await supabase.from('entitlement_audit')
        .select('id, created_at, after, actor_id')
        .eq('entity_type', 'client_smtp')
        .eq('entity_key', client.client_key)
        .eq('reason', 'impl_console_test_email_send_client_smtp')
        .order('created_at', { ascending: false }).limit(5);
      return data ?? [];
    },
  });

  const senderReady = !!smtp?.from_email && !!smtp?.provider && (smtp.provider === 'lovable' || !!smtp.secret_set_at);
  const limitReached = (bucket ?? 0) >= 10;

  const send = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      toast({ title: 'Invalid email', variant: 'destructive' }); return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('impl-console-send-test-email', {
        body: { client_id: client.id, to_email: to },
      });
      if (error) throw error;
      const resp = data as any;
      if (resp?.error === 'rate_limited') {
        toast({ title: 'Rate limit reached', description: `Try again in ~${Math.ceil(resp.retry_after_seconds / 60)} min.`, variant: 'destructive' });
      } else if (resp?.error === 'recipient_not_allowed') {
        toast({ title: 'Recipient not allowed', description: `Only addresses on @${resp.allowed_domain} or your own login email are permitted.`, variant: 'destructive' });
      } else if (resp?.ok) {
        toast({ title: 'Test email sent', description: `Used ${resp.used}/${resp.limit} this hour.` });
        await tickChecklist(client, 'test_email');
        qc.invalidateQueries({ queryKey: ['impl-console', 'checklist', client.id] });
      } else if (resp?.error) {
        toast({ title: 'Send failed', description: resp.error, variant: 'destructive' });
      }
      refetchBucket(); refetchRecent();
    } catch (e: any) {
      toast({ title: 'Send failed', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Test Email</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {!senderReady && (
          <Alert><AlertDescription>Set up Sender Identity (and rotate the secret) before sending a test.</AlertDescription></Alert>
        )}
        <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-end">
          <div>
            <Label>Send test to</Label>
            <Input type="email" placeholder="you@example.com" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button onClick={send} disabled={busy || !senderReady || limitReached || !to}>
            {busy ? 'Sending…' : limitReached ? 'Rate limit reached' : 'Send test'}
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">Used {bucket ?? 0}/10 this hour. Limit resets at the top of the hour.</div>

        <div>
          <div className="font-medium text-sm mb-2">Recent tests</div>
          {(recent ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">No tests yet.</div>
          ) : (
            <ul className="divide-y text-sm">
              {(recent ?? []).map((r: any) => (
                <li key={r.id} className="py-2 flex items-center justify-between">
                  <div>
                    <span className="font-mono">{r.after?.recipient_masked ?? '***'}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{r.after?.provider}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={r.after?.success ? 'default' : 'destructive'}>{r.after?.success ? 'sent' : 'failed'}</Badge>
                    <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(r.created_at))} ago</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
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