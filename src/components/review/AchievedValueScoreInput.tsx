import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScoreSelector } from './ScoreSelector';
import { QualitativeValueInput } from './QualitativeValueInput';
import { useScoreCalculationMode } from '@/hooks/useSystemSettings';
import { calculateRating, RatingLevel } from '@/lib/ratingCalculation';
import { UomType, QualitativeOption } from '@/lib/qualitativeUom';
import { Calculator, Check, Edit2 } from 'lucide-react';
import { DateCalendarInput } from './DateCalendarInput';

interface KpiThresholds {
  r5: string | null;
  r4: string | null;
  r3: string | null;
  r2: string | null;
  r1: string | null;
  r0: string | null;
}

interface AchievedValueScoreInputProps {
  kpi: {
    target_value: number | null;
    criteria: string | null;
    weightage: number | null;
    uom_type?: UomType | null;
    qualitative_options?: QualitativeOption[] | null;
    uom?: string | null;
  } & KpiThresholds;
  score: number | null;
  achievedValue: number | string | null;
  onScoreChange: (score: number, rating: RatingLevel) => void;
  onAchievedValueChange: (value: number | string | null) => void;
  disabled?: boolean;
  label?: string;
  reviewMonth?: string;
  reviewYear?: number;
}

const ratingColors: Record<RatingLevel, string> = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
};

const ratingLabels: Record<RatingLevel, string> = {
  blue: 'Outstanding',
  green: 'Exceeds',
  yellow: 'Meets',
  red: 'Below',
};

