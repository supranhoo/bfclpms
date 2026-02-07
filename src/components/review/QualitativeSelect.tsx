import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { QualitativeOption, BINARY_OPTIONS, scoreToRatingLevel } from '@/lib/qualitativeUom';

interface QualitativeSelectProps {
  uomType: 'binary' | 'tiered';
  qualitativeOptions: QualitativeOption[] | null;
  value: string | null;
  onChange: (value: string, rating: number) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

const ratingColors: Record<string, string> = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
};

export function QualitativeSelect({
  uomType,
  qualitativeOptions,
  value,
  onChange,
  disabled = false,
  placeholder = 'Select...',
  className = '',
}: QualitativeSelectProps) {
  // Use stored qualitativeOptions if available, fallback to BINARY_OPTIONS only if null
  const options = qualitativeOptions?.length 
    ? qualitativeOptions 
    : (uomType === 'binary' ? BINARY_OPTIONS : []);

  if (options.length === 0) {
    return <span className="text-sm text-muted-foreground">No options</span>;
  }

  // Sort by rating descending
  const sortedOptions = [...options].sort((a, b) => b.rating - a.rating);

  const handleChange = (selectedLabel: string) => {
    const option = options.find(o => o.label === selectedLabel);
    if (option) {
      onChange(option.label, option.rating);
    }
  };

  const selectedOption = options.find(o => o.label === value);
  const selectedLevel = selectedOption ? scoreToRatingLevel(selectedOption.rating) : null;

  return (
    <Select value={value || ''} onValueChange={handleChange} disabled={disabled}>
      <SelectTrigger className={`w-[140px] ${className}`}>
        <SelectValue placeholder={placeholder}>
          {selectedOption && (
            <div className="flex items-center gap-2">
              <span>{selectedOption.label}</span>
              <Badge 
                variant="secondary" 
                className={`text-[10px] px-1 py-0 ${ratingColors[selectedLevel!]} text-white`}
              >
                R{selectedOption.rating}
              </Badge>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-popover">
        {sortedOptions.map((option) => {
          const level = scoreToRatingLevel(option.rating);
          return (
            <SelectItem key={option.label} value={option.label}>
              <div className="flex items-center gap-2">
                <span>{option.label}</span>
                <Badge 
                  variant="secondary" 
                  className={`text-[10px] px-1 py-0 ${ratingColors[level]} text-white`}
                >
                  R{option.rating}
                </Badge>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
