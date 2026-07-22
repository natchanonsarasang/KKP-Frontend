import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Bot, MessageSquareText, User } from "lucide-react";
import { ProxyAudioPlayer } from "@/components/ProxyAudioPlayer";
import { getAICategoryBadge, getConfidenceMeter } from "./StatusBadges";
import type { EnrichedCallRecord } from "./types";

interface ConversationTurn {
  role: "bot" | "user";
  text: string;
  time?: string; // "HH:MM" extracted from the turn's timestamp, when present
}

// Each turn looks like "YYYY-MM-DD HH:MM:SS Bot: text" (timestamp optional for
// older logs). Match one turn at a time, capturing the timestamp + role + text
// up to the next turn boundary, so the trailing timestamp never bleeds into the
// message body. Falls back to a single raw block when no markers are present.
const TIMESTAMP = String.raw`\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?`;
const TURN_RE = new RegExp(
  String.raw`(?:(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?\s*)?` + // 1=date 2=HH:MM
    String.raw`(Bot|User)\s*:\s*` + // 3=role
    String.raw`([\s\S]*?)` + // 4=text (non-greedy)
    String.raw`(?=(?:${TIMESTAMP}\s*)?(?:Bot|User)\s*:|$)`, // stop at next turn / end
  "gi",
);

function parseConversation(log: string): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  TURN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TURN_RE.exec(log)) !== null) {
    const role = m[3].toLowerCase() === "user" ? "user" : "bot";
    const text = m[4].replace(/\s+/g, " ").trim();
    if (!text) continue;
    turns.push({ role, text, time: m[2] });
  }
  return turns;
}

// Outcomes with no meaningful conversation to show — the call never produced a
// real transcript, so the transcript column renders "-" instead of a link.
function hasNoTranscript(outcome: string | null | undefined): boolean {
  if (!outcome) return false;
  const o = outcome.toLowerCase();
  return o.includes("reject") || o.includes("hang");
}

export function ConversationLogCell({ record }: { record: EnrichedCallRecord }) {
  const [open, setOpen] = useState(false);
  const log = record.conversation_log?.trim() || "";

  const turns = useMemo(() => (log ? parseConversation(log) : []), [log]);

  // Rejected / hang-up calls have no meaningful conversation — show "-".
  if (!log || hasNoTranscript(record.call_outcome)) {
    return <span className="text-muted-foreground text-xs">-</span>;
  }

  const title = record.debtor_name?.trim() || record.phone_number || "บทสนทนา";

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs text-primary hover:text-primary"
        onClick={() => setOpen(true)}
      >
        <MessageSquareText className="w-3.5 h-3.5" />
        ดูบทสนทนา
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg gap-0 p-0 overflow-hidden">
          <DialogHeader className="space-y-2 border-b px-5 py-4">
            <DialogTitle className="text-base">{title}</DialogTitle>
            <DialogDescription className="sr-only">บทสนทนาของการโทร</DialogDescription>
            <div className="flex flex-wrap items-center gap-2">
              {getAICategoryBadge(record.ai_category)}
              {getConfidenceMeter(record.ai_confidence)}
              {record.phone_number && (
                <span className="font-mono text-xs text-muted-foreground">{record.phone_number}</span>
              )}
            </div>
          </DialogHeader>

          {record.audio_url && (
            <div className="border-b bg-muted/30 px-5 py-3">
              <ProxyAudioPlayer url={record.audio_url} className="w-full h-9" />
            </div>
          )}

          <ScrollArea className="max-h-[55vh]">
            <div className="space-y-3 px-5 py-4">
              {turns.length > 0 ? (
                turns.map((turn, i) => (
                  <div
                    key={i}
                    className={`flex items-end gap-2 ${turn.role === "user" ? "flex-row-reverse" : ""}`}
                  >
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                        turn.role === "user" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {turn.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                    </div>
                    <div
                      className={`flex max-w-[78%] flex-col gap-1 ${
                        turn.role === "user" ? "items-end" : "items-start"
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
                      {turn.time && (
                        <span className="px-1 text-[10px] tabular-nums text-muted-foreground">{turn.time}</span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                // No Bot/User markers detected — show the raw transcript verbatim.
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{log}</p>
              )}
            </div>
          </ScrollArea>

          {record.ai_reason && (
            <div className="border-t bg-muted/30 px-5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                เหตุผล AI
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{record.ai_reason}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
