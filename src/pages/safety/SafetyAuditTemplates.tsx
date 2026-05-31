import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, FileText, Loader2, Trash2, Save, ArrowLeft, ArrowRight } from 'lucide-react';
import {
  useAuditTemplates,
  useAuditTemplateItems,
  useCreateAuditTemplate,
  useUpdateAuditTemplate,
  useUpsertTemplateItems,
} from '@/hooks/useSafetyAudits';
import {
  SAFETY_AUDIT_CATEGORIES,
  SAFETY_AUDIT_CATEGORY_LABEL,
} from '@/lib/safetyAudits';
import { toast } from 'sonner';

/**
 * Admin template manager. Two-pane: templates list on the left, item editor on the right.
 */
export default function SafetyAuditTemplates() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const { data: templates = [], isLoading } = useAuditTemplates({ activeOnly: false });

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/safety/audits"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
        </Button>
        <h1 className="text-xl font-bold flex-1">Audit Templates</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> New Template</Button>
          </DialogTrigger>
          <CreateTemplateDialog
            onCreated={(id) => {
              setSelectedId(id);
              setCreateOpen(false);
            }}
          />
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Templates</CardTitle>
            <CardDescription>{templates.length} total</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {isLoading && (
              <div className="text-sm text-muted-foreground py-4 text-center">Loading…</div>
            )}
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`w-full text-left flex items-center gap-2 p-2 rounded-lg border ${
                  selectedId === t.id ? 'bg-muted' : 'hover:bg-muted/50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{t.title}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {t.code} · v{t.version} · {SAFETY_AUDIT_CATEGORY_LABEL[t.category as keyof typeof SAFETY_AUDIT_CATEGORY_LABEL] ?? t.category}
                  </div>
                </div>
                {!t.is_active && <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            ))}
            {!isLoading && templates.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No templates yet.
              </div>
            )}
          </CardContent>
        </Card>

        <div className="md:col-span-2">
          {selectedId ? (
            <TemplateEditor templateId={selectedId} />
          ) : (
            <Card>
              <CardContent className="py-16 text-center text-sm text-muted-foreground">
                Select a template to edit, or create a new one.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateTemplateDialog({ onCreated }: { onCreated: (id: string) => void }) {
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('general');
  const create = useCreateAuditTemplate();

  async function onSave() {
    if (!code.trim() || !title.trim()) { toast.error('Code and title are required.'); return; }
    try {
      const row = await create.mutateAsync({
        code: code.trim(),
        title: title.trim(),
        description: description.trim() || null,
        category,
      });
      toast.success('Template created.');
      onCreated(row.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create template.');
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New Audit Template</DialogTitle>
        <DialogDescription>Add items after creating the template.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Code *</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. SAF-HOUSE-01" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Title *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Monthly Housekeeping Audit" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SAFETY_AUDIT_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{SAFETY_AUDIT_CATEGORY_LABEL[c]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={onSave} disabled={create.isPending}>
          {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Create Template
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

interface DraftItem {
  id?: string;
  section: string;
  prompt: string;
  weight: number;
  is_critical: boolean;
  evidence_required: boolean;
  sort_order: number;
}

function TemplateEditor({ templateId }: { templateId: string }) {
  const { data: items = [], isLoading } = useAuditTemplateItems(templateId);
  const update = useUpdateAuditTemplate();
  const upsert = useUpsertTemplateItems();

  const [draft, setDraft] = useState<DraftItem[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [active, setActive] = useState<boolean | null>(null);

  // Sync draft when server data loads or templateId changes.
  // Use a key trick: reset when items signature changes.
  const sig = items.map((i) => i.id).join('|');
  if (draft.length === 0 && items.length > 0 && removed.length === 0) {
    setDraft(items.map((i) => ({
      id: i.id,
      section: i.section,
      prompt: i.prompt,
      weight: i.weight,
      is_critical: i.is_critical,
      evidence_required: i.evidence_required,
      sort_order: i.sort_order,
    })));
  }

  function addItem() {
    setDraft((d) => [
      ...d,
      {
        section: 'General',
        prompt: '',
        weight: 1,
        is_critical: false,
        evidence_required: false,
        sort_order: d.length,
      },
    ]);
  }
  function removeItem(idx: number) {
    setDraft((d) => {
      const next = [...d];
      const [removedItem] = next.splice(idx, 1);
      if (removedItem.id) setRemoved((r) => [...r, removedItem.id!]);
      return next.map((it, i) => ({ ...it, sort_order: i }));
    });
  }
  function setItem(idx: number, patch: Partial<DraftItem>) {
    setDraft((d) => d.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  async function onSave() {
    if (draft.some((d) => !d.prompt.trim())) {
      toast.error('Every item needs a prompt.');
      return;
    }
    try {
      await upsert.mutateAsync({ templateId, items: draft, removedIds: removed });
      if (active !== null) {
        await update.mutateAsync({ id: templateId, is_active: active });
      }
      setRemoved([]);
      setActive(null);
      toast.success('Template saved.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed.');
    }
  }

  return (
    <Card key={sig}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Items</CardTitle>
        <CardDescription>Weight is used in the score; critical items auto-create incidents on No.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
        {draft.map((it, idx) => (
          <div key={idx} className="rounded-lg border p-3 space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <Input
                value={it.section}
                onChange={(e) => setItem(idx, { section: e.target.value })}
                placeholder="Section"
              />
              <Input
                className="md:col-span-3"
                value={it.prompt}
                onChange={(e) => setItem(idx, { prompt: e.target.value })}
                placeholder="Prompt (e.g. Are walkways free of obstructions?)"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-1">
                Weight
                <Input
                  type="number"
                  min={0.1}
                  max={100}
                  step={0.1}
                  className="h-7 w-20"
                  value={it.weight}
                  onChange={(e) => setItem(idx, { weight: Number(e.target.value) })}
                />
              </label>
              <label className="flex items-center gap-1">
                <Switch
                  checked={it.is_critical}
                  onCheckedChange={(v) => setItem(idx, { is_critical: v })}
                />
                Critical
              </label>
              <label className="flex items-center gap-1">
                <Switch
                  checked={it.evidence_required}
                  onCheckedChange={(v) => setItem(idx, { evidence_required: v })}
                />
                Evidence required on No
              </label>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => removeItem(idx)}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
              </Button>
            </div>
          </div>
        ))}
        {draft.length === 0 && !isLoading && (
          <div className="text-sm text-muted-foreground text-center py-4">No items yet.</div>
        )}
        <div className="flex flex-wrap gap-2 justify-between">
          <Button variant="outline" size="sm" onClick={addItem}>
            <Plus className="h-4 w-4 mr-1" /> Add Item
          </Button>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs">
              <Switch
                checked={active ?? true}
                onCheckedChange={setActive}
              />
              Active
            </label>
            <Button onClick={onSave} disabled={upsert.isPending || update.isPending}>
              {(upsert.isPending || update.isPending)
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Save className="h-4 w-4 mr-2" />}
              Save Changes
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}