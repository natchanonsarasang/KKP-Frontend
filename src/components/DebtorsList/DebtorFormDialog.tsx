import type { FormEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { DEBTOR_CUSTOMER_VARIABLE_KEYS, DEBTOR_CUSTOMER_VARIABLE_LABELS } from "@/lib/debtorVariables";
import type { Debtor, DebtorFormData } from "./types";

interface DebtorFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingDebtor: Debtor | null;
  formData: DebtorFormData;
  onFormDataChange: (updater: (prev: DebtorFormData) => DebtorFormData) => void;
  templateVariables: Record<string, string>;
  onTemplateVariablesChange: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function DebtorFormDialog({
  open,
  onOpenChange,
  editingDebtor,
  formData,
  onFormDataChange,
  templateVariables,
  onTemplateVariablesChange,
  onSubmit,
  onCancel,
  isSubmitting,
}: DebtorFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editingDebtor ? "Edit Debtor" : "Add Debtor"}</DialogTitle>
          <DialogDescription>{editingDebtor ? "Update debtor information" : "Add a new debtor to track"}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4 mt-4 max-h-[60vh] overflow-y-auto pr-2">
          {/* Phone Number - Always required */}
          <div className="space-y-1.5">
            <Label className="text-sm">Phone Number *</Label>
            <Input
              value={formData.phone_number}
              onChange={(e) => onFormDataChange((p) => ({ ...p, phone_number: e.target.value }))}
              placeholder="0812345678"
            />
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-sm">Customer data</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Variables sent to bot: <code className="text-xs bg-muted px-1 rounded">{"{name}"}</code>,{" "}
                <code className="text-xs bg-muted px-1 rounded">{"{car_detail}"}</code>,{" "}
                <code className="text-xs bg-muted px-1 rounded">{"{total_debt}"}</code>,{" "}
                <code className="text-xs bg-muted px-1 rounded">{"{overdue_installment}"}</code>, etc.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {DEBTOR_CUSTOMER_VARIABLE_KEYS.map((key) => {
                const isRequired = ["name", "total_debt"].includes(key);
                const isNumeric = ["total_debt", "total_interest", "total_fine", "overdue_installment"].includes(key);
                return (
                  <div key={key} className="space-y-1.5">
                    <Label className="text-sm">
                      {DEBTOR_CUSTOMER_VARIABLE_LABELS[key]}
                      {isRequired && <span className="text-destructive ml-0.5">*</span>}
                    </Label>
                    <Input
                      type={isNumeric ? "number" : "text"}
                      min={isNumeric ? 0 : undefined}
                      step={key === "overdue_installment" ? 1 : undefined}
                      required={isRequired}
                      value={templateVariables[key] ?? ""}
                      onChange={(e) =>
                        onTemplateVariablesChange((prev) => ({
                          ...prev,
                          [key]: e.target.value,
                        }))
                      }
                      placeholder={key}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => onFormDataChange((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Add notes..."
              className="resize-none"
              rows={2}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingDebtor ? "Update" : "Add Debtor"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
