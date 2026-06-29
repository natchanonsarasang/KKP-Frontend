import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Users } from "lucide-react";
import { maskPhoneNumber } from "@/lib/formatPhone";
import type { Debtor, Template } from "./types";

interface AddToListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: Template[];
  selectedTemplateId: string;
  onSelectedTemplateIdChange: (id: string) => void;
  scheduledTime: string;
  onScheduledTimeChange: (value: string) => void;
  availableDebtors: Debtor[] | undefined;
  selectedDebtors: string[];
  onToggleDebtorSelection: (id: string) => void;
  onSelectAllDebtors: () => void;
  onCancel: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

export function AddToListDialog({
  open,
  onOpenChange,
  templates,
  selectedTemplateId,
  onSelectedTemplateIdChange,
  scheduledTime,
  onScheduledTimeChange,
  availableDebtors,
  selectedDebtors,
  onToggleDebtorSelection,
  onSelectAllDebtors,
  onCancel,
  onSubmit,
  isSubmitting,
}: AddToListDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Add to Call List</DialogTitle>
          <DialogDescription>Select debtors to add to the call queue</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Template Selection */}
          <div className="space-y-1.5">
            <Label className="text-sm">Template</Label>
            <Select value={selectedTemplateId} onValueChange={onSelectedTemplateIdChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select template" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                {templates?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.org_name} {t.is_system_default && "(Default)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Schedule Time (Optional) */}
          <div className="space-y-1.5">
            <Label className="text-sm">Schedule (Optional)</Label>
            <Input
              type="datetime-local"
              value={scheduledTime}
              onChange={(e) => onScheduledTimeChange(e.target.value)}
            />
          </div>

          {/* Debtor Selection */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm">Select Debtors ({selectedDebtors.length} selected)</Label>
              <Button variant="ghost" size="sm" onClick={onSelectAllDebtors}>
                {selectedDebtors.length === availableDebtors?.length ? "Deselect All" : "Select All"}
              </Button>
            </div>

            {availableDebtors && availableDebtors.length > 0 ? (
              <div className="flex-1 overflow-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead className="text-xs">Phone</TableHead>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs">Debt</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {availableDebtors.map((debtor) => (
                      <TableRow key={debtor.id} className="cursor-pointer" onClick={() => onToggleDebtorSelection(debtor.id)}>
                        <TableCell>
                          <Checkbox
                            checked={selectedDebtors.includes(debtor.id)}
                            onCheckedChange={() => onToggleDebtorSelection(debtor.id)}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm">{maskPhoneNumber(debtor.phone_number)}</TableCell>
                        <TableCell className="text-sm">{debtor.name || "-"}</TableCell>
                        <TableCell className="text-sm">
                          {debtor.total_debt
                            ? new Intl.NumberFormat("th-TH", {
                                style: "currency",
                                currency: "THB",
                                minimumFractionDigits: 0,
                              }).format(debtor.total_debt)
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {debtor.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground border rounded-md">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No available debtors</p>
                <p className="text-xs">All debtors are already in the call queue</p>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onCancel}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={onSubmit} disabled={selectedDebtors.length === 0 || isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add {selectedDebtors.length} to List
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
