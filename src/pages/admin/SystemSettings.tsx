import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Settings, Calculator, Edit3, Lightbulb, Save, RefreshCw, Calendar, Users, FileText, AlertCircle, Mail, Building2, CalendarDays, SlidersHorizontal, Database, KeyRound, Upload, Shield, Menu, LogOut, Undo2, LayoutGrid, Flag, TrendingUp, GitBranch, ScrollText, History } from 'lucide-react';
import { useScoreCalculationMode, useUpdateSystemSetting, ScoreCalculationMode, useAutoRolloverSetting, useRolloverLogs, useDailyAggregationMethod, DailyAggregationMethod, useSystemSetting, useAutoLogoutMinutes } from '@/hooks/useSystemSettings';
import { useRecallWindowHours } from '@/hooks/useRecallSubmission';
import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { EmailNotificationSettings } from '@/components/admin/EmailNotificationSettings';
import { EmailTemplateEditor } from '@/components/admin/EmailTemplateEditor';
import { GlobalBrandingSettings } from '@/components/admin/GlobalBrandingSettings';
import { WorkflowSettingsTab } from '@/components/admin/WorkflowSettingsTab';
import { BackupRestoreTab } from '@/components/admin/BackupRestoreTab';
import { FrequencyCycleSettings } from '@/components/admin/FrequencyCycleSettings';
import { RolloverDialog } from '@/components/admin/RolloverDialog';
import { BackfillAuditAssignmentsPanel } from '@/components/admin/BackfillAuditAssignmentsPanel';
import { PasswordPolicyTab } from '@/components/admin/PasswordPolicyTab';
import { ReportAccessTab } from '@/components/admin/ReportAccessTab';
import { MenuAccessTab } from '@/components/admin/MenuAccessTab';
import { DataRepairTab } from '@/components/admin/DataRepairTab';
import { ReportBuilderTab } from '@/components/admin/ReportBuilderTab';
import { UploadSettingsTab } from '@/components/admin/UploadSettingsTab';
import { OrgKpiGovernanceSettings } from '@/components/admin/OrgKpiGovernanceSettings';
import { FeatureFlagsTab } from '@/components/admin/FeatureFlagsTab';
import { DummyEmployeeVisibilityCard } from '@/components/admin/DummyEmployeeVisibilityCard';
import { EmployeeMasterFieldsCard } from '@/components/admin/EmployeeMasterFieldsCard';
import ModuleHubSettings from '@/pages/admin/ModuleHubSettings';
import { IncrementEligibilitySection } from '@/components/admin/scoring/IncrementEligibilitySection';
import { AnnualScoreCalculationSection } from '@/components/admin/scoring/AnnualScoreCalculationSection';
import { IncrementMethodSection } from '@/components/admin/scoring/IncrementMethodSection';
import GeneralEligibilityPage from '@/pages/increment/GeneralEligibility';
import IncrementSlabsPage from '@/pages/increment/IncrementSlabs';
import WorkflowConfigPage from '@/pages/admin/WorkflowConfig';
import OrganizationPage from '@/pages/admin/Organization';
import ReviewPeriodsPage from '@/pages/admin/ReviewPeriods';
import AuditLogsPage from '@/pages/AuditLogs';
import EmailLogsPage from '@/pages/admin/EmailLogs';
import { useMenuAccess } from '@/hooks/useMenuAccess';
import { ConfirmationIncrementSection } from '@/components/admin/scoring/ConfirmationIncrementSection';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useIsMobile } from '@/hooks/use-mobile';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useSearchParams } from 'react-router-dom';

