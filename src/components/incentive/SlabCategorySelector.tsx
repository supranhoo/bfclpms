import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Check, X } from 'lucide-react';
import { useIncentiveSlabCategories, useCreateSlabCategory } from '@/hooks/useIncentiveSlabCategories';

interface Props {
  value: string;
  onValueChange: (value: string) => void;
  /** When set, only these category values are shown */
  allowedValues?: string[];
}

export function SlabCategorySelector({ value, onValueChange, allowedValues }: Props) {
  const { data: categories = [] } = useIncentiveSlabCategories();
  const createCategory = useCreateSlabCategory();
  const [showInput, setShowInput] = useState(false);
  const [newLabel, setNewLabel] = useState('');

  const filtered = allowedValues
    ? categories.filter((c: any) => allowedValues.includes(c.value))
    : categories;

  const handleAdd = () => {
    const label = newLabel.trim();
    if (!label) return;
    const val = label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    createCategory.mutate({ value: val, label }, {
      onSuccess: () => {
        onValueChange(val);
        setNewLabel('');
        setShowInput(false);
      },
    });
  };

  if (showInput) {
    return (
      <div className="flex items-center gap-2">
        <Input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="e.g. Safety Score"
          className="h-9"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <Button size="icon" variant="outline" onClick={handleAdd} disabled={!newLabel.trim() || createCategory.isPending} className="h-9 w-9 shrink-0">
          <Check className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => { setShowInput(false); setNewLabel(''); }} className="h-9 w-9 shrink-0">
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={(v) => {
      if (v === '__ADD_NEW__') {
        setShowInput(true);
      } else {
        onValueChange(v);
      }
    }}>
      <SelectTrigger className="w-[180px]"><SelectValue placeholder="Select category" /></SelectTrigger>
      <SelectContent>
        {filtered.map((c: any) => (
          <SelectItem key={c.id} value={c.value}>{c.label}</SelectItem>
        ))}
        <SelectItem value="__ADD_NEW__">
          <span className="flex items-center gap-1 text-primary">
            <Plus className="h-3.5 w-3.5" /> Add New Category
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
