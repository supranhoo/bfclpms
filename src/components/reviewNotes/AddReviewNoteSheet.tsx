import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateReviewNote } from '@/hooks/useReviewNotes';
import {
  REVIEW_NOTE_CATEGORY_LABELS,
  REVIEW_NOTE_PRIORITY_LABELS,
  nextMonthFirstDay,
  type ReviewNoteCategory,
  type ReviewNotePriority,
} from '@/services/reviewNotes/reviewNotesService';
import { EmployeePickerCombobox, type EmployeeOption } from './EmployeePickerCombobox';
import { MonthPicker } from './MonthPicker';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-selected subject (e.g. when opened from an inline scorecard trigger). When omitted, the sheet shows an employee picker. */
  subjectEmployeeId?: string;
  subjectName?: string;
  kpiId?: string | null;
  kpiName?: string | null;
  periodId?: string | null;
  defaultCategory?: ReviewNoteCategory;
}

export function AddReviewNoteSheet({
  open,
  onOpenChange,
  subjectEmployeeId,
  subjectName,
  kpiId,
  kpiName,
  periodId,
  defaultCategory = 'kpi_change',
}: Props) {
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [category, setCategory] = useState<ReviewNoteCategory>(defaultCategory);
  const [priority, setPriority] = useState<ReviewNotePriority>('medium');
  const [pickedEmployeeId, setPickedEmployeeId] = useState<string | null>(null);
  const [pickedEmployee, setPickedEmployee] = useState<EmployeeOption | null>(null);
  const [applicableFrom, setApplicableFrom] = useState<string | null>(null);

  const showEmployeePicker = !subjectEmployeeId;
  const effectiveSubjectId = subjectEmployeeId ?? pickedEmployeeId;

  useEffect(() => {
    if (open) {
      setTitle('');
      setDetails('');
      setCategory(defaultCategory);
      setPriority('medium');
      setPickedEmployeeId(null);
      setPickedEmployee(null);
      // Default Apply-From to next month so HR rarely has to change it.
      setApplicableFrom(nextMonthFirstDay());
    }
  }, [open, defaultCategory]);

  const create = useCreateReviewNote();

  const handleSave = async () => {
    if (!title.trim() || !effectiveSubjectId) return;
    await create.mutateAsync({
      subject_employee_id: effectiveSubjectId,
      kpi_id: kpiId ?? null,
      period_id: periodId ?? null,
      category,
      title: title.trim(),
      details: details.trim() || null,
      priority,
      applicable_from: applicableFrom,
    });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add Review Note</SheetTitle>
          <SheetDescription>
            Capture an input now — change it in the next KRA cycle.
            {subjectName && !showEmployeePicker && (
              <span className="block mt-1 text-xs">For: <strong>{subjectName}</strong></span>
            )}
            {kpiName && <span className="block text-xs">KPI: <strong>{kpiName}</strong></span>}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          {showEmployeePicker && (
            <div className="space-y-2">
              <Label htmlFor="rn-employee">Employee <span className="text-destructive">*</span></Label>
              <EmployeePickerCombobox
                value={pickedEmployeeId}
                onChange={(id, emp) => { setPickedEmployeeId(id); setPickedEmployee(emp); }}
              />
              {pickedEmployee && (
                <p className="text-xs text-muted-foreground">
                  {pickedEmployee.full_name}
                  {pickedEmployee.employee_code && ` · Code: ${pickedEmployee.employee_code}`}
                  {pickedEmployee.department_name && ` · ${pickedEmployee.department_name}`}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="rn-category">Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as ReviewNoteCategory)}>
              <SelectTrigger id="rn-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(REVIEW_NOTE_CATEGORY_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rn-title">Title <span className="text-destructive">*</span></Label>
            <Input
              id="rn-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="e.g. Reduce production target by 10% next cycle"
            />
            <p className="text-xs text-muted-foreground">{title.length}/120</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rn-details">Details</Label>
            <Textarea
              id="rn-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={5}
              placeholder="Context, reasoning, agreed action…"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rn-priority">Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as ReviewNotePriority)}>
              <SelectTrigger id="rn-priority"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(REVIEW_NOTE_PRIORITY_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Apply From <span className="text-muted-foreground font-normal">(cycle month)</span></Label>
            <MonthPicker value={applicableFrom} onChange={setApplicableFrom} placeholder="No specific month" />
            <p className="text-xs text-muted-foreground">
              Leave blank if there's no specific target cycle. Defaults to next month.
            </p>
          </div>
        </div>

        <SheetFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancel</Button>
          <Button onClick={handleSave} disabled={!title.trim() || !effectiveSubjectId || create.isPending}>
            {create.isPending ? 'Saving…' : 'Save Note'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}