import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RatingLevel } from '@/hooks/useKpis';

const ratingOptions: { value: RatingLevel; label: string; color: string; score: number }[] = [
  { value: 'blue', label: 'Outstanding', color: '#3B82F6', score: 5 },
  { value: 'green', label: 'Exceeds', color: '#10B981', score: 4 },
  { value: 'yellow', label: 'Meets', color: '#F59E0B', score: 3 },
  { value: 'red', label: 'Below', color: '#EF4444', score: 2 },
];

interface RatingSelectorProps {
  value: RatingLevel | '';
  onChange: (rating: RatingLevel) => void;
  label?: string;
  disabled?: boolean;
}

export function RatingSelector({ value, onChange, label = 'Rating', disabled = false }: RatingSelectorProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="grid grid-cols-4 gap-2">
        {ratingOptions.map(opt => (
          <Button
            key={opt.value}
            type="button"
            variant={value === opt.value ? 'default' : 'outline'}
            className="h-auto py-3 flex flex-col gap-1"
            style={value === opt.value ? { backgroundColor: opt.color, borderColor: opt.color } : {}}
            onClick={() => onChange(opt.value)}
            disabled={disabled}
          >
            <div 
              className="w-4 h-4 rounded-full border-2 border-current" 
              style={{ backgroundColor: value === opt.value ? 'white' : opt.color }}
            />
            <span className="text-xs">{opt.label}</span>
            <span className="text-xs opacity-70">({opt.score})</span>
          </Button>
        ))}
      </div>
    </div>
  );
}

export function getRatingScore(rating: RatingLevel): number {
  return ratingOptions.find(r => r.value === rating)?.score || 0;
}

export { ratingOptions };
