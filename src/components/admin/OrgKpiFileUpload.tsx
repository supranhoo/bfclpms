import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileText, X, Loader2, ExternalLink } from 'lucide-react';
import { openStorageFile, buildEvidenceFileName } from '@/lib/storageDownload';
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
      const sanitizedName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').substring(0, 40);
      const fileName = `org-kpi-${Date.now()}_${sanitizedName}.${fileExt}`;
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

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isUploading || disabled || existingUrl) return;
    const dialogContainer = containerRef.current?.closest('[role="dialog"]');
    const target = dialogContainer || document;
    const handler = (e: Event) => {
      const ce = e as ClipboardEvent;
      const files = ce.clipboardData?.files;
      if (!files || files.length === 0) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const file = files[0];
      if (file.size > maxFileSizeBytes) {
        toast({ title: 'File too large', description: `Maximum file size is ${maxFileSizeMb}MB`, variant: 'destructive' });
        return;
      }
      setIsUploading(true);
      const fileExt = file.name.split('.').pop() || 'png';
      const sanitizedName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').substring(0, 40);
      const fileName = `org-kpi-${Date.now()}_${sanitizedName}.${fileExt}`;
      const filePath = `org-kpi-evidence/${fileName}`;
      supabase.storage.from('review-evidence').upload(filePath, file).then(({ error: uploadError }) => {
        if (uploadError) {
          toast({ title: 'Upload failed', description: uploadError.message, variant: 'destructive' });
          setIsUploading(false);
          return;
        }
        const { data: { publicUrl } } = supabase.storage.from('review-evidence').getPublicUrl(filePath);
        onUploadComplete(publicUrl);
        toast({ title: 'File uploaded successfully' });
        setIsUploading(false);
      });
    };
    target.addEventListener('paste', handler);
    return () => target.removeEventListener('paste', handler);
  }, [isUploading, disabled, existingUrl, maxFileSizeBytes, maxFileSizeMb, onUploadComplete, toast]);

  if (existingUrl) {
    return (
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => openStorageFile(existingUrl, buildEvidenceFileName(existingUrl, null, 'Org_KPI'))}
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
    <div ref={containerRef}>
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
      <span className="text-[10px] text-muted-foreground">or Ctrl+V</span>
    </div>
  );
}
