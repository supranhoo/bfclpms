import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  DndContext, PointerSensor, useSensor, useSensors, closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import {
  GripVertical, Eye, EyeOff, Save, RotateCcw, Sparkles, Database, AlertCircle,
  ChevronDown, ChevronRight, Search, FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useSystemSetting, useUpdateSystemSetting } from '@/hooks/useSystemSettings';
import {
  useReportRegistry, useReportFieldRegistry, useReportFieldOverridesAll,
} from '@/hooks/useResolvedReportFields';
import { applyFieldOverrides } from '@/lib/reports/applyFieldOverrides';
import { REPORT_CATALOG, flattenCatalog } from '@/lib/reports/catalog';
import type {
  ReportFieldOverrideRow, ReportFieldRegistryRow, ReportRegistryRow, ResolvedReportField,
} from '@/lib/reports/types';

type PendingDraft = {
  field_key: string;
  label: string;
  sort: number;
  is_hidden: boolean;
};

export function ReportFieldSequenceTab() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { data: flagSetting } = useSystemSetting('report_overrides_enabled');
  const updateSetting = useUpdateSystemSetting();
  const { data: reports = [], isLoading: regLoading } = useReportRegistry();
  const { data: fieldRegistry = [], isLoading: fieldsLoading } = useReportFieldRegistry();
  const { data: allOverrides = [] } = useReportFieldOverridesAll();

  const [seeding, setSeeding] = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, PendingDraft[]>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [resetAllOpen, setResetAllOpen] = useState(false);

  const flagEnabled = useMemo(() => {
    const v = flagSetting?.setting_value as unknown;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return v === 'true' || v === '"true"';
    return false;
  }, [flagSetting]);

  const isEmpty = !regLoading && reports.length === 0;

  const fieldsByReport = useMemo(() => {
    const m = new Map<string, ReportFieldRegistryRow[]>();
    for (const f of fieldRegistry) {
      const arr = m.get(f.report_id) ?? [];
      arr.push(f);
      m.set(f.report_id, arr);
    }
    return m;
  }, [fieldRegistry]);

  const overridesByReport = useMemo(() => {
    const m = new Map<string, ReportFieldOverrideRow[]>();
    for (const o of allOverrides) {
      const arr = m.get(o.report_id) ?? [];
      arr.push(o);
      m.set(o.report_id, arr);
    }
    return m;
  }, [allOverrides]);

  const filteredReports = useMemo(() => {
    const sorted = [...reports].sort((a, b) => a.sort_order - b.sort_order);
    if (!search.trim()) return sorted;
    const q = search.toLowerCase();
    return sorted.filter(
      (r) =>
        r.display_name.toLowerCase().includes(q) ||
        r.report_id.toLowerCase().includes(q) ||
        r.module_prefix.toLowerCase().includes(q),
    );
  }, [reports, search]);

  function getResolved(reportId: string): ResolvedReportField[] {
    return applyFieldOverrides(fieldsByReport.get(reportId) ?? [], overridesByReport.get(reportId) ?? []);
  }

  function startDraft(reportId: string) {
    const resolved = getResolved(reportId);
    setDrafts((prev) => ({
      ...prev,
      [reportId]: resolved.map((f, idx) => ({
        field_key: f.field_key,
        label: f.label,
        sort: (idx + 1) * 10,
        is_hidden: f.is_hidden,
      })),
    }));
  }

  function discardDraft(reportId: string) {
    setDrafts((prev) => {
      const n = { ...prev }; delete n[reportId]; return n;
    });
  }

  async function seedAll() {
    setSeeding(true);
    try {
      const { reports: regs, fields } = flattenCatalog();
      const { error: e1 } = await supabase
        .from('report_registry' as any)
        .upsert(regs as any, { onConflict: 'report_id' });
      if (e1) throw e1;
      if (fields.length > 0) {
        const { error: e2 } = await supabase
          .from('report_field_registry' as any)
          .upsert(fields as any, { onConflict: 'report_id,field_key' });
        if (e2) throw e2;
      }
      toast.success(`Seeded ${regs.length} reports / ${fields.length} fields`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['report-registry'] }),
        qc.invalidateQueries({ queryKey: ['report-field-registry'] }),
      ]);
    } catch (e: any) {
      toast.error(`Seed failed: ${e.message ?? e}`);
    } finally {
      setSeeding(false);
    }
  }

  async function saveReportDrafts(report: ReportRegistryRow) {
    const draft = drafts[report.report_id];
    if (!draft) return;
    setSavingId(report.report_id);
    try {
      const existing = overridesByReport.get(report.report_id) ?? [];
      const existingByKey = new Map(existing.map((o) => [o.field_key, o]));
      const registry = fieldsByReport.get(report.report_id) ?? [];
      const regByKey = new Map(registry.map((r) => [r.field_key, r]));

      const auditRows: any[] = [];
      for (const d of draft) {
        const reg = regByKey.get(d.field_key);
        if (!reg) continue;
        const customLabel = reg.is_renamable && d.label.trim() && d.label.trim() !== reg.default_label
          ? d.label.trim()
          : null;
        const customSort = d.sort !== reg.default_sort ? d.sort : null;
        const isHidden = reg.is_required ? false : d.is_hidden;

        const existingRow = existingByKey.get(d.field_key);
        const payload = {
          report_id: report.report_id,
          field_key: d.field_key,
          client_id: null,
          custom_label: customLabel,
          custom_sort: customSort,
          is_hidden: isHidden,
          is_active: true,
          updated_by: profile?.id ?? null,
          updated_at: new Date().toISOString(),
        };

        if (existingRow) {
          const { error } = await supabase
            .from('report_field_overrides' as any).update(payload).eq('id', existingRow.id);
          if (error) throw error;
        } else if (customLabel !== null || customSort !== null || isHidden) {
          const { error } = await supabase.from('report_field_overrides' as any).insert(payload);
          if (error) throw error;
        } else {
          continue;
        }

        const prevLabel = existingRow?.custom_label ?? reg.default_label;
        const prevSort = existingRow?.custom_sort ?? reg.default_sort;
        const prevHidden = existingRow?.is_hidden ?? false;
        if ((customLabel ?? reg.default_label) !== prevLabel) {
          auditRows.push({
            report_id: report.report_id, field_key: d.field_key, client_id: null,
            field: 'label', old_value: prevLabel, new_value: customLabel ?? reg.default_label,
            changed_by: profile?.id ?? null,
          });
        }
        if ((customSort ?? reg.default_sort) !== prevSort) {
          auditRows.push({
            report_id: report.report_id, field_key: d.field_key, client_id: null,
            field: 'sort', old_value: String(prevSort), new_value: String(customSort ?? reg.default_sort),
            changed_by: profile?.id ?? null,
          });
        }
        if (isHidden !== prevHidden) {
          auditRows.push({
            report_id: report.report_id, field_key: d.field_key, client_id: null,
            field: 'is_hidden', old_value: String(prevHidden), new_value: String(isHidden),
            changed_by: profile?.id ?? null,
          });
        }
      }
      if (auditRows.length > 0) {
        await supabase.from('report_field_override_audit' as any).insert(auditRows);
      }

      toast.success(`Saved ${report.display_name}`);
      discardDraft(report.report_id);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['report-field-overrides-all'] }),
        qc.invalidateQueries({ queryKey: ['report-field-overrides', report.report_id] }),
      ]);
    } catch (e: any) {
      toast.error(`Save failed: ${e.message ?? e}`);
    } finally {
      setSavingId(null);
    }
  }

  async function resetReport(report: ReportRegistryRow) {
    try {
      const { error } = await supabase
        .from('report_field_overrides' as any)
        .update({ is_active: false })
        .eq('report_id', report.report_id)
        .is('client_id', null)
        .eq('is_active', true);
      if (error) throw error;
      await supabase.from('report_field_override_audit' as any).insert({
        report_id: report.report_id, field_key: null, client_id: null,
        field: 'reset', old_value: null, new_value: 'reset_report',
        changed_by: profile?.id ?? null,
      });
      toast.success(`${report.display_name} reset to defaults`);
      discardDraft(report.report_id);
      await qc.invalidateQueries({ queryKey: ['report-field-overrides-all'] });
    } catch (e: any) {
      toast.error(`Reset failed: ${e.message ?? e}`);
    }
  }

  async function resetAll() {
    try {
      const { error } = await supabase
        .from('report_field_overrides' as any)
        .update({ is_active: false })
        .is('client_id', null)
        .eq('is_active', true);
      if (error) throw error;
      await supabase.from('report_field_override_audit' as any).insert({
        report_id: '__ALL__', field_key: null, client_id: null,
        field: 'reset', old_value: null, new_value: 'reset_all',
        changed_by: profile?.id ?? null,
      });
      toast.success('All report customizations reset');
      setDrafts({});
      await qc.invalidateQueries({ queryKey: ['report-field-overrides-all'] });
    } catch (e: any) {
      toast.error(`Reset failed: ${e.message ?? e}`);
    } finally {
      setResetAllOpen(false);
    }
  }

  if (regLoading || fieldsLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Report Field Sequence
              </CardTitle>
              <CardDescription>
                Reorder, rename, and hide columns per report. Field keys and report routes never change.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 border rounded-md">
                <Label htmlFor="report-overrides-enabled" className="text-sm cursor-pointer">
                  Enable overrides
                </Label>
                <Switch
                  id="report-overrides-enabled"
                  checked={flagEnabled}
                  onCheckedChange={(checked) =>
                    updateSetting.mutate({ key: 'report_overrides_enabled', value: String(checked) })
                  }
                />
              </div>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setResetAllOpen(true)}>
                <RotateCcw className="h-4 w-4" /> Reset all
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Empty state */}
      {isEmpty && (
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg bg-primary/10"><Database className="h-5 w-5 text-primary" /></div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">Report registry is empty</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Seed the report catalog to enable per-report column customization.
                </p>
                <Button onClick={seedAll} disabled={seeding} className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  {seeding ? 'Seeding…' : `Seed ${REPORT_CATALOG.length} reports`}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Disabled flag warning */}
      {!flagEnabled && !isEmpty && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/10 text-sm">
          <AlertCircle className="h-4 w-4 mt-0.5 text-amber-600 flex-shrink-0" />
          <div>
            <p className="font-medium">Overrides are currently inactive</p>
            <p className="text-muted-foreground">
              Edits are saved but reports keep rendering their hardcoded defaults until you enable overrides above.
            </p>
          </div>
        </div>
      )}

      {/* Search + re-seed */}
      {!isEmpty && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search report by name or ID…" className="h-8 pl-7"
            />
          </div>
          <Button variant="ghost" size="sm" onClick={seedAll} disabled={seeding} className="gap-2">
            <Sparkles className="h-4 w-4" /> Re-seed catalog
          </Button>
        </div>
      )}

      {/* Report list */}
      <div className="space-y-2">
        {filteredReports.map((report) => {
          const isOpen = !!expanded[report.report_id];
          const fields = fieldsByReport.get(report.report_id) ?? [];
          const resolved = getResolved(report.report_id);
          const draft = drafts[report.report_id];
          const isDirty = !!draft;
          const overrideCount = (overridesByReport.get(report.report_id) ?? []).filter((o) => o.is_active).length;
          return (
            <Card key={report.report_id}>
              <Collapsible open={isOpen} onOpenChange={(open) => {
                setExpanded((prev) => ({ ...prev, [report.report_id]: open }));
                if (open && !draft) startDraft(report.report_id);
                if (!open) discardDraft(report.report_id);
              }}>
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30">
                    <div className="flex items-center gap-3 min-w-0">
                      {isOpen ? <ChevronDown className="h-4 w-4 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 flex-shrink-0" />}
                      <div className="min-w-0">
                        <div className="font-medium truncate">{report.display_name}</div>
                        <div className="text-xs text-muted-foreground font-mono truncate">
                          {report.report_id} · {report.canonical_route}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {fields.length === 0 && (
                        <Badge variant="outline" className="text-xs">No fields</Badge>
                      )}
                      {fields.length > 0 && (
                        <Badge variant="outline" className="text-xs">{fields.length} columns</Badge>
                      )}
                      {overrideCount > 0 && (
                        <Badge variant="default" className="text-xs">{overrideCount} customized</Badge>
                      )}
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border-t px-4 pb-4 pt-3">
                    {fields.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4">
                        Columns for this report are not yet catalogued. Wire its page to <code>useResolvedReportFields()</code> and seed its field registry to enable customization.
                      </p>
                    ) : (
                      <FieldDnDList
                        items={draft ?? resolved.map((f, idx) => ({
                          field_key: f.field_key, label: f.label, sort: (idx + 1) * 10, is_hidden: f.is_hidden,
                        }))}
                        registry={fields}
                        onChange={(next) => setDrafts((prev) => ({ ...prev, [report.report_id]: next }))}
                      />
                    )}
                    {fields.length > 0 && (
                      <div className="flex items-center justify-end gap-2 mt-3">
                        <Button variant="ghost" size="sm" onClick={() => resetReport(report)} className="gap-2">
                          <RotateCcw className="h-3.5 w-3.5" /> Reset this report
                        </Button>
                        <Button variant="ghost" size="sm" disabled={!isDirty} onClick={() => discardDraft(report.report_id)}>
                          Discard
                        </Button>
                        <Button size="sm" disabled={!isDirty || savingId === report.report_id}
                          onClick={() => saveReportDrafts(report)} className="gap-2">
                          <Save className="h-3.5 w-3.5" /> {savingId === report.report_id ? 'Saving…' : 'Save'}
                        </Button>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}
        {filteredReports.length === 0 && !isEmpty && (
          <p className="text-sm text-muted-foreground py-4 text-center">No reports match "{search}".</p>
        )}
      </div>

      <ConfirmDestructiveDialog
        open={resetAllOpen}
        onCancel={() => setResetAllOpen(false)}
        onConfirm={resetAll}
        title="Reset every report customization?"
        description="All column rename / reorder / hide overrides across every report revert to defaults. This action is logged."
        confirmLabel="Reset everything"
      />
    </div>
  );
}

// ── Sortable field list ────────────────────────────────────────────────────
function FieldDnDList(props: {
  items: PendingDraft[];
  registry: ReportFieldRegistryRow[];
  onChange: (next: PendingDraft[]) => void;
}) {
  const { items, registry, onChange } = props;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const regByKey = useMemo(() => new Map(registry.map((r) => [r.field_key, r])), [registry]);

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.field_key === active.id);
    const to = items.findIndex((i) => i.field_key === over.id);
    if (from < 0 || to < 0) return;
    const moved = arrayMove(items, from, to);
    onChange(moved.map((m, idx) => ({ ...m, sort: (idx + 1) * 10 })));
  }

  function updateItem(field_key: string, patch: Partial<PendingDraft>) {
    onChange(items.map((i) => (i.field_key === field_key ? { ...i, ...patch } : i)));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.field_key)} strategy={verticalListSortingStrategy}>
        <div className="space-y-1">
          {items.map((item) => {
            const reg = regByKey.get(item.field_key);
            if (!reg) return null;
            return (
              <SortableFieldRow
                key={item.field_key}
                item={item}
                reg={reg}
                onChange={(patch) => updateItem(item.field_key, patch)}
              />
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableFieldRow(props: {
  item: PendingDraft;
  reg: ReportFieldRegistryRow;
  onChange: (patch: Partial<PendingDraft>) => void;
}) {
  const { item, reg, onChange } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.field_key });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}
      className="flex items-center gap-2 p-2 rounded border bg-card hover:bg-muted/30">
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground"
        {...attributes} {...listeners}
        aria-label={`Drag ${reg.default_label}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Input
        value={item.label}
        disabled={!reg.is_renamable}
        onChange={(e) => onChange({ label: e.target.value })}
        placeholder={reg.default_label}
        className="h-8 text-sm flex-1 min-w-0"
      />
      <code className="text-[10px] text-muted-foreground font-mono flex-shrink-0">{reg.field_key}</code>
      {reg.is_required && <Badge variant="outline" className="text-xs">Required</Badge>}
      {!reg.is_renamable && <Badge variant="outline" className="text-xs">Locked label</Badge>}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 flex-shrink-0"
        disabled={reg.is_required}
        onClick={() => onChange({ is_hidden: !item.is_hidden })}
        title={item.is_hidden ? 'Show column' : 'Hide column'}
      >
        {item.is_hidden ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4" />}
      </Button>
    </div>
  );
}