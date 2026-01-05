import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useKraCategories, useProfiles } from '@/hooks/useOrganization';
import { useAdminUpdateKpi, ReviewStatus, KPI } from '@/hooks/useKpis';
import { Loader2 } from 'lucide-react';

interface AdminKpiEditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  kpi: KPI | null;
}

const STATUS_OPTIONS: { value: ReviewStatus; label: string }[] = [
  { value: 'kra_set', label: 'KRA Set' },
  { value: 'self_review', label: 'Self Review' },
  { value: 'manager_check', label: 'Manager Check' },
  { value: 'audit', label: 'Audit' },
  { value: 'management_review', label: 'Management Review' },
  { value: 'approved', label: 'Approved' },
];

const FREQUENCY_OPTIONS = ['Monthly', 'Quarterly', 'Half-Yearly', 'Annually'];
const CRITERIA_OPTIONS = ['Higher is Better', 'Lower is Better', 'Equal to Target'];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function AdminKpiEditDialog({ isOpen, onClose, kpi }: AdminKpiEditDialogProps) {
  const { data: categories } = useKraCategories();
  const { data: profiles } = useProfiles();
  const updateKpi = useAdminUpdateKpi();

  const [formData, setFormData] = useState({
    employee_id: '',
    category_id: '',
    kra_name: '',
    kpi_name: '',
    target_value: '',
    uom: '',
    weightage: '',
    frequency: '',
    criteria: '',
    source_of_data: '',
    review_period: '',
    review_year: '',
    status: '' as ReviewStatus,
    r5: '',
    r4: '',
    r3: '',
    r2: '',
    r1: '',
    r0: '',
  });
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (kpi) {
      setFormData({
        employee_id: kpi.employee_id || '',
        category_id: kpi.category_id || '',
        kra_name: kpi.kra_name || '',
        kpi_name: kpi.kpi_name || '',
        target_value: kpi.target_value?.toString() || '',
        uom: kpi.uom || '',
        weightage: kpi.weightage?.toString() || '',
        frequency: kpi.frequency || '',
        criteria: kpi.criteria || '',
        source_of_data: kpi.source_of_data || '',
        review_period: kpi.review_period || '',
        review_year: kpi.review_year?.toString() || '',
        status: kpi.status || 'kra_set',
        r5: kpi.r5 || '',
        r4: kpi.r4 || '',
        r3: kpi.r3 || '',
        r2: kpi.r2 || '',
        r1: kpi.r1 || '',
        r0: kpi.r0 || '',
      });
      setReason('');
    }
  }, [kpi]);

  const handleSubmit = async () => {
    if (!kpi) return;

    await updateKpi.mutateAsync({
      id: kpi.id,
      employee_id: formData.employee_id,
      category_id: formData.category_id,
      kra_name: formData.kra_name,
      kpi_name: formData.kpi_name,
      target_value: formData.target_value ? parseFloat(formData.target_value) : null,
      uom: formData.uom || null,
      weightage: formData.weightage ? parseFloat(formData.weightage) : null,
      frequency: formData.frequency || null,
      criteria: formData.criteria || null,
      source_of_data: formData.source_of_data || null,
      review_period: formData.review_period || null,
      review_year: formData.review_year ? parseInt(formData.review_year) : null,
      status: formData.status,
      r5: formData.r5 || null,
      r4: formData.r4 || null,
      r3: formData.r3 || null,
      r2: formData.r2 || null,
      r1: formData.r1 || null,
      r0: formData.r0 || null,
      reason,
    });

    onClose();
  };

  if (!kpi) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Admin KPI Editor</DialogTitle>
          <DialogDescription>
            Edit all KPI fields. Changes will be logged for audit purposes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Employee & Category */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Employee</Label>
              <Select
                value={formData.employee_id}
                onValueChange={(value) => setFormData(prev => ({ ...prev, employee_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {profiles?.map(profile => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.full_name || profile.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={formData.category_id}
                onValueChange={(value) => setFormData(prev => ({ ...prev, category_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories?.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* KRA & KPI Names */}
          <div className="space-y-2">
            <Label>KRA Name</Label>
            <Input
              value={formData.kra_name}
              onChange={(e) => setFormData(prev => ({ ...prev, kra_name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>KPI Name</Label>
            <Textarea
              value={formData.kpi_name}
              onChange={(e) => setFormData(prev => ({ ...prev, kpi_name: e.target.value }))}
              rows={2}
            />
          </div>

          {/* Target, UOM, Weightage, Frequency, Criteria */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Target Value</Label>
              <Input
                type="number"
                value={formData.target_value}
                onChange={(e) => setFormData(prev => ({ ...prev, target_value: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>UOM</Label>
              <Input
                value={formData.uom}
                onChange={(e) => setFormData(prev => ({ ...prev, uom: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Weightage (%)</Label>
              <Input
                type="number"
                value={formData.weightage}
                onChange={(e) => setFormData(prev => ({ ...prev, weightage: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select
                value={formData.frequency}
                onValueChange={(value) => setFormData(prev => ({ ...prev, frequency: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map(opt => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Criteria</Label>
              <Select
                value={formData.criteria}
                onValueChange={(value) => setFormData(prev => ({ ...prev, criteria: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select criteria" />
                </SelectTrigger>
                <SelectContent>
                  {CRITERIA_OPTIONS.map(opt => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Source of Data */}
          <div className="space-y-2">
            <Label>Source of Data</Label>
            <Input
              value={formData.source_of_data}
              onChange={(e) => setFormData(prev => ({ ...prev, source_of_data: e.target.value }))}
            />
          </div>

          {/* Rating Thresholds */}
          <div className="space-y-2">
            <Label>Rating Thresholds</Label>
            <div className="grid grid-cols-6 gap-2">
              {(['r5', 'r4', 'r3', 'r2', 'r1', 'r0'] as const).map((field) => (
                <div key={field} className="space-y-1">
                  <Label className="text-xs uppercase">{field}</Label>
                  <Input
                    value={formData[field]}
                    onChange={(e) => setFormData(prev => ({ ...prev, [field]: e.target.value }))}
                    placeholder={field.toUpperCase()}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Review Period & Status */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Review Period</Label>
              <Select
                value={formData.review_period}
                onValueChange={(value) => setFormData(prev => ({ ...prev, review_period: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map(month => (
                    <SelectItem key={month} value={month}>{month}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Review Year</Label>
              <Input
                type="number"
                value={formData.review_year}
                onChange={(e) => setFormData(prev => ({ ...prev, review_year: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData(prev => ({ ...prev, status: value as ReviewStatus }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Reason for Change */}
          <div className="space-y-2">
            <Label>Reason for Change (for audit log)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Optional: Explain why this change is being made..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={updateKpi.isPending}>
            {updateKpi.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}