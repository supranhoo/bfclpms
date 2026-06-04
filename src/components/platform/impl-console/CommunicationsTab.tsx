import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, ExternalLink, Archive, Star, ShieldCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';

type Client = { id: string; client_key: string; display_name: string; is_active: boolean };

type Contact = {
  id: string;
  client_id: string;
  role: string;
  email: string;
  display_name: string | null;
  is_primary_for_role: boolean;
  verified: boolean;
  verified_at: string | null;
  notes: string | null;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

const ROLES = [
  { value: 'support', label: 'Support' },
  { value: 'hr', label: 'HR' },
  { value: 'escalation', label: 'Escalation' },
  { value: 'billing', label: 'Billing' },
  { value: 'ops', label: 'Ops' },
  { value: 'other', label: 'Other' },
] as const;

function normalizeEmail(raw: string): { ok: true; email: string } | { ok: false; reason: string } {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return { ok: false as const, reason: 'Email is required.' };
  if (/[\s\u0000-\u001f]/.test(trimmed)) return { ok: false as const, reason: 'Email may not contain spaces or control characters.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return { ok: false as const, reason: 'Invalid email format.' };
  return { ok: true as const, email: trimmed };
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${(local[0] ?? '*')}***@${domain}`;
}

async function emailAuditFields(email: string) {
  const domain = email.split('@')[1] ?? '';
  const hash = (await sha256Hex(email)).slice(0, 16);
  return { email_domain: domain, email_hash: hash, email_masked: maskEmail(email) };
}

async function writeContactAudit(opts: {
  actorId?: string;
  clientId: string;
  clientKey: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
}) {
  await supabase.from('entitlement_audit').insert({
    actor_id: opts.actorId,
    event_type: 'update',
    entity_type: 'client_contact',
    entity_key: opts.clientKey,
    client_id: opts.clientId,
    before: opts.before as any,
    after: opts.after as any,
    reason: 'impl_console_update_client_contact',
  });
}

async function tickSupportEmailsChecklist(client: Client) {
  const { data: row } = await supabase
    .from('client_setup_checklist')
    .select('id, done')
    .eq('client_id', client.id).eq('item_key', 'support_emails').maybeSingle();
  if (!row || row.done) return;
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('client_setup_checklist').update({
    done: true, done_by: user?.id ?? null, done_at: new Date().toISOString(),
  }).eq('id', row.id);
  await supabase.from('entitlement_audit').insert({
    actor_id: user?.id, event_type: 'update',
    entity_type: 'client_setup_checklist', entity_key: client.client_key, client_id: client.id,
    before: { item_key: 'support_emails', done: false }, after: { item_key: 'support_emails', done: true, auto: true },
    reason: 'impl_console_checklist_check_client_setup_checklist',
  });
}

export function CommunicationsTab({ client, actorId }: { client: Client; actorId?: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState<Contact | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['impl-console', 'contacts', client.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_contacts')
        .select('*')
        .eq('client_id', client.id)
        .order('is_active', { ascending: false })
        .order('role')
        .order('is_primary_for_role', { ascending: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Contact[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['impl-console', 'contacts', client.id] });

  const maybeTickSupport = async () => {
    const { data: rows } = await supabase.from('client_contacts').select('role, is_active, verified').eq('client_id', client.id);
    const hasVerifiedSupport = (rows ?? []).some((r: any) => r.role === 'support' && r.is_active && r.verified);
    if (hasVerifiedSupport) await tickSupportEmailsChecklist(client);
  };

  const setPrimary = async (row: Contact) => {
    try {
      const { error } = await supabase.rpc('impl_console_set_primary_contact', { _contact_id: row.id });
      if (error) throw error;
      const fields = await emailAuditFields(row.email);
      await writeContactAudit({
        actorId, clientId: client.id, clientKey: client.client_key,
        before: { id: row.id, role: row.role, is_primary_for_role: row.is_primary_for_role },
        after: { id: row.id, role: row.role, is_primary_for_role: true, set_primary: true, ...fields },
      });
      toast({ title: 'Primary contact updated' });
      refresh();
    } catch (e: any) {
      toast({ title: 'Could not set primary', description: e.message, variant: 'destructive' });
    }
  };

  const toggleVerified = async (row: Contact) => {
    try {
      const next = !row.verified;
      const { error } = await supabase.from('client_contacts').update({
        verified: next,
        verified_by: next ? actorId : null,
        verified_at: next ? new Date().toISOString() : null,
        updated_by: actorId,
      }).eq('id', row.id);
      if (error) throw error;
      const fields = await emailAuditFields(row.email);
      await writeContactAudit({
        actorId, clientId: client.id, clientKey: client.client_key,
        before: { id: row.id, role: row.role, verified: row.verified },
        after: { id: row.id, role: row.role, verified: next, ...fields },
      });
      toast({ title: next ? 'Marked verified' : 'Verification cleared' });
      refresh();
      qc.invalidateQueries({ queryKey: ['impl-console', 'checklist', client.id] });
      if (next) void maybeTickSupport();
    } catch (e: any) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    }
  };

  const doArchive = async (row: Contact) => {
    try {
      const { error } = await supabase.rpc('impl_console_archive_contact', { _contact_id: row.id });
      if (error) throw error;
      const fields = await emailAuditFields(row.email);
      await writeContactAudit({
        actorId, clientId: client.id, clientKey: client.client_key,
        before: { id: row.id, role: row.role, is_active: true, is_primary_for_role: row.is_primary_for_role },
        after: { id: row.id, role: row.role, is_active: false, archived: true, ...fields },
      });
      toast({ title: 'Contact archived' });
      setConfirmArchive(null);
      refresh();
    } catch (e: any) {
      toast({ title: 'Archive failed', description: e.message, variant: 'destructive' });
    }
  };

  if (isLoading) return <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>;

  const active = (data ?? []).filter((r) => r.is_active);
  const archived = (data ?? []).filter((r) => !r.is_active);
  const filtered = roleFilter === 'all' ? active : active.filter((r) => r.role === roleFilter);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle>Communications — Client Contacts</CardTitle>
        <Button size="sm" onClick={() => setShowAdd(true)}>Add contact</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription className="text-xs">
            Manual verification only — no SMTP probe is performed. Verified means an implementer confirmed the mailbox is monitored. Addresses here will be used by future notification templates and dispatch.
          </AlertDescription>
        </Alert>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Filter by role:</span>
          {[{ value: 'all', label: 'All' }, ...ROLES].map((r) => (
            <Button key={r.value} size="sm" variant={roleFilter === r.value ? 'default' : 'outline'} onClick={() => setRoleFilter(r.value)}>
              {r.label}
            </Button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            {active.length === 0 ? 'No contacts registered yet. Add at least one Support address.' : 'No contacts match this filter.'}
          </div>
        ) : (
          <div className="border rounded-md divide-y">
            {filtered.map((row) => (
              <div key={row.id} className="p-3 flex items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-[240px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <a href={`mailto:${row.email}`} className="font-mono text-sm hover:underline break-all">{row.email}</a>
                    <a href={`mailto:${row.email}`} className="text-muted-foreground hover:text-foreground" aria-label="Open mailto"><ExternalLink className="h-3.5 w-3.5" /></a>
                    <Badge variant="outline">{ROLES.find((r) => r.value === row.role)?.label ?? row.role}</Badge>
                    {row.is_primary_for_role && <Badge>Primary</Badge>}
                    {row.verified ? <Badge variant="secondary"><ShieldCheck className="h-3 w-3 mr-1" />Verified</Badge> : <Badge variant="outline">Unverified</Badge>}
                  </div>
                  {row.display_name && <div className="text-xs text-muted-foreground mt-1">{row.display_name}</div>}
                  {row.notes && <div className="text-xs text-muted-foreground mt-1 italic">{row.notes}</div>}
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {!row.is_primary_for_role && (
                    <Button size="sm" variant="outline" onClick={() => setPrimary(row)} title="Set as primary for this role">
                      <Star className="h-3.5 w-3.5 mr-1" />Set primary
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => toggleVerified(row)}>
                    {row.verified ? 'Unverify' : 'Mark verified'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmArchive(row)} title="Archive (no hard delete)">
                    <Archive className="h-3.5 w-3.5 mr-1" />Archive
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {archived.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground mt-4 mb-1">Archived ({archived.length})</div>
            <div className="border rounded-md divide-y">
              {archived.map((row) => (
                <div key={row.id} className="p-3 flex items-center gap-3 opacity-70">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs break-all">{row.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {ROLES.find((r) => r.value === row.role)?.label ?? row.role}
                      {' · '}Archived {row.archived_at ? `${formatDistanceToNow(new Date(row.archived_at))} ago` : ''}
                    </div>
                  </div>
                  <Badge variant="outline">Archived</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        <AddContactDialog
          open={showAdd}
          onOpenChange={setShowAdd}
          client={client}
          actorId={actorId}
          onCreated={async () => { refresh(); await maybeTickSupport(); qc.invalidateQueries({ queryKey: ['impl-console', 'checklist', client.id] }); }}
        />

        <ConfirmDestructiveDialog
          open={!!confirmArchive}
          onCancel={() => setConfirmArchive(null)}
          onConfirm={() => confirmArchive && doArchive(confirmArchive)}
          title="Archive this contact?"
          description="This will archive the contact, not delete it. Historical audit/config remains available."
          confirmLabel="Archive"
        />
      </CardContent>
    </Card>
  );
}

function AddContactDialog({
  open, onOpenChange, client, actorId, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  client: Client;
  actorId?: string;
  onCreated: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<string>('support');
  const [notes, setNotes] = useState('');
  const [makePrimary, setMakePrimary] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = () => { setEmail(''); setDisplayName(''); setRole('support'); setNotes(''); setMakePrimary(false); };

  const submit = async () => {
    const norm = normalizeEmail(email);
    if (norm.ok !== true) {
      const reason = (norm as { ok: false; reason: string }).reason;
      toast({ title: 'Invalid email', description: reason, variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const { data: inserted, error } = await supabase.from('client_contacts').insert({
        client_id: client.id,
        role,
        email: norm.email,
        display_name: displayName.trim() || null,
        notes: notes.trim() || null,
        is_primary_for_role: false,
        created_by: actorId,
        updated_by: actorId,
      }).select().single();
      if (error) throw error;

      const fields = await emailAuditFields(norm.email);
      await writeContactAudit({
        actorId, clientId: client.id, clientKey: client.client_key,
        before: null,
        after: { id: inserted.id, role, created: true, ...fields },
      });

      if (makePrimary) {
        const { error: rpcErr } = await supabase.rpc('impl_console_set_primary_contact', { _contact_id: inserted.id });
        if (rpcErr) throw rpcErr;
        await writeContactAudit({
          actorId, clientId: client.id, clientKey: client.client_key,
          before: { id: inserted.id, role, is_primary_for_role: false },
          after: { id: inserted.id, role, is_primary_for_role: true, set_primary: true, ...fields },
        });
      }

      toast({ title: 'Contact added' });
      reset();
      onOpenChange(false);
      await onCreated();
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      toast({ title: 'Add failed', description: /duplicate key/i.test(msg) ? 'This email is already registered for this role.' : msg, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add client contact</DialogTitle>
          <DialogDescription>
            Register a role-tagged mailbox for {client.display_name}. Contacts are never hard-deleted — archive instead.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="support@client.com" />
          </div>
          <div>
            <Label>Display name <span className="text-xs text-muted-foreground">(optional)</span></Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Client Support Desk" />
          </div>
          <div>
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes <span className="text-xs text-muted-foreground">(optional)</span></Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Context for support" />
            <div className="text-xs text-muted-foreground mt-1">Do not enter passwords, tokens, or secrets in notes.</div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={makePrimary} onCheckedChange={(v) => setMakePrimary(!!v)} />
            Mark as primary for this role <span className="text-xs text-muted-foreground">(auto-replaces any existing primary in the same role)</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !email.trim()}>{busy ? 'Adding…' : 'Add contact'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}