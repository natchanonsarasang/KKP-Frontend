import { useEffect, useState } from "react";
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
// conversation id. Botnoi logs carry no link to our debtors, so rows are
// identified by conversation id and time only.
export function CallHistoryTable() {
  const [rangeDays, setRangeDays] = useState<(typeof RANGE_OPTIONS)[number]>(7);
  const [selected, setSelected] = useState<BotnoiConversation | null>(null);

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
                <TableHead className="text-xs">Conversation ID</TableHead>
                <TableHead className="text-xs w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {conversations.map((conv) => (
                <TableRow key={conv.id}>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{conv.startedAt ?? "-"}</TableCell>
                  <TableCell className="font-mono text-xs">{conv.id}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-primary"
                      onClick={() => setSelected(conv)}
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

      <ConversationDialog conversation={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function ConversationDialog({ conversation, onClose }: { conversation: BotnoiConversation | null; onClose: () => void }) {
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
    <Dialog open={!!conversation} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Conversation</DialogTitle>
          <DialogDescription className="font-mono text-xs break-all">{conversation?.id}</DialogDescription>
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

function BotnoiAudioPlayer({ filePath, downloadName }: { filePath: string | null; downloadName: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [blobType, setBlobType] = useState("");
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!filePath) return;
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
  }, [filePath]);

  if (!filePath || failed) {
    return <p className="text-xs text-muted-foreground italic">No audio available</p>;
  }
  if (loading || !blobUrl) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        กำลังโหลดไฟล์เสียง...
      </div>
    );
  }

  const handleDownload = () => {
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

  return (
    <>
      <audio controls src={blobUrl} className="w-full" />
      <Button variant="outline" size="sm" className="w-full" onClick={handleDownload}>
        <Download className="w-4 h-4 mr-2" />
        Download Audio
      </Button>
    </>
  );
}
