import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Phone } from "lucide-react";
import type { PreviewPayload } from "./types";

interface PreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previewPayload: PreviewPayload | null;
  onMakeCallNow: () => void;
}

export function PreviewDialog({ open, onOpenChange, previewPayload, onMakeCallNow }: PreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Botnoi Call Payload Preview</DialogTitle>
          <DialogDescription>This is the exact payload that will be sent to Botnoi API</DialogDescription>
        </DialogHeader>
        {previewPayload && (
          <div className="space-y-4">
            <div className="bg-muted rounded-lg p-4 font-mono text-sm space-y-3">
              <div>
                <span className="text-muted-foreground">Phone Number: </span>
                <span className="text-foreground font-semibold">{previewPayload.phone}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Template ID: </span>
                <span className="text-foreground font-semibold">{previewPayload.templateId}</span>
              </div>
              <div>
                <span className="text-muted-foreground block mb-1">Appointment Date (Message): </span>
                <div className="bg-background border rounded p-3 whitespace-pre-wrap break-words text-foreground">
                  {previewPayload.message}
                </div>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">Raw JSON Payload to Botnoi:</h4>
              <pre className="text-xs bg-background border rounded p-3 overflow-x-auto">
                {JSON.stringify(
                  {
                    "Tel. Number": previewPayload.phone,
                    template_id: previewPayload.templateId,
                    "Appointment Date": previewPayload.message,
                  },
                  null,
                  2,
                )}
              </pre>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button className="flex-1" onClick={onMakeCallNow}>
                <Phone className="w-4 h-4 mr-2" />
                Make Call Now
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
