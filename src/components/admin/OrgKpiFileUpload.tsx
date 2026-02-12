import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileText, X, Loader2, ExternalLink } from 'lucide-react';
import { useUploadLimits } from '@/hooks/useUploadLimits';

interface OrgKpiFileUploadProps {
  existingUrl: string | null;
  onUploadComplete: (url: string | null) => void;
  disabled?: boolean;
}

export function OrgKpiFileUpload({ existingUrl, onUploadComplete, disabled }: OrgKpiFileUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { maxFileSizeMb, maxFileSizeBytes } = useUploadLimits();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > maxFileSizeBytes) {
      toast({
        title: 'File too large',
        description: `Maximum file size is ${maxFileSizeMb}MB`,
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `org-kpi-${Date.now()}.${fileExt}`;
      const filePath = `org-kpi-evidence/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('review-evidence')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('review-evidence')
        .getPublicUrl(filePath);

      onUploadComplete(publicUrl);
      toast({ title: 'File uploaded successfully' });
    } catch (error: any) {
      toast({
        title: 'Upload failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemove = () => {
    onUploadComplete(null);
  };

  if (existingUrl) {
    return (
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => window.open(existingUrl, '_blank')}
          disabled={disabled}
        >
          <FileText className="h-3 w-3 mr-1" />
          View
          <ExternalLink className="h-3 w-3 ml-1" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
          onClick={handleRemove}
          disabled={disabled}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelect}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
        disabled={disabled || isUploading}
      />
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled || isUploading}
      >
        {isUploading ? (
          <>
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            <Upload className="h-3 w-3 mr-1" />
            Upload
          </>
        )}
      </Button>
    </div>
  );
}
