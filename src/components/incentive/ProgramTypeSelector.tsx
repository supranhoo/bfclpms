import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Check, X } from 'lucide-react';
import { useIncentiveProgramTypes, useCreateProgramType } from '@/hooks/useIncentiveProgramTypes';

interface Props {
  value: string;
  onValueChange: (value: string) => void;
}

export function ProgramTypeSelector({ value, onValueChange }: Props) {
  const { data: types = [] } = useIncentiveProgramTypes();
  const createType = useCreateProgramType();
  const [showInput, setShowInput] = useState(false);
  const [newLabel, setNewLabel] = useState('');

  const handleAdd = () => {
    const label = newLabel.trim();
    if (!label) return;
    const val = label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    createType.mutate({ value: val, label }, {
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
          placeholder="e.g. Plant Incentive"
          className="h-9"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <Button size="icon" variant="outline" onClick={handleAdd} disabled={!newLabel.trim() || createType.isPending} className="h-9 w-9 shrink-0">
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
      <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
      <SelectContent>
        {types.map((t: any) => (
          <SelectItem key={t.id} value={t.value}>{t.label}</SelectItem>
        ))}
        <SelectItem value="__ADD_NEW__">
          <span className="flex items-center gap-1 text-primary">
            <Plus className="h-3.5 w-3.5" /> Add New Type
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
