import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Upload, X, FileText, Image, FileSpreadsheet, Loader2, Plus } from 'lucide-react';
import { openStorageFile } from '@/lib/storageDownload';
import { cn } from '@/lib/utils';
import { useUploadLimits } from '@/hooks/useUploadLimits';

interface MultiFileUploadProps {
  userId: string;
  contextId: string; // KPI ID, Query ID, etc.
  folder: string; // 'self-evidence', 'manager-evidence', etc.
  existingUrls: string[];
  onUploadComplete: (urls: string[]) => void;
  maxFiles?: number;
  disabled?: boolean;
  label?: string;
  /**
   * Optional additional MIME types to accept beyond the default
   * JPEG/PNG/PDF/Excel set. Merged into validation, the file picker
   * `accept` attribute, and the icon lookup.
   */
  extraAcceptedTypes?: Record<string, { ext: string; icon: any }>;
  /**
   * Optional helper text shown below the dropzone. Defaults to the
   * standard "Supported: JPEG, PNG, PDF, Excel" message.
   */
  helperText?: string;
  /**
   * Optional rename hook applied to every file before upload. Useful
   * for pasted screenshots that arrive as `image.png` so callers can
   * inject context (e.g. employee code + timestamp).
   */
  pasteFilenameFor?: (file: File) => string | null | undefined;
}

interface UploadingFile {
  id: string;
  name: string;
  progress: number;
}

const DEFAULT_ACCEPTED_TYPES = {
  'image/jpeg': { ext: 'jpg', icon: Image },
  'image/jpg': { ext: 'jpg', icon: Image },
  'image/png': { ext: 'png', icon: Image },
  'application/pdf': { ext: 'pdf', icon: FileText },
  'application/vnd.ms-excel': { ext: 'xls', icon: FileSpreadsheet },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', icon: FileSpreadsheet },
};

const DEFAULT_ACCEPTED_EXTENSIONS = '.jpg,.jpeg,.png,.pdf,.xls,.xlsx';

