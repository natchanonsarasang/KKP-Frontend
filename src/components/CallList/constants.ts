import { Clock, Phone, CheckCircle, XCircle, PhoneOff, AlertCircle, RotateCcw } from "lucide-react";
import type { AutoDialSettings } from "./types";

export const DEFAULT_SETTINGS: AutoDialSettings = {
  maxRetries: 2,
  dailyLimit: 500,
  businessHoursOnly: true,
  businessHoursStart: "09:00",
  businessHoursEnd: "18:00",
  businessDays: [1, 2, 3, 4, 5], // Mon-Fri by default
  delayBetweenCalls: 5, // Default to 5 seconds for testing
  concurrentCalls: 5,
  testMode: false,
  timezoneOffset: -new Date().getTimezoneOffset(), // Auto-detect user's timezone
  interruptible: false,
};

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  pending: { label: "Pending", color: "bg-muted text-muted-foreground", icon: Clock },
  calling: { label: "Calling", color: "bg-primary/10 text-primary", icon: Phone },
  completed: { label: "Completed", color: "bg-success/10 text-success", icon: CheckCircle },
  success: { label: "Success", color: "bg-success/10 text-success", icon: CheckCircle },
  confirmed: { label: "Confirmed", color: "bg-success/10 text-success", icon: CheckCircle },
  declined: { label: "Declined", color: "bg-destructive/10 text-destructive", icon: XCircle },
  no_answer: { label: "No Answer", color: "bg-muted text-muted-foreground", icon: PhoneOff },
  failed: { label: "Failed", color: "bg-destructive/10 text-destructive", icon: AlertCircle },
  no_response: { label: "No Response", color: "bg-warning/10 text-warning", icon: Clock },
  retry_pending: { label: "Retry Pending", color: "bg-warning/10 text-warning", icon: RotateCcw },
};

// BOTNOI TEMPLATE ID - registered with "{Appointment Date}" placeholder
export const BOTNOI_TEMPLATE_ID = "2015208747";
