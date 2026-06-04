import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Archive, Eye, Plus, Pencil } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';

type Client = { id: string; client_key: string; display_name: string; is_active: boolean };

type Template = {
  id: string;
  client_id: string;
  template_key: string;
  channel: string;
  subject: string;
  body_text: string;
  body_html: string | null;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

const ALLOWED_VARS = ['client_name', 'client_key', 'actor_email_masked', 'timestamp_utc', 'app_url'] as const;
const KEY_RE = /^[a-z0-9_]{2,64}$/;

function substitute(s: string, vars: Record<string, string>) {
  return s.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (m, k) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m,
  );
}

async function writeTplAudit(opts: {
  actorId?: string;
  clientId: string;
  clientKey: string;
  action: 'create' | 'update' | 'archive';
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}) {
  await supabase.from('entitlement_audit').insert({
    actor_id: opts.actorId,
    event_type: 'update',
    entity_type: 'client_notification_template',
    entity_key: opts.clientKey,
    client_id: opts.clientId,
    before: opts.before as any,
    after: opts.after as any,
    reason: `impl_console_${opts.action}_client_notification_template`,
  });
}

function digest(t: { template_key: string; subject: string; body_text: string; body_html: string | null; is_active: boolean }) {
  // PII-minimized audit payload: only key + lengths + active flag (no raw subject/body).
  return {
    template_key: t.template_key,
    subject_len: t.subject.length,
    body_text_len: t.body_text.length,
    body_html_len: (t.body_html ?? '').length,
    is_active: t.is_active,
  };
}

export function TemplatesTab({ client, actorId }: { client?: Client; actorId?: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [previewing, setPreviewing] = useState<Template | null>(null);
  const [archiving, setArchiving] = useState<Template | null>(null);

  const { data: templates, isLoading } = useQuery({
    queryKey: ['impl-console', 'templates', client?.id],
    queryFn: async () => {
      if (!client) return [] as Template[];
      const { data, error } = await supabase
        .from('client_notification_templates')
        .select('*')
        .eq('client_id', client.id)
        .eq('is_active', true)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Template[];
    },
    enabled: !!client?.id,
  });

  if (!client) return <Alert><AlertDescription>Select a client to manage templates.</AlertDescription></Alert>;
  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  async function doArchive(t: Template) {
    const { error } = await supabase.rpc('impl_console_archive_template', { _id: t.id });
    if (error) {
      toast({ title: 'Archive failed', description: error.message, variant: 'destructive' });
      return;
    }
    await writeTplAudit({
      actorId,
      clientId: client!.id,
      clientKey: client!.client_key,
      action: 'archive',
      before: digest(t),
      after: digest({ ...t, is_active: false }),
    });
    toast({ title: 'Archived', description: `Template "${t.template_key}" archived.` });
    qc.invalidateQueries({ queryKey: ['impl-console', 'templates', client!.id] });
    setArchiving(null);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Notification Templates — {client.display_name}</CardTitle>
        <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1" />Add template</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <Alert>
          <AlertDescription className="text-xs">
            Templates are used only by the Implementation Console Test Email tab. The global PMS notification engine is not affected. Only allowlisted variables are substituted: <code>{ALLOWED_VARS.map(v => `{{${v}}}`).join(', ')}</code>.
          </AlertDescription>
        </Alert>

        {(templates ?? []).length === 0 && (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No templates yet. The Test Email tab will use the default plain body.
          </div>
        )}

        <div className="space-y-2">
          {(templates ?? []).map((t) => (
            <div key={t.id} className="border rounded-md p-3 flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-sm font-mono">{t.template_key}</code>
                  <Badge variant="secondary">{t.channel}</Badge>
                  {t.body_html && <Badge variant="outline">HTML stored</Badge>}
                </div>
                <div className="text-sm mt-1 truncate text-muted-foreground">{t.subject}</div>
                <div className="text-xs text-muted-foreground mt-1">Updated {formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant="ghost" onClick={() => setPreviewing(t)} title="Preview"><Eye className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(t)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => setArchiving(t)} title="Archive"><Archive className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>

      {addOpen && (
        <TemplateDialog
          open
          mode="create"
          client={client}
          actorId={actorId}
          onClose={() => setAddOpen(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['impl-console', 'templates', client.id] })}
        />
      )}
      {editing && (
        <TemplateDialog
          open
          mode="edit"
          client={client}
          actorId={actorId}
          existing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['impl-console', 'templates', client.id] })}
        />
      )}
      {previewing && (
        <PreviewDialog template={previewing} client={client} actorId={actorId} onClose={() => setPreviewing(null)} />
      )}
      {archiving && (
        <ConfirmDestructiveDialog
          open
          onOpenChange={(o) => !o && setArchiving(null)}
          title="Archive template?"
          description={`This will archive "${archiving.template_key}", not delete it. Historical audit remains available. The Test Email tab will fall back to the default body for this key until a new active template is added.`}
          confirmText="Archive"
          onConfirm={() => doArchive(archiving)}
        />
      )}
    </Card>
  );
}

