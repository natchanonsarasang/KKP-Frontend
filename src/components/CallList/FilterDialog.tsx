import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DebtorFilterPanel, FilterConditions } from "@/components/DebtorFilterPanel";

interface FilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCalculateCount: (conditions: FilterConditions) => void;
  onConfirmSelection: (conditions: FilterConditions) => void;
  onClose: () => void;
  isLoading: boolean;
  isConfirming: boolean;
  matchCount: number | undefined;
  totalAvailable: number;
}

export function FilterDialog({
  open,
  onOpenChange,
  onCalculateCount,
  onConfirmSelection,
  onClose,
  isLoading,
  isConfirming,
  matchCount,
  totalAvailable,
}: FilterDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Smart Queue</DialogTitle>
          <DialogDescription>Filter debtors by conditions and queue them for calling</DialogDescription>
        </DialogHeader>
        <DebtorFilterPanel
          onCalculateCount={onCalculateCount}
          onConfirmSelection={onConfirmSelection}
          onClose={onClose}
          isLoading={isLoading}
          isConfirming={isConfirming}
          matchCount={matchCount}
          totalAvailable={totalAvailable}
        />
      </DialogContent>
    </Dialog>
  );
}
