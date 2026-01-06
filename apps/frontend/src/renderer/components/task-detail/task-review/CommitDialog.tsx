import { GitCommit, Loader2 } from 'lucide-react';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../ui/alert-dialog';
import { Textarea } from '../../ui/textarea';
import { Label } from '../../ui/label';

interface CommitDialogProps {
  open: boolean;
  taskId: string;
  isCommitting: boolean;
  onOpenChange: (open: boolean) => void;
  onCommit: (commitMessage: string) => Promise<void>;
}

/**
 * Dialog for committing uncommitted changes
 */
export function CommitDialog({
  open,
  taskId,
  isCommitting,
  onOpenChange,
  onCommit
}: CommitDialogProps) {
  const [commitMessage, setCommitMessage] = useState('');

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    await onCommit(commitMessage.trim());
    setCommitMessage('');
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <GitCommit className="h-5 w-5 text-success" />
            Commit Changes
          </AlertDialogTitle>
          <AlertDialogDescription>
            Enter a commit message for the uncommitted changes in the main project.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="commit-message">Commit Message</Label>
            <Textarea
              id="commit-message"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="e.g., Fix bug in authentication"
              disabled={isCommitting}
              className="min-h-[100px]"
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isCommitting}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleCommit}
            disabled={!commitMessage.trim() || isCommitting}
            className="bg-success hover:bg-success/90"
          >
            {isCommitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Committing...
              </>
            ) : (
              <>
                <GitCommit className="h-4 w-4 mr-2" />
                Commit
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
