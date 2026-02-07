import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RatingLevel } from '@/hooks/useKpis';

const scoreOptions: { score: number; label: string; color: string; level: RatingLevel }[] = [
  { score: 5, label: 'Outstanding', color: '#3B82F6', level: 'blue' },
  { score: 4, label: 'Exceeds', color: '#10B981', level: 'green' },
  { score: 3, label: 'Meets', color: '#F59E0B', level: 'yellow' },
  { score: 2, label: 'Below', color: '#EF4444', level: 'red' },
];

interface ScoreSelectorProps {
  value: number | null;
  onChange: (score: number, rating: RatingLevel) => void;
  label?: string;
  disabled?: boolean;
}

export function ScoreSelector({ value, onChange, label = 'Score', disabled = false }: ScoreSelectorProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {scoreOptions.map(opt => (
          <Button
            key={opt.score}
            type="button"
            variant={value === opt.score ? 'default' : 'outline'}
            className="h-auto py-2 sm:py-3 flex flex-col gap-0.5 sm:gap-1"
            style={value === opt.score ? { backgroundColor: opt.color, borderColor: opt.color } : {}}
            onClick={() => onChange(opt.score, opt.level)}
            disabled={disabled}
          >
            <div 
              className="w-3 h-3 sm:w-4 sm:h-4 rounded-full border-2 border-current" 
              style={{ backgroundColor: value === opt.score ? 'white' : opt.color }}
            />
            <span className="text-xs font-semibold">{opt.score}</span>
            <span className="text-xs">{opt.label}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}

export function scoreToRating(score: number): RatingLevel {
  if (score >= 5) return 'blue';
  if (score >= 4) return 'green';
  if (score >= 3) return 'yellow';
  return 'red';
}

export function ratingToScore(rating: RatingLevel): number {
  switch (rating) {
    case 'blue': return 5;
    case 'green': return 4;
    case 'yellow': return 3;
    case 'red': return 2;
    default: return 0;
  }
}

export { scoreOptions };