export function AchievedValueScoreInput({
  kpi,
  score,
  achievedValue,
  onScoreChange,
  onAchievedValueChange,
  disabled = false,
  label = 'Score',
  reviewMonth,
  reviewYear,
}: AchievedValueScoreInputProps) {
  const { mode, isLoading } = useScoreCalculationMode();
  const uomType = kpi.uom_type || 'numeric';
  const isQualitative = uomType === 'binary' || uomType === 'tiered';
  const isDateUom = kpi.uom === 'Date';
  
  const [localAchievedValue, setLocalAchievedValue] = useState<string>(
    achievedValue?.toString() || ''
  );
  const [isOverriding, setIsOverriding] = useState(false);

  useEffect(() => {
    setLocalAchievedValue(achievedValue?.toString() || '');
  }, [achievedValue]);

  // Calculate score from achieved value using thresholds
  // NOTE: Must be defined before any conditional returns that use it
  const calculateScoreFromValue = (value: number | null) => {
    if (value === null || value === undefined) return null;

    const thresholds = {
      r5: kpi.r5,
      r4: kpi.r4,
      r3: kpi.r3,
      r2: kpi.r2,
      r1: kpi.r1,
      r0: kpi.r0,
    };

    const result = calculateRating(
      value,
      kpi.target_value,
      thresholds,
      kpi.criteria || 'Higher is Better',
      kpi.weightage || 0,
      'numeric',
      null,
      kpi.uom
    );

    return result;
  };

  // For Date UOM, render the calendar input component
  if (isDateUom && reviewMonth && reviewYear) {
    const dayValue = typeof achievedValue === 'number' 
      ? achievedValue 
      : (typeof achievedValue === 'string' && achievedValue ? parseInt(achievedValue) : null);
    
    const handleDateChange = (day: number | null) => {
      onAchievedValueChange(day);
      if (day !== null) {
        const result = calculateScoreFromValue(day);
        if (result) {
          onScoreChange(result.rating, result.ratingLevel);
        }
      }
    };
    
    const dateResult = dayValue !== null ? calculateScoreFromValue(dayValue) : null;
    
    return (
      <div className="space-y-4">
        <DateCalendarInput
          value={dayValue}
          onChange={handleDateChange}
          reviewMonth={reviewMonth}
          reviewYear={reviewYear}
          disabled={disabled}
          label="Completion Date"
        />
        
        {dateResult && (
          <div className="p-4 rounded-lg border bg-muted/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Calculated Score</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`${ratingColors[dateResult.ratingLevel]} text-white`}>
                  {dateResult.rating} - {ratingLabels[dateResult.ratingLevel]}
                </Badge>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Submitted on day {dayValue} of the month
            </p>
          </div>
        )}
      </div>
    );
  }

  // For qualitative UOMs, render the qualitative input component
  if (isQualitative) {
    return (
      <QualitativeValueInput
        uomType={uomType as 'binary' | 'tiered'}
        qualitativeOptions={kpi.qualitative_options || null}
        value={typeof achievedValue === 'string' ? achievedValue : null}
        onChange={(value, rating, ratingLevel) => {
          // For qualitative, update both the string value AND the score
          onAchievedValueChange(value);
          onScoreChange(rating, ratingLevel);
        }}
        disabled={disabled}
        label={label}
      />
    );
  }

  const handleAchievedValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalAchievedValue(value);
    
    const numValue = value === '' ? null : parseFloat(value);
    onAchievedValueChange(numValue);

    // For auto_calculate mode, automatically update the score
    if (mode === 'auto_calculate' && numValue !== null) {
      const result = calculateScoreFromValue(numValue);
      if (result) {
        onScoreChange(result.rating, result.ratingLevel);
      }
    }
  };

  const calculatedResult = calculateScoreFromValue(
    localAchievedValue === '' ? null : parseFloat(localAchievedValue)
  );

  const handleAcceptSuggestion = () => {
    if (calculatedResult) {
      onScoreChange(calculatedResult.rating, calculatedResult.ratingLevel);
      setIsOverriding(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <div className="h-20 bg-muted animate-pulse rounded-md" />
      </div>
    );
  }

  // Manual mode - show only ScoreSelector
  if (mode === 'manual') {
    return (
      <ScoreSelector
        value={score}
        onChange={onScoreChange}
        label={label}
        disabled={disabled}
      />
    );
  }

  // Auto-calculate mode - achieved value input with auto score
  if (mode === 'auto_calculate') {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Achieved Value</Label>
          <Input
            type="number"
            step="any"
            value={localAchievedValue}
            onChange={handleAchievedValueChange}
            placeholder="Enter achieved value"
            disabled={disabled}
          />
        </div>

        {calculatedResult && (
          <div className="p-4 rounded-lg border bg-muted/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Calculated Score</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`${ratingColors[calculatedResult.ratingLevel]} text-white`}>
                  {calculatedResult.rating} - {ratingLabels[calculatedResult.ratingLevel]}
                </Badge>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Achievement: {(calculatedResult.percentage).toFixed(1)}% of target
            </p>
          </div>
        )}

        {!localAchievedValue && (
          <p className="text-sm text-muted-foreground">
            Enter the achieved value to auto-calculate the score.
          </p>
        )}
      </div>
    );
  }

  // Suggested with override mode
  if (mode === 'suggested_override') {
    const showSuggestion = calculatedResult && localAchievedValue !== '';
    const currentScoreMatchesSuggestion = calculatedResult && score === calculatedResult.rating;

    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Achieved Value</Label>
          <Input
            type="number"
            step="any"
            value={localAchievedValue}
            onChange={handleAchievedValueChange}
            placeholder="Enter achieved value (optional)"
            disabled={disabled}
          />
        </div>

        {showSuggestion && (
          <div className="p-4 rounded-lg border bg-primary/5 border-primary/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Suggested Score</span>
              </div>
              <Badge className={`${ratingColors[calculatedResult.ratingLevel]} text-white`}>
                {calculatedResult.rating} - {ratingLabels[calculatedResult.ratingLevel]}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Based on {(calculatedResult.percentage).toFixed(1)}% achievement
            </p>
            {!currentScoreMatchesSuggestion && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 gap-1"
                onClick={handleAcceptSuggestion}
                disabled={disabled}
              >
                <Check className="h-3 w-3" />
                Accept Suggestion
              </Button>
            )}
            {currentScoreMatchesSuggestion && (
              <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                <Check className="h-3 w-3" />
                Suggestion accepted
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{label}</Label>
            {showSuggestion && !isOverriding && score !== null && !currentScoreMatchesSuggestion && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Edit2 className="h-3 w-3" />
                Manual override applied
              </span>
            )}
          </div>
          <ScoreSelector
            value={score}
            onChange={(newScore, rating) => {
              onScoreChange(newScore, rating);
              if (calculatedResult && newScore !== calculatedResult.rating) {
                setIsOverriding(true);
              }
            }}
            disabled={disabled}
          />
        </div>
      </div>
    );
  }

  // Fallback to manual mode
  return (
    <ScoreSelector
      value={score}
      onChange={onScoreChange}
      label={label}
      disabled={disabled}
    />
  );
}
