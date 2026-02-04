import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Calculator, Edit3, Lightbulb, Save, RefreshCw, Calendar, Users, FileText, AlertCircle, Mail, Building2, CalendarDays, SlidersHorizontal } from 'lucide-react';
import { useScoreCalculationMode, useUpdateSystemSetting, ScoreCalculationMode, useAutoRolloverSetting, useRolloverLogs, useTriggerRollover, useDailyAggregationMethod, DailyAggregationMethod } from '@/hooks/useSystemSettings';
import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { EmailNotificationSettings } from '@/components/admin/EmailNotificationSettings';
import { EmailTemplateEditor } from '@/components/admin/EmailTemplateEditor';
import { GlobalBrandingSettings } from '@/components/admin/GlobalBrandingSettings';
import { WorkflowSettingsTab } from '@/components/admin/WorkflowSettingsTab';

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

const dailyAggregationOptions: {
  value: DailyAggregationMethod;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: 'average',
    label: 'Average Score',
    description: 'Monthly score is the simple average of all daily submitted values.',
    icon: <Calculator className="h-5 w-5" />,
  },
  {
    value: 'missed_days_penalty',
    label: 'Missed Days Penalty',
    description: 'Score based on missed days: 5 (0 missed), 4 (1 missed), 3 (2 missed), 2 (3 missed), 1 (4 missed), 0 (5+ missed).',
    icon: <CalendarDays className="h-5 w-5" />,
  },
];

