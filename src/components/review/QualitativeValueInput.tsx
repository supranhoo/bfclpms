import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { QualitativeOption, BINARY_OPTIONS, scoreToRatingLevel } from '@/lib/qualitativeUom';
import { RatingLevel } from '@/hooks/useKpis';

interface QualitativeValueInputProps {
  uomType: 'binary' | 'tiered';
  qualitativeOptions: QualitativeOption[] | null;
  value: string | null;
  onChange: (value: string, rating: number, ratingLevel: RatingLevel) => void;
  disabled?: boolean;
  label?: string;
}

const ratingColors: Record<string, string> = {
  blue: 'bg-blue-500 hover:bg-blue-600',
  green: 'bg-green-500 hover:bg-green-600',
  yellow: 'bg-yellow-500 hover:bg-yellow-600',
  red: 'bg-red-500 hover:bg-red-600',
};

const ratingBorderColors: Record<string, string> = {
  blue: 'border-blue-500',
  green: 'border-green-500',
  yellow: 'border-yellow-500',
  red: 'border-red-500',
};

const ratingLabels: Record<string, string> = {
  blue: 'Outstanding',
  green: 'Exceeds',
  yellow: 'Meets',
  red: 'Below',
};

export function QualitativeValueInput({
  uomType,
  qualitativeOptions,
  value,
  onChange,
  disabled = false,
  label = 'Achieved Value',
}: QualitativeValueInputProps) {
  // Use stored qualitativeOptions if available, fallback to BINARY_OPTIONS only if null
  const options = qualitativeOptions?.length 
    ? qualitativeOptions 
    : (uomType === 'binary' ? BINARY_OPTIONS : []);

  if (options.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No qualitative options defined for this KPI.
      </div>
    );
  }

  // Sort by rating descending for display
  const sortedOptions = [...options].sort((a, b) => b.rating - a.rating);
  const selectedOption = options.find((opt) => opt.label === value);
  const selectedLevel = selectedOption ? scoreToRatingLevel(selectedOption.rating) : null;

  return (
    <div className="space-y-4">
      <Label>{label}</Label>
      
      <div className="flex flex-wrap gap-2">
        {sortedOptions.map((option) => {
          const level = scoreToRatingLevel(option.rating);
          const isSelected = value === option.label;

          return (
            <TooltipProvider key={option.label}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant={isSelected ? 'default' : 'outline'}
                    className={`h-auto py-3 px-4 flex flex-col gap-1 min-w-[100px] ${
                      isSelected ? ratingColors[level] : ''
                    } ${!isSelected ? `hover:${ratingBorderColors[level]}` : ''}`}
                    onClick={() => onChange(option.label, option.rating, level as RatingLevel)}
                    disabled={disabled}
                  >
                    <span className="font-medium">{option.label}</span>
                    <Badge
                      variant="secondary"
                      className={`text-xs ${isSelected ? 'bg-white/20 text-white' : ''}`}
                    >
                      R{option.rating}
                    </Badge>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[250px]">
                  <div className="space-y-1">
                    <p className="font-medium">{option.label}</p>
                    <p className="text-xs text-muted-foreground">{option.definition}</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>

      {selectedOption && (
        <Card className={`p-4 border-l-4 ${ratingBorderColors[selectedLevel!]}`}>
          <div className="flex items-start gap-3">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">
                Selected: {selectedOption.label}
              </p>
              <p className="text-xs text-muted-foreground">
                {selectedOption.definition}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <Badge className={`${ratingColors[selectedLevel!]} text-white`}>
                  Score: {selectedOption.rating} - {ratingLabels[selectedLevel!]}
                </Badge>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
