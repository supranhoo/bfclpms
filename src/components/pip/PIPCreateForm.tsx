/**
 * ADR-208 — full-page PIP creation form.
 *
 * Extracted verbatim (validation + POLICY §15.7 guardrails) from the former
 * PIPCreateDialog, with two behavioural changes:
 *   1. the employee Select is fully controlled, so a preselected employee
 *      renders on first paint (previously `defaultValue` swallowed prefills);
 *   2. improvement areas can be picked from the employee's low-scoring KPIs.
 */
import { useEffect, useMemo, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { useCreatePIP } from '@/hooks/usePIP';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CalendarIcon, Plus, X } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { getPipPolicySettings, DEFAULT_PIP_POLICY } from '@/lib/pip/pipPolicySettings';
import { validatePipDuration, validateMilestoneCadence, LIVE_PIP_STATUSES } from '@/lib/pip/pipTriggerRules';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LowScoringKpiPicker } from '@/components/pip/LowScoringKpiPicker';
import type { MonthKey } from '@/hooks/useMonthlyTrend';

const milestoneSchema = z.object({
  milestone_date: z.date(),
  description: z.string().min(1, 'Description required'),
  expected_outcome: z.string().min(1, 'Expected outcome required'),
});

const formSchema = z.object({
  employee_id: z.string().min(1, 'Select an employee'),
  start_date: z.date(),
  end_date: z.date(),
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
  improvement_areas: z.array(z.string()).min(1, 'Select at least one area'),
  success_criteria: z.string().min(10, 'Success criteria must be at least 10 characters'),
  support_provided: z.string().min(10, 'Describe the support BFCL will provide (POLICY §15.6)'),
  milestones: z.array(milestoneSchema).min(1, 'Add at least one milestone'),
});

type FormValues = z.infer<typeof formSchema>;

export const IMPROVEMENT_AREAS = [
  'Quality of Work',
  'Productivity',
  'Communication',
  'Teamwork',
  'Attendance',
  'Technical Skills',
  'Leadership',
  'Time Management',
  'Customer Service',
  'Initiative',
];

export interface PIPCreateFormProps {
  preselectedEmployeeId?: string;
  prefillReason?: string;
  triggerSource?: string;
  triggerContext?: Record<string, unknown> | null;
  /** Evaluation window that produced the suggestion — drives the KPI picker. */
  months: MonthKey[];
  onCancel: () => void;
  onCreated: () => void;
}

