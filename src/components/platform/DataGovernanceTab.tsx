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
import { Pencil, ShieldAlert, Info, Plus, FileLock2, Download, ClipboardList, Archive, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataGovernanceOverviewSubTab } from './DataGovernanceOverviewSubTab';
import { LayoutDashboard } from 'lucide-react';

export function DataGovernanceTab() {
  const [activeTab, setActiveTab] = useState<
    'overview' | 'classifications' | 'sensitive-fields' | 'export-policies' | 'audit-policy' | 'retention-policy' | 'privacy-consent'
  >('overview');
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

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">
            <LayoutDashboard className="h-4 w-4 mr-1" /> Overview
          </TabsTrigger>
          <TabsTrigger value="classifications">
            <ShieldAlert className="h-4 w-4 mr-1" /> Classifications
          </TabsTrigger>
          <TabsTrigger value="sensitive-fields">
            <FileLock2 className="h-4 w-4 mr-1" /> Sensitive Fields
          </TabsTrigger>
          <TabsTrigger value="export-policies">
            <Download className="h-4 w-4 mr-1" /> Export Policies
          </TabsTrigger>
          <TabsTrigger value="audit-policy">
            <ClipboardList className="h-4 w-4 mr-1" /> Audit Policy
          </TabsTrigger>
          <TabsTrigger value="retention-policy">
            <Archive className="h-4 w-4 mr-1" /> Retention Policy
          </TabsTrigger>
          <TabsTrigger value="privacy-consent">
            <ShieldCheck className="h-4 w-4 mr-1" /> Privacy &amp; Consent
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><DataGovernanceOverviewSubTab onNavigate={setActiveTab} /></TabsContent>
        <TabsContent value="classifications"><ClassificationsSubTab /></TabsContent>
        <TabsContent value="sensitive-fields"><SensitiveFieldsSubTab /></TabsContent>
        <TabsContent value="export-policies"><ExportPoliciesSubTab /></TabsContent>
        <TabsContent value="audit-policy"><AuditPolicySubTab /></TabsContent>
        <TabsContent value="retention-policy"><RetentionPolicySubTab /></TabsContent>
        <TabsContent value="privacy-consent"><PrivacyConsentSubTab /></TabsContent>
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

/* ────────────────────────── 3A.6: Privacy / Consent ────────────────────── */

type PrivacyConsent = {
  id: string;
  module_key: string;
  consent_key: string;
  consent_label: string;
  purpose: string;
  data_categories: string | null;
  lawful_basis: 'consent' | 'contract' | 'legitimate_interest' | 'legal_obligation' | 'vital_interest' | 'public_task';
  required: boolean;
  default_state: 'opt_in' | 'opt_out';
  dsar_contact_email: string | null;
  policy_url: string | null;
  notes: string | null;
  is_active: boolean;
};
type PrivacyConsentDraft = Omit<PrivacyConsent, 'id'> & { id?: string };

const PC_MODULES = ['platform', 'pms', 'hrms', 'lms', 'safety', 'incentive'] as const;
const PC_BASES = ['consent', 'contract', 'legitimate_interest', 'legal_obligation', 'vital_interest', 'public_task'] as const;
const PC_DEFAULTS = ['opt_in', 'opt_out'] as const;
const PC_KEY_MAX = 100;
const PC_LABEL_MAX = 120;
const PC_PURPOSE_MAX = 500;
const PC_NOTES_MAX = 500;

function emptyPc(): PrivacyConsentDraft {
  return {
    module_key: 'platform',
    consent_key: '',
    consent_label: '',
    purpose: '',
    data_categories: '',
    lawful_basis: 'consent',
    required: false,
    default_state: 'opt_out',
    dsar_contact_email: '',
    policy_url: '',
    notes: '',
    is_active: true,
  };
}

function pickPcAuditable(p: PrivacyConsentDraft) {
  return {
    module_key: p.module_key,
    consent_key: p.consent_key,
    consent_label: p.consent_label,
    purpose: p.purpose,
    data_categories: p.data_categories,
    lawful_basis: p.lawful_basis,
    required: p.required,
    default_state: p.default_state,
    dsar_contact_email: p.dsar_contact_email,
    policy_url: p.policy_url,
    notes: p.notes,
    is_active: p.is_active,
  };
}

function PrivacyConsentSubTab() {
  const qc = useQueryClient();
  const { user, hasRole } = useAuth();
  const canWrite = hasRole('platform_owner');

  const { data, isLoading } = useQuery({
    queryKey: ['platform-settings', 'data-governance', 'privacy-consent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('privacy_consent_settings')
        .select('*')
        .order('module_key', { ascending: true })
        .order('consent_key', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PrivacyConsent[];
    },
  });

  const [filterModule, setFilterModule] = useState<string>('all');
  const [showInactive, setShowInactive] = useState(false);

  const [editing, setEditing] = useState<PrivacyConsent | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<PrivacyConsentDraft | null>(null);

  useEffect(() => {
    if (creating) setForm(emptyPc());
    else if (editing) setForm({ ...editing });
    else setForm(null);
  }, [editing, creating]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!form) return;
      if (creating) {
        const payload = pickPcAuditable(form);
        const { error } = await supabase
          .from('privacy_consent_settings')
          .insert({ ...payload, created_by: user?.id ?? null });
        if (error) throw error;
        const { error: audErr } = await supabase.from('entitlement_audit').insert({
          actor_id: user?.id ?? null,
          event_type: 'create',
          entity_type: 'privacy_consent_setting',
          entity_key: form.consent_key,
          before: null,
          after: payload,
          reason: 'platform_settings_privacy_consent_create',
        });
        if (audErr) throw audErr;
        return;
      }
      if (!editing) return;
      const before = pickPcAuditable(editing);
      const after = pickPcAuditable(form);
      const { error } = await supabase
        .from('privacy_consent_settings')
        .update({
          consent_label: form.consent_label,
          purpose: form.purpose,
          data_categories: form.data_categories,
          lawful_basis: form.lawful_basis,
          required: form.required,
          default_state: form.default_state,
          dsar_contact_email: form.dsar_contact_email,
          policy_url: form.policy_url,
          notes: form.notes,
          is_active: form.is_active,
        })
        .eq('id', editing.id);
      if (error) throw error;
      const { error: audErr } = await supabase.from('entitlement_audit').insert({
        actor_id: user?.id ?? null,
        event_type: 'update',
        entity_type: 'privacy_consent_setting',
        entity_key: editing.consent_key,
        before,
        after,
        reason: 'platform_settings_privacy_consent_update',
      });
      if (audErr) throw audErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-settings', 'data-governance', 'privacy-consent'] });
      toast.success(creating ? 'Consent setting added' : 'Consent setting updated');
      setEditing(null);
      setCreating(false);
    },
    onError: (e: Error) => toast.error(`Save failed: ${e.message}`),
  });

  if (isLoading) return <LoadingRows />;

  const isEditMode = !!editing && !creating;
  const keyLen = (form?.consent_key ?? '').length;
  const labelLen = (form?.consent_label ?? '').length;
  const purposeLen = (form?.purpose ?? '').length;
  const notesLen = (form?.notes ?? '').length;

  const valid =
    !!form &&
    !!form.module_key &&
    !!form.consent_key.trim() &&
    !!form.consent_label.trim() &&
    !!form.purpose.trim() &&
    keyLen <= PC_KEY_MAX &&
    labelLen <= PC_LABEL_MAX &&
    purposeLen <= PC_PURPOSE_MAX &&
    notesLen <= PC_NOTES_MAX;

  const dirty = creating
    ? true
    : !!editing && !!form && JSON.stringify(pickPcAuditable(editing)) !== JSON.stringify(pickPcAuditable(form));

  const filtered = (data ?? []).filter((p) => {
    if (filterModule !== 'all' && p.module_key !== filterModule) return false;
    if (!showInactive && !p.is_active) return false;
    return true;
  });

  return (
    <>
      <div className="flex flex-wrap items-end gap-3 pb-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Module</Label>
          <Select value={filterModule} onValueChange={setFilterModule}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modules</SelectItem>
              {PC_MODULES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} id="pc-show-inactive" />
          <Label htmlFor="pc-show-inactive" className="text-sm cursor-pointer">Show inactive</Label>
        </div>
        <div className="ml-auto">
          <Button
            onClick={() => setCreating(true)}
            disabled={!canWrite}
            title={canWrite ? 'Add consent setting' : 'platform_owner only'}
          >
            <Plus className="h-4 w-4 mr-1" /> Add Consent
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Module</TableHead>
              <TableHead>Consent</TableHead>
              <TableHead>Lawful Basis</TableHead>
              <TableHead>Default</TableHead>
              <TableHead className="text-center">Required</TableHead>
              <TableHead className="text-center">Active</TableHead>
              <TableHead className="w-16 text-right">Edit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No consent settings</TableCell></TableRow>
            ) : filtered.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.module_key}</TableCell>
                <TableCell>
                  <div className="font-medium">{p.consent_label}</div>
                  <div className="font-mono text-xs text-muted-foreground">{p.consent_key}</div>
                </TableCell>
                <TableCell><Badge variant="outline" className="text-xs">{p.lawful_basis}</Badge></TableCell>
                <TableCell><Badge variant="secondary" className="text-xs">{p.default_state}</Badge></TableCell>
                <TableCell className="text-center">{boolDash(p.required)}</TableCell>
                <TableCell className="text-center">{p.is_active ? '✓' : '—'}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(p)}
                    disabled={!canWrite}
                    aria-label={`Edit ${p.consent_key}`}
                    title={canWrite ? 'Edit consent setting' : 'platform_owner only'}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={editing !== null || creating}
        onOpenChange={(o) => { if (!o && !mut.isPending) { setEditing(null); setCreating(false); } }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{creating ? 'Add consent setting' : 'Edit consent setting'}</DialogTitle>
            <DialogDescription>
              Registry only. Saved values are recorded with an audit row but no consent banner,
              cookie blocker, or marketing opt-out is enforced yet.
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="pc-module">Module</Label>
                  <Select
                    value={form.module_key}
                    onValueChange={(v) => setForm({ ...form, module_key: v })}
                    disabled={isEditMode}
                  >
                    <SelectTrigger id="pc-module"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PC_MODULES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pc-key">Consent key</Label>
                  <Input
                    id="pc-key"
                    value={form.consent_key}
                    maxLength={PC_KEY_MAX}
                    disabled={isEditMode}
                    placeholder="e.g. platform.cookies.analytics"
                    onChange={(e) => setForm({ ...form, consent_key: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">{keyLen}/{PC_KEY_MAX}</p>
                </div>
              </div>
              {isEditMode && (
                <p className="text-xs text-muted-foreground">
                  Module and consent key are immutable after creation.
                </p>
              )}

              <div className="space-y-1">
                <Label htmlFor="pc-label">Label</Label>
                <Input
                  id="pc-label"
                  value={form.consent_label}
                  maxLength={PC_LABEL_MAX}
                  onChange={(e) => setForm({ ...form, consent_label: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">{labelLen}/{PC_LABEL_MAX}</p>
              </div>

              <div className="space-y-1">
                <Label htmlFor="pc-purpose">Purpose</Label>
                <Textarea
                  id="pc-purpose"
                  value={form.purpose}
                  maxLength={PC_PURPOSE_MAX}
                  rows={2}
                  onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">{purposeLen}/{PC_PURPOSE_MAX}</p>
              </div>

              <div className="space-y-1">
                <Label htmlFor="pc-cats">Data categories</Label>
                <Input
                  id="pc-cats"
                  value={form.data_categories ?? ''}
                  placeholder="e.g. email, device_id, ip"
                  onChange={(e) => setForm({ ...form, data_categories: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="pc-basis">Lawful basis</Label>
                  <Select
                    value={form.lawful_basis}
                    onValueChange={(v) => setForm({ ...form, lawful_basis: v as PrivacyConsent['lawful_basis'] })}
                  >
                    <SelectTrigger id="pc-basis"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PC_BASES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pc-default">Default state</Label>
                  <Select
                    value={form.default_state}
                    onValueChange={(v) => setForm({ ...form, default_state: v as PrivacyConsent['default_state'] })}
                  >
                    <SelectTrigger id="pc-default"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PC_DEFAULTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="pc-dsar">DSAR contact email</Label>
                  <Input
                    id="pc-dsar"
                    type="email"
                    value={form.dsar_contact_email ?? ''}
                    placeholder="privacy@example.com"
                    onChange={(e) => setForm({ ...form, dsar_contact_email: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pc-url">Policy URL</Label>
                  <Input
                    id="pc-url"
                    value={form.policy_url ?? ''}
                    placeholder="https://…"
                    onChange={(e) => setForm({ ...form, policy_url: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <SwitchRow label="Required (no opt-out)" checked={form.required}  onChange={(v) => setForm({ ...form, required: v })} />
                <SwitchRow label="Active"                checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} />
              </div>

              <div className="space-y-1">
                <Label htmlFor="pc-notes">Notes</Label>
                <Textarea
                  id="pc-notes"
                  value={form.notes ?? ''}
                  maxLength={PC_NOTES_MAX}
                  rows={2}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">{notesLen}/{PC_NOTES_MAX}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setEditing(null); setCreating(false); }}
              disabled={mut.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => mut.mutate()}
              disabled={!valid || !dirty || !canWrite || mut.isPending}
            >
              {mut.isPending ? 'Saving…' : creating ? 'Add' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ────────────────────────── 3A.4: Audit Policy ─────────────────────────── */

type AuditPolicy = {
  id: string;
  module_key: string;
  event_category: string;
  enabled: boolean;
  retention_days: number | null;
  min_severity: 'info' | 'notice' | 'warn' | 'critical';
  include_payload: boolean;
  pii_redaction: boolean;
  alert_on_failure: boolean;
  notes: string | null;
  is_active: boolean;
};
type AuditPolicyDraft = Omit<AuditPolicy, 'id'> & { id?: string };

const AP_MODULES = ['pms', 'hrms', 'lms', 'safety', 'incentive', 'platform'] as const;
const AP_CATEGORIES = [
  'auth', 'data_read', 'data_write', 'export', 'permission_change',
  'score_change', 'workflow_change', 'config_change', 'admin_action', 'notification',
] as const;
const AP_SEVERITIES = ['info', 'notice', 'warn', 'critical'] as const;
const AP_NOTES_MAX = 500;

function emptyAp(): AuditPolicyDraft {
  return {
    module_key: 'pms',
    event_category: 'data_write',
    enabled: true,
    retention_days: 365,
    min_severity: 'info',
    include_payload: true,
    pii_redaction: false,
    alert_on_failure: false,
    notes: '',
    is_active: true,
  };
}

function pickApAuditable(p: AuditPolicyDraft) {
  return {
    module_key: p.module_key,
    event_category: p.event_category,
    enabled: p.enabled,
    retention_days: p.retention_days,
    min_severity: p.min_severity,
    include_payload: p.include_payload,
    pii_redaction: p.pii_redaction,
    alert_on_failure: p.alert_on_failure,
    notes: p.notes,
    is_active: p.is_active,
  };
}

function AuditPolicySubTab() {
  const qc = useQueryClient();
  const { user, hasRole } = useAuth();
  const canWrite = hasRole('platform_owner');

  const { data, isLoading } = useQuery({
    queryKey: ['platform-settings', 'data-governance', 'audit-policies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_policies')
        .select('*')
        .order('module_key', { ascending: true })
        .order('event_category', { ascending: true });
      if (error) throw error;
      return (data ?? []) as AuditPolicy[];
    },
  });

  const [filterModule, setFilterModule] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [showInactive, setShowInactive] = useState(false);

  const [editing, setEditing] = useState<AuditPolicy | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<AuditPolicyDraft | null>(null);

  useEffect(() => {
    if (creating) setForm(emptyAp());
    else if (editing) setForm({ ...editing });
    else setForm(null);
  }, [editing, creating]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!form) return;
      if (creating) {
        const payload = pickApAuditable(form);
        const { error } = await supabase
          .from('audit_policies')
          .insert({ ...payload, created_by: user?.id ?? null, updated_by: user?.id ?? null });
        if (error) throw error;
        const { error: audErr } = await supabase.from('entitlement_audit').insert({
          actor_id: user?.id ?? null,
          event_type: 'create',
          entity_type: 'audit_policy',
          entity_key: `${form.module_key}.${form.event_category}`,
          before: null,
          after: payload,
          reason: 'platform_settings_audit_policy_create',
        });
        if (audErr) throw audErr;
        return;
      }
      if (!editing) return;
      const before = pickApAuditable(editing);
      const after = pickApAuditable(form);
      const { error } = await supabase
        .from('audit_policies')
        .update({
          enabled: form.enabled,
          retention_days: form.retention_days,
          min_severity: form.min_severity,
          include_payload: form.include_payload,
          pii_redaction: form.pii_redaction,
          alert_on_failure: form.alert_on_failure,
          notes: form.notes,
          is_active: form.is_active,
          updated_by: user?.id ?? null,
        })
        .eq('id', editing.id);
      if (error) throw error;
      const { error: audErr } = await supabase.from('entitlement_audit').insert({
        actor_id: user?.id ?? null,
        event_type: 'update',
        entity_type: 'audit_policy',
        entity_key: `${editing.module_key}.${editing.event_category}`,
        before,
        after,
        reason: 'platform_settings_audit_policy_update',
      });
      if (audErr) throw audErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-settings', 'data-governance', 'audit-policies'] });
      qc.invalidateQueries({ queryKey: ['platform-settings', 'audit'] });
      toast.success(creating ? 'Audit policy added' : 'Audit policy updated');
      setEditing(null);
      setCreating(false);
    },
    onError: (e: Error) => toast.error(`Save failed: ${e.message}`),
  });

  if (isLoading) return <LoadingRows />;

  const isEditMode = !!editing && !creating;
  const notesLen = (form?.notes ?? '').length;
  const valid =
    !!form &&
    !!form.module_key &&
    !!form.event_category &&
    notesLen <= AP_NOTES_MAX &&
    (form.retention_days == null ||
      (Number.isInteger(form.retention_days) && form.retention_days >= 0));
  const dirty = creating
    ? true
    : !!editing && !!form && JSON.stringify(pickApAuditable(editing)) !== JSON.stringify(pickApAuditable(form));

  const filtered = (data ?? []).filter((p) => {
    if (filterModule !== 'all' && p.module_key !== filterModule) return false;
    if (filterCategory !== 'all' && p.event_category !== filterCategory) return false;
    if (!showInactive && !p.is_active) return false;
    return true;
  });

  return (
    <>
      <div className="flex flex-wrap items-end gap-3 pb-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Module</Label>
          <Select value={filterModule} onValueChange={setFilterModule}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modules</SelectItem>
              {AP_MODULES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Category</Label>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {AP_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} id="ap-show-inactive" />
          <Label htmlFor="ap-show-inactive" className="text-sm cursor-pointer">Show inactive</Label>
        </div>
        <div className="ml-auto">
          <Button
            onClick={() => setCreating(true)}
            disabled={!canWrite}
            title={canWrite ? 'Add audit policy' : 'platform_owner only'}
          >
            <Plus className="h-4 w-4 mr-1" /> Add Policy
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Module</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-center">Enabled</TableHead>
              <TableHead className="text-right">Retention (days)</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead className="text-center">Payload</TableHead>
              <TableHead className="text-center">PII Redact</TableHead>
              <TableHead className="text-center">Alert</TableHead>
              <TableHead className="text-center">Active</TableHead>
              <TableHead className="w-16 text-right">Edit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-6">No audit policies</TableCell></TableRow>
            ) : filtered.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.module_key}</TableCell>
                <TableCell className="font-mono text-xs">{p.event_category}</TableCell>
                <TableCell className="text-center">{boolDash(p.enabled)}</TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {p.retention_days == null ? '∞' : p.retention_days.toLocaleString()}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs uppercase">{p.min_severity}</Badge>
                </TableCell>
                <TableCell className="text-center">{boolDash(p.include_payload)}</TableCell>
                <TableCell className="text-center">{boolDash(p.pii_redaction)}</TableCell>
                <TableCell className="text-center">{boolDash(p.alert_on_failure)}</TableCell>
                <TableCell className="text-center">{p.is_active ? '✓' : '—'}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(p)}
                    disabled={!canWrite}
                    aria-label={`Edit ${p.module_key}.${p.event_category}`}
                    title={canWrite ? 'Edit audit policy' : 'platform_owner only'}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={editing !== null || creating}
        onOpenChange={(o) => { if (!o && !mut.isPending) { setEditing(null); setCreating(false); } }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{creating ? 'Add audit policy' : 'Edit audit policy'}</DialogTitle>
            <DialogDescription>
              Registry only. Saved values are recorded with an audit row but no audit writer or
              retention job consults this table yet.
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="ap-module">Module</Label>
                  <Select
                    value={form.module_key}
                    onValueChange={(v) => setForm({ ...form, module_key: v })}
                    disabled={isEditMode}
                  >
                    <SelectTrigger id="ap-module"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {AP_MODULES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ap-cat">Event category</Label>
                  <Select
                    value={form.event_category}
                    onValueChange={(v) => setForm({ ...form, event_category: v })}
                    disabled={isEditMode}
                  >
                    <SelectTrigger id="ap-cat"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {AP_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {isEditMode && (
                <p className="text-xs text-muted-foreground">
                  Module and category are immutable after creation. Add a new row if the identity changes.
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="ap-retention">Retention (days)</Label>
                  <Input
                    id="ap-retention"
                    type="number"
                    min={0}
                    value={form.retention_days ?? ''}
                    placeholder="Forever"
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm({ ...form, retention_days: v === '' ? null : Number(v) });
                    }}
                  />
                  <p className="text-xs text-muted-foreground">Blank = keep forever · 0 = no retention</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ap-sev">Minimum severity</Label>
                  <Select
                    value={form.min_severity}
                    onValueChange={(v) => setForm({ ...form, min_severity: v as AuditPolicy['min_severity'] })}
                  >
                    <SelectTrigger id="ap-sev"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {AP_SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <SwitchRow label="Enabled"          checked={form.enabled}          onChange={(v) => setForm({ ...form, enabled: v })} />
                <SwitchRow label="Include payload"  checked={form.include_payload}  onChange={(v) => setForm({ ...form, include_payload: v })} />
                <SwitchRow label="PII redaction"    checked={form.pii_redaction}    onChange={(v) => setForm({ ...form, pii_redaction: v })} />
                <SwitchRow label="Alert on failure" checked={form.alert_on_failure} onChange={(v) => setForm({ ...form, alert_on_failure: v })} />
                <SwitchRow label="Active"           checked={form.is_active}        onChange={(v) => setForm({ ...form, is_active: v })} />
              </div>

              <div className="space-y-1">
                <Label htmlFor="ap-notes">Notes</Label>
                <Textarea
                  id="ap-notes"
                  value={form.notes ?? ''}
                  maxLength={AP_NOTES_MAX}
                  rows={2}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">{notesLen}/{AP_NOTES_MAX}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setEditing(null); setCreating(false); }}
              disabled={mut.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => mut.mutate()}
              disabled={!valid || !dirty || !canWrite || mut.isPending}
            >
              {mut.isPending ? 'Saving…' : creating ? 'Add' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ────────────────────────── 3A.5: Retention Policy ─────────────────────── */

type RetentionPolicy = {
  id: string;
  module_key: string;
  domain_key: string;
  domain_label: string;
  retention_days: number | null;
  archive_after_days: number | null;
  purge_strategy: 'soft_delete' | 'hard_delete' | 'anonymize' | 'archive_only';
  legal_hold: boolean;
  regulatory_basis: string | null;
  owner_role: string | null;
  notes: string | null;
  is_active: boolean;
};
type RetentionPolicyDraft = Omit<RetentionPolicy, 'id'> & { id?: string };

const RP_MODULES = ['pms', 'hrms', 'lms', 'safety', 'incentive', 'platform'] as const;
const RP_STRATEGIES = ['soft_delete', 'hard_delete', 'anonymize', 'archive_only'] as const;
const RP_OWNER_ROLE_SUGGESTIONS = ['platform_owner', 'admin', 'hr_pms', 'management', 'safety_admin', 'manager'];
const RP_NOTES_MAX = 500;
const RP_KEY_MAX = 80;
const RP_LABEL_MAX = 120;
const RP_REG_MAX = 200;

function emptyRp(): RetentionPolicyDraft {
  return {
    module_key: 'pms',
    domain_key: '',
    domain_label: '',
    retention_days: 365,
    archive_after_days: null,
    purge_strategy: 'soft_delete',
    legal_hold: false,
    regulatory_basis: '',
    owner_role: '',
    notes: '',
    is_active: true,
  };
}

function pickRpAuditable(p: RetentionPolicyDraft) {
  return {
    module_key: p.module_key,
    domain_key: p.domain_key,
    domain_label: p.domain_label,
    retention_days: p.retention_days,
    archive_after_days: p.archive_after_days,
    purge_strategy: p.purge_strategy,
    legal_hold: p.legal_hold,
    regulatory_basis: p.regulatory_basis,
    owner_role: p.owner_role,
    notes: p.notes,
    is_active: p.is_active,
  };
}

function RetentionPolicySubTab() {
  const qc = useQueryClient();
  const { user, hasRole } = useAuth();
  const canWrite = hasRole('platform_owner');

  const { data, isLoading } = useQuery({
    queryKey: ['platform-settings', 'data-governance', 'retention-policies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('retention_policies')
        .select('*')
        .order('module_key', { ascending: true })
        .order('domain_key', { ascending: true });
      if (error) throw error;
      return (data ?? []) as RetentionPolicy[];
    },
  });

  const [filterModule, setFilterModule] = useState<string>('all');
  const [showInactive, setShowInactive] = useState(false);

  const [editing, setEditing] = useState<RetentionPolicy | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<RetentionPolicyDraft | null>(null);

  useEffect(() => {
    if (creating) setForm(emptyRp());
    else if (editing) setForm({ ...editing });
    else setForm(null);
  }, [editing, creating]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!form) return;
      if (creating) {
        const payload = pickRpAuditable(form);
        const { error } = await supabase
          .from('retention_policies')
          .insert({ ...payload, created_by: user?.id ?? null, updated_by: user?.id ?? null });
        if (error) throw error;
        const { error: audErr } = await supabase.from('entitlement_audit').insert({
          actor_id: user?.id ?? null,
          event_type: 'create',
          entity_type: 'retention_policy',
          entity_key: form.domain_key,
          before: null,
          after: payload,
          reason: 'platform_settings_retention_policy_create',
        });
        if (audErr) throw audErr;
        return;
      }
      if (!editing) return;
      const before = pickRpAuditable(editing);
      const after = pickRpAuditable(form);
      const { error } = await supabase
        .from('retention_policies')
        .update({
          domain_label: form.domain_label,
          retention_days: form.retention_days,
          archive_after_days: form.archive_after_days,
          purge_strategy: form.purge_strategy,
          legal_hold: form.legal_hold,
          regulatory_basis: form.regulatory_basis,
          owner_role: form.owner_role,
          notes: form.notes,
          is_active: form.is_active,
          updated_by: user?.id ?? null,
        })
        .eq('id', editing.id);
      if (error) throw error;
      const { error: audErr } = await supabase.from('entitlement_audit').insert({
        actor_id: user?.id ?? null,
        event_type: 'update',
        entity_type: 'retention_policy',
        entity_key: editing.domain_key,
        before,
        after,
        reason: 'platform_settings_retention_policy_update',
      });
      if (audErr) throw audErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-settings', 'data-governance', 'retention-policies'] });
      toast.success(creating ? 'Retention policy added' : 'Retention policy updated');
      setEditing(null);
      setCreating(false);
    },
    onError: (e: Error) => toast.error(`Save failed: ${e.message}`),
  });

  if (isLoading) return <LoadingRows />;

  const isEditMode = !!editing && !creating;
  const notesLen = (form?.notes ?? '').length;
  const labelLen = (form?.domain_label ?? '').length;
  const keyLen = (form?.domain_key ?? '').length;
  const regLen = (form?.regulatory_basis ?? '').length;

  const retentionValid =
    form?.retention_days == null ||
    (Number.isInteger(form.retention_days) && form.retention_days >= 0);
  const archiveValid =
    form?.archive_after_days == null ||
    (Number.isInteger(form.archive_after_days) && form.archive_after_days >= 0);
  const archiveLeRetention =
    !form ||
    form.archive_after_days == null ||
    form.retention_days == null ||
    form.archive_after_days <= form.retention_days;

  const valid =
    !!form &&
    !!form.module_key &&
    !!form.domain_key.trim() &&
    !!form.domain_label.trim() &&
    keyLen <= RP_KEY_MAX &&
    labelLen <= RP_LABEL_MAX &&
    regLen <= RP_REG_MAX &&
    notesLen <= RP_NOTES_MAX &&
    retentionValid &&
    archiveValid &&
    archiveLeRetention;

  const dirty = creating
    ? true
    : !!editing && !!form && JSON.stringify(pickRpAuditable(editing)) !== JSON.stringify(pickRpAuditable(form));

  const filtered = (data ?? []).filter((p) => {
    if (filterModule !== 'all' && p.module_key !== filterModule) return false;
    if (!showInactive && !p.is_active) return false;
    return true;
  });

  const fmtDays = (d: number | null) => (d == null ? 'Forever' : d.toLocaleString());

  return (
    <>
      <div className="flex flex-wrap items-end gap-3 pb-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Module</Label>
          <Select value={filterModule} onValueChange={setFilterModule}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modules</SelectItem>
              {RP_MODULES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} id="rp-show-inactive" />
          <Label htmlFor="rp-show-inactive" className="text-sm cursor-pointer">Show inactive</Label>
        </div>
        <div className="ml-auto">
          <Button
            onClick={() => setCreating(true)}
            disabled={!canWrite}
            title={canWrite ? 'Add retention policy' : 'platform_owner only'}
          >
            <Plus className="h-4 w-4 mr-1" /> Add Policy
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Module</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead className="text-right">Retention</TableHead>
              <TableHead className="text-right">Archive After</TableHead>
              <TableHead>Strategy</TableHead>
              <TableHead className="text-center">Legal Hold</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead className="text-center">Active</TableHead>
              <TableHead className="w-16 text-right">Edit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">No retention policies</TableCell></TableRow>
            ) : filtered.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.module_key}</TableCell>
                <TableCell>
                  <div className="font-medium">{p.domain_label}</div>
                  <div className="font-mono text-xs text-muted-foreground">{p.domain_key}</div>
                </TableCell>
                <TableCell className="text-right font-mono text-xs">{fmtDays(p.retention_days)}</TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {p.archive_after_days == null ? '—' : p.archive_after_days.toLocaleString()}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">{p.purge_strategy}</Badge>
                </TableCell>
                <TableCell className="text-center">{boolDash(p.legal_hold)}</TableCell>
                <TableCell className="font-mono text-xs">{p.owner_role || '—'}</TableCell>
                <TableCell className="text-center">{p.is_active ? '✓' : '—'}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(p)}
                    disabled={!canWrite}
                    aria-label={`Edit ${p.domain_key}`}
                    title={canWrite ? 'Edit retention policy' : 'platform_owner only'}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={editing !== null || creating}
        onOpenChange={(o) => { if (!o && !mut.isPending) { setEditing(null); setCreating(false); } }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{creating ? 'Add retention policy' : 'Edit retention policy'}</DialogTitle>
            <DialogDescription>
              Registry only. Saved values are recorded with an audit row but no archive or purge
              job consults this table yet.
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="rp-module">Module</Label>
                  <Select
                    value={form.module_key}
                    onValueChange={(v) => setForm({ ...form, module_key: v })}
                    disabled={isEditMode}
                  >
                    <SelectTrigger id="rp-module"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RP_MODULES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rp-key">Domain key</Label>
                  <Input
                    id="rp-key"
                    value={form.domain_key}
                    maxLength={RP_KEY_MAX}
                    disabled={isEditMode}
                    placeholder="e.g. pms.review_submissions"
                    onChange={(e) => setForm({ ...form, domain_key: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">{keyLen}/{RP_KEY_MAX}</p>
                </div>
              </div>
              {isEditMode && (
                <p className="text-xs text-muted-foreground">
                  Module and domain key are immutable after creation. Add a new row if the identity changes.
                </p>
              )}

              <div className="space-y-1">
                <Label htmlFor="rp-label">Label</Label>
                <Input
                  id="rp-label"
                  value={form.domain_label}
                  maxLength={RP_LABEL_MAX}
                  onChange={(e) => setForm({ ...form, domain_label: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">{labelLen}/{RP_LABEL_MAX}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="rp-retention">Retention (days)</Label>
                  <Input
                    id="rp-retention"
                    type="number"
                    min={0}
                    value={form.retention_days ?? ''}
                    placeholder="Forever"
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm({ ...form, retention_days: v === '' ? null : Number(v) });
                    }}
                  />
                  <p className="text-xs text-muted-foreground">Blank = keep forever</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rp-archive">Archive after (days)</Label>
                  <Input
                    id="rp-archive"
                    type="number"
                    min={0}
                    value={form.archive_after_days ?? ''}
                    placeholder="None"
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm({ ...form, archive_after_days: v === '' ? null : Number(v) });
                    }}
                  />
                  <p className="text-xs text-muted-foreground">Must be ≤ retention</p>
                </div>
              </div>
              {!archiveLeRetention && (
                <p className="text-xs text-destructive">Archive window cannot exceed retention.</p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="rp-strategy">Purge strategy</Label>
                  <Select
                    value={form.purge_strategy}
                    onValueChange={(v) => setForm({ ...form, purge_strategy: v as RetentionPolicy['purge_strategy'] })}
                  >
                    <SelectTrigger id="rp-strategy"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RP_STRATEGIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rp-owner">Owner role</Label>
                  <Input
                    id="rp-owner"
                    list="rp-owner-suggestions"
                    value={form.owner_role ?? ''}
                    onChange={(e) => setForm({ ...form, owner_role: e.target.value })}
                    placeholder="e.g. hr_pms"
                  />
                  <datalist id="rp-owner-suggestions">
                    {RP_OWNER_ROLE_SUGGESTIONS.map((r) => <option key={r} value={r} />)}
                  </datalist>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="rp-reg">Regulatory basis</Label>
                <Input
                  id="rp-reg"
                  value={form.regulatory_basis ?? ''}
                  maxLength={RP_REG_MAX}
                  placeholder='e.g. "IT Act 2000, 7y"'
                  onChange={(e) => setForm({ ...form, regulatory_basis: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">{regLen}/{RP_REG_MAX}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <SwitchRow label="Legal hold" checked={form.legal_hold} onChange={(v) => setForm({ ...form, legal_hold: v })} />
                <SwitchRow label="Active"     checked={form.is_active}  onChange={(v) => setForm({ ...form, is_active: v })} />
              </div>

              <div className="space-y-1">
                <Label htmlFor="rp-notes">Notes</Label>
                <Textarea
                  id="rp-notes"
                  value={form.notes ?? ''}
                  maxLength={RP_NOTES_MAX}
                  rows={2}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">{notesLen}/{RP_NOTES_MAX}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setEditing(null); setCreating(false); }}
              disabled={mut.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => mut.mutate()}
              disabled={!valid || !dirty || !canWrite || mut.isPending}
            >
              {mut.isPending ? 'Saving…' : creating ? 'Add' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ────────────────────────── 3A.3: Export Policies ──────────────────────── */

type ExportPolicy = {
  id: string;
  classification_key: string;
  export_allowed: boolean;
  allowed_formats: string[];
  max_rows_per_export: number | null;
  watermark_required: boolean;
  download_reason_required: boolean;
  approval_required: boolean;
  approver_role: string | null;
  retain_export_log_days: number | null;
  notes: string | null;
  is_active: boolean;
};

const FORMAT_OPTIONS = ['csv', 'xlsx', 'pdf', 'json'] as const;
const APPROVER_ROLE_SUGGESTIONS = ['platform_owner', 'admin', 'hr_pms', 'management', 'manager'];
const EP_NOTES_MAX = 500;

function pickEpAuditable(p: ExportPolicy) {
  return {
    export_allowed: p.export_allowed,
    allowed_formats: [...p.allowed_formats].sort(),
    max_rows_per_export: p.max_rows_per_export,
    watermark_required: p.watermark_required,
    download_reason_required: p.download_reason_required,
    approval_required: p.approval_required,
    approver_role: p.approver_role,
    retain_export_log_days: p.retain_export_log_days,
    notes: p.notes,
    is_active: p.is_active,
  };
}

function ExportPoliciesSubTab() {
  const qc = useQueryClient();
  const { user, hasRole } = useAuth();
  const canWrite = hasRole('platform_owner');

  const { data: classifications } = useQuery({
    queryKey: ['platform-settings', 'data-governance', 'classifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('data_classifications')
        .select('classification_key,label,sort_order')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['platform-settings', 'data-governance', 'export-policies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('export_policies')
        .select('*');
      if (error) throw error;
      return (data ?? []) as ExportPolicy[];
    },
  });

  const [editing, setEditing] = useState<ExportPolicy | null>(null);
  const [form, setForm] = useState<ExportPolicy | null>(null);
  useEffect(() => { setForm(editing ? { ...editing } : null); }, [editing]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!editing || !form) return;
      const before = pickEpAuditable(editing);
      const after = pickEpAuditable(form);
      const { error } = await supabase
        .from('export_policies')
        .update({
          export_allowed: form.export_allowed,
          allowed_formats: form.allowed_formats,
          max_rows_per_export: form.max_rows_per_export,
          watermark_required: form.watermark_required,
          download_reason_required: form.download_reason_required,
          approval_required: form.approval_required,
          approver_role: form.approver_role,
          retain_export_log_days: form.retain_export_log_days,
          notes: form.notes,
          is_active: form.is_active,
          updated_by: user?.id ?? null,
        })
        .eq('id', editing.id);
      if (error) throw error;
      const { error: audErr } = await supabase.from('entitlement_audit').insert({
        actor_id: user?.id ?? null,
        event_type: 'update',
        entity_type: 'export_policy',
        entity_key: editing.classification_key,
        before,
        after,
        reason: 'platform_settings_export_policy_update',
      });
      if (audErr) throw audErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-settings', 'data-governance', 'export-policies'] });
      qc.invalidateQueries({ queryKey: ['platform-settings', 'audit'] });
      setEditing(null);
      toast.success('Export policy updated');
    },
    onError: (e: Error) => toast.error(`Update failed: ${e.message}`),
  });

  if (isLoading) return <LoadingRows />;

  const order = new Map((classifications ?? []).map((c, i) => [c.classification_key, i]));
  const labelOf = (k: string) =>
    (classifications ?? []).find((c) => c.classification_key === k)?.label ?? k;
  const sorted = [...(data ?? [])].sort(
    (a, b) => (order.get(a.classification_key) ?? 999) - (order.get(b.classification_key) ?? 999),
  );

  const notesLen = (form?.notes ?? '').length;
  const approverTrim = (form?.approver_role ?? '').trim();
  const valid =
    !!form &&
    notesLen <= EP_NOTES_MAX &&
    (form.max_rows_per_export == null ||
      (Number.isInteger(form.max_rows_per_export) && form.max_rows_per_export >= 0)) &&
    (form.retain_export_log_days == null ||
      (Number.isInteger(form.retain_export_log_days) && form.retain_export_log_days >= 0)) &&
    (!form.approval_required || approverTrim.length > 0) &&
    (!form.export_allowed || form.allowed_formats.length > 0);
  const dirty = !!editing && !!form && JSON.stringify(pickEpAuditable(editing)) !== JSON.stringify(pickEpAuditable(form));

  const toggleFormat = (fmt: string, on: boolean) => {
    if (!form) return;
    const set = new Set(form.allowed_formats);
    if (on) set.add(fmt); else set.delete(fmt);
    setForm({ ...form, allowed_formats: [...set] });
  };

  return (
    <>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Classification</TableHead>
              <TableHead className="text-center">Export</TableHead>
              <TableHead>Formats</TableHead>
              <TableHead className="text-right">Max rows</TableHead>
              <TableHead className="text-center">Watermark</TableHead>
              <TableHead className="text-center">Reason</TableHead>
              <TableHead className="text-center">Approval</TableHead>
              <TableHead>Approver</TableHead>
              <TableHead className="text-right">Log days</TableHead>
              <TableHead className="text-center">Active</TableHead>
              <TableHead className="w-16 text-right">Edit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-6">No rows</TableCell></TableRow>
            ) : sorted.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span>{labelOf(p.classification_key)}</span>
                    <span className="font-mono text-xs text-muted-foreground">{p.classification_key}</span>
                  </div>
                </TableCell>
                <TableCell className="text-center">{boolDash(p.export_allowed)}</TableCell>
                <TableCell>
                  {p.allowed_formats.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <div className="flex gap-1 flex-wrap">
                      {p.allowed_formats.map((f) => <Badge key={f} variant="outline" className="text-xs uppercase">{f}</Badge>)}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {p.max_rows_per_export == null ? '∞' : p.max_rows_per_export.toLocaleString()}
                </TableCell>
                <TableCell className="text-center">{boolDash(p.watermark_required)}</TableCell>
                <TableCell className="text-center">{boolDash(p.download_reason_required)}</TableCell>
                <TableCell className="text-center">{boolDash(p.approval_required)}</TableCell>
                <TableCell className="font-mono text-xs">{p.approver_role ?? <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {p.retain_export_log_days == null ? '∞' : p.retain_export_log_days}
                </TableCell>
                <TableCell className="text-center">{p.is_active ? '✓' : '—'}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(p)}
                    disabled={!canWrite}
                    aria-label={`Edit ${p.classification_key} export policy`}
                    title={canWrite ? 'Edit export policy' : 'platform_owner only'}
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
            <DialogTitle>Edit export policy</DialogTitle>
            <DialogDescription>
              One policy per classification. Saved values are recorded but do not enforce
              anything yet — exporters will read this in a future phase.
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Classification (read-only)</Label>
                <Input value={`${labelOf(form.classification_key)}  ·  ${form.classification_key}`} readOnly disabled className="font-mono" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <SwitchRow label="Export allowed"     checked={form.export_allowed}           onChange={(v) => setForm({ ...form, export_allowed: v })} />
                <SwitchRow label="Watermark"          checked={form.watermark_required}       onChange={(v) => setForm({ ...form, watermark_required: v })} />
                <SwitchRow label="Download reason"    checked={form.download_reason_required} onChange={(v) => setForm({ ...form, download_reason_required: v })} />
                <SwitchRow label="Approval required"  checked={form.approval_required}        onChange={(v) => setForm({ ...form, approval_required: v })} />
                <SwitchRow label="Active"             checked={form.is_active}                onChange={(v) => setForm({ ...form, is_active: v })} />
              </div>

              <div className="space-y-1">
                <Label>Allowed formats</Label>
                <div className="flex flex-wrap gap-2">
                  {FORMAT_OPTIONS.map((fmt) => {
                    const on = form.allowed_formats.includes(fmt);
                    return (
                      <Button
                        key={fmt}
                        type="button"
                        size="sm"
                        variant={on ? 'default' : 'outline'}
                        onClick={() => toggleFormat(fmt, !on)}
                        disabled={!form.export_allowed}
                        className="uppercase text-xs"
                      >
                        {fmt}
                      </Button>
                    );
                  })}
                </div>
                {form.export_allowed && form.allowed_formats.length === 0 && (
                  <p className="text-xs text-destructive">Pick at least one format when export is allowed.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="ep-maxrows">Max rows per export</Label>
                  <Input
                    id="ep-maxrows"
                    type="number"
                    min={0}
                    value={form.max_rows_per_export ?? ''}
                    placeholder="Unlimited"
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm({ ...form, max_rows_per_export: v === '' ? null : Number(v) });
                    }}
                  />
                  <p className="text-xs text-muted-foreground">Blank = unlimited · 0 = blocked</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ep-retain">Retain export log (days)</Label>
                  <Input
                    id="ep-retain"
                    type="number"
                    min={0}
                    value={form.retain_export_log_days ?? ''}
                    placeholder="Forever"
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm({ ...form, retain_export_log_days: v === '' ? null : Number(v) });
                    }}
                  />
                  <p className="text-xs text-muted-foreground">Blank = keep forever</p>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="ep-approver">Approver role</Label>
                <Input
                  id="ep-approver"
                  value={form.approver_role ?? ''}
                  placeholder={form.approval_required ? 'e.g. platform_owner' : 'Not required'}
                  list="ep-approver-suggestions"
                  onChange={(e) => setForm({ ...form, approver_role: e.target.value || null })}
                />
                <datalist id="ep-approver-suggestions">
                  {APPROVER_ROLE_SUGGESTIONS.map((r) => <option key={r} value={r} />)}
                </datalist>
                {form.approval_required && approverTrim.length === 0 && (
                  <p className="text-xs text-destructive">Approver role required when approval is on.</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="ep-notes">Notes</Label>
                <Textarea
                  id="ep-notes"
                  value={form.notes ?? ''}
                  maxLength={EP_NOTES_MAX}
                  rows={2}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">{notesLen}/{EP_NOTES_MAX}</p>
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

/* ────────────────────────── 3A.2: Sensitive Field Registry ─────────────── */

type SensitiveField = {
  id: string;
  module_key: string;
  table_name: string;
  column_name: string;
  field_label: string | null;
  classification_key: string;
  pii: boolean;
  phi: boolean;
  financial: boolean;
  notes: string | null;
  is_active: boolean;
};

type SensitiveFieldDraft = Omit<SensitiveField, 'id'> & { id?: string };

const MODULE_OPTIONS = ['pms', 'hrms', 'lms', 'safety', 'incentive', 'platform'] as const;
const SF_TEXT_MAX = 120;
const SF_NOTES_MAX = 500;

function emptyDraft(defaultClassification: string): SensitiveFieldDraft {
  return {
    module_key: 'pms',
    table_name: '',
    column_name: '',
    field_label: '',
    classification_key: defaultClassification,
    pii: false,
    phi: false,
    financial: false,
    notes: '',
    is_active: true,
  };
}

function pickSfAuditable(f: SensitiveFieldDraft) {
  return {
    module_key: f.module_key,
    table_name: f.table_name,
    column_name: f.column_name,
    field_label: f.field_label,
    classification_key: f.classification_key,
    pii: f.pii,
    phi: f.phi,
    financial: f.financial,
    notes: f.notes,
    is_active: f.is_active,
  };
}

function SensitiveFieldsSubTab() {
  const qc = useQueryClient();
  const { user, hasRole } = useAuth();
  const canWrite = hasRole('platform_owner');

  const { data: classifications } = useQuery({
    queryKey: ['platform-settings', 'data-governance', 'classifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('data_classifications')
        .select('classification_key,label,is_active')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['platform-settings', 'data-governance', 'sensitive-fields'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sensitive_fields')
        .select('*')
        .order('module_key', { ascending: true })
        .order('table_name', { ascending: true })
        .order('column_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as SensitiveField[];
    },
  });

  const [filterModule, setFilterModule] = useState<string>('all');
  const [filterClassification, setFilterClassification] = useState<string>('all');
  const [showInactive, setShowInactive] = useState(false);

  const [editing, setEditing] = useState<SensitiveField | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<SensitiveFieldDraft | null>(null);

  useEffect(() => {
    if (creating) {
      const def = classifications?.[0]?.classification_key ?? 'internal';
      setForm(emptyDraft(def));
    } else if (editing) {
      setForm({ ...editing });
    } else {
      setForm(null);
    }
  }, [editing, creating, classifications]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!form) return;
      if (creating) {
        const payload = pickSfAuditable(form);
        const { data: ins, error } = await supabase
          .from('sensitive_fields')
          .insert({ ...payload, created_by: user?.id ?? null, updated_by: user?.id ?? null })
          .select('id')
          .single();
        if (error) throw error;
        const { error: audErr } = await supabase.from('entitlement_audit').insert({
          actor_id: user?.id ?? null,
          event_type: 'create',
          entity_type: 'sensitive_field',
          entity_key: `${form.module_key}.${form.table_name}.${form.column_name}`,
          before: null,
          after: payload,
          reason: 'platform_settings_sensitive_field_create',
        });
        if (audErr) throw audErr;
        return ins;
      }
      if (!editing) return;
      const before = pickSfAuditable(editing);
      const after = pickSfAuditable(form);
      const { error } = await supabase
        .from('sensitive_fields')
        .update({
          field_label: form.field_label,
          classification_key: form.classification_key,
          pii: form.pii,
          phi: form.phi,
          financial: form.financial,
          notes: form.notes,
          is_active: form.is_active,
          updated_by: user?.id ?? null,
        })
        .eq('id', editing.id);
      if (error) throw error;
      const { error: audErr } = await supabase.from('entitlement_audit').insert({
        actor_id: user?.id ?? null,
        event_type: 'update',
        entity_type: 'sensitive_field',
        entity_key: `${editing.module_key}.${editing.table_name}.${editing.column_name}`,
        before,
        after,
        reason: 'platform_settings_sensitive_field_update',
      });
      if (audErr) throw audErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-settings', 'data-governance', 'sensitive-fields'] });
      qc.invalidateQueries({ queryKey: ['platform-settings', 'audit'] });
      toast.success(creating ? 'Sensitive field added' : 'Sensitive field updated');
      setEditing(null);
      setCreating(false);
    },
    onError: (e: Error) => toast.error(`Save failed: ${e.message}`),
  });

  if (isLoading) return <LoadingRows />;

  const isEditMode = !!editing && !creating;
  const labelTrim = (form?.field_label ?? '').trim();
  const tableTrim = (form?.table_name ?? '').trim();
  const columnTrim = (form?.column_name ?? '').trim();
  const notesLen = (form?.notes ?? '').length;
  const valid =
    !!form &&
    !!form.module_key &&
    tableTrim.length > 0 && tableTrim.length <= SF_TEXT_MAX &&
    columnTrim.length > 0 && columnTrim.length <= SF_TEXT_MAX &&
    labelTrim.length <= SF_TEXT_MAX &&
    notesLen <= SF_NOTES_MAX &&
    !!form.classification_key;
  const dirty = creating
    ? true
    : !!editing && !!form && JSON.stringify(pickSfAuditable(editing)) !== JSON.stringify(pickSfAuditable(form));

  const filtered = (data ?? []).filter((f) => {
    if (filterModule !== 'all' && f.module_key !== filterModule) return false;
    if (filterClassification !== 'all' && f.classification_key !== filterClassification) return false;
    if (!showInactive && !f.is_active) return false;
    return true;
  });

  return (
    <>
      <div className="flex flex-wrap items-end gap-3 pb-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Module</Label>
          <Select value={filterModule} onValueChange={setFilterModule}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modules</SelectItem>
              {MODULE_OPTIONS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Classification</Label>
          <Select value={filterClassification} onValueChange={setFilterClassification}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classifications</SelectItem>
              {(classifications ?? []).map((c) => (
                <SelectItem key={c.classification_key} value={c.classification_key}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} id="sf-show-inactive" />
          <Label htmlFor="sf-show-inactive" className="text-sm cursor-pointer">Show inactive</Label>
        </div>
        <div className="ml-auto">
          <Button
            onClick={() => setCreating(true)}
            disabled={!canWrite}
            title={canWrite ? 'Add sensitive field' : 'platform_owner only'}
          >
            <Plus className="h-4 w-4 mr-1" /> Add Field
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Module</TableHead>
              <TableHead>Table</TableHead>
              <TableHead>Column</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Classification</TableHead>
              <TableHead className="text-center">Flags</TableHead>
              <TableHead className="text-center">Active</TableHead>
              <TableHead className="w-16 text-right">Edit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No sensitive fields registered</TableCell></TableRow>
            ) : filtered.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-mono text-xs">{f.module_key}</TableCell>
                <TableCell className="font-mono text-xs">{f.table_name}</TableCell>
                <TableCell className="font-mono text-xs">{f.column_name}</TableCell>
                <TableCell>{f.field_label || <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell><Badge variant="outline" className="text-xs">{f.classification_key}</Badge></TableCell>
                <TableCell className="text-center">
                  <div className="flex gap-1 justify-center">
                    {f.pii && <Badge variant="secondary" className="text-xs">PII</Badge>}
                    {f.phi && <Badge variant="secondary" className="text-xs">PHI</Badge>}
                    {f.financial && <Badge variant="secondary" className="text-xs">FIN</Badge>}
                    {!f.pii && !f.phi && !f.financial && <span className="text-muted-foreground">—</span>}
                  </div>
                </TableCell>
                <TableCell className="text-center">{f.is_active ? '✓' : '—'}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(f)}
                    disabled={!canWrite}
                    aria-label={`Edit ${f.module_key}.${f.table_name}.${f.column_name}`}
                    title={canWrite ? 'Edit sensitive field' : 'platform_owner only'}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={editing !== null || creating}
        onOpenChange={(o) => { if (!o && !mut.isPending) { setEditing(null); setCreating(false); } }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{creating ? 'Add sensitive field' : 'Edit sensitive field'}</DialogTitle>
            <DialogDescription>
              Registry only. Saved values are recorded with an audit row but do not mask,
              block, or otherwise change any PMS behaviour yet.
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="sf-module">Module</Label>
                  <Select
                    value={form.module_key}
                    onValueChange={(v) => setForm({ ...form, module_key: v })}
                    disabled={isEditMode}
                  >
                    <SelectTrigger id="sf-module"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MODULE_OPTIONS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sf-table">Table</Label>
                  <Input
                    id="sf-table"
                    value={form.table_name}
                    maxLength={SF_TEXT_MAX}
                    readOnly={isEditMode}
                    disabled={isEditMode}
                    onChange={(e) => setForm({ ...form, table_name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sf-col">Column</Label>
                  <Input
                    id="sf-col"
                    value={form.column_name}
                    maxLength={SF_TEXT_MAX}
                    readOnly={isEditMode}
                    disabled={isEditMode}
                    onChange={(e) => setForm({ ...form, column_name: e.target.value })}
                  />
                </div>
              </div>
              {isEditMode && (
                <p className="text-xs text-muted-foreground">
                  Module, table and column are immutable after creation. Add a new row if the identity changes.
                </p>
              )}

              <div className="space-y-1">
                <Label htmlFor="sf-label">Field label</Label>
                <Input
                  id="sf-label"
                  value={form.field_label ?? ''}
                  maxLength={SF_TEXT_MAX}
                  placeholder="Human-readable label (optional)"
                  onChange={(e) => setForm({ ...form, field_label: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="sf-class">Classification</Label>
                <Select
                  value={form.classification_key}
                  onValueChange={(v) => setForm({ ...form, classification_key: v })}
                >
                  <SelectTrigger id="sf-class"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(classifications ?? []).map((c) => (
                      <SelectItem key={c.classification_key} value={c.classification_key}>
                        {c.label} <span className="font-mono text-xs text-muted-foreground ml-1">({c.classification_key})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <SwitchRow label="PII"       checked={form.pii}       onChange={(v) => setForm({ ...form, pii: v })} />
                <SwitchRow label="PHI"       checked={form.phi}       onChange={(v) => setForm({ ...form, phi: v })} />
                <SwitchRow label="Financial" checked={form.financial} onChange={(v) => setForm({ ...form, financial: v })} />
                <SwitchRow label="Active"    checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} />
              </div>

              <div className="space-y-1">
                <Label htmlFor="sf-notes">Notes</Label>
                <Textarea
                  id="sf-notes"
                  value={form.notes ?? ''}
                  maxLength={SF_NOTES_MAX}
                  rows={2}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">{notesLen}/{SF_NOTES_MAX}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setEditing(null); setCreating(false); }}
              disabled={mut.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => mut.mutate()}
              disabled={!valid || !dirty || !canWrite || mut.isPending}
            >
              {mut.isPending ? 'Saving…' : creating ? 'Add' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}