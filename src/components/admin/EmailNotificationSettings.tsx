import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mail, Send, Save, AlertCircle, Image, Server, Eye, EyeOff, Plug, Lock, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  useEmailNotificationSettings,
  useUpdateEmailSettings,
  useSendTestEmail,
  useTestSmtpConnection,
  EmailEventType,
  EmailNotificationSettings as EmailSettings,
  EmailProvider,
  SmtpSecurity,
} from '@/hooks/useEmailNotificationSettings';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const EMAIL_EVENTS: { key: EmailEventType; label: string; description: string }[] = [
  { key: 'kpi_submitted', label: 'KPI Submission', description: 'Notify manager when employee submits self-review' },
  { key: 'manager_approved', label: 'Manager Approval', description: 'Notify employee when manager approves KPI' },
  { key: 'manager_rejected', label: 'Send Back', description: 'Notify employee when KPI is sent back for revision' },
  { key: 'query_raised', label: 'Query Raised', description: 'Notify recipient when a query is raised' },
  { key: 'query_resolved', label: 'Query Resolved', description: 'Notify raiser when their query is resolved' },
  { key: 'final_approved', label: 'Final Approval', description: 'Notify employee when KPI receives final sign-off' },
  { key: 'kra_assigned', label: 'KRA Assignment', description: 'Notify employee when new KRA is assigned' },
  { key: 'period_locked', label: 'Period Locked', description: 'Notify when review period is locked' },
  { key: 'pip_initiated', label: 'PIP Started', description: 'Notify employee when placed on Performance Improvement Plan' },
  { key: 'pip_milestone_reminder', label: 'PIP Milestone', description: 'Remind employee of upcoming PIP milestone check-ins' },
  { key: 'pip_completed', label: 'PIP Completed', description: 'Notify employee when PIP is successfully completed' },
];

