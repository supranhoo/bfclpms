import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent } from '@/components/ui/card';
import { Hash, ToggleLeft, List } from 'lucide-react';
import { UomType } from '@/lib/qualitativeUom';

interface UomTypeSelectorProps {
  value: UomType;
  onChange: (type: UomType) => void;
  disabled?: boolean;
}

const uomTypes = [
  {
    value: 'numeric' as UomType,
    label: 'Numeric',
    description: 'Percentage, Count, Days, Amount, etc.',
    icon: Hash,
  },
  {
    value: 'binary' as UomType,
    label: 'Binary',
    description: 'Yes/No with fixed scoring (Yes=5, No=0)',
    icon: ToggleLeft,
  },
  {
    value: 'tiered' as UomType,
    label: 'Tiered',
    description: 'Custom options with flexible ratings',
    icon: List,
  },
];

export function UomTypeSelector({ value, onChange, disabled = false }: UomTypeSelectorProps) {
  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">UOM Type</Label>
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as UomType)}
        disabled={disabled}
        className="grid grid-cols-3 gap-3"
      >
        {uomTypes.map((type) => {
          const Icon = type.icon;
          const isSelected = value === type.value;
          return (
            <Card
              key={type.value}
              className={`cursor-pointer transition-all ${
                isSelected
                  ? 'border-primary ring-1 ring-primary'
                  : 'hover:border-muted-foreground/30'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => !disabled && onChange(type.value)}
            >
              <CardContent className="p-3 flex flex-col items-center text-center gap-2">
                <RadioGroupItem
                  value={type.value}
                  id={`uom-${type.value}`}
                  className="sr-only"
                />
                <Icon
                  className={`h-5 w-5 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}
                />
                <div>
                  <p className="font-medium text-sm">{type.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{type.description}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </RadioGroup>
    </div>
  );
}
