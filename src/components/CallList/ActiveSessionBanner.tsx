import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, Coins, Loader2, Phone, Play, Square, XCircle } from "lucide-react";
import type { AutoDialSettings, CallSession } from "./types";

interface ActiveSessionBannerProps {
  activeSession: CallSession;
  settings: AutoDialSettings;
  callingCount: number;
  activeSessionConcurrentCalls: number;
  onResume: () => void;
  onPause: () => void;
  onStop: () => void;
}

export function ActiveSessionBanner({
  activeSession,
  settings,
  callingCount,
  activeSessionConcurrentCalls,
  onResume,
  onPause,
  onStop,
}: ActiveSessionBannerProps) {
  const isDone = activeSession.completed_calls + activeSession.failed_calls >= activeSession.total_calls;

  return (
    <Card
      className={`border-primary/50 ${activeSession.status === "paused" ? "bg-warning/10" : settings.testMode ? "bg-warning/20 border-warning" : "bg-primary/10"}`}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {activeSession.status === "running" ? (
              isDone ? (
                <CheckCircle className="w-5 h-5 text-success" />
              ) : (
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
              )
            ) : activeSession.status === "stopping" ? (
              <Square className="w-5 h-5 text-warning" />
            ) : (
              <Clock className="w-5 h-5 text-warning" />
            )}
            <div>
              <p className="font-medium flex items-center gap-2">
                {activeSession.status === "running"
                  ? isDone
                    ? "Session Completed"
                    : "Calls in Progress"
                  : activeSession.status === "stopping"
                    ? "Stopping..."
                    : "Paused"}
                {settings.testMode && (
                  <Badge variant="outline" className="bg-warning/20 text-warning border-warning text-xs">
                    🧪 TEST MODE
                  </Badge>
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {activeSession.error_message ||
                  (isDone
                    ? "All planned calls have been processed."
                    : settings.testMode
                      ? "Simulating calls - no real calls being made"
                      : "Processing calls in background...")}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {activeSession.status === "paused" && (
              <>
                <Button size="sm" onClick={onResume}>
                  <Play className="w-4 h-4 mr-2" />
                  Resume
                </Button>
                <Button size="sm" variant="destructive" onClick={onStop}>
                  <XCircle className="w-4 h-4 mr-2" />
                  Stop
                </Button>
              </>
            )}
            {activeSession.status === "running" && (
              <>
                {isDone ? (
                  <Button size="sm" variant="outline" onClick={onStop}>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Finish Session
                  </Button>
                ) : (
                  <>
                    <Button size="sm" variant="secondary" onClick={onPause}>
                      <Square className="w-4 h-4 mr-2" />
                      Pause
                    </Button>
                    <Button size="sm" variant="destructive" onClick={onStop}>
                      <XCircle className="w-4 h-4 mr-2" />
                      Stop
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">
              {activeSession.completed_calls + activeSession.failed_calls} / {activeSession.total_calls}
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{
                width: `${
                  activeSession.total_calls > 0
                    ? ((activeSession.completed_calls + activeSession.failed_calls) / activeSession.total_calls) * 100
                    : 0
                }%`,
              }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-4 text-sm">
          {activeSession.status === "running" && callingCount > 0 && (
            <div className="flex items-center gap-1.5 bg-primary/20 px-3 py-1.5 rounded-md border border-primary/30">
              <Phone className="w-4 h-4 text-primary animate-pulse" />
              <span className="font-bold text-primary tabular-nums">{callingCount} calling</span>
              <span className="text-muted-foreground">/ {activeSessionConcurrentCalls} max</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4 text-success" />
            <span className="font-medium">{activeSession.completed_calls}</span>
            <span className="text-muted-foreground">completed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Phone className="w-4 h-4 text-primary" />
            <span className="font-medium">{activeSession.confirmed_calls}</span>
            <span className="text-muted-foreground">confirmed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <XCircle className="w-4 h-4 text-destructive" />
            <span className="font-medium">{activeSession.failed_calls}</span>
            <span className="text-muted-foreground">failed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Coins className="w-4 h-4 text-warning" />
            <span className="font-medium">{activeSession.tokens_used}</span>
            <span className="text-muted-foreground">tokens used</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
