import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Download, FileText, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { downloadAudioViaProxy } from "@/api/audioProxy";
import { ProxyAudioPlayer } from "@/components/ProxyAudioPlayer";
import { downloadConversationAsText } from "./utils";
import type { TranscriptData } from "./types";

interface TranscriptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transcriptData: TranscriptData | null;
}

export function TranscriptDialog({ open, onOpenChange, transcriptData }: TranscriptDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Call Recording</DialogTitle>
          <DialogDescription>Conversation transcript from the call</DialogDescription>
        </DialogHeader>
        {transcriptData && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Conversation</Label>
              <div className="bg-muted/30 rounded-lg p-3 min-h-[150px] max-h-[400px] overflow-y-auto space-y-3">
                {transcriptData.conversationLog ? (
                  (() => {
                    // Parse conversation log: "YYYY-MM-DD HH:MM:SS Bot/User: message"
                    const lines = transcriptData.conversationLog.split("\n").filter((line) => line.trim());
                    return lines.map((line, idx) => {
                      const match = line.match(/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(Bot|User):\s*(.*)$/i);
                      if (!match) return null;

                      const [, timestamp, role, message] = match;
                      const isBot = role.toLowerCase() === "bot";
                      const time = timestamp.split(" ")[1]; // Just HH:MM:SS

                      return (
                        <div key={idx} className={`flex ${isBot ? "justify-start" : "justify-end"}`}>
                          <div
                            className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                              isBot
                                ? "bg-muted text-foreground rounded-bl-sm"
                                : "bg-primary text-primary-foreground rounded-br-sm"
                            }`}
                          >
                            <p className="text-sm">{message}</p>
                            <p
                              className={`text-[10px] mt-1 ${isBot ? "text-muted-foreground" : "text-primary-foreground/70"}`}
                            >
                              {time}
                            </p>
                          </div>
                        </div>
                      );
                    });
                  })()
                ) : (
                  <p className="text-sm text-muted-foreground italic text-center py-8">
                    No conversation log available
                  </p>
                )}
              </div>
              {transcriptData.conversationLog && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => downloadConversationAsText(transcriptData.conversationLog!, "conversation.txt")}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Download Text
                </Button>
              )}
            </div>

            {transcriptData.audioUrl && (
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Volume2 className="w-4 h-4" />
                  Audio Recording
                </Label>
                <ProxyAudioPlayer url={transcriptData.audioUrl} className="w-full" />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={async () => {
                    try {
                      await downloadAudioViaProxy(transcriptData.audioUrl!, "call_audio.mp3");
                    } catch (err) {
                      console.error("Audio download error:", err);
                      toast.error("Failed to download audio");
                    }
                  }}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Audio
                </Button>
              </div>
            )}

            <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
