import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RequiredMark } from '@/components/ui/RequiredMark';
import type { CustomFieldDef } from '@/lib/employeeMasterCustomFields';

interface Props {
  def: CustomFieldDef;
  value: unknown;
  onChange: (next: unknown) => void;
}

/**
 * Renders a single admin-defined custom field as the correct shadcn input.
 * Mandatory fields show a lowercase red `l` (RequiredMark); never an asterisk.
 */
export function CustomFieldRenderer({ def, value, onChange }: Props) {
  const label = (
    <Label className="block">
      {def.field_label}
      {def.is_mandatory ? <RequiredMark /> : null}
    </Label>
  );

  const helper = def.help_text ? (
    <p className="text-xs text-muted-foreground">{def.help_text}</p>
  ) : null;

  switch (def.field_type) {
    case 'long_text':
      return (
        <div className="space-y-1.5">
          {label}
          <Textarea
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={def.placeholder || ''}
            rows={3}
          />
          {helper}
        </div>
      );
    case 'dropdown':
      return (
        <div className="space-y-1.5">
          {label}
          <Select
            value={(value as string) ?? ''}
            onValueChange={(v) => onChange(v)}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder={def.placeholder || 'Select…'} />
            </SelectTrigger>
            <SelectContent>
              {(def.dropdown_options || []).map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {helper}
        </div>
      );
    case 'yes_no':
      return (
        <div className="flex items-center justify-between rounded-lg border p-3 h-fit">
          <div className="space-y-0.5 min-w-0">
            {label}
            {helper}
          </div>
          <Switch
            checked={!!value}
            onCheckedChange={(v) => onChange(v)}
            aria-label={def.field_label}
          />
        </div>
      );
    case 'date':
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            type="date"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            className="h-9"
          />
          {helper}
        </div>
      );
    case 'number':
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            type="number"
            value={(value as string | number | null | undefined) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={def.placeholder || ''}
            className="h-9"
          />
          {helper}
        </div>
      );
    case 'email':
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            type="email"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={def.placeholder || 'name@example.com'}
            className="h-9"
          />
          {helper}
        </div>
      );
    case 'phone':
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            type="tel"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={def.placeholder || ''}
            className="h-9"
            inputMode="tel"
          />
          {helper}
        </div>
      );
    case 'text':
    default:
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={def.placeholder || ''}
            className="h-9"
          />
          {helper}
        </div>
      );
  }
}