export default function SystemSettings() {
  const { mode, isLoading: modeLoading } = useScoreCalculationMode();
  const { enabled: rolloverEnabled, isLoading: rolloverLoading } = useAutoRolloverSetting();
  const { method: dailyMethod, isLoading: dailyMethodLoading } = useDailyAggregationMethod();
  const { data: rolloverLogs, isLoading: logsLoading } = useRolloverLogs();
  const updateSetting = useUpdateSystemSetting();
  const triggerRollover = useTriggerRollover();
  
  const [selectedMode, setSelectedMode] = useState<ScoreCalculationMode>(mode);
  const [selectedDailyMethod, setSelectedDailyMethod] = useState<DailyAggregationMethod>(dailyMethod);
  const [hasChanges, setHasChanges] = useState(false);
  const [hasDailyChanges, setHasDailyChanges] = useState(false);

  useEffect(() => {
    if (mode) {
      setSelectedMode(mode);
    }
  }, [mode]);

  useEffect(() => {
    if (dailyMethod) {
      setSelectedDailyMethod(dailyMethod);
    }
  }, [dailyMethod]);

  const handleModeChange = (value: ScoreCalculationMode) => {
    setSelectedMode(value);
    setHasChanges(value !== mode);
  };

  const handleDailyMethodChange = (value: DailyAggregationMethod) => {
    setSelectedDailyMethod(value);
    setHasDailyChanges(value !== dailyMethod);
  };

  const handleSave = () => {
    updateSetting.mutate(
      { key: 'score_calculation_mode', value: selectedMode },
      { onSuccess: () => setHasChanges(false) }
    );
  };

  const handleSaveDailyMethod = () => {
    updateSetting.mutate(
      { key: 'daily_aggregation_method', value: selectedDailyMethod },
      { onSuccess: () => setHasDailyChanges(false) }
    );
  };

  const handleRolloverToggle = (checked: boolean) => {
    updateSetting.mutate({
      key: 'auto_kra_rollover',
      value: checked ? 'enabled' : 'disabled',
    });
  };

  const handleManualRollover = (force: boolean = false) => {
    triggerRollover.mutate(force);
  };

  const lastRollover = rolloverLogs?.[0];
  const isLoading = modeLoading || rolloverLoading || dailyMethodLoading;

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <Settings className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">System Settings</h1>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-10 w-80" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold">System Settings</h1>
      </div>

      <Tabs defaultValue="branding" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="branding" className="gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Branding</span>
          </TabsTrigger>
          <TabsTrigger value="general" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">General</span>
          </TabsTrigger>
          <TabsTrigger value="scoring" className="gap-2">
            <Calculator className="h-4 w-4" />
            <span className="hidden sm:inline">Scoring</span>
          </TabsTrigger>
          <TabsTrigger value="controls" className="gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            <span className="hidden sm:inline">Controls</span>
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-2">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">Email</span>
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Templates</span>
          </TabsTrigger>
        </TabsList>

        {/* Branding Tab */}
        <TabsContent value="branding">
          <GlobalBrandingSettings />
        </TabsContent>

        {/* General Tab - Auto KRA Rollover */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                Auto KRA Rollover
              </CardTitle>
              <CardDescription>
                Automatically copy KRA definitions from the previous month to the new month on the 1st of each month.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 rounded-lg border">
                <div className="space-y-1">
                  <Label htmlFor="auto-rollover" className="text-base font-medium">
                    Enable Auto-Rollover
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    When enabled, KPIs will be automatically copied on the 1st of each month.
                  </p>
                </div>
                <Switch
                  id="auto-rollover"
                  checked={rolloverEnabled}
                  onCheckedChange={handleRolloverToggle}
                  disabled={updateSetting.isPending}
                />
              </div>

              {lastRollover && (
                <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Last Rollover</span>
                    <Badge variant={lastRollover.status === 'completed' ? 'default' : 'destructive'}>
                      {lastRollover.status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>{format(new Date(lastRollover.created_at), 'dd MMM yyyy, hh:mm a')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span>{lastRollover.kpis_copied} KPIs copied</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>{lastRollover.employees_affected} employees</span>
                    </div>
                    <div className="text-muted-foreground">
                      {lastRollover.source_period} {lastRollover.source_year} → {lastRollover.target_period} {lastRollover.target_year}
                    </div>
                  </div>
                  {lastRollover.error_message && (
                    <div className="flex items-center gap-2 text-sm text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      <span>{lastRollover.error_message}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3 border-t pt-4">
                <Button
                  variant="outline"
                  onClick={() => handleManualRollover(false)}
                  disabled={triggerRollover.isPending}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${triggerRollover.isPending ? 'animate-spin' : ''}`} />
                  {triggerRollover.isPending ? 'Rolling Over...' : 'Rollover Now'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => handleManualRollover(true)}
                  disabled={triggerRollover.isPending}
                >
                  Force Rollover
                </Button>
                <span className="text-sm text-muted-foreground">
                  Force will copy even if target period already has KPIs.
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Scoring Tab */}
        <TabsContent value="scoring" className="space-y-6">
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

          {/* Daily KPI Aggregation Method */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5" />
                Daily KPI Aggregation Method
              </CardTitle>
              <CardDescription>
                Configure how daily submission entries are aggregated into a monthly score.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={selectedDailyMethod}
                onValueChange={(value) => handleDailyMethodChange(value as DailyAggregationMethod)}
                className="space-y-4"
              >
                {dailyAggregationOptions.map((option) => (
                  <div
                    key={option.value}
                    className={`flex items-start space-x-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedDailyMethod === option.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/30'
                    }`}
                    onClick={() => handleDailyMethodChange(option.value)}
                  >
                    <RadioGroupItem value={option.value} id={`daily-${option.value}`} className="mt-1" />
                    <div className="flex-1">
                      <Label
                        htmlFor={`daily-${option.value}`}
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
                  Current method: <span className="font-medium text-foreground">{
                    dailyAggregationOptions.find(o => o.value === dailyMethod)?.label || dailyMethod
                  }</span>
                </p>
                <Button 
                  onClick={handleSaveDailyMethod} 
                  disabled={!hasDailyChanges || updateSetting.isPending}
                  className="gap-2"
                >
                  <Save className="h-4 w-4" />
                  {updateSetting.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Controls Tab */}
        <TabsContent value="controls">
          <WorkflowSettingsTab />
        </TabsContent>

        {/* Email Tab */}
        <TabsContent value="email">
          <EmailNotificationSettings />
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates">
          <EmailTemplateEditor />
        </TabsContent>
      </Tabs>
    </div>
  );
}