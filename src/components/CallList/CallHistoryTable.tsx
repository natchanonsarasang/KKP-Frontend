import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { AlertCircle, Download, FileText, History, Loader2, RefreshCw, Volume2 } from "lucide-react";
import { toast } from "sonner";
import {
  getBotnoiAudioBlobUrl,
  listBotnoiConversations,
  parseBotnoiLog,
  readBotnoiLog,
  type BotnoiConversation,
} from "@/api/botnoiLogs";
import { downloadConversationAsText } from "./utils";

const RANGE_OPTIONS = [7, 30, 90] as const;

// Botnoi conversation history for the configured agent, one row per
// conversation. Botnoi logs carry no link to our debtors, so rows show the
// call time only.
export function CallHistoryTable() {
  const [rangeDays, setRangeDays] = useState<(typeof RANGE_OPTIONS)[number]>(7);
  const [selected, setSelected] = useState<BotnoiConversation | null>(null);
  // Kept separate from `selected` so the dialog keeps its content while the
  // close animation plays, instead of collapsing to an empty box.
  const [dialogOpen, setDialogOpen] = useState(false);

  const today = new Date();
  const startDate = format(subDays(today, rangeDays), "yyyy/MM/dd");
  const endDate = format(today, "yyyy/MM/dd");

  const { data: conversations, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["botnoi-conversations", startDate, endDate],
    queryFn: () => listBotnoiConversations(startDate, endDate),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-muted p-1 rounded-lg">
          {RANGE_OPTIONS.map((days) => (
            <button
              key={days}
              onClick={() => setRangeDays(days)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                rangeDays === days ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {days} วัน
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="text-center py-12 text-muted-foreground">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p>Failed to load call history</p>
          <p className="text-sm">{(error as Error).message}</p>
        </div>
      ) : !conversations || conversations.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <History className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p>No call history in the last {rangeDays} days</p>
          <p className="text-sm">Conversations from the Botnoi voicebot will appear here</p>
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">เวลา</TableHead>
                <TableHead className="text-xs">เสียง</TableHead>
                <TableHead className="text-xs w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {conversations.map((conv) => (
                <TableRow key={conv.id}>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{conv.startedAt ?? "-"}</TableCell>
                  <TableCell>
                    <BotnoiAudioPlayer filePath={conv.logPath} downloadName={`call_${conv.id}`} compact />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-primary"
                      onClick={() => {
                        setSelected(conv);
                        setDialogOpen(true);
                      }}
                      title="View conversation"
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ConversationDialog conversation={selected} open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}

function ConversationDialog({
  conversation,
  open,
  onClose,
}: {
  conversation: BotnoiConversation | null;
  open: boolean;
  onClose: () => void;
}) {
  const logPath = conversation?.logPath ?? null;
  const { data: log, isLoading } = useQuery({
    queryKey: ["botnoi-log", logPath],
    queryFn: () => readBotnoiLog(logPath!),
    enabled: !!logPath,
  });
  const turns = log === undefined ? null : parseBotnoiLog(log);
  // read_log answers { key, text }; download the raw transcript text when present.
  const logText =
    log === undefined
      ? null
      : typeof (log as { text?: unknown })?.text === "string"
        ? (log as { text: string }).text
        : typeof log === "string"
          ? log
          : JSON.stringify(log, null, 2);

  return (
    <Dialog open={open && !!conversation} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Conversation</DialogTitle>
          <DialogDescription className="text-xs">{conversation?.startedAt ?? ""}</DialogDescription>
        </DialogHeader>
        {conversation && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Chat log</Label>
              <div className="bg-muted/30 rounded-lg p-3 min-h-[150px] max-h-[400px] overflow-y-auto space-y-3">
                {!logPath ? (
                  <p className="text-sm text-muted-foreground italic text-center py-8">No chat log available</p>
                ) : isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : turns ? (
                  turns.map((turn, idx) => {
                    const isUser = turn.role === "user";
                    return (
                      <div key={idx} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                            isUser
                              ? "bg-primary text-primary-foreground rounded-br-sm"
                              : "bg-muted text-foreground rounded-bl-sm"
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">{turn.text}</p>
                          {turn.time && (
                            <p className={`text-[10px] mt-1 ${isUser ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                              {turn.time}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <pre className="text-xs whitespace-pre-wrap break-all">{JSON.stringify(log, null, 2)}</pre>
                )}
              </div>
              {logText && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => downloadConversationAsText(logText, `conversation_${conversation.id}.txt`)}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Download Text
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Volume2 className="w-4 h-4" />
                Audio Recording
              </Label>
              <BotnoiAudioPlayer filePath={conversation.logPath} downloadName={`call_${conversation.id}`} />
            </div>

            <Button variant="outline" className="w-full" onClick={onClose}>
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Pause every other <audio> on the page so only one recording plays at a time.
function pauseOtherAudio(current: HTMLAudioElement) {
  document.querySelectorAll("audio").forEach((el) => {
    if (el !== current) el.pause();
  });
}

// The recording player used in both the conversation dialog and the table rows
// (`compact`). Recordings are ~1 MB each, so a compact (table row) player waits
// until it is scrolled into view before fetching.
function BotnoiAudioPlayer({
  filePath,
  downloadName,
  compact = false,
}: {
  filePath: string | null;
  downloadName: string;
  compact?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(!compact);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [blobType, setBlobType] = useState("");
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (inView || !containerRef.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        observer.disconnect();
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [inView]);

  useEffect(() => {
    if (!filePath || !inView) return;
    let active = true;
    let created: string | null = null;

    setLoading(true);
    setFailed(false);
    setBlobUrl(null);

    getBotnoiAudioBlobUrl(filePath)
      .then(({ url, type }) => {
        if (!active) {
          URL.revokeObjectURL(url);
          return;
        }
        created = url;
        setBlobUrl(url);
        setBlobType(type);
      })
      .catch(() => active && setFailed(true))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [filePath, inView]);

  const handleDownload = () => {
    if (!blobUrl) return;
    try {
      const ext = blobType.includes("mpeg") || blobType.includes("mp3") ? "mp3" : "wav";
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${downloadName}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error("Audio download error:", err);
      toast.error("Failed to download audio");
    }
  };

  let content: ReactNode;
  if (!filePath || failed) {
    content = <p className="text-xs text-muted-foreground italic">No audio available</p>;
  } else if (loading || !blobUrl) {
    content = (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        กำลังโหลดไฟล์เสียง...
      </div>
    );
  } else if (compact) {
    content = (
      <>
        <audio controls src={blobUrl} className="h-8 w-[260px]" onPlay={(e) => pauseOtherAudio(e.currentTarget)} />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-primary"
          onClick={handleDownload}
          title="Download Audio"
        >
          <Download className="w-3.5 h-3.5" />
        </Button>
      </>
    );
  } else {
    content = (
      <>
        <audio controls src={blobUrl} className="w-full" onPlay={(e) => pauseOtherAudio(e.currentTarget)} />
        <Button variant="outline" size="sm" className="w-full" onClick={handleDownload}>
          <Download className="w-4 h-4 mr-2" />
          Download Audio
        </Button>
      </>
    );
  }

  return (
    <div ref={containerRef} className={compact ? "flex items-center gap-1" : "space-y-2"}>
      {content}
    </div>
  );
}