const SETTINGS_SECTIONS = [
  { key: 'branding', label: 'Branding', icon: Building2 },
  { key: 'general', label: 'General', icon: RefreshCw },
  { key: 'workflow', label: 'Workflow Config', icon: GitBranch },
  { key: 'organization', label: 'Organization', icon: Building2 },
  { key: 'review-periods', label: 'Review Periods', icon: Calendar },
  { key: 'scoring', label: 'Scoring', icon: Calculator },
  { key: 'increment', label: 'Increment', icon: TrendingUp },
  { key: 'cycles', label: 'Cycles', icon: CalendarDays },
  { key: 'controls', label: 'Controls', icon: SlidersHorizontal },
  { key: 'uploads', label: 'Uploads', icon: Upload },
  { key: 'reports', label: 'Report Access', icon: Shield },
  { key: 'menu-access', label: 'Menu Access', icon: Menu },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'templates', label: 'Templates', icon: FileText },
  { key: 'passwords', label: 'Passwords', icon: KeyRound },
  { key: 'report-builder', label: 'Report Builder', icon: LayoutGrid },
  { key: 'backups', label: 'Backups', icon: Database },
  { key: 'data-repair', label: 'Data Repair', icon: Undo2 },
  { key: 'feature-flags', label: 'Feature Flags', icon: Flag },
  { key: 'module-hub', label: 'Module Hub', icon: LayoutGrid },
  { key: 'logs', label: 'Logs', icon: ScrollText },
] as const;

