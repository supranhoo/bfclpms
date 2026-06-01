import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  CUSTOM_FIELD_TYPES,
  CUSTOM_FIELD_TYPE_LABELS,
  customFieldDefSchema,
  sanitizeFieldKey,
  type CustomFieldDef,
  type CustomFieldType,
  type DropdownOption,
} from '@/lib/employeeMasterCustomFields';
import { useUpsertEmployeeMasterCustomField } from '@/hooks/useEmployeeMasterCustomFields';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: CustomFieldDef | null;
}

interface FormState {
  field_label: string;
  field_key: string;
  field_key_touched: boolean;
  field_type: CustomFieldType;
  is_mandatory: boolean;
  show_on_add_user: boolean;
  show_on_edit_user: boolean;
  show_in_employee_master: boolean;
  dropdown_options: DropdownOption[];
  placeholder: string;
  help_text: string;
  is_active: boolean;
  sort_order: number;
}

function makeInitialState(existing?: CustomFieldDef | null): FormState {
  if (!existing) {
    return {
      field_label: '',
      field_key: '',
      field_key_touched: false,
      field_type: 'text',
      is_mandatory: false,
      show_on_add_user: true,
      show_on_edit_user: true,
      show_in_employee_master: false,
      dropdown_options: [],
      placeholder: '',
      help_text: '',
      is_active: true,
      sort_order: 0,
    };
  }
  return {
    field_label: existing.field_label,
    field_key: existing.field_key,
    field_key_touched: true,
    field_type: existing.field_type,
    is_mandatory: existing.is_mandatory,
    show_on_add_user: existing.show_on_add_user,
    show_on_edit_user: existing.show_on_edit_user,
    show_in_employee_master: existing.show_in_employee_master,
    dropdown_options: existing.dropdown_options ?? [],
    placeholder: existing.placeholder ?? '',
    help_text: existing.help_text ?? '',
    is_active: existing.is_active,
    sort_order: existing.sort_order,
  };
}

