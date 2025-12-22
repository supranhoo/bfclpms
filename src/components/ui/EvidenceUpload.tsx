import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Upload, X, FileText, Image, FileSpreadsheet, Loader2 } from 'lucide-react';

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
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function EvidenceUpload({ userId, kpiId, onUploadComplete, existingUrl }: EvidenceUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(existingUrl || null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

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
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: 'File too large',
        description: 'Maximum file size is 10MB.',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    setFileName(file.name);

    try {
      const fileExt = ACCEPTED_TYPES[file.type as keyof typeof ACCEPTED_TYPES]?.ext || 'file';
      const filePath = `${userId}/${kpiId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('review-evidence')
        .upload(filePath, file, { upsert: true });

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
    } catch (error: any) {
      toast({
        title: 'Upload failed',
        description: error.message || 'Failed to upload file.',
        variant: 'destructive',
      });
      setFileName(null);
    } finally {
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

  const FileIcon = uploadedUrl ? getFileIcon(uploadedUrl) : Upload;

  return (
    <div className="space-y-2">
      <Label>Evidence Attachment (Optional)</Label>
      <p className="text-xs text-muted-foreground mb-2">
        Supported: JPEG, PNG, PDF, Excel (max 10MB)
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
          <a 
            href={uploadedUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline truncate flex-1"
          >
            {fileName || 'View uploaded file'}
          </a>
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
              Uploading...
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