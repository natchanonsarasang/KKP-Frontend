import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Check, Download, FileText, Pencil, Volume2, X } from "lucide-react";
import { downloadAudioViaProxy } from "@/api/audioProxy";
import { ProxyAudioPlayer } from "@/components/ProxyAudioPlayer";
import { downloadConversationAsText } from "./utils";
import { updateCallAttempt } from "@/api/callAttempts";
import type { CallAttempt } from "@/api/types";

// Editable copy of the Call Queue transcript. Visually mirrors TranscriptDialog
// (the read-only "View conversation" in the Completed tab) but each turn is
// editable and the result is saved to `edited_conversation_log` — the exact same
// field the analytics "ASR Correction" column writes to. The original
// `conversation_log` (webhook-owned, read by the AI classifier) is never touched.

interface EditableTurn {
  role: "bot" | "user";
  text: string;
  time?: string; // "HH:MM:SS" for display
  timestamp?: string; // full "YYYY-MM-DD HH:MM:SS" prefix, preserved on save
}

const TIMESTAMP = String.raw`\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?`;
const TURN_RE = new RegExp(
  String.raw`(?:(${TIMESTAMP})\s*)?` + // 1=full timestamp
    String.raw`(Bot|User)\s*:\s*` + // 2=role
    String.raw`([\s\S]*?)` + // 3=text (non-greedy)
    String.raw`(?=(?:${TIMESTAMP}\s*)?(?:Bot|User)\s*:|$)`, // stop at next turn / end
  "gi",
);

function parseConversation(log: string): EditableTurn[] {
  const turns: EditableTurn[] = [];
  TURN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TURN_RE.exec(log)) !== null) {
    const role = m[2].toLowerCase() === "user" ? "user" : "bot";
    const text = m[3].replace(/\s+/g, " ").trim();
    if (!text) continue;
    const timestamp = m[1]?.replace("T", " ");
    const time = timestamp?.slice(11); // "HH:MM:SS"
    turns.push({ role, text, time, timestamp });
  }
  return turns;
}

// Round-trip the edited turns back into the "timestamp Role: text" line format.
function serialize(turns: EditableTurn[]): string {
  return turns
    .map((t) => {
      const prefix = t.timestamp ? `${t.timestamp} ` : "";
      const role = t.role === "user" ? "User" : "Bot";
      return `${prefix}${role}: ${t.text.trim()}`;
    })
    .join("\n");
}

interface EditableTranscriptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attempt: CallAttempt | null;
}

