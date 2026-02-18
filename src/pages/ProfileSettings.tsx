import { useState, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Camera,
  Mail,
  Phone,
  Lock,
  Eye,
  EyeOff,
  Pencil,
  Check,
  X,
  Loader2,
  User,
} from 'lucide-react';

// ─── Password strength helper ───────────────────────────────────────────────
function getPasswordStrength(password: string): { level: 'weak' | 'medium' | 'strong'; label: string } {
  if (!password) return { level: 'weak', label: '' };
  const hasNum = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const score = [password.length >= 8, hasNum, hasSpecial, hasUpper, hasLower].filter(Boolean).length;
  if (score <= 2) return { level: 'weak', label: 'Weak' };
  if (score <= 3) return { level: 'medium', label: 'Medium' };
  return { level: 'strong', label: 'Strong' };
}

// ─── Inline editable field ──────────────────────────────────────────────────
interface InlineFieldProps {
  label: string;
  icon: React.ElementType;
  value: string;
  placeholder: string;
  isEditing: boolean;
  editValue: string;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onEditValueChange: (v: string) => void;
  isSaving?: boolean;
  type?: string;
  hint?: string;
}

function InlineField({
  label, icon: Icon, value, placeholder, isEditing, editValue,
  onEdit, onCancel, onSave, onEditValueChange, isSaving, type = 'text', hint,
}: InlineFieldProps) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        {isEditing ? (
          <>
            <Input
              type={type}
              value={editValue}
              onChange={e => onEditValueChange(e.target.value)}
              placeholder={placeholder}
              className="h-8 flex-1 text-sm"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
            />
            <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" onClick={onSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={onCancel}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : (
          <>
            <span className="flex-1 text-sm text-foreground truncate">
              {value || <span className="text-muted-foreground italic">{placeholder}</span>}
            </span>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground pl-6">{hint}</p>}
    </div>
  );
}

