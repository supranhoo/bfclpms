import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface JdFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  designation: string;
  existing?: {
    id: string;
    role_purpose: string | null;
    key_responsibilities: string[];
    required_skills: string[];
    qualifications: string | null;
  } | null;
  onSaved: () => void;
}

export default function JdFormDialog({ open, onOpenChange, designation, existing, onSaved }: JdFormDialogProps) {
  const [rolePurpose, setRolePurpose] = useState('');
  const [responsibilities, setResponsibilities] = useState<string[]>([]);
  const [newResp, setNewResp] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [newSkill, setNewSkill] = useState('');
  const [qualifications, setQualifications] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing) {
      setRolePurpose(existing.role_purpose || '');
      setResponsibilities(existing.key_responsibilities || []);
      setSkills(existing.required_skills || []);
      setQualifications(existing.qualifications || '');
    } else {
      setRolePurpose('');
      setResponsibilities([]);
      setSkills([]);
      setQualifications('');
    }
  }, [existing, open]);

  const addResponsibility = () => {
    const trimmed = newResp.trim();
    if (trimmed && !responsibilities.includes(trimmed)) {
      setResponsibilities(prev => [...prev, trimmed]);
      setNewResp('');
    }
  };

  const addSkill = () => {
    const trimmed = newSkill.trim();
    if (trimmed && !skills.includes(trimmed)) {
      setSkills(prev => [...prev, trimmed]);
      setNewSkill('');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = {
        designation,
        role_purpose: rolePurpose || null,
        key_responsibilities: responsibilities,
        required_skills: skills,
        qualifications: qualifications || null,
        updated_at: new Date().toISOString(),
      };

      if (existing?.id) {
        const { error } = await supabase
          .from('employee_job_descriptions')
          .update(data)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('employee_job_descriptions')
          .insert(data);
        if (error) throw error;
      }
      toast({ title: 'Job Description saved successfully' });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Error saving JD', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit' : 'Create'} Job Description — {designation}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Role Purpose</Label>
            <Textarea value={rolePurpose} onChange={e => setRolePurpose(e.target.value)} placeholder="Describe the purpose of this role..." rows={3} />
          </div>

          <div>
            <Label>Key Responsibilities</Label>
            <div className="flex gap-2 mt-1">
              <Input value={newResp} onChange={e => setNewResp(e.target.value)} placeholder="Add responsibility..." onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addResponsibility())} />
              <Button type="button" size="sm" variant="outline" onClick={addResponsibility}><Plus className="h-4 w-4" /></Button>
            </div>
            <ul className="mt-2 space-y-1">
              {responsibilities.map((r, i) => (
                <li key={i} className="flex items-center gap-2 text-sm bg-muted/50 rounded px-2 py-1">
                  <span className="flex-1">{r}</span>
                  <Button type="button" variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setResponsibilities(prev => prev.filter((_, j) => j !== i))}>
                    <X className="h-3 w-3" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <Label>Required Skills</Label>
            <div className="flex gap-2 mt-1">
              <Input value={newSkill} onChange={e => setNewSkill(e.target.value)} placeholder="Add skill..." onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSkill())} />
              <Button type="button" size="sm" variant="outline" onClick={addSkill}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {skills.map((s, i) => (
                <Badge key={i} variant="secondary" className="gap-1">
                  {s}
                  <button onClick={() => setSkills(prev => prev.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <Label>Qualifications</Label>
            <Textarea value={qualifications} onChange={e => setQualifications(e.target.value)} placeholder="Required qualifications..." rows={2} />
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
