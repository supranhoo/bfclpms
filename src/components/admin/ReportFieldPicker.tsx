import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { GripVertical, X } from 'lucide-react';
import { REPORT_FIELD_REGISTRY, REPORT_FIELD_SOURCES, type ReportFieldSource } from '@/lib/reportFieldRegistry';

interface SelectedColumn {
  key: string;
  alias?: string;
  width?: string;
}

interface ReportFieldPickerProps {
  selectedColumns: SelectedColumn[];
  onChange: (columns: SelectedColumn[]) => void;
}

export function ReportFieldPicker({ selectedColumns, onChange }: ReportFieldPickerProps) {
  const [search, setSearch] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const selectedKeys = new Set(selectedColumns.map(c => c.key));
  const filteredRegistry = REPORT_FIELD_REGISTRY.filter(f =>
    f.label.toLowerCase().includes(search.toLowerCase()) ||
    f.key.toLowerCase().includes(search.toLowerCase())
  );

  const toggleField = (key: string) => {
    if (selectedKeys.has(key)) {
      onChange(selectedColumns.filter(c => c.key !== key));
    } else {
      onChange([...selectedColumns, { key }]);
    }
  };

  const updateAlias = (key: string, alias: string) => {
    onChange(selectedColumns.map(c => c.key === key ? { ...c, alias: alias || undefined } : c));
  };

  const removeColumn = (key: string) => {
    onChange(selectedColumns.filter(c => c.key !== key));
  };

  const handleDragStart = (index: number) => setDragIndex(index);
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const newCols = [...selectedColumns];
    const [dragged] = newCols.splice(dragIndex, 1);
    newCols.splice(index, 0, dragged);
    onChange(newCols);
    setDragIndex(index);
  };
  const handleDragEnd = () => setDragIndex(null);

  return (
    <div className="space-y-4">
      {/* Selected columns (reorderable) */}
      {selectedColumns.length > 0 && (
        <div className="space-y-1">
          <Label className="text-sm font-medium">Selected Columns ({selectedColumns.length})</Label>
          <p className="text-xs text-muted-foreground mb-2">Drag to reorder. Optionally set a display alias.</p>
          {selectedColumns.map((col, index) => {
            const def = REPORT_FIELD_REGISTRY.find(f => f.key === col.key);
            return (
              <div
                key={col.key}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-2 p-2 rounded-md border bg-card ${
                  dragIndex === index ? 'opacity-50 border-primary' : ''
                }`}
              >
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0 cursor-grab" />
                <span className="text-xs text-muted-foreground w-5">{index + 1}</span>
                <span className="text-sm font-medium min-w-[120px]">{def?.label || col.key}</span>
                <Input
                  value={col.alias || ''}
                  onChange={e => updateAlias(col.key, e.target.value)}
                  placeholder="Alias (optional)"
                  className="h-7 text-xs flex-1 max-w-[200px]"
                />
                <Badge variant="outline" className="text-[10px]">{def?.source}</Badge>
                <button onClick={() => removeColumn(col.key)} className="text-muted-foreground hover:text-destructive">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Available fields */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Available Fields</Label>
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search fields..."
          className="h-8 text-sm"
        />

        <div className="max-h-[300px] overflow-y-auto space-y-3">
          {REPORT_FIELD_SOURCES.map(source => {
            const fields = filteredRegistry.filter(f => f.source === source);
            if (fields.length === 0) return null;
            return (
              <Card key={source} className="p-0">
                <div className="px-3 py-2 bg-muted/50 border-b">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{source}</span>
                </div>
                <CardContent className="p-2 space-y-0.5">
                  {fields.map(field => (
                    <label key={field.key} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer">
                      <Checkbox
                        checked={selectedKeys.has(field.key)}
                        onCheckedChange={() => toggleField(field.key)}
                      />
                      <span className="text-sm">{field.label}</span>
                      <Badge variant="outline" className="text-[10px] ml-auto">{field.type}</Badge>
                    </label>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