export function MultiFileUpload({
  userId,
  contextId,
  folder,
  existingUrls,
  onUploadComplete,
  maxFiles = 5,
  disabled = false,
  label = 'Evidence Attachments',
  extraAcceptedTypes,
  helperText,
  pasteFilenameFor,
}: MultiFileUploadProps) {
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { maxFileSizeMb, maxFileSizeBytes } = useUploadLimits();

  const ACCEPTED_TYPES: Record<string, { ext: string; icon: any }> = {
    ...DEFAULT_ACCEPTED_TYPES,
    ...(extraAcceptedTypes ?? {}),
  };
  const ACCEPTED_EXTENSIONS = Array.from(
    new Set([
      ...DEFAULT_ACCEPTED_EXTENSIONS.split(','),
      ...Object.values(ACCEPTED_TYPES).map((v) => `.${v.ext}`),
    ]),
  ).join(',');

  const currentCount = existingUrls.length;
  const canUploadMore = currentCount < maxFiles && !disabled;
  const remainingSlots = maxFiles - currentCount;

  const getFileIcon = (url: string) => {
    if (url.includes('.pdf')) return FileText;
    if (url.includes('.xls')) return FileSpreadsheet;
    if (url.includes('.doc')) return FileText;
    return Image;
  };

  const getFileName = (url: string) => {
    try {
      const parts = url.split('/');
      const fileName = parts[parts.length - 1];
      // Decode URL-encoded characters
      return decodeURIComponent(fileName);
    } catch {
      return 'File';
    }
  };

  const uploadFile = async (file: File): Promise<string | null> => {
    const fileId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Apply consumer-supplied rename (e.g. for pasted screenshots).
    if (pasteFilenameFor) {
      try {
        const renamed = pasteFilenameFor(file);
        if (renamed && renamed !== file.name) {
          file = new File([file], renamed, { type: file.type });
        }
      } catch {
        /* fall back to original filename */
      }
    }

    // Validate file type
    if (!Object.keys(ACCEPTED_TYPES).includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: `"${file.name}" is not a supported format.`,
        variant: 'destructive',
      });
      return null;
    }

    // Validate file size
    if (file.size > maxFileSizeBytes) {
      toast({
        title: 'File too large',
        description: `"${file.name}" exceeds the ${maxFileSizeMb}MB limit.`,
        variant: 'destructive',
      });
      return null;
    }

    // Add to uploading list
    setUploadingFiles(prev => [...prev, { id: fileId, name: file.name, progress: 0 }]);

    try {
      const fileExt = ACCEPTED_TYPES[file.type as keyof typeof ACCEPTED_TYPES]?.ext || 'file';
      const timestamp = Date.now();
      const sanitizedName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').substring(0, 40);
      const filePath = `${userId}/${contextId}/${folder}/${timestamp}_${sanitizedName}.${fileExt}`;

      // Simulate progress (Supabase doesn't provide upload progress)
      const progressInterval = setInterval(() => {
        setUploadingFiles(prev =>
          prev.map(f =>
            f.id === fileId ? { ...f, progress: Math.min(f.progress + 10, 90) } : f
          )
        );
      }, 100);

      const { error: uploadError } = await supabase.storage
        .from('review-evidence')
        .upload(filePath, file, { upsert: true });

      clearInterval(progressInterval);

      if (uploadError) throw uploadError;

      // Set progress to 100%
      setUploadingFiles(prev =>
        prev.map(f => (f.id === fileId ? { ...f, progress: 100 } : f))
      );

      const { data: { publicUrl } } = supabase.storage
        .from('review-evidence')
        .getPublicUrl(filePath);

      // Remove from uploading list after short delay
      setTimeout(() => {
        setUploadingFiles(prev => prev.filter(f => f.id !== fileId));
      }, 500);

      return publicUrl;
    } catch (error: any) {
      setUploadingFiles(prev => prev.filter(f => f.id !== fileId));
      toast({
        title: 'Upload failed',
        description: error.message || `Failed to upload "${file.name}"`,
        variant: 'destructive',
      });
      return null;
    }
  };

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const filesToUpload = Array.from(files).slice(0, remainingSlots);
    
    if (files.length > remainingSlots) {
      toast({
        title: 'Too many files',
        description: `You can only upload ${remainingSlots} more file(s). Max ${maxFiles} total.`,
        variant: 'destructive',
      });
    }

    const uploadedUrls: string[] = [];
    
    for (const file of filesToUpload) {
      const url = await uploadFile(file);
      if (url) {
        uploadedUrls.push(url);
      }
    }

    if (uploadedUrls.length > 0) {
      onUploadComplete([...existingUrls, ...uploadedUrls]);
      toast({
        title: 'Files uploaded',
        description: `${uploadedUrls.length} file(s) uploaded successfully.`,
      });
    }
  };

  const handleRemove = (urlToRemove: string) => {
    const newUrls = existingUrls.filter(url => url !== urlToRemove);
    onUploadComplete(newUrls);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled && canUploadMore) {
      setIsDragOver(true);
    }
  }, [disabled, canUploadMore]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!disabled && canUploadMore) {
      handleFilesSelected(e.dataTransfer.files);
    }
  }, [disabled, canUploadMore]);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (disabled || !canUploadMore) return;
    const dialogContainer = containerRef.current?.closest('[role="dialog"]');
    const target = dialogContainer || document;
    const handler = (e: Event) => {
      const ce = e as ClipboardEvent;
      const files = ce.clipboardData?.files;
      if (!files || files.length === 0) return;
      e.preventDefault();
      handleFilesSelected(files);
    };
    target.addEventListener('paste', handler);
    return () => target.removeEventListener('paste', handler);
  }, [disabled, canUploadMore, handleFilesSelected]);

  const isUploading = uploadingFiles.length > 0;

  return (
    <div className="space-y-2" ref={containerRef}>
      <div className="flex items-center justify-between">
        <Label>{label} ({currentCount}/{maxFiles})</Label>
      </div>
      
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => handleFilesSelected(e.target.files)}
        accept={ACCEPTED_EXTENSIONS}
        multiple
        className="hidden"
        disabled={disabled || !canUploadMore}
      />

      {/* File Grid */}
      <div className="flex flex-wrap gap-2">
        {/* Existing Files */}
        {existingUrls.map((url, index) => {
          const FileIcon = getFileIcon(url);
          return (
            <div
              key={url}
              className="relative group flex items-center gap-2 p-2 pr-8 border rounded-lg bg-muted/50 max-w-[200px]"
            >
              <FileIcon className="h-4 w-4 text-primary flex-shrink-0" />
              <button
                type="button"
                onClick={() => openStorageFile(url)}
                className="text-xs text-primary hover:underline truncate text-left bg-transparent border-none p-0 cursor-pointer"
                title={getFileName(url)}
              >
                {getFileName(url)}
              </button>
              {!disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemove(url)}
                  className="absolute right-0 top-0 h-full w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          );
        })}

        {/* Uploading Files */}
        {uploadingFiles.map((file) => (
          <div
            key={file.id}
            className="flex items-center gap-2 p-2 border rounded-lg bg-muted/50 min-w-[150px]"
          >
            <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs truncate">{file.name}</p>
              <Progress value={file.progress} className="h-1 mt-1" />
            </div>
          </div>
        ))}

        {/* Add More Button / Drop Zone */}
        {canUploadMore && (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            
            onClick={() => fileInputRef.current?.click()}
            tabIndex={0}
            className={cn(
              'flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-lg cursor-pointer transition-colors min-w-[140px]',
              isDragOver
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30',
              isUploading && 'pointer-events-none opacity-50'
            )}
          >
            <Plus className="h-5 w-5 text-muted-foreground mb-1" />
            <span className="text-xs text-muted-foreground text-center">
              {isUploading ? 'Uploading...' : 'Add files'}
            </span>
            <span className="text-[10px] text-muted-foreground/70 text-center mt-0.5">
              Drop, click, or paste
            </span>
          </div>
        )}
      </div>

      {/* Help Text */}
      <p className="text-xs text-muted-foreground">
        {helperText ?? `Supported: JPEG, PNG, PDF, Excel (max ${maxFileSizeMb}MB each)`}
      </p>
    </div>
  );
}