export function PIPCreateForm({
  preselectedEmployeeId,
  prefillReason,
  triggerSource,
  triggerContext,
  months,
  onCancel,
  onCreated,
}: PIPCreateFormProps) {
  const createPIP = useCreatePIP();
  const [policyError, setPolicyError] = useState<string | null>(null);

  /** Active employees only — a PIP is never raised against a deactivated user. */
  const { data: employees } = useQuery({
    queryKey: ['employees-for-pip'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, employee_code, designation')
        .eq('is_active', true)
        .order('full_name')
        .limit(2000);
      if (error) throw error;
      return data;
    },
  });

  /** POLICY §15.7 — duration bounds are admin-configurable, never hardcoded. */
  const { data: policy } = useQuery({
    queryKey: ['pip-policy-settings'],
    queryFn: getPipPolicySettings,
    staleTime: 5 * 60 * 1000,
  });
  const bounds = policy ?? DEFAULT_PIP_POLICY;

  /** POLICY §15.7 — an employee may not hold overlapping plans. */
  const { data: livePips } = useQuery({
    queryKey: ['pip-live-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('performance_improvement_plans')
        .select('id, employee_id, status')
        .in('status', [...LIVE_PIP_STATUSES]);
      if (error) throw error;
      return data ?? [];
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      employee_id: preselectedEmployeeId || '',
      start_date: new Date(),
      end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      reason: prefillReason || '',
      improvement_areas: [],
      success_criteria: '',
      support_provided: '',
      milestones: [
        {
          milestone_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          description: 'First Check-in',
          expected_outcome: '',
        },
      ],
    },
  });

  // Late-arriving prefill (e.g. router state resolved after mount).
  useEffect(() => {
    if (preselectedEmployeeId) form.setValue('employee_id', preselectedEmployeeId);
    if (prefillReason) form.setValue('reason', prefillReason);
  }, [preselectedEmployeeId, prefillReason]);

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'milestones' });

  const employeeId = form.watch('employee_id');
  const selectedAreas = form.watch('improvement_areas');

  const selectedEmployee = useMemo(
    () => employees?.find(e => e.id === employeeId),
    [employees, employeeId],
  );

  const toggleArea = (area: string) => {
    const current = form.getValues('improvement_areas');
    form.setValue(
      'improvement_areas',
      current.includes(area) ? current.filter(a => a !== area) : [...current, area],
      { shouldValidate: true, shouldDirty: true },
    );
  };

  const onSubmit = async (values: FormValues) => {
    setPolicyError(null);

    const duration = validatePipDuration(values.start_date, values.end_date, {
      minDays: bounds.minDurationDays,
      maxDays: bounds.maxDurationDays,
    });
    if (!duration.valid) {
      setPolicyError(duration.message ?? 'Invalid plan duration.');
      return;
    }

    const cadence = validateMilestoneCadence(
      values.milestones.map(m => m.milestone_date),
      values.start_date,
      values.end_date,
    );
    if (!cadence.valid) {
      setPolicyError(cadence.message ?? 'Invalid checkpoint schedule.');
      return;
    }

    const overlap = (livePips ?? []).find(p => p.employee_id === values.employee_id);
    if (overlap) {
      setPolicyError(
        'This employee already has a live Performance Improvement Plan. Overlapping plans are not permitted (POLICY §15.7).',
      );
      return;
    }

    await createPIP.mutateAsync({
      employee_id: values.employee_id,
      start_date: format(values.start_date, 'yyyy-MM-dd'),
      end_date: format(values.end_date, 'yyyy-MM-dd'),
      reason: values.reason,
      improvement_areas: values.improvement_areas,
      success_criteria: values.success_criteria,
      support_provided: values.support_provided,
      trigger_source: triggerSource ?? 'manual',
      trigger_context: triggerContext ?? null,
      milestones: values.milestones.map(m => ({
        milestone_date: format(m.milestone_date, 'yyyy-MM-dd'),
        description: m.description,
        expected_outcome: m.expected_outcome,
      })),
    });
    form.reset();
    onCreated();
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-24">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* ── Left column: who, when, why ─────────────────────────── */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Employee &amp; period</CardTitle>
                <CardDescription>Who the plan covers and how long it runs.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="employee_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Employee</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Select employee">
                              {selectedEmployee
                                ? `${selectedEmployee.full_name} (${selectedEmployee.employee_code})`
                                : undefined}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-72">
                          {employees?.map(emp => (
                            <SelectItem key={emp.id} value={emp.id}>
                              {emp.full_name} ({emp.employee_code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {preselectedEmployeeId && (
                        <FormDescription>
                          Prefilled from a PIP suggestion. Changing the employee also changes who the
                          recorded trigger evidence applies to.
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="start_date"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Start Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button variant="outline" className={cn('h-10 pl-3 text-left font-normal', !field.value && 'text-muted-foreground')}>
                                {field.value ? format(field.value, 'PPP') : 'Pick a date'}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={field.value} onSelect={field.onChange} />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="end_date"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>End Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button variant="outline" className={cn('h-10 pl-3 text-left font-normal', !field.value && 'text-muted-foreground')}>
                                {field.value ? format(field.value, 'PPP') : 'Pick a date'}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={field.value} onSelect={field.onChange} />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormDescription>
                  Duration must be between {bounds.minDurationDays} and {bounds.maxDurationDays} days
                  (POLICY §15.7).
                </FormDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Reason for PIP</CardTitle>
                <CardDescription>The performance evidence that justifies the plan.</CardDescription>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="sr-only">Reason for PIP</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe the performance concerns that led to this PIP..."
                          className="min-h-24"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Areas for Improvement</CardTitle>
                <CardDescription>
                  Pick general areas and/or the specific KPIs scoring below the PIP threshold in the
                  evaluation window.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="improvement_areas"
                  render={() => (
                    <FormItem>
                      <FormLabel className="text-sm">General areas</FormLabel>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {IMPROVEMENT_AREAS.map(area => (
                          <Badge
                            key={area}
                            variant={selectedAreas.includes(area) ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => toggleArea(area)}
                          >
                            {area}
                          </Badge>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-2">
                  <FormLabel className="text-sm">Low-scoring KPIs</FormLabel>
                  <LowScoringKpiPicker
                    employeeId={employeeId || undefined}
                    months={months}
                    selected={selectedAreas}
                    onToggle={toggleArea}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Right column: outcomes, support, checkpoints ────────── */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Success criteria &amp; support</CardTitle>
                <CardDescription>What "improved" means, and what the organisation provides.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="success_criteria"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Success Criteria</FormLabel>
                      <FormDescription>Define what successful completion looks like</FormDescription>
                      <FormControl>
                        <Textarea
                          placeholder="The employee will have successfully completed the PIP when..."
                          className="min-h-24"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="support_provided"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Support &amp; Resources Provided</FormLabel>
                      <FormDescription>
                        Training, coaching, mentoring or tools the organisation will provide during the
                        plan (POLICY §15.6)
                      </FormDescription>
                      <FormControl>
                        <Textarea
                          placeholder="Weekly coaching with the reporting manager, refresher training on..."
                          className="min-h-24"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">Milestones</CardTitle>
                  <CardDescription>Review checkpoints across the plan (POLICY §15.7).</CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10"
                  onClick={() => append({ milestone_date: new Date(), description: '', expected_outcome: '' })}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add Milestone
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {fields.map((field, index) => (
                  <div key={field.id} className="space-y-3 rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Milestone {index + 1}</span>
                      {fields.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}>
                          <X className="h-4 w-4" />
                          <span className="sr-only">Remove milestone {index + 1}</span>
                        </Button>
                      )}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField
                        control={form.control}
                        name={`milestones.${index}.milestone_date`}
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel className="text-xs">Date</FormLabel>
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button variant="outline" className={cn('h-10 pl-3 text-left font-normal', !field.value && 'text-muted-foreground')}>
                                    {field.value ? format(field.value, 'MMM d, yyyy') : 'Pick date'}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar mode="single" selected={field.value} onSelect={field.onChange} />
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`milestones.${index}.description`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Description</FormLabel>
                            <FormControl>
                              <Input className="h-10" placeholder="e.g., First Check-in" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name={`milestones.${index}.expected_outcome`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Expected Outcome</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="What should be achieved by this milestone..."
                              className="min-h-16"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>

        {policyError && (
          <Alert variant="destructive">
            <AlertDescription>{policyError}</AlertDescription>
          </Alert>
        )}

        {/* Sticky action bar */}
        <div className="sticky bottom-0 z-10 -mx-4 flex justify-end gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-md sm:px-4">
          <Button type="button" variant="outline" className="h-10" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" className="h-10" disabled={createPIP.isPending}>
            {createPIP.isPending ? 'Creating...' : 'Create PIP'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