type SectionKey = typeof SETTINGS_SECTIONS[number]['key'];

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
  const { data: uploadLimitSetting, isLoading: uploadLimitLoading } = useSystemSetting('max_upload_size_mb');
  const { minutes: autoLogoutMinutes, isLoading: autoLogoutLoading } = useAutoLogoutMinutes();
  const { hours: recallWindowHours, isLoading: recallWindowLoading } = useRecallWindowHours();
  const updateSetting = useUpdateSystemSetting();
  const isMobile = useIsMobile();
  const { canAccess } = useMenuAccess();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSection = (searchParams.get('section') as SectionKey) || 'branding';
  const [activeSection, setActiveSectionRaw] = useState<SectionKey>(initialSection);
  const incrementTab = searchParams.get('tab') || 'eligibility';
  const logsTab = searchParams.get('logs') || 'audit';
  const setActiveSection = (key: SectionKey) => {
    setActiveSectionRaw(key);
    const next = new URLSearchParams(searchParams);
    next.set('section', key);
    if (key !== 'increment') next.delete('tab');
    if (key !== 'logs') next.delete('logs');
    setSearchParams(next, { replace: true });
  };
  useEffect(() => {
    const s = searchParams.get('section') as SectionKey | null;
    if (s && s !== activeSection) setActiveSectionRaw(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const [selectedMode, setSelectedMode] = useState<ScoreCalculationMode>(mode);
  const [selectedDailyMethod, setSelectedDailyMethod] = useState<DailyAggregationMethod>(dailyMethod);
  const [hasChanges, setHasChanges] = useState(false);
  const [hasDailyChanges, setHasDailyChanges] = useState(false);
  const [rolloverDialogOpen, setRolloverDialogOpen] = useState(false);
  const [uploadLimitMb, setUploadLimitMb] = useState(5);
  const [hasUploadLimitChanges, setHasUploadLimitChanges] = useState(false);
  const [selectedAutoLogout, setSelectedAutoLogout] = useState<string>(String(autoLogoutMinutes));
  const [hasAutoLogoutChanges, setHasAutoLogoutChanges] = useState(false);
  const [selectedRecallWindow, setSelectedRecallWindow] = useState<string>(recallWindowHours === 0 ? 'disabled' : String(recallWindowHours));
  const [hasRecallWindowChanges, setHasRecallWindowChanges] = useState(false);

  useEffect(() => {
    if (mode) setSelectedMode(mode);
  }, [mode]);

  useEffect(() => {
    if (dailyMethod) setSelectedDailyMethod(dailyMethod);
  }, [dailyMethod]);

  useEffect(() => {
    if (uploadLimitSetting?.setting_value) {
      const val = uploadLimitSetting.setting_value;
      const parsed = typeof val === 'number' ? val : parseFloat(String(val).replace(/^"|"$/g, ''));
      if (!isNaN(parsed) && parsed > 0) setUploadLimitMb(parsed);
    }
  }, [uploadLimitSetting]);

  useEffect(() => {
    if (!autoLogoutLoading) {
      setSelectedAutoLogout(autoLogoutMinutes === 0 ? 'disabled' : String(autoLogoutMinutes));
    }
  }, [autoLogoutMinutes, autoLogoutLoading]);

  useEffect(() => {
    if (!recallWindowLoading) {
      setSelectedRecallWindow(recallWindowHours === 0 ? 'disabled' : String(recallWindowHours));
    }
  }, [recallWindowHours, recallWindowLoading]);

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

  const handleManualRollover = () => {
    setRolloverDialogOpen(true);
  };

  const handleUploadLimitChange = (value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      setUploadLimitMb(Math.max(1, Math.min(50, num)));
      setHasUploadLimitChanges(true);
    }
  };

  const handleSaveUploadLimit = () => {
    updateSetting.mutate(
      { key: 'max_upload_size_mb', value: String(uploadLimitMb) },
      { onSuccess: () => setHasUploadLimitChanges(false) }
    );
  };

  const handleAutoLogoutChange = (value: string) => {
    setSelectedAutoLogout(value);
    const currentVal = autoLogoutMinutes === 0 ? 'disabled' : String(autoLogoutMinutes);
    setHasAutoLogoutChanges(value !== currentVal);
  };

  const handleSaveAutoLogout = () => {
    const saveValue = selectedAutoLogout === 'disabled' ? 'disabled' : selectedAutoLogout;
    updateSetting.mutate(
      { key: 'auto_logout_minutes', value: saveValue },
      { onSuccess: () => setHasAutoLogoutChanges(false) }
    );
  };

  const handleRecallWindowChange = (value: string) => {
    setSelectedRecallWindow(value);
    const currentVal = recallWindowHours === 0 ? 'disabled' : String(recallWindowHours);
    setHasRecallWindowChanges(value !== currentVal);
  };

  const handleSaveRecallWindow = () => {
    const saveValue = selectedRecallWindow === 'disabled' ? 'disabled' : selectedRecallWindow;
    updateSetting.mutate(
      { key: 'self_review_recall_hours', value: saveValue },
      { onSuccess: () => setHasRecallWindowChanges(false) }
    );
  };

  const lastRollover = rolloverLogs?.[0];
  const isLoading = modeLoading || rolloverLoading || dailyMethodLoading;

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
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

  const renderSectionContent = () => {
    switch (activeSection) {
      case 'branding':
        return <GlobalBrandingSettings />;
      case 'general':
        return (
          <>
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
                  <Button variant="outline" onClick={handleManualRollover}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Rollover KPIs
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Configure source/target period, preview conflicts, and rollover selectively.
                  </span>
                </div>
              </CardContent>
            </Card>

            <RolloverDialog open={rolloverDialogOpen} onOpenChange={setRolloverDialogOpen} />

            <BackfillAuditAssignmentsPanel />

            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  File Upload Limit
                </CardTitle>
                <CardDescription>
                  Set the maximum allowed file size for evidence uploads, attachments, and branding assets across the system.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 p-4 rounded-lg border">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="upload-limit" className="text-base font-medium">
                      Max Upload Size (MB)
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Applies to all evidence, attachment, and branding uploads. Range: 1–50 MB.
                    </p>
                  </div>
                  <Input
                    id="upload-limit"
                    type="number"
                    min={1}
                    max={50}
                    value={uploadLimitMb}
                    onChange={(e) => handleUploadLimitChange(e.target.value)}
                    className="w-24"
                  />
                </div>
                <div className="mt-4 flex items-center justify-between border-t pt-4">
                  <p className="text-sm text-muted-foreground">
                    Current limit: <span className="font-medium text-foreground">{uploadLimitMb} MB</span>
                  </p>
                  <Button
                    onClick={handleSaveUploadLimit}
                    disabled={!hasUploadLimitChanges || updateSetting.isPending}
                    className="gap-2"
                  >
                    <Save className="h-4 w-4" />
                    {updateSetting.isPending ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LogOut className="h-5 w-5" />
                  Auto Logout (Idle Timeout)
                </CardTitle>
                <CardDescription>
                  Automatically sign out users after a period of inactivity to enhance security.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 p-4 rounded-lg border">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="auto-logout" className="text-base font-medium">
                      Idle Timeout Duration
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Users will be signed out after this period of inactivity. A warning appears 60 seconds before logout.
                    </p>
                  </div>
                  <Select value={selectedAutoLogout} onValueChange={handleAutoLogoutChange}>
                    <SelectTrigger className="w-40" id="auto-logout">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="disabled">Disabled</SelectItem>
                      <SelectItem value="5">5 minutes</SelectItem>
                      <SelectItem value="10">10 minutes</SelectItem>
                      <SelectItem value="15">15 minutes</SelectItem>
                      <SelectItem value="30">30 minutes</SelectItem>
                      <SelectItem value="45">45 minutes</SelectItem>
                      <SelectItem value="60">60 minutes</SelectItem>
                      <SelectItem value="90">90 minutes</SelectItem>
                      <SelectItem value="120">120 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="mt-4 flex items-center justify-between border-t pt-4">
                  <p className="text-sm text-muted-foreground">
                    Current setting: <span className="font-medium text-foreground">
                      {autoLogoutMinutes === 0 ? 'Disabled' : `${autoLogoutMinutes} minutes`}
                    </span>
                  </p>
                  <Button
                    onClick={handleSaveAutoLogout}
                    disabled={!hasAutoLogoutChanges || updateSetting.isPending}
                    className="gap-2"
                  >
                    <Save className="h-4 w-4" />
                    {updateSetting.isPending ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Undo2 className="h-5 w-5" />
                  Self-Review Recall Window
                </CardTitle>
                <CardDescription>
                  Allow employees to withdraw and correct their self-review submission within a defined time window, as long as the manager hasn't reviewed it yet.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 p-4 rounded-lg border">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="recall-window" className="text-base font-medium">
                      Recall Duration
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Employees can recall their submission within this duration after submitting, provided the manager hasn't acted.
                    </p>
                  </div>
                  <Select value={selectedRecallWindow} onValueChange={handleRecallWindowChange}>
                    <SelectTrigger className="w-40" id="recall-window">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="disabled">Disabled</SelectItem>
                      <SelectItem value="1">1 hour</SelectItem>
                      <SelectItem value="2">2 hours</SelectItem>
                      <SelectItem value="4">4 hours</SelectItem>
                      <SelectItem value="6">6 hours</SelectItem>
                      <SelectItem value="12">12 hours</SelectItem>
                      <SelectItem value="24">24 hours</SelectItem>
                      <SelectItem value="48">48 hours</SelectItem>
                      <SelectItem value="72">72 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="mt-4 flex items-center justify-between border-t pt-4">
                  <p className="text-sm text-muted-foreground">
                    Current setting: <span className="font-medium text-foreground">
                      {recallWindowHours === 0 ? 'Disabled' : `${recallWindowHours} hours`}
                    </span>
                  </p>
                  <Button
                    onClick={handleSaveRecallWindow}
                    disabled={!hasRecallWindowChanges || updateSetting.isPending}
                    className="gap-2"
                  >
                    <Save className="h-4 w-4" />
                    {updateSetting.isPending ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <OrgKpiGovernanceSettings />

            <DummyEmployeeVisibilityCard />

            <EmployeeMasterFieldsCard />
          </>
        );
      case 'scoring':
        return (
          <div className="space-y-6">
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

            <AnnualScoreCalculationSection />
          </div>
        );
      case 'increment':
        return (
          <Tabs
            value={incrementTab}
            onValueChange={(v) => {
              const next = new URLSearchParams(searchParams);
              next.set('section', 'increment');
              next.set('tab', v);
              setSearchParams(next, { replace: true });
            }}
            className="space-y-4"
          >
            <TabsList>
              <TabsTrigger value="eligibility">Ineligibility Criteria</TabsTrigger>
              <TabsTrigger value="method">Increment Method</TabsTrigger>
              <TabsTrigger value="general-eligibility">General Eligibility</TabsTrigger>
              <TabsTrigger value="increment-slabs">Increment Slabs</TabsTrigger>
              <TabsTrigger value="confirmation-adjustment">Confirmation Adjustment</TabsTrigger>
            </TabsList>
            <TabsContent value="eligibility"><IncrementEligibilitySection /></TabsContent>
            <TabsContent value="method"><IncrementMethodSection /></TabsContent>
            <TabsContent value="general-eligibility"><GeneralEligibilityPage /></TabsContent>
            <TabsContent value="increment-slabs"><IncrementSlabsPage /></TabsContent>
            <TabsContent value="confirmation-adjustment"><ConfirmationIncrementSection /></TabsContent>
          </Tabs>
        );
      case 'cycles':
        return <FrequencyCycleSettings />;
      case 'controls':
        return <WorkflowSettingsTab />;
      case 'uploads':
        return <UploadSettingsTab />;
      case 'reports':
        return <ReportAccessTab />;
      case 'menu-access':
        return <MenuAccessTab />;
      case 'email':
        return <EmailNotificationSettings />;
      case 'templates':
        return <EmailTemplateEditor />;
      case 'passwords':
        return <PasswordPolicyTab />;
      case 'report-builder':
        return <ReportBuilderTab />;
      case 'backups':
        return <BackupRestoreTab />;
      case 'data-repair':
        return <DataRepairTab />;
      case 'feature-flags':
        return <FeatureFlagsTab />;
      case 'module-hub':
        return <ModuleHubSettings />;
      case 'workflow':
        return <WorkflowConfigPage />;
      case 'organization':
        return <OrganizationPage />;
      case 'review-periods':
        return <ReviewPeriodsPage />;
      default:
        return null;
    }
  };

  const SidebarNav = () => (
    <ScrollArea className="h-full">
      <nav className="space-y-1 p-3">
        {SETTINGS_SECTIONS.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.key;
          return (
            <button
              key={section.key}
              onClick={() => setActiveSection(section.key)}
              className={cn(
                'flex items-center gap-3 w-full rounded-md px-3 py-2.5 text-sm font-medium transition-colors text-left',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {section.label}
            </button>
          );
        })}
      </nav>
    </ScrollArea>
  );

  // Mobile layout
  if (isMobile) {
    return (
      <div className="container mx-auto p-3">
        <div className="flex items-center gap-3 mb-4">
          <Settings className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold">System Settings</h1>
        </div>
        <Select value={activeSection} onValueChange={(v) => setActiveSection(v as SectionKey)}>
          <SelectTrigger className="mb-4">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SETTINGS_SECTIONS.map((section) => {
              const Icon = section.icon;
              return (
                <SelectItem key={section.key} value={section.key}>
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {section.label}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <div>{renderSectionContent()}</div>
      </div>
    );
  }

  // Desktop layout — full-width shell so content sections (e.g. Increment Slabs)
  // can breathe edge-to-edge on large monitors.
  return (
    <div className="w-full">
      <div className="flex items-center gap-3 mb-4">
        <Settings className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold">System Settings</h1>
      </div>

      <div className="rounded-lg border bg-card" style={{ height: 'calc(100vh - 140px)' }}>
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel defaultSize={15} minSize={12} maxSize={22}>
            <div className="h-full border-r">
              <SidebarNav />
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={85}>
            <ScrollArea className="h-full">
              <div className="p-4 lg:p-6">
                {renderSectionContent()}
              </div>
            </ScrollArea>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
