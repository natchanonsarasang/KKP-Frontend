import { AlertCircle, CheckCircle, Clock, PhoneCall, PhoneOff, XCircle } from "lucide-react";

export const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  pending: { label: "Pending", color: "bg-muted text-muted-foreground", icon: Clock },
  calling: { label: "Calling", color: "bg-primary/10 text-primary", icon: PhoneCall },
  confirmed: { label: "Confirmed", color: "bg-success/10 text-success", icon: CheckCircle },
  declined: { label: "Declined", color: "bg-destructive/10 text-destructive", icon: XCircle },
  completed: { label: "Completed", color: "bg-muted text-muted-foreground", icon: PhoneCall },
  no_response: { label: "No Response", color: "bg-warning/10 text-warning", icon: Clock },
  failed: { label: "Failed", color: "bg-destructive/10 text-destructive", icon: AlertCircle },
  no_answer: { label: "No Answer", color: "bg-muted text-muted-foreground", icon: PhoneOff },
};
