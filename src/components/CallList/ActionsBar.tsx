import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Filter, Loader2, Play, RotateCcw, Trash2, Users, Zap } from "lucide-react";
import type { AutoDialSettings, CallListItem, CallSession } from "./types";

interface ActionsBarProps {
  activeSession: CallSession | null | undefined;
  settings: AutoDialSettings;
  isWithinBusinessHours: () => boolean;
  callListItems: CallListItem[] | undefined;
  pendingCount: number;
  processedCount: number;
  failedCount: number;
  queueAllCount: number;
  uncalledCount: number;
  isLoadingAllActiveDebtors: boolean;
  onStartCalling: () => void;
  onQueueAll: () => void;
  onQueueUncalled: () => void;
  onOpenFilterDialog: () => void;
  onRetryFailed: () => void;
  isQueueAllPending: boolean;
  isQueueUncalledPending: boolean;
  isRetryFailedPending: boolean;
  onClearPending: () => void;
  isClearPendingPending: boolean;
  onClearCompleted: () => void;
  isClearCompletedPending: boolean;
  onClearAll: () => void;
  isClearAllPending: boolean;
}

export function ActionsBar({
  activeSession,
  settings,
  isWithinBusinessHours,
  callListItems,
  pendingCount,
  processedCount,
  failedCount,
  queueAllCount,
  uncalledCount,
  isLoadingAllActiveDebtors,
  onStartCalling,
  onQueueAll,
  onQueueUncalled,
  onOpenFilterDialog,
  onRetryFailed,
  isQueueAllPending,
  isQueueUncalledPending,
  isRetryFailedPending,
  onClearPending,
  isClearPendingPending,
  onClearCompleted,
  isClearCompletedPending,
  onClearAll,
  isClearAllPending,
}: ActionsBarProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          {!activeSession ? (
            <>
              <Button
                onClick={onStartCalling}
                disabled={pendingCount === 0 || (settings.businessHoursOnly && !isWithinBusinessHours())}
                className={settings.testMode ? "bg-warning hover:bg-warning/90 text-warning-foreground" : ""}
              >
                <Play className="w-4 h-4 mr-2" />
                {settings.testMode ? "🧪 Test Calls" : "Start Calls"} ({pendingCount})
              </Button>

              <Button
                variant="secondary"
                onClick={onQueueAll}
                disabled={isQueueAllPending || isLoadingAllActiveDebtors || queueAllCount === 0}
              >
                {isQueueAllPending || isLoadingAllActiveDebtors ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4 mr-2" />
                )}
                Queue All ({isLoadingAllActiveDebtors ? "…" : queueAllCount})
              </Button>

              <Button
                variant="secondary"
                onClick={onQueueUncalled}
                disabled={isQueueUncalledPending || isLoadingAllActiveDebtors || uncalledCount === 0}
              >
                {isQueueUncalledPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Users className="w-4 h-4 mr-2" />
                )}
                Queue Uncalled ({isLoadingAllActiveDebtors ? "…" : uncalledCount})
              </Button>

              <Button variant="outline" onClick={onOpenFilterDialog} disabled={isLoadingAllActiveDebtors}>
                <Filter className="w-4 h-4 mr-2" />
                Smart Queue
              </Button>

              {failedCount > 0 && (
                <Button variant="outline" onClick={onRetryFailed} disabled={isRetryFailedPending}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Retry Failed ({failedCount})
                </Button>
              )}
            </>
          ) : null}

          {pendingCount > 0 && !activeSession && (
            <Button variant="outline" onClick={onClearPending} disabled={isClearPendingPending}>
              <Trash2 className="w-4 h-4 mr-2" />
              Clear Pending
            </Button>
          )}

          {processedCount > 0 && !activeSession && (
            <Button variant="outline" onClick={onClearCompleted} disabled={isClearCompletedPending}>
              <Trash2 className="w-4 h-4 mr-2" />
              Clear Completed
            </Button>
          )}

          {callListItems && callListItems.length > 0 && !activeSession && (
            <Button variant="destructive" onClick={onClearAll} disabled={isClearAllPending}>
              {isClearAllPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Clear All
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
