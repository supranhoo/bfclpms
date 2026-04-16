import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { Plus, Trash2 } from 'lucide-react';
import { REPORT_FIELD_REGISTRY } from '@/lib/reportFieldRegistry';

interface FilterRule {
  field: string;
  operator: string;
  value: string;
  user_selectable?: boolean;
}

interface ReportFilterConfigProps {
  filters: FilterRule[];
  onChange: (filters: FilterRule[]) => void;
}

const OPERATORS = [
  { value: 'eq', label: 'Equals' },
  { value: 'neq', label: 'Not Equals' },
  { value: 'gt', label: 'Greater Than' },
  { value: 'gte', label: 'Greater or Equal' },
  { value: 'lt', label: 'Less Than' },
  { value: 'lte', label: 'Less or Equal' },
  { value: 'like', label: 'Contains' },
  { value: 'in', label: 'In (comma-separated)' },
];

export function ReportFilterConfig({ filters, onChange }: ReportFilterConfigProps) {
  const addFilter = () => {
    onChange([...filters, { field: '', operator: 'eq', value: '', user_selectable: false }]);
  };

  const updateFilter = (index: number, updates: Partial<FilterRule>) => {
    onChange(filters.map((f, i) => i === index ? { ...f, ...updates } : f));
  };

  const removeFilter = (index: number) => {
    onChange(filters.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">Filter Rules</Label>
          <p className="text-xs text-muted-foreground">Define default filters. Mark as "User Selectable" to let viewers change them at runtime.</p>
        </div>
        <Button variant="outline" size="sm" onClick={addFilter} className="gap-1">
          <Plus className="h-3.5 w-3.5" /> Add Filter
        </Button>
      </div>

      {filters.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No filters configured. The report will show all matching data.</p>
      ) : (
        <div className="space-y-2">
          {filters.map((filter, index) => (
            <Card key={index} className="p-3">
              <div className="grid gap-2 sm:grid-cols-4 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Field</Label>
                  <Select value={filter.field} onValueChange={v => updateFilter(index, { field: v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select field" /></SelectTrigger>
                    <SelectContent>
                      {REPORT_FIELD_REGISTRY.map(f => (
                        <SelectItem key={f.key} value={f.key} className="text-xs">{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Operator</Label>
                  <Select value={filter.operator} onValueChange={v => updateFilter(index, { operator: v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {OPERATORS.map(op => (
                        <SelectItem key={op.value} value={op.value} className="text-xs">{op.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Value</Label>
                  <Input
                    value={filter.value}
                    onChange={e => updateFilter(index, { value: e.target.value })}
                    placeholder="Filter value"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <Switch
                      checked={filter.user_selectable || false}
                      onCheckedChange={v => updateFilter(index, { user_selectable: v })}
                    />
                    <Label className="text-xs">User Selectable</Label>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeFilter(index)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
