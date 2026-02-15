import { useState, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { FlaskConical } from 'lucide-react';
import { calculateRating, RatingThresholds, ratingToLevel, levelToText } from '@/lib/ratingCalculation';

interface ScoringSimulatorPopoverProps {
  kpi: {
    target_value: number | null;
    criteria: string | null;
    r5: string | null;
    r4: string | null;
    r3: string | null;
    r2: string | null;
    r1: string | null;
    r0: string | null;
    weightage: number | null;
    kpi_name: string;
  };
}

export function ScoringSimulatorPopover({ kpi }: ScoringSimulatorPopoverProps) {
  const [testValue, setTestValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const result = useMemo(() => {
    if (!testValue) return null;
    
    const achieved = parseFloat(testValue);
    if (isNaN(achieved)) return null;

    const thresholds: RatingThresholds = {
      r5: kpi.r5,
      r4: kpi.r4,
      r3: kpi.r3,
      r2: kpi.r2,
      r1: kpi.r1,
      r0: kpi.r0,
    };

    // Get UOM from kpi if available (for Date UOM handling)
    const uom = (kpi as any).uom || null;
    
    const result = calculateRating(
      achieved,
      kpi.target_value,
      thresholds,
      kpi.criteria || 'Higher is Better',
      kpi.weightage || 0,
      'numeric',
      null,
      uom,
      (kpi as any).threshold_mode || 'absolute'
    );
    
    return result;
  }, [testValue, kpi]);

  const getRatingColor = (rating: number) => {
    if (rating >= 5) return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200';
    if (rating >= 4) return 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200';
    if (rating >= 3) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200';
    if (rating >= 2) return 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300';
    if (rating >= 1) return 'bg-red-400 text-white dark:bg-red-600 dark:text-white';
    return 'bg-red-900 text-red-100 dark:bg-red-950 dark:text-red-200';
  };

  const getBgColor = (rating: number) => {
    if (rating >= 5) return 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800';
    if (rating >= 4) return 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800';
    if (rating >= 3) return 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800';
    if (rating >= 2) return 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800';
    if (rating >= 1) return 'bg-red-50 border-red-300 dark:bg-red-950 dark:border-red-700';
    return 'bg-red-100 border-red-400 dark:bg-red-950 dark:border-red-600';
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-7 w-7"
          title="Test Scoring Logic"
        >
          <FlaskConical className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-sm">Scoring Logic Simulator</h4>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {kpi.kpi_name}
            </p>
          </div>

          {/* KPI Info */}
          <div className="text-xs space-y-1 p-2 rounded bg-muted/50">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Target:</span>
              <span className="font-mono">{kpi.target_value ?? '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Criteria:</span>
              <span>{kpi.criteria || 'Higher is Better'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Weightage:</span>
              <span>{kpi.weightage ?? 0}%</span>
            </div>
          </div>

          {/* Thresholds */}
          <div className="text-xs">
            <p className="text-muted-foreground mb-1">Thresholds:</p>
            <div className="grid grid-cols-6 gap-1">
              {(['r5', 'r4', 'r3', 'r2', 'r1', 'r0'] as const).map(key => (
                <div key={key} className="text-center">
                  <p className="uppercase text-muted-foreground">{key}</p>
                  <p className="font-mono text-xs">{kpi[key] || '-'}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Test Input */}
          <div>
            <Label className="text-xs">Test Achieved Value</Label>
            <Input
              type="number"
              value={testValue}
              onChange={(e) => setTestValue(e.target.value)}
              placeholder="Enter value..."
              className="mt-1"
            />
          </div>

          {/* Result */}
          {result && (
            <div className={`p-3 rounded-lg border ${getBgColor(result.rating)}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Result:</span>
                <Badge className={getRatingColor(result.rating)}>
                  Rating {result.rating}
                </Badge>
              </div>
              <div className="mt-2 text-xs space-y-1">
                <div className="flex justify-between">
                  <span>Level:</span>
                  <span className="font-medium">{levelToText(result.ratingLevel)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Achievement:</span>
                  <span className="font-mono">{result.percentage.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Weighted Score:</span>
                  <span className="font-mono">{result.weightedScore.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {!result && testValue && (
            <p className="text-xs text-muted-foreground text-center">
              Enter a valid number to see results
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
