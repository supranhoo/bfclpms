import { useState, useEffect } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Download, X } from 'lucide-react';

interface KraPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pdfBlob: Blob | null;
  fileName: string;
}

export function KraPreviewDialog({ open, onOpenChange, pdfBlob, fileName }: KraPreviewDialogProps) {
  const isMobile = useIsMobile();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (pdfBlob) {
      const url = URL.createObjectURL(pdfBlob);
      setBlobUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setBlobUrl(null);
  }, [pdfBlob]);

  const handleDownload = () => {
    if (!pdfBlob) return;
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(pdfBlob);
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const content = (
    <div className="flex flex-col h-full gap-3">
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={handleDownload} disabled={!pdfBlob}>
          <Download className="h-4 w-4 mr-1" />
          Download
        </Button>
      </div>
      {blobUrl ? (
        <iframe
          src={blobUrl}
          className="flex-1 w-full min-h-[60vh] border rounded-md"
          title="KRA Preview"
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          Generating preview…
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader>
            <DrawerTitle>KRA Preview</DrawerTitle>
            <DrawerDescription>Preview your KRA assignment sheet</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4 flex-1 overflow-auto">
            {content}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>KRA Preview</DialogTitle>
          <DialogDescription>Preview your KRA assignment sheet</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
