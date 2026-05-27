import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setCustomerConsent, updateCustomer } from "./api/airtable";
import type { Customer } from "./types";

interface Props {
  customer: Customer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CONSENT_OPTIONS = ["Consent Given", "Consent Denied"] as const;

const EditCustomerDialog = ({ customer, open, onOpenChange }: Props) => {
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone1, setPhone1] = useState("");
  const [consentStatus, setConsentStatus] = useState<string>("");

  useEffect(() => {
    if (customer) {
      setFirstName(customer.firstName ?? "");
      setLastName(customer.lastName ?? "");
      setPhone1(customer.phone1 ?? "");
      setConsentStatus(customer.consentStatus ?? "");
    }
  }, [customer]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!customer) throw new Error("No customer selected");
      return updateCustomer(customer.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone1: phone1.trim(),
        consentStatus: consentStatus || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Customer updated");
      queryClient.invalidateQueries({ queryKey: ["dhipaya-customers"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update customer");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Edit Customer</DialogTitle>
          <DialogDescription>
            Update customer details. Changes sync to Airtable.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone1">Phone</Label>
            <Input
              id="phone1"
              value={phone1}
              onChange={(e) => setPhone1(e.target.value)}
              inputMode="tel"
            />
          </div>

          <div className="space-y-2">
            <Label>Consent</Label>
            <Select
              value={consentStatus || "none"}
              onValueChange={(v) => setConsentStatus(v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select consent status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {CONSENT_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditCustomerDialog;
