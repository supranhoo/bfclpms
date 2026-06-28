import { useRef, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Camera, Check, X, Loader2, Building2, Hash, Award, UserCheck, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';

interface ProfileHeroProps {
  user: any;
  profile: any;
  departmentName: string | null;
  divisionName: string | null;
  managerName: string | null;
  fetchProfile: (id: string) => Promise<boolean>;
}

export default function ProfileHero({ user, profile, departmentName, divisionName, managerName, fetchProfile }: ProfileHeroProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Max 5MB', variant: 'destructive' });
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Select an image file', variant: 'destructive' });
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleUpload = async () => {
    if (!avatarFile || !user) return;
    setUploading(true);
    try {
      const ext = avatarFile.name.split('.').pop() || 'jpg';
      const filePath = `${user.id}/${Date.now()}.${ext}`;
      if (profile?.avatar_url) {
        const oldPath = profile.avatar_url.split('/avatars/')[1];
        if (oldPath) await supabase.storage.from('avatars').remove([oldPath]);
      }
      const { error: upErr } = await supabase.storage.from('avatars').upload(filePath, avatarFile, { upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const { error: profErr } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
      if (profErr) throw profErr;
      toast({ title: 'Profile picture updated' });
      setAvatarFile(null);
      setAvatarPreview(null);
      await fetchProfile(user.id);
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const cancelUpload = () => {
    setAvatarPreview(null);
    setAvatarFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const displayAvatar = avatarPreview || profile?.avatar_url || undefined;

  return (
    <div className="rounded-xl border bg-card p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
        {/* Avatar */}
        <div className="relative group cursor-pointer shrink-0" onClick={() => !avatarFile && fileInputRef.current?.click()}>
          <Avatar className="h-28 w-28 ring-4 ring-primary/20 ring-offset-2 ring-offset-card">
            <AvatarImage src={displayAvatar} />
            <AvatarFallback className="bg-primary/10 text-primary text-3xl font-semibold">
              {getInitials(profile?.full_name)}
            </AvatarFallback>
          </Avatar>
          {!avatarFile && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className="h-6 w-6 text-white" />
            </div>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

        {/* Info */}
        <div className="flex-1 text-center sm:text-left space-y-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{profile?.full_name || 'Employee'}</h1>
            <p className="text-base text-muted-foreground">{profile?.designation || 'No designation'}</p>
          </div>

          <div className="flex flex-wrap justify-center sm:justify-start gap-2">
            {profile?.employee_code && (
              <Badge variant="outline" className="gap-1 text-xs">
                <Hash className="h-3 w-3" /> {profile.employee_code}
              </Badge>
            )}
            {departmentName && (
              <Badge variant="outline" className="gap-1 text-xs">
                <Building2 className="h-3 w-3" /> {departmentName}
              </Badge>
            )}
            {profile?.pms_grade && (
              <Badge variant="secondary" className="gap-1 text-xs">
                <Award className="h-3 w-3" /> {profile.pms_grade}
              </Badge>
            )}
            {divisionName && (
              <Badge variant="outline" className="gap-1 text-xs">
                {divisionName}
              </Badge>
            )}
            {managerName && (
              <Badge variant="outline" className="gap-1 text-xs">
                <UserCheck className="h-3 w-3" /> {managerName}
              </Badge>
            )}
            {(profile as any)?.doj && (
              <Badge variant="outline" className="gap-1 text-xs">
                <Calendar className="h-3 w-3" /> Joined {format(new Date((profile as any).doj), 'MMM yyyy')}
              </Badge>
            )}
          </div>

          {avatarFile && (
            <div className="flex justify-center sm:justify-start gap-2 pt-1">
              <Button size="sm" onClick={handleUpload} disabled={uploading}>
                {uploading ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Uploading…</> : <><Check className="h-3.5 w-3.5 mr-1" />Save Photo</>}
              </Button>
              <Button size="sm" variant="outline" onClick={cancelUpload}>
                <X className="h-3.5 w-3.5 mr-1" />Cancel
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
