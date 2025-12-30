import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Settings, Calculator, Edit3, Lightbulb, Save } from 'lucide-react';
import { useScoreCalculationMode, useUpdateSystemSetting, ScoreCalculationMode } from '@/hooks/useSystemSettings';
import { useState, useEffect } from 'react';

const scoreCalculationOptions: { 
  value: ScoreCalculationMode; 
  label: string; 
  description: string; 
  icon: React.ReactNode 
}[] = [
  {
    value: 'manual',
    label: 'Manual Score Selection',
    description: 'Reviewers manually select a score from 1-5. No achieved value input required.',
    icon: <Edit3 className="h-5 w-5" />,
  },
  {
    value: 'auto_calculate',
    label: 'Auto-Calculate from Achieved Value',
    description: 'Reviewers enter the achieved value, and the score is automatically calculated using KPI thresholds (R5-R0).',
    icon: <Calculator className="h-5 w-5" />,
  },
  {
    value: 'suggested_override',
    label: 'Suggested Score with Override',
    description: 'Show auto-calculated score as a suggestion based on achieved value, but allow reviewers to override if needed.',
    icon: <Lightbulb className="h-5 w-5" />,
  },
];

export default function SystemSettings() {
  const { mode, isLoading } = useScoreCalculationMode();
  const updateSetting = useUpdateSystemSetting();
  const [selectedMode, setSelectedMode] = useState<ScoreCalculationMode>(mode);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (mode) {
      setSelectedMode(mode);
    }
  }, [mode]);

  const handleModeChange = (value: ScoreCalculationMode) => {
    setSelectedMode(value);
    setHasChanges(value !== mode);
  };

  const handleSave = () => {
    updateSetting.mutate(
      { key: 'score_calculation_mode', value: selectedMode },
      { onSuccess: () => setHasChanges(false) }
    );
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <Settings className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">System Settings</h1>
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-96 mt-2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold">System Settings</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Score Calculation Mode
          </CardTitle>
          <CardDescription>
            Configure how scores are calculated during the review process (Manager, Auditor, and Management stages).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={selectedMode}
            onValueChange={(value) => handleModeChange(value as ScoreCalculationMode)}
            className="space-y-4"
          >
            {scoreCalculationOptions.map((option) => (
              <div
                key={option.value}
                className={`flex items-start space-x-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  selectedMode === option.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/30'
                }`}
                onClick={() => handleModeChange(option.value)}
              >
                <RadioGroupItem value={option.value} id={option.value} className="mt-1" />
                <div className="flex-1">
                  <Label
                    htmlFor={option.value}
                    className="flex items-center gap-2 text-base font-medium cursor-pointer"
                  >
                    {option.icon}
                    {option.label}
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {option.description}
                  </p>
                </div>
              </div>
            ))}
          </RadioGroup>

          <div className="mt-6 flex items-center justify-between border-t pt-4">
            <p className="text-sm text-muted-foreground">
              Current mode: <span className="font-medium text-foreground">{
                scoreCalculationOptions.find(o => o.value === mode)?.label || mode
              }</span>
            </p>
            <Button 
              onClick={handleSave} 
              disabled={!hasChanges || updateSetting.isPending}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {updateSetting.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