export function EmployeeMasterCustomFieldDialog({ open, onOpenChange, existing }: Props) {
  const { toast } = useToast();
  const upsert = useUpsertEmployeeMasterCustomField();
  const isEdit = !!existing;

  const [state, setState] = useState<FormState>(() => makeInitialState(existing));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setState(makeInitialState(existing));
      setErrors({});
    }
  }, [open, existing]);

  const onLabelChange = (val: string) => {
    setState((s) => ({
      ...s,
      field_label: val,
      field_key: s.field_key_touched ? s.field_key : sanitizeFieldKey(val),
    }));
  };

  const onKeyChange = (val: string) => {
    setState((s) => ({ ...s, field_key: val, field_key_touched: true }));
  };

  const setOption = (idx: number, patch: Partial<DropdownOption>) => {
    setState((s) => {
      const next = s.dropdown_options.slice();
      next[idx] = { ...next[idx], ...patch };
      return { ...s, dropdown_options: next };
    });
  };

  const addOption = () => {
    setState((s) => ({
      ...s,
      dropdown_options: [...s.dropdown_options, { value: '', label: '' }],
    }));
  };

  const removeOption = (idx: number) => {
    setState((s) => ({
      ...s,
      dropdown_options: s.dropdown_options.filter((_, i) => i !== idx),
    }));
  };

  const isDropdown = state.field_type === 'dropdown';

  const canSubmit = useMemo(() => {
    if (!state.field_label.trim() || !state.field_key.trim()) return false;
    if (isDropdown && state.dropdown_options.length < 1) return false;
    return true;
  }, [state, isDropdown]);

  const handleSubmit = async () => {
    const parsed = customFieldDefSchema.safeParse({
      field_label: state.field_label,
      field_key: state.field_key,
      field_type: state.field_type,
      is_mandatory: state.is_mandatory,
      show_on_add_user: state.show_on_add_user,
      show_on_edit_user: state.show_on_edit_user,
      show_in_employee_master: state.show_in_employee_master,
      dropdown_options: isDropdown
        ? state.dropdown_options.map((o) => ({
            value: o.value.trim(),
            label: o.label.trim() || o.value.trim(),
          }))
        : null,
      placeholder: state.placeholder,
      help_text: state.help_text,
      is_active: state.is_active,
      sort_order: state.sort_order,
    });

    if (!parsed.success) {
      const map: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path.join('.') || '_';
        if (!map[k]) map[k] = issue.message;
      }
      setErrors(map);
      return;
    }

    try {
      await upsert.mutateAsync({
        id: existing?.id,
        ...parsed.data,
      });
      toast({ title: isEdit ? 'Custom field updated' : 'Custom field added' });
      onOpenChange(false);
    } catch (e: any) {
      const msg = e?.message || 'Save failed';
      if (/duplicate|unique/i.test(msg)) {
        setErrors({ field_key: 'This key is already in use' });
      } else {
        toast({ title: 'Save failed', description: msg, variant: 'destructive' });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Employee Master Field' : 'Add Employee Master Field'}</DialogTitle>
          <DialogDescription>
            Custom fields appear on the Add New User page based on the toggles below.
            Mandatory fields show a small red <span className="text-destructive font-semibold">l</span> indicator (never an asterisk).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Field Label</Label>
            <Input
              value={state.field_label}
              onChange={(e) => onLabelChange(e.target.value)}
              placeholder="e.g. Blood Group"
              className="h-9"
            />
            {errors.field_label && (
              <p className="text-xs text-destructive">{errors.field_label}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Field Key</Label>
            <Input
              value={state.field_key}
              onChange={(e) => onKeyChange(e.target.value.toLowerCase())}
              placeholder="blood_group"
              className="h-9 font-mono text-sm"
              disabled={isEdit}
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, numbers and underscores. {isEdit ? 'Cannot be changed after creation.' : 'Auto-generated from the label.'}
            </p>
            {errors.field_key && (
              <p className="text-xs text-destructive">{errors.field_key}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Field Type</Label>
              <Select
                value={state.field_type}
                onValueChange={(v) => setState((s) => ({ ...s, field_type: v as CustomFieldType }))}
                disabled={isEdit}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CUSTOM_FIELD_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{CUSTOM_FIELD_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isEdit && (
                <p className="text-xs text-muted-foreground">Type is locked after creation.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Sort Order</Label>
              <Input
                type="number"
                min={0}
                value={state.sort_order}
                onChange={(e) => setState((s) => ({ ...s, sort_order: Number(e.target.value) || 0 }))}
                className="h-9"
              />
            </div>
          </div>

          {isDropdown && (
            <div className="space-y-1.5">
              <Label>Dropdown Options</Label>
              <div className="space-y-2">
                {state.dropdown_options.length === 0 && (
                  <p className="text-xs text-muted-foreground">No options yet. Add at least one.</p>
                )}
                {state.dropdown_options.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={opt.label}
                      onChange={(e) => setOption(idx, { label: e.target.value })}
                      placeholder="Label"
                      className="h-9"
                    />
                    <Input
                      value={opt.value}
                      onChange={(e) => setOption(idx, { value: e.target.value })}
                      placeholder="value"
                      className="h-9 font-mono text-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeOption(idx)}
                      aria-label="Remove option"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addOption} className="gap-1.5">
                  <Plus className="h-4 w-4" /> Add option
                </Button>
              </div>
              {errors.dropdown_options && (
                <p className="text-xs text-destructive">{errors.dropdown_options}</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              value={state.placeholder}
              onChange={(e) => setState((s) => ({ ...s, placeholder: e.target.value }))}
              placeholder="Placeholder (optional)"
              className="h-9"
            />
            <Input
              value={state.help_text}
              onChange={(e) => setState((s) => ({ ...s, help_text: e.target.value }))}
              placeholder="Help text (optional)"
              className="h-9"
            />
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <ToggleRow
              label="Mandatory"
              description="Validated when an admin creates the user"
              checked={state.is_mandatory}
              onChange={(v) => setState((s) => ({ ...s, is_mandatory: v }))}
            />
            <ToggleRow
              label="Show on Add New User"
              checked={state.show_on_add_user}
              onChange={(v) => setState((s) => ({ ...s, show_on_add_user: v }))}
            />
            <ToggleRow
              label="Show on Edit User"
              checked={state.show_on_edit_user}
              onChange={(v) => setState((s) => ({ ...s, show_on_edit_user: v }))}
            />
            <ToggleRow
              label="Show in Employee Master table"
              description="Column visibility (coming soon)"
              checked={state.show_in_employee_master}
              onChange={(v) => setState((s) => ({ ...s, show_in_employee_master: v }))}
            />
            <ToggleRow
              label="Active"
              description="Inactive fields are hidden everywhere but values are preserved"
              checked={state.is_active}
              onChange={(v) => setState((s) => ({ ...s, is_active: v }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={upsert.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || upsert.isPending}>
            {isEdit ? 'Save Changes' : 'Add Field'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}