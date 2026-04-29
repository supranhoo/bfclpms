import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Upload, X, FileText, Image, FileSpreadsheet, Loader2 } from 'lucide-react';
import { openStorageFile } from '@/lib/storageDownload';
import { useUploadLimits } from '@/hooks/useUploadLimits';
import { useImageCompressionSettings } from '@/hooks/useImageCompressionSettings';
import {
  compressImageFile,
  formatSavings,
  shouldShowSavingsToast,
} from '@/lib/imageCompression';
import { toast as sonnerToast } from 'sonner';

interface EvidenceUploadProps {
  userId: string;
  kpiId: string;
  onUploadComplete: (url: string) => void;
  existingUrl?: string | null;
}

const ACCEPTED_TYPES = {
  'image/jpeg': { ext: 'jpg', icon: Image },
  'image/jpg': { ext: 'jpg', icon: Image },
  'image/png': { ext: 'png', icon: Image },
  'application/pdf': { ext: 'pdf', icon: FileText },
  'application/vnd.ms-excel': { ext: 'xls', icon: FileSpreadsheet },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', icon: FileSpreadsheet },
};

const ACCEPTED_EXTENSIONS = '.jpg,.jpeg,.png,.pdf,.xls,.xlsx';

export function EvidenceUpload({ userId, kpiId, onUploadComplete, existingUrl }: EvidenceUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(existingUrl || null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { maxFileSizeMb, maxFileSizeBytes } = useUploadLimits();
  const { enabled: compressionEnabled, policy: compressionPolicy } =
    useImageCompressionSettings();

  const getFileIcon = (url: string) => {
    if (url.includes('.pdf')) return FileText;
    if (url.includes('.xls')) return FileSpreadsheet;
    return Image;
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!Object.keys(ACCEPTED_TYPES).includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a JPEG, PNG, PDF, or Excel file.',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size
    if (file.size > maxFileSizeBytes) {
      toast({
        title: 'File too large',
        description: `Maximum file size is ${maxFileSizeMb}MB.`,
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    setFileName(file.name);

    try {
      // Phase A — client-side image compression. Returns the original
      // file untouched for non-images, small files, GIFs, or on error.
      // Show "Optimizing…" only for slow compressions (>250 ms).
      const optimizingTimer = window.setTimeout(() => setOptimizing(true), 250);
      const compResult = await compressImageFile(file, {
        enabled: compressionEnabled,
        policy: compressionPolicy,
      });
      window.clearTimeout(optimizingTimer);
      setOptimizing(false);
      const outFile = compResult.file;

      const fileExt = ACCEPTED_TYPES[outFile.type as keyof typeof ACCEPTED_TYPES]?.ext
        ?? ACCEPTED_TYPES[file.type as keyof typeof ACCEPTED_TYPES]?.ext
        ?? 'file';
      const sanitizedName = outFile.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').substring(0, 40);
      const filePath = `${userId}/${kpiId}/${Date.now()}_${sanitizedName}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('review-evidence')
        .upload(filePath, outFile, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('review-evidence')
        .getPublicUrl(filePath);

      setUploadedUrl(publicUrl);
      onUploadComplete(publicUrl);
      
      toast({
        title: 'File uploaded',
        description: 'Evidence file uploaded successfully.',
      });
      if (shouldShowSavingsToast(compResult)) {
        sonnerToast.message(formatSavings(compResult));
      }
    } catch (error: any) {
      toast({
        title: 'Upload failed',
        description: error.message || 'Failed to upload file.',
        variant: 'destructive',
      });
      setFileName(null);
    } finally {
      setOptimizing(false);
      setUploading(false);
    }
  };

  const handleRemove = () => {
    setUploadedUrl(null);
    setFileName(null);
    onUploadComplete('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (uploading || uploadedUrl) return;
    const dialogContainer = containerRef.current?.closest('[role="dialog"]');
    const target = dialogContainer || document;
    const handler = (e: Event) => {
      const ce = e as ClipboardEvent;
      const files = ce.clipboardData?.files;
      if (!files || files.length === 0) return;
      const file = files[0];
      if (!Object.keys(ACCEPTED_TYPES).includes(file.type)) {
        toast({ title: 'Invalid file type', description: 'Please upload a JPEG, PNG, PDF, or Excel file.', variant: 'destructive' });
        return;
      }
      if (file.size > maxFileSizeBytes) {
        toast({ title: 'File too large', description: `Maximum file size is ${maxFileSizeMb}MB.`, variant: 'destructive' });
        return;
      }
      e.preventDefault();
      setUploading(true);
      setFileName(file.name);
      const optimizingTimer = window.setTimeout(() => setOptimizing(true), 250);
      compressImageFile(file, { enabled: compressionEnabled, policy: compressionPolicy }).then((compResult) => {
        window.clearTimeout(optimizingTimer);
        setOptimizing(false);
        const outFile = compResult.file;
        const fileExt = ACCEPTED_TYPES[outFile.type as keyof typeof ACCEPTED_TYPES]?.ext
          ?? ACCEPTED_TYPES[file.type as keyof typeof ACCEPTED_TYPES]?.ext
          ?? 'file';
        const sanitizedName = outFile.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').substring(0, 40);
        const filePath = `${userId}/${kpiId}/${Date.now()}_${sanitizedName}.${fileExt}`;
        supabase.storage.from('review-evidence').upload(filePath, outFile, { upsert: true }).then(({ error: uploadError }) => {
        if (uploadError) {
          toast({ title: 'Upload failed', description: uploadError.message, variant: 'destructive' });
          setFileName(null);
          setUploading(false);
          return;
        }
        const { data: { publicUrl } } = supabase.storage.from('review-evidence').getPublicUrl(filePath);
        setUploadedUrl(publicUrl);
        onUploadComplete(publicUrl);
        toast({ title: 'File uploaded', description: 'Evidence file uploaded successfully.' });
        if (shouldShowSavingsToast(compResult)) {
          sonnerToast.message(formatSavings(compResult));
        }
        setUploading(false);
        });
      });
    };
    target.addEventListener('paste', handler);
    return () => target.removeEventListener('paste', handler);
  }, [uploading, uploadedUrl, maxFileSizeBytes, maxFileSizeMb, userId, kpiId, onUploadComplete, toast, compressionEnabled, compressionPolicy]);

  const FileIcon = uploadedUrl ? getFileIcon(uploadedUrl) : Upload;

  return (
    <div className="space-y-2" ref={containerRef}>
      <Label>Evidence Attachment (Optional)</Label>
      <p className="text-xs text-muted-foreground mb-2">
        Supported: JPEG, PNG, PDF, Excel (max {maxFileSizeMb}MB). You can also paste images.
      </p>
      
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept={ACCEPTED_EXTENSIONS}
        className="hidden"
        disabled={uploading}
      />

      {uploadedUrl ? (
        <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/50">
          <FileIcon className="h-5 w-5 text-primary flex-shrink-0" />
          <button 
            type="button"
            onClick={() => openStorageFile(uploadedUrl!)}
            className="text-sm text-primary hover:underline truncate flex-1 text-left bg-transparent border-none p-0 cursor-pointer"
          >
            {fileName || 'View uploaded file'}
          </button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full justify-start"
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {optimizing ? 'Optimizing…' : 'Uploading...'}
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Upload Evidence File
            </>
          )}
        </Button>
      )}
    </div>
  );
}