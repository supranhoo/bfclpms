import { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import {
  validatePipDuration,
  validateMilestoneCadence,
  LIVE_PIP_STATUSES,
} from '@/lib/pip/pipTriggerRules';
import { Alert, AlertDescription } from '@/components/ui/alert';

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

interface PIPCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedEmployeeId?: string;
  /** ADR-207 — policy-worded evidence text carried from a suggestion. */
  prefillReason?: string;
  triggerSource?: string;
  triggerContext?: Record<string, unknown> | null;
}

const IMPROVEMENT_AREAS = [
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

export function PIPCreateDialog({
  open,
  onOpenChange,
  preselectedEmployeeId,
  prefillReason,
  triggerSource,
  triggerContext,
}: PIPCreateDialogProps) {
  const createPIP = useCreatePIP();
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [policyError, setPolicyError] = useState<string | null>(null);

  /** Active employees only — a PIP is never raised against a deactivated user. */
  const { data: employees } = useQuery({
    queryKey: ['employees-for-pip'],
    enabled: open,
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
    enabled: open,
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
      end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      reason: prefillReason || '',
      improvement_areas: [],
      success_criteria: '',
      support_provided: '',
      milestones: [
        {
          milestone_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 2 weeks
          description: 'First Check-in',
          expected_outcome: '',
        },
      ],
    },
  });

  // Suggestion-driven opens carry the employee and evidence text.
  useEffect(() => {
    if (!open) return;
    setPolicyError(null);
    if (preselectedEmployeeId) form.setValue('employee_id', preselectedEmployeeId);
    if (prefillReason) form.setValue('reason', prefillReason);
  }, [open, preselectedEmployeeId, prefillReason]);

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'milestones',
  });

  const toggleArea = (area: string) => {
    const current = form.getValues('improvement_areas');
    if (current.includes(area)) {
      form.setValue('improvement_areas', current.filter(a => a !== area));
    } else {
      form.setValue('improvement_areas', [...current, area]);
    }
    setSelectedAreas(form.getValues('improvement_areas'));
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
    setSelectedAreas([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Performance Improvement Plan</DialogTitle>
          <DialogDescription>
            Set up a structured improvement plan with milestones and success criteria.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Employee Selection */}
            <FormField
              control={form.control}
              name="employee_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Employee</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select employee" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {employees?.map(emp => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.full_name} ({emp.employee_code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Start Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant="outline" className={cn('pl-3 text-left font-normal', !field.value && 'text-muted-foreground')}>
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
                          <Button variant="outline" className={cn('pl-3 text-left font-normal', !field.value && 'text-muted-foreground')}>
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

            {/* Reason */}
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason for PIP</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Describe the performance concerns that led to this PIP..." 
                      className="min-h-20"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Improvement Areas */}
            <FormField
              control={form.control}
              name="improvement_areas"
              render={() => (
                <FormItem>
                  <FormLabel>Areas for Improvement</FormLabel>
                  <FormDescription>Select the areas that need improvement</FormDescription>
                  <div className="flex flex-wrap gap-2 mt-2">
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

            {/* Success Criteria */}
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
                      className="min-h-20"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Support & resources — POLICY §15.6 */}
            <FormField
              control={form.control}
              name="support_provided"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Support &amp; Resources Provided</FormLabel>
                  <FormDescription>
                    Training, coaching, mentoring or tools the organisation will provide during the plan (POLICY §15.6)
                  </FormDescription>
                  <FormControl>
                    <Textarea
                      placeholder="Weekly coaching with the reporting manager, refresher training on..."
                      className="min-h-20"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {policyError && (
              <Alert variant="destructive">
                <AlertDescription>{policyError}</AlertDescription>
              </Alert>
            )}

            {/* Milestones */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <FormLabel>Milestones</FormLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({
                    milestone_date: new Date(),
                    description: '',
                    expected_outcome: '',
                  })}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Milestone
                </Button>
              </div>

              {fields.map((field, index) => (
                <div key={field.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">Milestone {index + 1}</span>
                    {fields.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name={`milestones.${index}.milestone_date`}
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel className="text-xs">Date</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button variant="outline" size="sm" className={cn('pl-3 text-left font-normal', !field.value && 'text-muted-foreground')}>
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
                            <Input placeholder="e.g., First Check-in" {...field} />
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
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createPIP.isPending}>
                {createPIP.isPending ? 'Creating...' : 'Create PIP'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
