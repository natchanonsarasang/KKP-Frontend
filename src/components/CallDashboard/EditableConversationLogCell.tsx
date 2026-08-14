import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bot, Check, Download, Pencil, User, X } from "lucide-react";
import { ProxyAudioPlayer } from "@/components/ProxyAudioPlayer";
import { downloadAudioViaProxy } from "@/api/audioProxy";
import { getAICategoryBadge, getConfidenceMeter } from "./StatusBadges";
import { updateCallAttempt } from "@/api/callAttempts";
import type { EnrichedCallRecord } from "./types";

// A user-editable copy of the conversation log, stored on the call attempt as
// `edited_conversation_log`. This never touches the original `conversation_log`
// (webhook-owned, read by the AI classifier). When no edit exists yet the editor
// is pre-filled with the original transcript so the user starts from the real one.
//
// Unlike the read-only ConversationLogCell, this renders each turn as a chat
// bubble with its own inline edit button — editing a bubble only changes that
// turn's text; the timestamp and role are preserved on save.

interface EditableTurn {
  role: "bot" | "user";
  text: string;
  time?: string; // "HH:MM" for display
  timestamp?: string; // full "YYYY-MM-DD HH:MM:SS" prefix, preserved on save
}

// Each turn looks like "YYYY-MM-DD HH:MM:SS Bot: text" (timestamp optional for
// older logs). Match one turn at a time, capturing the full timestamp + role +
// text up to the next turn boundary, so we can round-trip it back to the same
// shape after editing.
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
    const time = timestamp?.slice(11, 16); // "HH:MM"
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

export function EditableConversationLogCell({ record }: { record: EnrichedCallRecord }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const hasEdit = !!record.edited_conversation_log?.trim();

  // Seed the bubble editor from whichever source actually parses into turns.
  // Prefer the user's edited copy, but if it's unparseable plain text (e.g. an
  // older save that dropped the Bot:/User: markers) fall back to the original
  // transcript's structure so the user still gets editable bubbles rather than a
  // plain textarea. Only when neither parses do we drop to raw-text editing.
  const parsed = useMemo(() => {
    const fromEdited = parseConversation(record.edited_conversation_log ?? "");
    if (fromEdited.length > 0) return fromEdited;
    return parseConversation(record.conversation_log ?? "");
  }, [record.edited_conversation_log, record.conversation_log]);
  const source = record.edited_conversation_log ?? record.conversation_log ?? "";
  const isStructured = parsed.length > 0;

  const [turns, setTurns] = useState<EditableTurn[]>(parsed);
  const [raw, setRaw] = useState(source);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  // Re-sync from the record whenever the dialog opens or the underlying record
  // changes (e.g. after a refetch), so we never show stale draft text.
  useEffect(() => {
    if (!open) return;
    const fromEdited = parseConversation(record.edited_conversation_log ?? "");
    const seed = fromEdited.length > 0 ? fromEdited : parseConversation(record.conversation_log ?? "");
    setTurns(seed);
    setRaw(record.edited_conversation_log ?? record.conversation_log ?? "");
    setEditingIndex(null);
    setDraft("");
  }, [open, record.edited_conversation_log, record.conversation_log]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!record.workspace_id) throw new Error("missing workspace id");
      const edited = isStructured ? serialize(turns) : raw;
      return updateCallAttempt(record.id, record.workspace_id, {
        edited_conversation_log: edited,
      });
    },
    onSuccess: () => {
      toast.success("บันทึกบทสนทนาที่แก้ไขแล้ว");
      queryClient.invalidateQueries({ queryKey: ["call-attempts-analytics"] });
      setOpen(false);
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

  const title = record.debtor_name?.trim() || record.phone_number || "บทสนทนา";

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs text-primary hover:text-primary"
        onClick={() => setOpen(true)}
      >
        <Pencil className="w-3.5 h-3.5" />
        {hasEdit ? "แก้ไขแล้ว" : "แก้ไขบทสนทนา"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg gap-0 p-0 overflow-hidden">
          <DialogHeader className="space-y-2 border-b px-5 py-4">
            <DialogTitle className="text-base">{title}</DialogTitle>
            <DialogDescription>
              แก้ไขสำเนาของบทสนทนาได้ที่นี่ ต้นฉบับจะไม่ถูกเปลี่ยนแปลง
            </DialogDescription>
            <div className="flex flex-wrap items-center gap-2">
              {getAICategoryBadge(record.ai_category)}
              {getConfidenceMeter(record.ai_confidence)}
              {record.phone_number && (
                <span className="font-mono text-xs text-muted-foreground">{record.phone_number}</span>
              )}
            </div>
          </DialogHeader>

          {record.audio_url && (
            <div className="space-y-2 border-b bg-muted/30 px-5 py-3">
              <ProxyAudioPlayer url={record.audio_url} className="w-full h-9" />
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={async () => {
                  try {
                    await downloadAudioViaProxy(record.audio_url!, "call_audio.mp3");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "ดาวน์โหลดไฟล์เสียงไม่สำเร็จ");
                  }
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                ดาวน์โหลดไฟล์เสียง
              </Button>
            </div>
          )}

          {isStructured ? (
            <ScrollArea className="max-h-[55vh]">
              <div className="space-y-3 px-5 py-4">
                {turns.map((turn, i) => {
                  const isEditing = editingIndex === i;
                  return (
                    <div
                      key={i}
                      className={`group flex items-end gap-2 ${
                        turn.role === "user" ? "flex-row-reverse" : ""
                      }`}
                    >
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                          turn.role === "user"
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {turn.role === "user" ? (
                          <User className="h-3.5 w-3.5" />
                        ) : (
                          <Bot className="h-3.5 w-3.5" />
                        )}
                      </div>
                      <div
                        className={`flex max-w-[78%] flex-col gap-1 ${
                          turn.role === "user" ? "items-end" : "items-start"
                        }`}
                      >
                        {isEditing ? (
                          <div className="flex flex-col gap-1.5">
                            <Textarea
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              autoFocus
                              rows={3}
                              className="min-w-[220px] text-sm leading-relaxed"
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
                          <div
                            className={`flex items-center gap-1.5 ${
                              turn.role === "user" ? "flex-row-reverse" : ""
                            }`}
                          >
                            <div
                              className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                                turn.role === "user"
                                  ? "rounded-br-sm bg-primary/10 text-foreground"
                                  : "rounded-bl-sm bg-muted text-foreground"
                              }`}
                            >
                              {turn.text}
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
                        {turn.time && (
                          <span className="px-1 text-[10px] tabular-nums text-muted-foreground">
                            {turn.time}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          ) : (
            // No Bot/User markers detected — edit the raw transcript verbatim.
            <div className="px-5 py-4">
              <Textarea
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                rows={14}
                className="text-sm leading-relaxed"
                placeholder="พิมพ์บทสนทนา..."
              />
            </div>
          )}

          <DialogFooter className="border-t px-5 py-3">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>
              ยกเลิก
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || editingIndex !== null}
            >
              {mutation.isPending ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
