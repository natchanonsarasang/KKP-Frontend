import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, FolderPlus } from "lucide-react";

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateWorkspace: (name: string) => Promise<void>;
  isRequired?: boolean;
}

const CreateWorkspaceDialog = ({
  open,
  onOpenChange,
  onCreateWorkspace,
  isRequired = false,
}: CreateWorkspaceDialogProps) => {
  const [name, setName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsCreating(true);
    try {
      await onCreateWorkspace(name.trim());
      setName("");
      onOpenChange(false);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={isRequired ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={isRequired ? (e) => e.preventDefault() : undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="w-5 h-5" />
            {isRequired ? "Create Your First Workspace" : "Create Workspace"}
          </DialogTitle>
          <DialogDescription>
            {isRequired
              ? "You need to create a workspace to start managing your debtors. Each workspace can have its own debtor list with custom columns."
              : "Create a new workspace to organize your debtors. Each workspace can have its own debtor list with custom columns."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="workspace-name">Workspace Name</Label>
            <Input
              id="workspace-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Company A, Project 2024"
              autoFocus
            />
          </div>

          <div className="flex gap-2">
            {!isRequired && (
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
                disabled={isCreating}
              >
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              className={isRequired ? "w-full" : "flex-1"}
              disabled={!name.trim() || isCreating}
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Workspace"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateWorkspaceDialog;
