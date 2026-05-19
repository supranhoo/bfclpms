import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Save, CalendarDays } from 'lucide-react';
import { useFrequencyConfigs, useUpdateFrequencyConfig } from '@/hooks/useFrequencyConfig';
import { toast } from 'sonner';
import { WeeklyWindowEditor } from './WeeklyWindowEditor';
import {
  CycleOption,
  BI_MONTHLY_OPTIONS,
  QUARTERLY_OPTIONS,
  HALF_YEARLY_OPTIONS,
  YEARLY_OPTIONS,
} from '@/lib/frequencyCycleOptions';

function detectCurrentOption(
  options: CycleOption[],
  currentSubFrequency: string | undefined,
  currentActiveMonth: number | null | undefined
): string {
  const match = options.find(
    (o) => o.subFrequency === currentSubFrequency || o.activeMonth === currentActiveMonth
  );
  return match?.value || options[0]?.value || '';
}

interface FrequencyCycleSectionProps {
  title: string;
  options: CycleOption[];
  currentSubFrequency: string | undefined;
  currentActiveMonth: number | null | undefined;
  configId: string | undefined;
  onSave: (id: string, option: CycleOption) => void;
  isSaving: boolean;
}

function FrequencyCycleSection({
  title,
  options,
  currentSubFrequency,
  currentActiveMonth,
  configId,
  onSave,
  isSaving,
}: FrequencyCycleSectionProps) {
  const currentValue = detectCurrentOption(options, currentSubFrequency, currentActiveMonth);
  const [selected, setSelected] = useState(currentValue);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const detected = detectCurrentOption(options, currentSubFrequency, currentActiveMonth);
    setSelected(detected);
    setHasChanges(false);
  }, [currentSubFrequency, currentActiveMonth, options]);

  const handleChange = (value: string) => {
    setSelected(value);
    setHasChanges(value !== detectCurrentOption(options, currentSubFrequency, currentActiveMonth));
  };

  const handleSave = () => {
    const option = options.find((o) => o.value === selected);
    if (option && configId) {
      onSave(configId, option);
      setHasChanges(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>Choose when the cycle starts for this frequency.</CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup value={selected} onValueChange={handleChange} className="space-y-3">
          {options.map((option) => (
            <div
              key={option.value}
              className={`flex items-start space-x-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                selected === option.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-muted-foreground/30'
              }`}
              onClick={() => handleChange(option.value)}
            >
              <RadioGroupItem value={option.value} id={`${title}-${option.value}`} className="mt-1" />
              <div className="flex-1">
                <Label htmlFor={`${title}-${option.value}`} className="text-base font-medium cursor-pointer">
                  {option.label}
                </Label>
                <p className="text-sm text-muted-foreground mt-1">{option.description}</p>
              </div>
            </div>
          ))}
        </RadioGroup>

        <div className="mt-4 flex justify-end">
          <Button onClick={handleSave} disabled={!hasChanges || isSaving} className="gap-2">
            <Save className="h-4 w-4" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function FrequencyCycleSettings() {
  const { data: configs, isLoading } = useFrequencyConfigs();
  const updateConfig = useUpdateFrequencyConfig();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const biMonthly = configs?.find((c) => c.frequency === 'Bi-Monthly');
  const quarterly = configs?.find((c) => c.frequency === 'Quarterly');
  const halfYearly = configs?.find((c) => c.frequency === 'Half-Yearly');
  const yearly = configs?.find((c) => c.frequency === 'Yearly');

  const handleSave = (id: string, option: CycleOption) => {
    updateConfig.mutate(
      {
        id,
        sub_frequency: option.subFrequency,
        locked_months: option.lockedMonths,
        active_month: option.activeMonth,
      },
      {
        onSuccess: () => toast.success('Frequency cycle updated successfully'),
        onError: () => toast.error('Failed to update frequency cycle'),
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <CalendarDays className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">Frequency Cycle Configuration</h2>
      </div>
      <p className="text-sm text-muted-foreground -mt-4">
        Configure when multi-month frequency cycles start. This affects which months are locked and when reviews are due.
        Individual KPIs can override these defaults via the Cycle Start field.
      </p>

      <FrequencyCycleSection
        title="Bi-Monthly Cycle Start"
        options={BI_MONTHLY_OPTIONS}
        currentSubFrequency={biMonthly?.sub_frequency}
        currentActiveMonth={biMonthly?.active_month}
        configId={biMonthly?.id}
        onSave={handleSave}
        isSaving={updateConfig.isPending}
      />

      <FrequencyCycleSection
        title="Quarterly Cycle Start"
        options={QUARTERLY_OPTIONS}
        currentSubFrequency={quarterly?.sub_frequency}
        currentActiveMonth={quarterly?.active_month}
        configId={quarterly?.id}
        onSave={handleSave}
        isSaving={updateConfig.isPending}
      />

      <FrequencyCycleSection
        title="Half-Yearly Cycle Start"
        options={HALF_YEARLY_OPTIONS}
        currentSubFrequency={halfYearly?.sub_frequency}
        currentActiveMonth={halfYearly?.active_month}
        configId={halfYearly?.id}
        onSave={handleSave}
        isSaving={updateConfig.isPending}
      />

      <FrequencyCycleSection
        title="Yearly Cycle Start"
        options={YEARLY_OPTIONS}
        currentSubFrequency={yearly?.sub_frequency}
        currentActiveMonth={yearly?.active_month}
        configId={yearly?.id}
        onSave={handleSave}
        isSaving={updateConfig.isPending}
      />

      <WeeklyWindowEditor />
    </div>
  );
}