export function EditableTranscriptDialog({ open, onOpenChange, attempt }: EditableTranscriptDialogProps) {
  const queryClient = useQueryClient();

  const seed = useMemo(() => {
    const fromEdited = parseConversation(attempt?.edited_conversation_log ?? "");
    if (fromEdited.length > 0) return fromEdited;
    return parseConversation(attempt?.conversation_log ?? "");
  }, [attempt?.edited_conversation_log, attempt?.conversation_log]);

  const source = attempt?.edited_conversation_log || attempt?.conversation_log || "";
  const isStructured = seed.length > 0;

  const [turns, setTurns] = useState<EditableTurn[]>(seed);
  const [raw, setRaw] = useState(source);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  // Re-sync from the attempt whenever the dialog opens or the record changes.
  useEffect(() => {
    if (!open) return;
    const fromEdited = parseConversation(attempt?.edited_conversation_log ?? "");
    const next = fromEdited.length > 0 ? fromEdited : parseConversation(attempt?.conversation_log ?? "");
    setTurns(next);
    setRaw(attempt?.edited_conversation_log || attempt?.conversation_log || "");
    setEditingIndex(null);
    setDraft("");
  }, [open, attempt?.edited_conversation_log, attempt?.conversation_log]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!attempt) throw new Error("missing call attempt");
      if (!attempt.workspace_id) throw new Error("missing workspace id");
      const edited = isStructured ? serialize(turns) : raw;
      return updateCallAttempt(attempt.id, attempt.workspace_id, {
        edited_conversation_log: edited,
      });
    },
    onSuccess: () => {
      toast.success("บันทึกบทสนทนาที่แก้ไขแล้ว");
      queryClient.invalidateQueries({ queryKey: ["call-attempts-by-item"] });
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    },
  });

  const startEdit = (i: number) => {
    setEditingIndex(i);
    setDraft(turns[i].text);
  };

  const commitEdit = () => {
    if (editingIndex === null) return;
    const next = turns.slice();
    next[editingIndex] = { ...next[editingIndex], text: draft };
    setTurns(next);
    setEditingIndex(null);
    setDraft("");
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setDraft("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>แก้ไขบทสนทนา (ASR Correction)</DialogTitle>
          <DialogDescription>แก้ไขสำเนาของบทสนทนาได้ที่นี่ ต้นฉบับจะไม่ถูกเปลี่ยนแปลง</DialogDescription>
        </DialogHeader>
        {attempt && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Conversation</Label>
              <div className="bg-muted/30 rounded-lg p-3 min-h-[150px] max-h-[400px] overflow-y-auto space-y-3">
                {isStructured ? (
                  turns.map((turn, i) => {
                    const isBot = turn.role === "bot";
                    const isEditing = editingIndex === i;
                    return (
                      <div key={i} className={`group flex ${isBot ? "justify-start" : "justify-end"}`}>
                        {isEditing ? (
                          <div className="flex w-full flex-col gap-1.5">
                            <Textarea
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              autoFocus
                              rows={3}
                              className="text-sm leading-relaxed"
                            />
                            <div className="flex items-center gap-1.5">
                              <Button size="sm" className="h-7 gap-1 px-2 text-xs" onClick={commitEdit}>
                                <Check className="h-3.5 w-3.5" />
                                ตกลง
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 gap-1 px-2 text-xs"
                                onClick={cancelEdit}
                              >
                                <X className="h-3.5 w-3.5" />
                                ยกเลิก
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className={`flex items-center gap-1.5 ${isBot ? "" : "flex-row-reverse"}`}>
                            <div
                              className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                                isBot
                                  ? "bg-muted text-foreground rounded-bl-sm"
                                  : "bg-primary text-primary-foreground rounded-br-sm"
                              }`}
                            >
                              <p className="text-sm">{turn.text}</p>
                              {turn.time && (
                                <p
                                  className={`text-[10px] mt-1 ${
                                    isBot ? "text-muted-foreground" : "text-primary-foreground/70"
                                  }`}
                                >
                                  {turn.time}
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => startEdit(i)}
                              aria-label="แก้ไขข้อความนี้"
                              className="shrink-0 rounded-full p-1 text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground group-hover:opacity-100"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  // No Bot/User markers detected — edit the raw transcript verbatim.
                  <Textarea
                    value={raw}
                    onChange={(e) => setRaw(e.target.value)}
                    rows={10}
                    className="text-sm leading-relaxed"
                    placeholder="พิมพ์บทสนทนา..."
                  />
                )}
              </div>
              {(isStructured ? turns.length > 0 : raw.trim()) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() =>
                    downloadConversationAsText(isStructured ? serialize(turns) : raw, "conversation.txt")
                  }
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Download Text
                </Button>
              )}
            </div>

            {attempt.audio_url && (
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Volume2 className="w-4 h-4" />
                  Audio Recording
                </Label>
                <ProxyAudioPlayer url={attempt.audio_url} className="w-full" />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={async () => {
                    try {
                      await downloadAudioViaProxy(attempt.audio_url, "call_audio.mp3");
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

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
                disabled={mutation.isPending}
              >
                ยกเลิก
              </Button>
              <Button
                className="flex-1"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || editingIndex !== null}
              >
                {mutation.isPending ? "กำลังบันทึก..." : "บันทึก"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
