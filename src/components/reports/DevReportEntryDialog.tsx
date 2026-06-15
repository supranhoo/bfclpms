import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useUpsertDevReportEntry,
  type DevReportEntry,
  type DevReportEntryType,
} from '@/hooks/useDevReportEntries';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entryType: DevReportEntryType;
  initial?: DevReportEntry | null;
}

const STATUS_OPTIONS = ['Shipped', 'In Progress', 'Planned'];
const SEVERITY_OPTIONS = ['Critical', 'High', 'Major', 'Medium', 'Low'];
const TIMELINE_TYPES = ['Feature', 'Bug Fix', 'Maintenance'];

export function DevReportEntryDialog({ open, onOpenChange, entryType, initial }: Props) {
  const upsert = useUpsertDevReportEntry();
  const [form, setForm] = useState({
    entry_date: '',
    period_label: '',
    title: '',
    module_area: '',
    description: '',
    status: 'Shipped',
    severity: 'Medium',
    timeline_type: 'Feature',
    adr_refs: '',
    linked_commit: '',
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      entry_date: initial?.entry_date ?? '',
      period_label: initial?.period_label ?? '',
      title: initial?.title ?? '',
      module_area: initial?.module_area ?? '',
      description: initial?.description ?? '',
      status: initial?.status ?? 'Shipped',
      severity: initial?.severity ?? 'Medium',
      timeline_type: initial?.timeline_type ?? 'Feature',
      adr_refs: (initial?.adr_refs ?? []).join(', '),
      linked_commit: initial?.linked_commit ?? '',
    });
  }, [open, initial]);

  const submit = async () => {
    if (!form.title.trim() || !form.description.trim()) return;
    if (!form.entry_date && !form.period_label.trim()) return;
    await upsert.mutateAsync({
      id: initial?.id,
      entry_type: entryType,
      entry_date: form.entry_date || null,
      period_label: form.period_label.trim() || null,
      title: form.title.trim(),
      module_area: form.module_area.trim() || null,
      description: form.description.trim(),
      status: entryType === 'feature' ? form.status : null,
      severity: entryType === 'bug' ? form.severity : null,
      timeline_type: entryType === 'timeline' ? form.timeline_type : null,
      adr_refs: form.adr_refs
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
      linked_commit: form.linked_commit.trim() || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {initial ? 'Edit' : 'Add'} {entryType === 'feature' ? 'Feature' : entryType === 'bug' ? 'Bug Fix' : 'Timeline'} entry
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Entry Date</Label>
              <Input
                type="date"
                value={form.entry_date}
                onChange={(e) => setForm({ ...form, entry_date: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Period Label (fallback)</Label>
              <Input
                placeholder="e.g. 2026 Jun W1"
                value={form.period_label}
                onChange={(e) => setForm({ ...form, period_label: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Title *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          {entryType !== 'timeline' && (
            <div className="space-y-1">
              <Label>Module / Area</Label>
              <Input
                value={form.module_area}
                onChange={(e) => setForm({ ...form, module_area: e.target.value })}
              />
            </div>
          )}

          <div className="space-y-1">
            <Label>{entryType === 'bug' ? 'Fix Description' : entryType === 'feature' ? 'What Was Built' : 'Summary'} *</Label>
            <Textarea
              rows={5}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {entryType === 'feature' && (
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {entryType === 'bug' && (
              <div className="space-y-1">
                <Label>Severity</Label>
                <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SEVERITY_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {entryType === 'timeline' && (
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={form.timeline_type} onValueChange={(v) => setForm({ ...form, timeline_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIMELINE_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>ADR / Policy refs</Label>
              <Input
                placeholder="ADR-072, POLICY §54 v5"
                value={form.adr_refs}
                onChange={(e) => setForm({ ...form, adr_refs: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Linked commit / PR (optional)</Label>
            <Input
              value={form.linked_commit}
              onChange={(e) => setForm({ ...form, linked_commit: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={upsert.isPending}>
            {upsert.isPending ? 'Saving…' : 'Save entry'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}