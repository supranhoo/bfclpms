/**
 * Platform Settings → Data Governance.
 *
 * Phase 3A foundation. Configuration-only. Nothing here enforces anything
 * against PMS or any other module — it is a registry that future phases will
 * read. Every create/update writes an `entitlement_audit` row.
 *
 * Sub-tabs are added incrementally:
 *   3A.1 — Classifications   ← shipped
 *   3A.2 — Sensitive Fields  (next)
 *   3A.3 — Export Policies
 *   3A.4 — Audit Policy
 *   3A.5 — Retention
 *   3A.6 — Privacy / Consent
 */
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Pencil, ShieldAlert, Info, Plus, FileLock2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function DataGovernanceTab() {
  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle className="flex items-center gap-2">
          Data Governance
          <Badge variant="secondary" className="text-xs">Config only — not enforced yet</Badge>
        </AlertTitle>
        <AlertDescription>
          Platform-owner registry for classifications, sensitive fields, export rules, audit
          policy, retention and privacy. Editing values here records audit rows but does not
          change any PMS behaviour. Enforcement comes in a later phase.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="classifications" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="classifications">
            <ShieldAlert className="h-4 w-4 mr-1" /> Classifications
          </TabsTrigger>
          <TabsTrigger value="sensitive-fields">
            <FileLock2 className="h-4 w-4 mr-1" /> Sensitive Fields
          </TabsTrigger>
          {/* 3A.3–3A.6 tabs will be added in subsequent micro-phases. */}
        </TabsList>
        <TabsContent value="classifications"><ClassificationsSubTab /></TabsContent>
        <TabsContent value="sensitive-fields"><SensitiveFieldsSubTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ────────────────────────── 3A.1: Data Classification ──────────────────── */

type Classification = {
  id: string;
  classification_key: string;
  label: string;
  description: string | null;
  sort_order: number;
  export_allowed: boolean;
  watermark_required: boolean;
  download_reason_required: boolean;
  approval_required: boolean;
  max_rows_allowed: number | null;
  audit_view_required: boolean;
  is_active: boolean;
};

const LABEL_MAX = 80;
const DESC_MAX = 500;

function ClassificationsSubTab() {
  const qc = useQueryClient();
  const { user, hasRole } = useAuth();
  const canWrite = hasRole('platform_owner');

  const { data, isLoading } = useQuery({
    queryKey: ['platform-settings', 'data-governance', 'classifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('data_classifications')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Classification[];
    },
  });

  const [editing, setEditing] = useState<Classification | null>(null);
  const [form, setForm] = useState<Classification | null>(null);

  useEffect(() => { setForm(editing); }, [editing]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!editing || !form) return;
      const before = pickAuditable(editing);
      const after = pickAuditable(form);
      const { error } = await supabase
        .from('data_classifications')
        .update({
          label: form.label,
          description: form.description,
          export_allowed: form.export_allowed,
          watermark_required: form.watermark_required,
          download_reason_required: form.download_reason_required,
          approval_required: form.approval_required,
          max_rows_allowed: form.max_rows_allowed,
          audit_view_required: form.audit_view_required,
          is_active: form.is_active,
        })
        .eq('id', editing.id);
      if (error) throw error;
      const { error: audErr } = await supabase.from('entitlement_audit').insert({
        actor_id: user?.id ?? null,
        event_type: 'update',
        entity_type: 'data_classification',
        entity_key: editing.classification_key,
        before,
        after,
        reason: 'platform_settings_data_classification_update',
      });
      if (audErr) throw audErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-settings', 'data-governance', 'classifications'] });
      qc.invalidateQueries({ queryKey: ['platform-settings', 'audit'] });
      setEditing(null);
      toast.success('Classification updated');
    },
    onError: (e: Error) => toast.error(`Update failed: ${e.message}`),
  });

  if (isLoading) return <LoadingRows />;

  const labelTrim = (form?.label ?? '').trim();
  const labelValid = labelTrim.length > 0 && labelTrim.length <= LABEL_MAX;
  const descLen = (form?.description ?? '').length;
  const descValid = descLen <= DESC_MAX;
  const maxRowsValid =
    form?.max_rows_allowed == null ||
    (Number.isInteger(form.max_rows_allowed) && form.max_rows_allowed >= 0);
  const valid = !!form && labelValid && descValid && maxRowsValid;
  const dirty = !!editing && !!form && JSON.stringify(pickAuditable(editing)) !== JSON.stringify(pickAuditable(form));

  return (
    <>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead>Label</TableHead>
              <TableHead className="text-center">Export</TableHead>
              <TableHead className="text-center">Watermark</TableHead>
              <TableHead className="text-center">Reason</TableHead>
              <TableHead className="text-center">Approval</TableHead>
              <TableHead className="text-right">Max rows</TableHead>
              <TableHead className="text-center">Audit view</TableHead>
              <TableHead className="text-center">Active</TableHead>
              <TableHead className="w-16 text-right">Edit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-6">No rows</TableCell></TableRow>
            ) : (data ?? []).map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">{c.classification_key}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span>{c.label}</span>
                    {!c.is_active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-center">{boolDash(c.export_allowed)}</TableCell>
                <TableCell className="text-center">{boolDash(c.watermark_required)}</TableCell>
                <TableCell className="text-center">{boolDash(c.download_reason_required)}</TableCell>
                <TableCell className="text-center">{boolDash(c.approval_required)}</TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {c.max_rows_allowed == null ? '∞' : c.max_rows_allowed.toLocaleString()}
                </TableCell>
                <TableCell className="text-center">{boolDash(c.audit_view_required)}</TableCell>
                <TableCell className="text-center">{c.is_active ? '✓' : '—'}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(c)}
                    disabled={!canWrite}
                    aria-label={`Edit ${c.classification_key}`}
                    title={canWrite ? 'Edit classification' : 'platform_owner only'}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => { if (!o && !mut.isPending) setEditing(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit classification</DialogTitle>
            <DialogDescription>
              Classification key is immutable. All other fields are editable. Saved values are
              recorded but do not enforce anything yet.
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Key (read-only)</Label>
                <Input value={form.classification_key} readOnly disabled className="font-mono" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dc-label">Label</Label>
                <Input
                  id="dc-label"
                  value={form.label}
                  maxLength={LABEL_MAX}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dc-desc">Description</Label>
                <Textarea
                  id="dc-desc"
                  value={form.description ?? ''}
                  maxLength={DESC_MAX}
                  rows={2}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">{descLen}/{DESC_MAX}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <SwitchRow label="Export allowed"        checked={form.export_allowed}           onChange={(v) => setForm({ ...form, export_allowed: v })} />
                <SwitchRow label="Watermark required"    checked={form.watermark_required}       onChange={(v) => setForm({ ...form, watermark_required: v })} />
                <SwitchRow label="Download reason"       checked={form.download_reason_required} onChange={(v) => setForm({ ...form, download_reason_required: v })} />
                <SwitchRow label="Approval required"     checked={form.approval_required}        onChange={(v) => setForm({ ...form, approval_required: v })} />
                <SwitchRow label="Audit view"            checked={form.audit_view_required}      onChange={(v) => setForm({ ...form, audit_view_required: v })} />
                <SwitchRow label="Active"                checked={form.is_active}                onChange={(v) => setForm({ ...form, is_active: v })} />
              </div>

              <div className="space-y-1">
                <Label htmlFor="dc-maxrows">Max rows allowed</Label>
                <Input
                  id="dc-maxrows"
                  type="number"
                  min={0}
                  value={form.max_rows_allowed ?? ''}
                  placeholder="Leave blank for unlimited"
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm({ ...form, max_rows_allowed: v === '' ? null : Number(v) });
                  }}
                />
                <p className="text-xs text-muted-foreground">Blank = unlimited · 0 = blocked</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={mut.isPending}>Cancel</Button>
            <Button
              onClick={() => mut.mutate()}
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

/* ────────────────────────── helpers ─────────────────────────────────────── */

function pickAuditable(c: Classification) {
  return {
    label: c.label,
    description: c.description,
    export_allowed: c.export_allowed,
    watermark_required: c.watermark_required,
    download_reason_required: c.download_reason_required,
    approval_required: c.approval_required,
    max_rows_allowed: c.max_rows_allowed,
    audit_view_required: c.audit_view_required,
    is_active: c.is_active,
  };
}

function boolDash(v: boolean) {
  return v ? <span className="text-foreground">✓</span> : <span className="text-muted-foreground">—</span>;
}

function SwitchRow({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border p-2">
      <Label className="text-sm cursor-pointer">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
    </div>
  );
}