export function EmailNotificationSettings() {
  const { data: settings, isLoading } = useEmailNotificationSettings();
  const updateSettings = useUpdateEmailSettings();
  const sendTestEmail = useSendTestEmail();
  const testSmtpConnection = useTestSmtpConnection();
  
  const [localSettings, setLocalSettings] = useState<EmailSettings>({
    enabled: false,
    senderName: 'PMS Notifications',
    senderEmail: 'onboarding@resend.dev',
    enabledEvents: [],
    companyLogoUrl: '',
    customFooterText: '',
    emailProvider: 'resend',
    smtpHost: '',
    smtpPort: 587,
    smtpSecurity: 'tls',
    smtpUsername: '',
    smtpFromAddress: '',
    smtpFromName: '',
  });
  const [testEmail, setTestEmail] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [smtpPassword, setSmtpPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const { toast } = useToast();

  const handleUpdatePassword = useCallback(async () => {
    if (!smtpPassword.trim()) return;
    setIsUpdatingPassword(true);
    try {
      const { data, error } = await supabase.functions.invoke('update-smtp-password', {
        body: { password: smtpPassword },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({
        title: 'Password Updated',
        description: 'SMTP password has been stored securely.',
      });
      setSmtpPassword('');
    } catch (err: any) {
      toast({
        title: 'Failed to Update Password',
        description: err.message || 'An error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingPassword(false);
    }
  }, [smtpPassword, toast]);
  
  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
    }
  }, [settings]);
  
  const handleChange = <K extends keyof EmailSettings>(key: K, value: EmailSettings[K]) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };
  
  const handleEventToggle = (eventKey: EmailEventType, checked: boolean) => {
    const newEvents = checked
      ? [...localSettings.enabledEvents, eventKey]
      : localSettings.enabledEvents.filter(e => e !== eventKey);
    handleChange('enabledEvents', newEvents);
  };
  
  const handleSave = () => {
    updateSettings.mutate(localSettings, {
      onSuccess: () => setHasChanges(false),
    });
  };
  
  const handleSendTest = () => {
    if (testEmail) {
      sendTestEmail.mutate(testEmail);
    }
  };

  const handleTestSmtp = () => {
    if (testEmail && localSettings.smtpHost) {
      testSmtpConnection.mutate({
        smtpHost: localSettings.smtpHost,
        smtpPort: localSettings.smtpPort,
        smtpSecurity: localSettings.smtpSecurity,
        smtpUsername: localSettings.smtpUsername,
        smtpFromAddress: localSettings.smtpFromAddress,
        smtpFromName: localSettings.smtpFromName,
        recipientEmail: testEmail,
      });
    }
  };
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-96 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Email Notifications
        </CardTitle>
        <CardDescription>
          Send email alerts in addition to in-app notifications for important workflow events.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Master Toggle */}
        <div className="flex items-center justify-between p-4 rounded-lg border">
          <div className="space-y-1">
            <Label htmlFor="email-enabled" className="text-base font-medium">
              Enable Email Notifications
            </Label>
            <p className="text-sm text-muted-foreground">
              Send email alerts for selected workflow events
            </p>
          </div>
          <Switch
            id="email-enabled"
            checked={localSettings.enabled}
            onCheckedChange={(checked) => handleChange('enabled', checked)}
          />
        </div>

        {/* Email Provider Selection */}
        <div className="space-y-4 p-4 rounded-lg border">
          <h4 className="font-medium flex items-center gap-2">
            <Server className="h-4 w-4" />
            Email Provider
          </h4>
          <RadioGroup
            value={localSettings.emailProvider}
            onValueChange={(value) => handleChange('emailProvider', value as EmailProvider)}
            className="grid grid-cols-2 gap-4"
          >
            <div className="flex items-center space-x-2 border rounded-lg p-4">
              <RadioGroupItem value="resend" id="provider-resend" />
              <Label htmlFor="provider-resend" className="flex-1 cursor-pointer">
                <div className="font-medium">Resend (Default)</div>
                <div className="text-sm text-muted-foreground">
                  Use Resend API for email delivery
                </div>
              </Label>
            </div>
            <div className="flex items-center space-x-2 border rounded-lg p-4">
              <RadioGroupItem value="smtp" id="provider-smtp" />
              <Label htmlFor="provider-smtp" className="flex-1 cursor-pointer">
                <div className="font-medium">Custom SMTP</div>
                <div className="text-sm text-muted-foreground">
                  Use your own mail server
                </div>
              </Label>
            </div>
          </RadioGroup>
        </div>

        {/* Resend Configuration */}
        {localSettings.emailProvider === 'resend' && (
          <div className="space-y-4 p-4 rounded-lg border">
            <h4 className="font-medium">Resend Configuration</h4>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sender-name">Sender Name</Label>
                <Input
                  id="sender-name"
                  value={localSettings.senderName}
                  onChange={(e) => handleChange('senderName', e.target.value)}
                  placeholder="PMS Notifications"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sender-email">Sender Email</Label>
                <Input
                  id="sender-email"
                  type="email"
                  value={localSettings.senderEmail}
                  onChange={(e) => handleChange('senderEmail', e.target.value)}
                  placeholder="pms@yourcompany.com"
                />
              </div>
            </div>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                To use a custom email domain, you must verify it in your Resend dashboard.
                The default <code>onboarding@resend.dev</code> can only send to verified emails during testing.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* SMTP Configuration */}
        {localSettings.emailProvider === 'smtp' && (
          <div className="space-y-4 p-4 rounded-lg border">
            <h4 className="font-medium">SMTP Server Configuration</h4>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="smtp-host">SMTP Host</Label>
                <Input
                  id="smtp-host"
                  value={localSettings.smtpHost}
                  onChange={(e) => handleChange('smtpHost', e.target.value)}
                  placeholder="mail.yourcompany.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp-port">Port</Label>
                <Select
                  value={String(localSettings.smtpPort)}
                  onValueChange={(value) => handleChange('smtpPort', parseInt(value))}
                >
                  <SelectTrigger id="smtp-port">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25 (Standard)</SelectItem>
                    <SelectItem value="465">465 (SSL/TLS)</SelectItem>
                    <SelectItem value="587">587 (STARTTLS)</SelectItem>
                    <SelectItem value="2525">2525 (Alternative)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Security</Label>
              <RadioGroup
                value={localSettings.smtpSecurity}
                onValueChange={(value) => handleChange('smtpSecurity', value as SmtpSecurity)}
                className="flex gap-6"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="tls" id="security-tls" />
                  <Label htmlFor="security-tls" className="cursor-pointer">TLS</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="starttls" id="security-starttls" />
                  <Label htmlFor="security-starttls" className="cursor-pointer">STARTTLS</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="none" id="security-none" />
                  <Label htmlFor="security-none" className="cursor-pointer">None</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="smtp-username">Username</Label>
                <Input
                  id="smtp-username"
                  value={localSettings.smtpUsername}
                  onChange={(e) => handleChange('smtpUsername', e.target.value)}
                  placeholder="noreply@yourcompany.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp-password">Password</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="smtp-password"
                      type={showPassword ? 'text' : 'password'}
                      value={smtpPassword}
                      onChange={(e) => setSmtpPassword(e.target.value)}
                      className="pr-10"
                      placeholder="Enter SMTP password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleUpdatePassword}
                    disabled={!smtpPassword.trim() || isUpdatingPassword}
                    className="shrink-0"
                  >
                    {isUpdatingPassword ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Lock className="h-4 w-4 mr-2" />
                    )}
                    {isUpdatingPassword ? 'Saving...' : 'Update Password'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Enter your SMTP password. It will be stored securely and never displayed again.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="smtp-from-address">From Address</Label>
                <Input
                  id="smtp-from-address"
                  type="email"
                  value={localSettings.smtpFromAddress}
                  onChange={(e) => handleChange('smtpFromAddress', e.target.value)}
                  placeholder="noreply@yourcompany.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp-from-name">From Name</Label>
                <Input
                  id="smtp-from-name"
                  value={localSettings.smtpFromName}
                  onChange={(e) => handleChange('smtpFromName', e.target.value)}
                  placeholder="BFCL PMS System"
                />
              </div>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Enter your SMTP server details. The SMTP password is stored securely as a secret and never exposed in the UI.
                Make sure your mail server allows connections from cloud services.
              </AlertDescription>
            </Alert>
          </div>
        )}
        
        {/* Template Customization */}
        <div className="space-y-4 p-4 rounded-lg border">
          <h4 className="font-medium flex items-center gap-2">
            <Image className="h-4 w-4" />
            Template Customization
          </h4>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="logo-url">Company Logo URL</Label>
              <Input
                id="logo-url"
                type="url"
                value={localSettings.companyLogoUrl}
                onChange={(e) => handleChange('companyLogoUrl', e.target.value)}
                placeholder="https://yourcompany.com/logo.png"
              />
              <p className="text-sm text-muted-foreground">
                URL to your company logo (recommended: 200x50px, PNG or SVG)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="footer-text">Custom Footer Text</Label>
              <Textarea
                id="footer-text"
                value={localSettings.customFooterText}
                onChange={(e) => handleChange('customFooterText', e.target.value)}
                placeholder="© 2024 Your Company. All rights reserved."
                rows={2}
              />
              <p className="text-sm text-muted-foreground">
                Additional text to display in the email footer
              </p>
            </div>
          </div>
        </div>

        {/* Event Selection */}
        <div className="space-y-4 p-4 rounded-lg border">
          <h4 className="font-medium">Notification Events</h4>
          <p className="text-sm text-muted-foreground">
            Select which events should trigger email notifications
          </p>
          <div className="space-y-3">
            {EMAIL_EVENTS.map((event) => (
              <div key={event.key} className="flex items-start space-x-3">
                <Checkbox
                  id={event.key}
                  checked={localSettings.enabledEvents.includes(event.key)}
                  onCheckedChange={(checked) => handleEventToggle(event.key, checked === true)}
                />
                <div className="space-y-1">
                  <Label htmlFor={event.key} className="font-medium cursor-pointer">
                    {event.label}
                  </Label>
                  <p className="text-sm text-muted-foreground">{event.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Test Email */}
        <div className="space-y-4 p-4 rounded-lg border">
          <h4 className="font-medium">Test Configuration</h4>
          <div className="flex flex-wrap gap-3">
            <Input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="Enter email to receive test"
              className="max-w-sm"
            />
            {localSettings.emailProvider === 'smtp' && (
              <Button
                variant="outline"
                onClick={handleTestSmtp}
                disabled={!testEmail || !localSettings.smtpHost || testSmtpConnection.isPending}
              >
                <Plug className="h-4 w-4 mr-2" />
                {testSmtpConnection.isPending ? 'Testing...' : 'Test SMTP'}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={handleSendTest}
              disabled={!testEmail || sendTestEmail.isPending}
            >
              <Send className="h-4 w-4 mr-2" />
              {sendTestEmail.isPending ? 'Sending...' : 'Send Test'}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {localSettings.emailProvider === 'smtp' 
              ? 'Click "Test SMTP" to verify connection, then "Send Test" to send a test email using saved settings.'
              : 'Send a test email to verify your configuration is working correctly.'
            }
          </p>
        </div>
        
        {/* Save Button */}
        <div className="flex justify-end border-t pt-4">
          <Button
            onClick={handleSave}
            disabled={!hasChanges || updateSettings.isPending}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {updateSettings.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
