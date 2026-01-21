import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Sparkles } from 'lucide-react';
import {
  QualitativeOption,
  TIERED_TEMPLATES,
  TEMPLATE_LABELS,
  RATING_LABELS,
} from '@/lib/qualitativeUom';

interface TieredOptionsBuilderProps {
  options: QualitativeOption[];
  onChange: (options: QualitativeOption[]) => void;
  disabled?: boolean;
}

const ratingColors: Record<number, string> = {
  5: 'bg-blue-500',
  4: 'bg-green-500',
  3: 'bg-yellow-500',
  2: 'bg-red-400',
  1: 'bg-red-500',
  0: 'bg-red-600',
};

export function TieredOptionsBuilder({
  options,
  onChange,
  disabled = false,
}: TieredOptionsBuilderProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');

  const handleAddOption = () => {
    onChange([
      ...options,
      { label: '', rating: 3, definition: '' },
    ]);
  };

  const handleRemoveOption = (index: number) => {
    onChange(options.filter((_, i) => i !== index));
  };

  const handleOptionChange = (
    index: number,
    field: keyof QualitativeOption,
    value: string | number
  ) => {
    const updated = [...options];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const handleApplyTemplate = (templateKey: string) => {
    if (templateKey && TIERED_TEMPLATES[templateKey]) {
      onChange([...TIERED_TEMPLATES[templateKey]]);
      setSelectedTemplate('');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Tiered Options</Label>
        <div className="flex items-center gap-2">
          <Select value={selectedTemplate} onValueChange={handleApplyTemplate}>
            <SelectTrigger className="w-[180px] h-8">
              <Sparkles className="h-3 w-3 mr-1" />
              <SelectValue placeholder="Use template" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TEMPLATE_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-3">
        {options.map((option, index) => (
          <Card key={index} className="border-dashed">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Label</Label>
                    <Input
                      value={option.label}
                      onChange={(e) => handleOptionChange(index, 'label', e.target.value)}
                      placeholder="e.g., Partial"
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Rating</Label>
                    <Select
                      value={option.rating.toString()}
                      onValueChange={(v) => handleOptionChange(index, 'rating', parseInt(v))}
                      disabled={disabled}
                    >
                      <SelectTrigger>
                        <div className="flex items-center gap-2">
                          <Badge className={`${ratingColors[option.rating]} text-white text-xs px-1.5`}>
                            R{option.rating}
                          </Badge>
                          <SelectValue />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {[5, 4, 3, 2, 1, 0].map((r) => (
                          <SelectItem key={r} value={r.toString()}>
                            <div className="flex items-center gap-2">
                              <Badge className={`${ratingColors[r]} text-white text-xs px-1.5`}>
                                R{r}
                              </Badge>
                              <span className="text-sm">{RATING_LABELS[r]}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveOption(index)}
                  disabled={disabled || options.length <= 2}
                  className="mt-6"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Definition (what does "{option.label || 'this option'}" mean for this KPI?)
                </Label>
                <Textarea
                  value={option.definition}
                  onChange={(e) => handleOptionChange(index, 'definition', e.target.value)}
                  placeholder="Describe what this option means specifically for this KPI..."
                  rows={2}
                  disabled={disabled}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAddOption}
        disabled={disabled}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Option
      </Button>

      {options.length > 0 && (
        <div className="text-xs text-muted-foreground p-3 bg-muted/50 rounded-lg">
          <strong>Preview:</strong>{' '}
          {options
            .sort((a, b) => b.rating - a.rating)
            .map((o) => `${o.label} (R${o.rating})`)
            .join(' → ')}
        </div>
      )}
    </div>
  );
}
