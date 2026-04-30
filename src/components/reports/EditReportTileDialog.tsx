import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useReportTileOverrides } from '@/hooks/useReportTileOverrides';
import { useToast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reportKey: string;
  /** Default (source-of-truth) title used for "Reset to default". */
  defaultTitle: string;
  /** Default (source-of-truth) description used for "Reset to default". */
  defaultDescription: string;
  /** Currently displayed title (override if any, else default). */
  currentTitle: string;
  /** Currently displayed description (override if any, else default). */
  currentDescription: string;
}

const TITLE_MAX = 80;
const DESC_MAX = 240;

export function EditReportTileDialog({
  open,
  onOpenChange,
  reportKey,
  defaultTitle,
  defaultDescription,
  currentTitle,
  currentDescription,
}: Props) {
  const { saveOverride, clearOverride, isSaving } = useReportTileOverrides();
  const { toast } = useToast();
  const [title, setTitle] = useState(currentTitle);
  const [description, setDescription] = useState(currentDescription);

  useEffect(() => {
    if (open) {
      setTitle(currentTitle);
      setDescription(currentDescription);
    }
  }, [open, currentTitle, currentDescription]);

  const handleSave = () => {
    const t = title.trim();
    if (!t) {
      toast({ title: 'Title is required', variant: 'destructive' });
      return;
    }
    saveOverride(reportKey, { title: t, description: description.trim() });
    onOpenChange(false);
  };

  const handleReset = () => {
    clearOverride(reportKey);
    setTitle(defaultTitle);
    setDescription(defaultDescription);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Report Tile</DialogTitle>
          <DialogDescription>
            Customize how this report appears on the Reports hub. Visible to all users.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="tile-title">Title</Label>
            <Input
              id="tile-title"
              value={title}
              maxLength={TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={defaultTitle}
            />
            <p className="text-xs text-muted-foreground text-right">
              {title.length}/{TITLE_MAX}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tile-desc">Description</Label>
            <Textarea
              id="tile-desc"
              value={description}
              maxLength={DESC_MAX}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={defaultDescription}
            />
            <p className="text-xs text-muted-foreground text-right">
              {description.length}/{DESC_MAX}
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={handleReset}
            disabled={isSaving}
            className="mr-auto"
          >
            Reset to default
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}