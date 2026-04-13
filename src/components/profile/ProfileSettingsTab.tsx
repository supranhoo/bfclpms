import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeAdminEdgeFunction } from '@/lib/adminEdgeFunction';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Mail, Phone, Lock, Eye, EyeOff, Pencil, Check, X, Loader2,
} from 'lucide-react';

// ─── Password strength ─────────────────────────────────────────────────────
function getPasswordStrength(password: string) {
  if (!password) return { level: 'weak' as const, label: '' };
  const score = [password.length >= 8, /[0-9]/.test(password), /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password), /[A-Z]/.test(password), /[a-z]/.test(password)].filter(Boolean).length;
  if (score <= 2) return { level: 'weak' as const, label: 'Weak' };
  if (score <= 3) return { level: 'medium' as const, label: 'Medium' };
  return { level: 'strong' as const, label: 'Strong' };
}

// ─── Inline Field ───────────────────────────────────────────────────────────
function InlineField({ label, icon: Icon, value, placeholder, isEditing, editValue, onEdit, onCancel, onSave, onEditValueChange, isSaving, type = 'text', hint }: {
  label: string; icon: React.ElementType; value: string; placeholder: string;
  isEditing: boolean; editValue: string; onEdit: () => void; onCancel: () => void;
  onSave: () => void; onEditValueChange: (v: string) => void; isSaving?: boolean;
  type?: string; hint?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        {isEditing ? (
          <>
            <Input type={type} value={editValue} onChange={e => onEditValueChange(e.target.value)} placeholder={placeholder} className="h-8 flex-1 text-sm" autoFocus onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }} />
            <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" onClick={onSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={onCancel}><X className="h-3.5 w-3.5" /></Button>
          </>
        ) : (
          <>
            <span className="flex-1 text-sm text-foreground truncate">{value || <span className="text-muted-foreground italic">{placeholder}</span>}</span>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
          </>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground pl-6">{hint}</p>}
    </div>
  );
}

// ─── Password Input ─────────────────────────────────────────────────────────
function PasswordInput({ value, onChange, placeholder, id }: { value: string; onChange: (v: string) => void; placeholder: string; id: string; }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={id} type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="pr-10" />
      <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShow(s => !s)} tabIndex={-1}>
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

