import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ClipboardCheck, MoreVertical, Plus, Pencil, Power, Trash2 } from 'lucide-react';
import { useEmployeeMasterFieldRequirements, EMPLOYEE_MASTER_FIELDS_SETTING_KEY } from '@/hooks/useEmployeeMasterFieldRequirements';
import { useUpdateSystemSetting } from '@/hooks/useSystemSettings';
import { EMPLOYEE_MASTER_FIELDS } from '@/lib/employeeMasterFields';
import { RequiredMark } from '@/components/ui/RequiredMark';
import { CUSTOM_FIELD_TYPE_LABELS, type CustomFieldDef } from '@/lib/employeeMasterCustomFields';
import {
  useEmployeeMasterCustomFieldDefs,
  useSetEmployeeMasterCustomFieldFlags,
  useDeleteEmployeeMasterCustomField,
} from '@/hooks/useEmployeeMasterCustomFields';
import { EmployeeMasterCustomFieldDialog } from './EmployeeMasterCustomFieldDialog';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { useToast } from '@/hooks/use-toast';

export function EmployeeMasterFieldsCard() {
  const { requirements, isLoading } = useEmployeeMasterFieldRequirements();
  const update = useUpdateSystemSetting();
  const { toast } = useToast();
  const { data: customFields = [], isLoading: isLoadingCustom } = useEmployeeMasterCustomFieldDefs();
  const setFlags = useSetEmployeeMasterCustomFieldFlags();
  const deleteField = useDeleteEmployeeMasterCustomField();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CustomFieldDef | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomFieldDef | null>(null);

  const handleToggle = (key: string, checked: boolean) => {
    const next = { ...requirements, [key]: checked };
    // Always-required keys remain true regardless of input.
    for (const f of EMPLOYEE_MASTER_FIELDS) {
      if (f.alwaysRequired) (next as any)[f.key] = true;
    }
    update.mutate({
      key: EMPLOYEE_MASTER_FIELDS_SETTING_KEY,
      // useUpdateSystemSetting deep-clones via JSON.parse(JSON.stringify(value)),
      // so passing the object directly stores it as a JSON object (not a string).
      value: next as unknown as string,
    });
  };

  const openAdd = () => {
    setEditTarget(null);
    setDialogOpen(true);
  };

  const openEdit = (def: CustomFieldDef) => {
    setEditTarget(def);
    setDialogOpen(true);
  };

  const toggleCustomMandatory = (def: CustomFieldDef, v: boolean) => {
    setFlags.mutate(
      { id: def.id, patch: { is_mandatory: v } },
      {
        onError: (e: any) =>
          toast({ title: 'Update failed', description: e?.message, variant: 'destructive' }),
      },
    );
  };

  const toggleCustomActive = (def: CustomFieldDef) => {
    setFlags.mutate(
      { id: def.id, patch: { is_active: !def.is_active } },
      {
        onSuccess: () =>
          toast({ title: def.is_active ? 'Field deactivated' : 'Field activated' }),
        onError: (e: any) =>
          toast({ title: 'Update failed', description: e?.message, variant: 'destructive' }),
      },
    );
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    deleteField.mutate(id, {
      onSuccess: () => {
        toast({ title: 'Custom field deleted' });
        setDeleteTarget(null);
      },
      onError: (e: any) => {
        toast({ title: 'Delete failed', description: e?.message, variant: 'destructive' });
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              Employee Master Fields
            </CardTitle>
            <CardDescription>
              Configure which fields are required when creating a new user. Fields marked
              mandatory show a small red <RequiredMark /> indicator next to their label on the
              Add New User page.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={openAdd}>
            <Plus className="h-4 w-4" /> Add Field
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {EMPLOYEE_MASTER_FIELDS.map((f) => {
            const checked = !!requirements[f.key];
            const disabled = !!f.alwaysRequired || isLoading || update.isPending;
            return (
              <div
                key={f.key}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2.5 min-h-[56px]"
              >
                <div className="min-w-0 space-y-0.5">
                  <Label className="text-sm font-medium block truncate">{f.label}</Label>
                  {f.alwaysRequired && (
                    <p className="text-xs text-muted-foreground">Required by system</p>
                  )}
                </div>
                <Switch
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(v) => handleToggle(f.key, v)}
                  aria-label={`Mandatory: ${f.label}`}
                />
              </div>
            );
          })}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold">Custom Fields</h4>
              <p className="text-xs text-muted-foreground">
                Admin-defined fields. They render on Add New User when active and the
                "Show on Add New User" toggle is on.
              </p>
            </div>
          </div>

          {isLoadingCustom ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : customFields.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                No custom fields yet. Use <span className="font-medium">Add Field</span> to create one.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {customFields.map((def) => (
                <div
                  key={def.id}
                  className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2.5 min-h-[56px]"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Label className="text-sm font-medium block truncate">{def.field_label}</Label>
                      {!def.is_active && (
                        <Badge variant="outline" className="text-[10px] uppercase">Inactive</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {CUSTOM_FIELD_TYPE_LABELS[def.field_type]}
                      {' · '}
                      <span className="font-mono">{def.field_key}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Switch
                      checked={def.is_mandatory}
                      disabled={!def.is_active || setFlags.isPending}
                      onCheckedChange={(v) => toggleCustomMandatory(def, v)}
                      aria-label={`Mandatory: ${def.field_label}`}
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Field actions">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(def)}>
                          <Pencil className="h-4 w-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleCustomActive(def)}>
                          <Power className="h-4 w-4 mr-2" />
                          {def.is_active ? 'Deactivate' : 'Activate'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteTarget(def)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>

      <EmployeeMasterCustomFieldDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        existing={editTarget}
      />

      <ConfirmDestructiveDialog
        open={!!deleteTarget}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.field_label}"?`}
        description="This permanently removes the field definition. Any values already saved against this field on existing employees will be orphaned. Consider deactivating instead."
        confirmLabel="Delete field"
        isLoading={deleteField.isPending}
      />
    </Card>
  );
}