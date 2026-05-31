import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScoreSelector } from './ScoreSelector';
import { QualitativeValueInput } from './QualitativeValueInput';
import { useScoreCalculationMode } from '@/hooks/useSystemSettings';
import { calculateRating, RatingLevel, isValueOutOfRange, RatingThresholds } from '@/lib/ratingCalculation';
import { UomType, QualitativeOption, BINARY_OPTIONS } from '@/lib/qualitativeUom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calculator, Check, Edit2, AlertTriangle } from 'lucide-react';
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

// Rating display uses centralized getScoreBadgeClass/getScoreLabel from reviewConstants
import { getScoreBadgeClass as _getScoreBadgeClass, getScoreLabel as _getScoreLabel } from '@/lib/reviewConstants';

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

  // Auto-calculate score on mount or when achievedValue changes
  // Also recalculates when current score doesn't match the achieved value (safety net for inherited mismatches)
  useEffect(() => {
    if (mode === 'auto_calculate' && achievedValue !== null && achievedValue !== '') {
      const numValue = typeof achievedValue === 'number' ? achievedValue : parseFloat(String(achievedValue));
      if (!isNaN(numValue)) {
        const result = calculateScoreFromValue(numValue);
        if (result && result.rating !== score) {
          // Use a microtask to avoid React state batching issues on mount
          Promise.resolve().then(() => {
            onScoreChange(result.rating, result.ratingLevel);
          });
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [achievedValue, score, mode]);

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
      uomType,
      kpi.qualitative_options,
      kpi.uom,
      (kpi as any).threshold_mode || 'absolute'
    );

    return result;
  };

  // For Date UOM, render the calendar input component
  if (isDateUom && reviewMonth && reviewYear) {
    const dayValue = typeof achievedValue === 'number' 
      ? achievedValue 
      : (typeof achievedValue === 'string' && achievedValue !== '' ? parseInt(achievedValue) : null);
    
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
                <Badge className={_getScoreBadgeClass(dateResult.rating)}>
                  {dateResult.rating} - {_getScoreLabel(dateResult.rating)}
                </Badge>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {dayValue === 0 
                ? `Completed before 1st ${reviewMonth}` 
                : `Submitted on day ${dayValue} of the month`}
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
        value={(() => {
          const opts = kpi.qualitative_options?.length
            ? kpi.qualitative_options
            : (uomType === 'binary' ? BINARY_OPTIONS : []);
          if (typeof achievedValue === 'string') {
            // Direct label match
            if (opts.find(o => o.label === achievedValue)) return achievedValue;
            // Defensive: numeric-looking string (e.g. "0", "5.00") — resolve via rating
            const n = parseFloat(achievedValue);
            if (Number.isFinite(n)) return opts.find(o => o.rating === n)?.label ?? achievedValue;
            return achievedValue;
          }
          if (typeof achievedValue === 'number') {
            return opts.find(o => o.rating === achievedValue)?.label || null;
          }
          return null;
        })()}
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
                <Badge className={_getScoreBadgeClass(calculatedResult.rating)}>
                  {calculatedResult.rating} - {_getScoreLabel(calculatedResult.rating)}
                </Badge>
              </div>
            </div>
            {kpi.uom !== '%' && kpi.uom?.toLowerCase() !== 'percentage' && (
              <p className="text-xs text-muted-foreground mt-2">
                Achievement: {(calculatedResult.percentage).toFixed(1)}% of target
              </p>
            )}
          </div>
        )}

        {(() => {
          const numVal = localAchievedValue === '' ? null : parseFloat(localAchievedValue);
          if (numVal === null || isNaN(numVal)) return null;
          const th: RatingThresholds = { r5: kpi.r5, r4: kpi.r4, r3: kpi.r3, r2: kpi.r2, r1: kpi.r1 };
          const check = isValueOutOfRange(numVal, kpi.target_value, th, kpi.uom ?? null);
          if (!check.outOfRange) return null;
          return (
            <Alert variant="default" className="border-orange-500/50 bg-orange-50 dark:bg-orange-950/30 py-2">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-xs text-orange-700 dark:text-orange-400">
                {check.message}
              </AlertDescription>
            </Alert>
          );
        })()}

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

        {(() => {
          const numVal = localAchievedValue === '' ? null : parseFloat(localAchievedValue);
          if (numVal === null || isNaN(numVal)) return null;
          const th: RatingThresholds = { r5: kpi.r5, r4: kpi.r4, r3: kpi.r3, r2: kpi.r2, r1: kpi.r1 };
          const check = isValueOutOfRange(numVal, kpi.target_value, th, kpi.uom ?? null);
          if (!check.outOfRange) return null;
          return (
            <Alert variant="default" className="border-orange-500/50 bg-orange-50 dark:bg-orange-950/30 py-2">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-xs text-orange-700 dark:text-orange-400">
                {check.message}
              </AlertDescription>
            </Alert>
          );
        })()}

        {showSuggestion && (
          <div className="p-4 rounded-lg border bg-primary/5 border-primary/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Suggested Score</span>
              </div>
              <Badge className={_getScoreBadgeClass(calculatedResult.rating)}>
                {calculatedResult.rating} - {_getScoreLabel(calculatedResult.rating)}
              </Badge>
            </div>
            {kpi.uom !== '%' && kpi.uom?.toLowerCase() !== 'percentage' && (
              <p className="text-xs text-muted-foreground mt-1">
                Based on {(calculatedResult.percentage).toFixed(1)}% achievement
              </p>
            )}
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