function TemplateDialog({
  open, mode, client, actorId, existing, onClose, onSaved,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  client: Client;
  actorId?: string;
  existing?: Template;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [key, setKey] = useState(existing?.template_key ?? '');
  const [subject, setSubject] = useState(existing?.subject ?? '');
  const [bodyText, setBodyText] = useState(existing?.body_text ?? '');
  const [bodyHtml, setBodyHtml] = useState(existing?.body_html ?? '');
  const [saving, setSaving] = useState(false);

  const insertVar = (target: 'subject' | 'text' | 'html', v: string) => {
    const token = `{{${v}}}`;
    if (target === 'subject') setSubject((s) => s + token);
    if (target === 'text') setBodyText((s) => s + token);
    if (target === 'html') setBodyHtml((s) => s + token);
  };

  async function save() {
    if (!KEY_RE.test(key)) {
      toast({ title: 'Invalid key', description: 'Lowercase letters, digits, underscore. 2–64 chars.', variant: 'destructive' });
      return;
    }
    if (!subject.trim() || subject.length > 200) { toast({ title: 'Subject required (≤200)', variant: 'destructive' }); return; }
    if (!bodyText.trim() || bodyText.length > 20000) { toast({ title: 'Body text required (≤20000)', variant: 'destructive' }); return; }
    if (bodyHtml && bodyHtml.length > 50000) { toast({ title: 'HTML too large (≤50000)', variant: 'destructive' }); return; }

    setSaving(true);
    try {
      if (mode === 'create') {
        const row = {
          client_id: client.id,
          template_key: key,
          channel: 'email',
          subject,
          body_text: bodyText,
          body_html: bodyHtml || null,
          created_by: actorId,
          updated_by: actorId,
        };
        const { data, error } = await supabase.from('client_notification_templates').insert(row).select('*').single();
        if (error) throw error;
        await writeTplAudit({
          actorId, clientId: client.id, clientKey: client.client_key, action: 'create',
          before: null, after: digest(data as Template),
        });
        toast({ title: 'Template created' });
      } else if (existing) {
        const patch = {
          subject,
          body_text: bodyText,
          body_html: bodyHtml || null,
          updated_by: actorId,
        };
        const { data, error } = await supabase.from('client_notification_templates').update(patch).eq('id', existing.id).select('*').single();
        if (error) throw error;
        await writeTplAudit({
          actorId, clientId: client.id, clientKey: client.client_key, action: 'update',
          before: digest(existing), after: digest(data as Template),
        });
        toast({ title: 'Template updated' });
      }
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message ?? 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Add template' : `Edit ${existing?.template_key}`}</DialogTitle>
          <DialogDescription>
            Used only by the Implementation Console Test Email tab. Only allowlisted variables are substituted; unknown tokens are left as-is. HTML is stored but not sent in this phase.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Template key</Label>
            <Input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              disabled={mode === 'edit'}
              placeholder="welcome_test"
            />
            <div className="text-xs text-muted-foreground mt-1">Lowercase, digits, underscore. Unique per client.</div>
          </div>

          <div>
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
            <VarChips onPick={(v) => insertVar('subject', v)} />
          </div>

          <div>
            <Label>Body (plain text)</Label>
            <Textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={8} />
            <VarChips onPick={(v) => insertVar('text', v)} />
          </div>

          <div>
            <Label>Body (HTML — optional, stored only, not sent yet)</Label>
            <Textarea value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} rows={6} className="font-mono text-xs" />
            <div className="text-xs text-muted-foreground mt-1">Allowed variables only. No scripts, iframes, external includes, or event handlers.</div>
            <VarChips onPick={(v) => insertVar('html', v)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VarChips({ onPick }: { onPick: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {ALLOWED_VARS.map((v) => (
        <Button key={v} type="button" variant="outline" size="sm" className="h-6 text-xs"
          onClick={() => onPick(v)}>{`{{${v}}}`}</Button>
      ))}
    </div>
  );
}

function PreviewDialog({ template, client, actorId, onClose }: {
  template: Template; client: Client; actorId?: string; onClose: () => void;
}) {
  const sampleVars = useMemo<Record<string, string>>(() => ({
    client_name: client.display_name ?? '',
    client_key: client.client_key ?? '',
    actor_email_masked: 'a***@example.com',
    timestamp_utc: new Date().toISOString(),
    app_url: 'https://app.example.com',
  }), [client]);

  const subject = substitute(template.subject, sampleVars);
  const text = substitute(template.body_text, sampleVars);
  const html = template.body_html ? substitute(template.body_html, sampleVars) : '';

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Preview — {template.template_key}</DialogTitle>
          <DialogDescription>Rendered with sample data. HTML is shown as source only (no sanitizer wired yet).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div><span className="text-muted-foreground">Subject:</span> <strong>{subject}</strong></div>
          <div>
            <div className="text-muted-foreground mb-1">Body (plain text):</div>
            <pre className="bg-muted p-3 rounded text-xs whitespace-pre-wrap">{text}</pre>
          </div>
          {html && (
            <div>
              <div className="text-muted-foreground mb-1">Body (HTML source — not rendered):</div>
              <pre className="bg-muted p-3 rounded text-xs whitespace-pre-wrap font-mono overflow-auto max-h-64">{html}</pre>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}