// ─── Main Settings Tab ──────────────────────────────────────────────────────
export default function ProfileSettingsTab({ user, profile, fetchProfile }: { user: any; profile: any; fetchProfile: (id: string) => Promise<boolean>; }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editingEmail, setEditingEmail] = useState(false);
  const [editEmail, setEditEmail] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [editingMobile, setEditingMobile] = useState(false);
  const [editMobile, setEditMobile] = useState('');
  const [savingMobile, setSavingMobile] = useState(false);
  const [localMobile, setLocalMobile] = useState<string | null>(null);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);

  const pwdStrength = getPasswordStrength(newPwd);
  const currentMobile = localMobile ?? profile?.mobile_number ?? '';

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    await fetchProfile(user.id);
    queryClient.invalidateQueries({ queryKey: ['profiles'] });
  }, [user, queryClient, fetchProfile]);

  const handleSaveEmail = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editEmail)) {
      toast({ title: 'Invalid email', variant: 'destructive' }); return;
    }
    setSavingEmail(true);
    try {
      const res = await invokeAdminEdgeFunction<any>('update-user-profile', { operation: 'update_email', newEmail: editEmail });
      if (res?.error) throw new Error(res.error);
      toast({ title: 'Email updated' });
      setEditingEmail(false);
      await supabase.auth.refreshSession();
      await refreshProfile();
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    } finally { setSavingEmail(false); }
  };

  const handleSaveMobile = async () => {
    if (editMobile && !/^\+?[0-9\s\-()\u200B]{7,20}$/.test(editMobile)) {
      toast({ title: 'Invalid mobile', variant: 'destructive' }); return;
    }
    setSavingMobile(true);
    try {
      const res = await invokeAdminEdgeFunction<any>('update-user-profile', { operation: 'update_mobile', mobileNumber: editMobile });
      if (res?.error) throw new Error(res.error);
      setLocalMobile(editMobile || null);
      setEditingMobile(false);
      toast({ title: 'Mobile updated' });
      await refreshProfile();
      setLocalMobile(null);
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    } finally { setSavingMobile(false); }
  };

  const handleSavePassword = async () => {
    if (!currentPwd || !newPwd || !confirmPwd) { toast({ title: 'All fields required', variant: 'destructive' }); return; }
    if (newPwd.length < 8) { toast({ title: 'Min 8 characters', variant: 'destructive' }); return; }
    if (!/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPwd)) { toast({ title: 'Need number or special char', variant: 'destructive' }); return; }
    if (newPwd !== confirmPwd) { toast({ title: 'Passwords mismatch', variant: 'destructive' }); return; }
    setSavingPwd(true);
    try {
      const res = await invokeAdminEdgeFunction<any>('update-user-profile', { operation: 'update_password', currentPassword: currentPwd, newPassword: newPwd });
      if (res?.error) throw new Error(res.error);
      toast({ title: 'Password updated' });
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    } finally { setSavingPwd(false); }
  };

  return (
    <div className="space-y-6">
      {/* Contact */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact Information</CardTitle>
          <CardDescription>Update your email and mobile number</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <InlineField label="Email Address" icon={Mail} value={user?.email || ''} placeholder="your@email.com" isEditing={editingEmail} editValue={editEmail} onEdit={() => { setEditEmail(user?.email || ''); setEditingEmail(true); }} onCancel={() => setEditingEmail(false)} onSave={handleSaveEmail} onEditValueChange={setEditEmail} isSaving={savingEmail} type="email" hint={editingEmail ? 'A confirmation will be sent to your new address.' : undefined} />
          <Separator />
          <InlineField label="Mobile Number" icon={Phone} value={currentMobile} placeholder="+91 98765 43210" isEditing={editingMobile} editValue={editMobile} onEdit={() => { setEditMobile(currentMobile); setEditingMobile(true); }} onCancel={() => setEditingMobile(false)} onSave={handleSaveMobile} onEditValueChange={setEditMobile} isSaving={savingMobile} type="tel" />
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change Password</CardTitle>
          <CardDescription>Your current password is required</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-pwd">Current Password</Label>
            <PasswordInput id="current-pwd" value={currentPwd} onChange={setCurrentPwd} placeholder="Enter current password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-pwd">New Password</Label>
            <PasswordInput id="new-pwd" value={newPwd} onChange={setNewPwd} placeholder="Minimum 8 characters" />
            {newPwd && (
              <div className="flex items-center gap-2 mt-1">
                <div className="flex gap-1 flex-1">
                  {(['weak', 'medium', 'strong'] as const).map((level, i) => (
                    <div key={level} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= ['weak', 'medium', 'strong'].indexOf(pwdStrength.level) ? pwdStrength.level === 'strong' ? 'bg-green-500' : pwdStrength.level === 'medium' ? 'bg-yellow-500' : 'bg-destructive' : 'bg-muted'}`} />
                  ))}
                </div>
                <span className={`text-xs font-medium ${pwdStrength.level === 'strong' ? 'text-green-600' : pwdStrength.level === 'medium' ? 'text-yellow-600' : 'text-destructive'}`}>{pwdStrength.label}</span>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-pwd">Confirm New Password</Label>
            <PasswordInput id="confirm-pwd" value={confirmPwd} onChange={setConfirmPwd} placeholder="Re-enter new password" />
            {confirmPwd && newPwd !== confirmPwd && <p className="text-xs text-destructive">Passwords do not match</p>}
          </div>
          <Button className="w-full" onClick={handleSavePassword} disabled={savingPwd || !currentPwd || !newPwd || !confirmPwd}>
            {savingPwd ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Updating…</> : <><Lock className="h-4 w-4 mr-2" />Update Password</>}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