// ─── Password input with toggle ─────────────────────────────────────────────
function PasswordInput({ value, onChange, placeholder, id }: {
  value: string; onChange: (v: string) => void; placeholder: string; id: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-10"
      />
      <button
        type="button"
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        onClick={() => setShow(s => !s)}
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function ProfileSettings() {
  const { user, profile, fetchProfile: _fetchProfile } = useAuth() as any;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Avatar
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Contact info edit states
  const [editingEmail, setEditingEmail] = useState(false);
  const [editEmail, setEditEmail] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  const [editingMobile, setEditingMobile] = useState(false);
  const [editMobile, setEditMobile] = useState('');
  const [savingMobile, setSavingMobile] = useState(false);

  // Password
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);

  const pwdStrength = getPasswordStrength(newPwd);

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    await supabase.from('profiles').select('*').eq('id', user.id).single();
    queryClient.invalidateQueries({ queryKey: ['profiles'] });
    // Reload auth profile from DB
    window.dispatchEvent(new Event('profile-updated'));
  }, [user, queryClient]);

  // ── Avatar upload ──────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Please select an image under 5MB', variant: 'destructive' });
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file type', description: 'Please select an image file (JPG, PNG, WebP)', variant: 'destructive' });
      return;
    }

    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleAvatarUpload = async () => {
    if (!avatarFile || !user) return;
    setUploadingAvatar(true);
    try {
      const ext = avatarFile.name.split('.').pop() || 'jpg';
      const filePath = `${user.id}/${Date.now()}.${ext}`;

      // Delete old avatar if exists
      if (profile?.avatar_url) {
        const oldPath = profile.avatar_url.split('/avatars/')[1];
        if (oldPath) {
          await supabase.storage.from('avatars').remove([oldPath]);
        }
      }

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, avatarFile, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      if (profileError) throw profileError;

      toast({ title: 'Profile picture updated' });
      setAvatarFile(null);
      refreshProfile();
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const cancelAvatarChange = () => {
    setAvatarPreview(null);
    setAvatarFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Email save ─────────────────────────────────────────────────────────────
  const handleSaveEmail = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(editEmail)) {
      toast({ title: 'Invalid email', description: 'Please enter a valid email address', variant: 'destructive' });
      return;
    }
    setSavingEmail(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('update-user-profile', {
        body: { operation: 'update_email', newEmail: editEmail },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);

      toast({ title: 'Verification email sent', description: res.data?.message || 'Check your new inbox to confirm the change.' });
      setEditingEmail(false);
    } catch (err: any) {
      toast({ title: 'Failed to update email', description: err.message, variant: 'destructive' });
    } finally {
      setSavingEmail(false);
    }
  };

  // ── Mobile save ────────────────────────────────────────────────────────────
  const handleSaveMobile = async () => {
    const mobileRegex = /^\+?[0-9\s\-()\u200B]{7,20}$/;
    if (editMobile && !mobileRegex.test(editMobile)) {
      toast({ title: 'Invalid mobile number', description: 'Please enter a valid mobile number (7-15 digits)', variant: 'destructive' });
      return;
    }
    setSavingMobile(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('update-user-profile', {
        body: { operation: 'update_mobile', mobileNumber: editMobile },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);

      toast({ title: 'Mobile number updated' });
      setEditingMobile(false);
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      refreshProfile();
    } catch (err: any) {
      toast({ title: 'Failed to update mobile number', description: err.message, variant: 'destructive' });
    } finally {
      setSavingMobile(false);
    }
  };

  // ── Password save ──────────────────────────────────────────────────────────
  const handleSavePassword = async () => {
    if (!currentPwd || !newPwd || !confirmPwd) {
      toast({ title: 'All fields required', variant: 'destructive' });
      return;
    }
    if (newPwd.length < 8) {
      toast({ title: 'Password too short', description: 'New password must be at least 8 characters', variant: 'destructive' });
      return;
    }
    if (!/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPwd)) {
      toast({ title: 'Password too simple', description: 'New password must contain at least one number or special character', variant: 'destructive' });
      return;
    }
    if (newPwd !== confirmPwd) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }

    setSavingPwd(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('update-user-profile', {
        body: { operation: 'update_password', currentPassword: currentPwd, newPassword: newPwd },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);

      toast({ title: 'Password updated successfully' });
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    } catch (err: any) {
      toast({ title: 'Failed to update password', description: err.message, variant: 'destructive' });
    } finally {
      setSavingPwd(false);
    }
  };

  const displayAvatar = avatarPreview || profile?.avatar_url || undefined;
  const currentMobile = (profile as any)?.mobile_number || '';

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-4 sm:p-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <User className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Profile Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your personal information and security</p>
        </div>
      </div>

      {/* ── Profile Picture ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile Picture</CardTitle>
          <CardDescription>Click the avatar to upload a new photo</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <div className="relative group cursor-pointer" onClick={() => !avatarFile && fileInputRef.current?.click()}>
            <Avatar className="h-24 w-24 ring-2 ring-border ring-offset-2">
              <AvatarImage src={displayAvatar} />
              <AvatarFallback className="bg-primary/10 text-primary text-2xl font-medium">
                {getInitials(profile?.full_name)}
              </AvatarFallback>
            </Avatar>
            {!avatarFile && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="h-6 w-6 text-white" />
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <p className="text-xs text-muted-foreground">Click to upload · JPG, PNG, WebP · Max 5MB</p>

          {avatarFile && (
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAvatarUpload} disabled={uploadingAvatar}>
                {uploadingAvatar ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Uploading…</> : <><Check className="h-3.5 w-3.5 mr-1" />Save Photo</>}
              </Button>
              <Button size="sm" variant="outline" onClick={cancelAvatarChange}>
                <X className="h-3.5 w-3.5 mr-1" />Cancel
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Contact Information ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact Information</CardTitle>
          <CardDescription>Update your email and mobile number</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <InlineField
            label="Email Address"
            icon={Mail}
            value={user?.email || ''}
            placeholder="your@email.com"
            isEditing={editingEmail}
            editValue={editEmail}
            onEdit={() => { setEditEmail(user?.email || ''); setEditingEmail(true); }}
            onCancel={() => setEditingEmail(false)}
            onSave={handleSaveEmail}
            onEditValueChange={setEditEmail}
            isSaving={savingEmail}
            type="email"
            hint={editingEmail ? 'A verification link will be sent to your new email address.' : undefined}
          />
          <Separator />
          <InlineField
            label="Mobile Number"
            icon={Phone}
            value={currentMobile}
            placeholder="+91 98765 43210"
            isEditing={editingMobile}
            editValue={editMobile}
            onEdit={() => { setEditMobile(currentMobile); setEditingMobile(true); }}
            onCancel={() => setEditingMobile(false)}
            onSave={handleSaveMobile}
            onEditValueChange={setEditMobile}
            isSaving={savingMobile}
            type="tel"
          />
        </CardContent>
      </Card>

      {/* ── Change Password ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change Password</CardTitle>
          <CardDescription>Your current password is required to set a new one</CardDescription>
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
                    <div
                      key={level}
                      className={`h-1.5 flex-1 rounded-full transition-colors ${
                        i <= (['weak', 'medium', 'strong'].indexOf(pwdStrength.level))
                          ? pwdStrength.level === 'strong' ? 'bg-green-500'
                            : pwdStrength.level === 'medium' ? 'bg-yellow-500'
                            : 'bg-destructive'
                          : 'bg-muted'
                      }`}
                    />
                  ))}
                </div>
                <span className={`text-xs font-medium ${
                  pwdStrength.level === 'strong' ? 'text-green-600'
                  : pwdStrength.level === 'medium' ? 'text-yellow-600'
                  : 'text-destructive'
                }`}>{pwdStrength.label}</span>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-pwd">Confirm New Password</Label>
            <PasswordInput id="confirm-pwd" value={confirmPwd} onChange={setConfirmPwd} placeholder="Re-enter new password" />
            {confirmPwd && newPwd !== confirmPwd && (
              <p className="text-xs text-destructive">Passwords do not match</p>
            )}
          </div>
          <Button
            className="w-full"
            onClick={handleSavePassword}
            disabled={savingPwd || !currentPwd || !newPwd || !confirmPwd}
          >
            {savingPwd ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Updating…</> : <><Lock className="h-4 w-4 mr-2" />Update Password</>}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
