import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateAppSettings } from '@/hooks/useAppSettings';
import { Loader2, Save } from 'lucide-react';

interface PolicyEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialContent: string;
}

export function PolicyEditorDialog({ open, onOpenChange, initialContent }: PolicyEditorDialogProps) {
  const [content, setContent] = useState(initialContent);
  const updateSettings = useUpdateAppSettings();

  const handleSave = () => {
    updateSettings.mutate(
      { pms_policy_content: content } as any,
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit PMS Policy</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="h-full resize-none font-mono text-sm"
            placeholder="Enter policy content using markdown formatting..."
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={updateSettings.isPending}>
            {updateSettings.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Policy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
