import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

interface CompetencyAssessmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string;
  reviewPeriod: string;
  reviewYear: number;
  existing?: {
    id: string;
    skill_name: string;
    category: string | null;
    required_level: number | null;
    current_level: number | null;
    remarks: string | null;
  } | null;
  onSaved: () => void;
}

const CATEGORIES = ['Technical', 'Behavioral', 'Leadership', 'Functional', 'Safety'];

export default function CompetencyAssessmentDialog({
  open, onOpenChange, employeeId, employeeName, reviewPeriod, reviewYear, existing, onSaved
}: CompetencyAssessmentDialogProps) {
  const { user } = useAuth();
  const [skillName, setSkillName] = useState('');
  const [category, setCategory] = useState('Technical');
  const [requiredLevel, setRequiredLevel] = useState(3);
  const [currentLevel, setCurrentLevel] = useState(1);
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing) {
      setSkillName(existing.skill_name);
      setCategory(existing.category || 'Technical');
      setRequiredLevel(existing.required_level || 3);
      setCurrentLevel(existing.current_level || 1);
      setRemarks(existing.remarks || '');
    } else {
      setSkillName('');
      setCategory('Technical');
      setRequiredLevel(3);
      setCurrentLevel(1);
      setRemarks('');
    }
  }, [existing, open]);

  const handleSave = async () => {
    if (!skillName.trim()) {
      toast({ title: 'Skill name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const data = {
        employee_id: employeeId,
        skill_name: skillName.trim(),
        category,
        required_level: requiredLevel,
        current_level: currentLevel,
        assessed_by: user?.id || null,
        assessed_at: new Date().toISOString(),
        review_period: reviewPeriod,
        review_year: reviewYear,
        remarks: remarks || null,
        updated_at: new Date().toISOString(),
      };

      if (existing?.id) {
        const { error } = await supabase.from('skill_competencies').update(data).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('skill_competencies').insert(data);
        if (error) throw error;
      }
      toast({ title: 'Competency saved' });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit' : 'Add'} Competency — {employeeName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Skill Name</Label>
            <Input value={skillName} onChange={e => setSkillName(e.target.value)} placeholder="e.g. Machine Operation" />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Required Level ({requiredLevel}/5)</Label>
            <Slider min={1} max={5} step={1} value={[requiredLevel]} onValueChange={v => setRequiredLevel(v[0])} className="mt-2" />
          </div>
          <div>
            <Label>Current Level ({currentLevel}/5)</Label>
            <Slider min={1} max={5} step={1} value={[currentLevel]} onValueChange={v => setCurrentLevel(v[0])} className="mt-2" />
          </div>
          <div>
            <Label>Remarks</Label>
            <Textarea value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional notes..." rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
