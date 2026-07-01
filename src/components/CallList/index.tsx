import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ListPlus, RefreshCw, Settings, Clock } from "lucide-react";
import { useAdmin } from "@/contexts/AdminContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import type { FilterConditions } from "@/components/DebtorFilterPanel";
import { DEFAULT_SETTINGS, statusConfig } from "./constants";
import { exportCompletedCallsToExcel } from "./utils";
import type { CallAttempt } from "@/api/types";
import { useCallListQueries } from "./useCallListQueries";
import { useCallListMutations } from "./useCallListMutations";
import { useCallSession } from "./useCallSession";
import { StatsCards } from "./StatsCards";
import { ActiveSessionBanner } from "./ActiveSessionBanner";
import { ActionsBar } from "./ActionsBar";
import { CallQueueTable } from "./CallQueueTable";
import { AddToListDialog } from "./AddToListDialog";
import { SettingsDialog } from "./SettingsDialog";
import { PreviewDialog } from "./PreviewDialog";
import { FilterDialog } from "./FilterDialog";
import { TranscriptDialog } from "./TranscriptDialog";
import type { AutoDialSettings, CallSession, SortDirection, SortField, Template, TranscriptData } from "./types";
import { Badge } from "@/components/ui/badge";

// call_templates is not served by the Go API; no templates available here.
const templates: Template[] = [];

const CallList = () => {
  const { effectiveUserId } = useAdmin();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id;

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showFilterDialog, setShowFilterDialog] = useState(false);
  const [selectedDebtors, setSelectedDebtors] = useState<string[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [scheduledTime, setScheduledTime] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"pending" | "calling" | "completed">("pending");
  const [filterMatchCount, setFilterMatchCount] = useState<number | undefined>(undefined);
  const [isFilterLoading, setIsFilterLoading] = useState(false);
  const [showTranscriptDialog, setShowTranscriptDialog] = useState(false);
  const [transcriptData, setTranscriptData] = useState<TranscriptData | null>(null);

  // Sorting state
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [settings, setSettings] = useState<AutoDialSettings>(() => {
    try {
      const saved = localStorage.getItem("autoDialSettings");
      const savedVersion = Number(localStorage.getItem("autoDialSettingsVersion") ?? "0");

      if (!saved) {
        return DEFAULT_SETTINGS;
      }

      const parsed = JSON.parse(saved) as Partial<AutoDialSettings>;
      const mergedSettings = { ...DEFAULT_SETTINGS, ...parsed };

      if (savedVersion < 2) {
        return {
          ...mergedSettings,
          concurrentCalls: DEFAULT_SETTINGS.concurrentCalls,
        };
      }

      return mergedSettings;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  useEffect(() => {
    try {
      const savedVersion = Number(localStorage.getItem("autoDialSettingsVersion") ?? "0");
      if (savedVersion < 2) {
        setSettings((prev) => ({
          ...prev,
          concurrentCalls: DEFAULT_SETTINGS.concurrentCalls,
        }));
      }
    } catch {
      // Ignore storage parsing issues and keep in-memory defaults
    }
  }, []);

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem("autoDialSettings", JSON.stringify(settings));
    localStorage.setItem("autoDialSettingsVersion", "2");
  }, [settings]);

  const {
    callListItems,
    isLoading,
    refetch,
    allActiveDebtors,
    isLoadingAllActiveDebtors,
    phoneStats,
    todayCallCount,
    availableDebtors,
    activeSession,
    refetchSession,
    callAttemptsByItemId,
    refetchAttempts,
  } = useCallListQueries({ effectiveUserId, workspaceId });

  const {
    queuedDebtorIds,
    queueAllDebtorsMutation,
    queueUncalledDebtorsMutation,
    addToListMutation,
    removeFromListMutation,
    clearPendingMutation,
    clearCompletedMutation,
    clearAllMutation,
    retryFailedMutation,
    queueFilteredDebtorsMutation,
  } = useCallListMutations({
    effectiveUserId,
    workspaceId,
    callListItems,
    allActiveDebtors,
    phoneStats,
    selectedTemplateId,
    templates,
    selectedDebtors,
    scheduledTime,
    onAddToListSuccess: () => {
      setShowAddDialog(false);
      setSelectedDebtors([]);
      setScheduledTime("");
    },
    onQueueFilteredSuccess: () => {
      setShowFilterDialog(false);
      setFilterMatchCount(undefined);
    },
  });

  const {
    isWithinBusinessHours,
    startCalling,
    pauseCalling,
    resumeCalling,
    stopCalling,
    makeCall,
    handlePreviewCall,
    previewPayload,
    showPreviewDialog,
    setShowPreviewDialog,
  } = useCallSession({
    templates,
    workspaceId,
    settings,
    effectiveUserId,
    callListItems,
    activeSession,
    refetchSession,
  });

  // Handle viewing transcript
  const handleViewTranscript = (attempt: CallAttempt | null) => {
    setTranscriptData({
      conversationLog: attempt?.conversation_log || null,
      audioUrl: attempt?.audio_url || null,
    });
    setShowTranscriptDialog(true);
  };

  const getStatusBadge = (status: string) => {
    const config = statusConfig[status] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <Badge variant="secondary" className={`${config.color} gap-1 font-normal`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  // processCount / Completed Call in DB is success, failed, completed
  const pendingCount =
    callListItems?.filter((item) => item.status === "pending" || item.status === "retry_pending").length || 0;
  const callingCount = callListItems?.filter((item) => item.status === "calling").length || 0;
  const processedCount =
    callListItems?.filter(
      (item) => item.status === "completed" || item.status === "failed" || item.status === "success",
    ).length || 0;

  // Unified Analytics-style Stats (Matching AnalyticsStats.tsx)
  // GLOBAL EXCLUSION: drop "incomplete" rows before any computation (hanged_up IS counted)
  const visibleCallListItems = (callListItems || []).filter((item) => {
    const s = (item.status || "").toLowerCase();
    const r = ((item as unknown as { call_record?: { result_data?: { status?: string } } }).call_record?.result_data
      ?.status || "").toLowerCase();
    return s !== "incomplete" && r !== "incomplete";
  });

  const completedCallsStats = visibleCallListItems.filter(
    (item) => item.called_at || (item.status && item.status !== "pending" && item.status !== "retry_pending"),
  );

  const pickedUpCount = completedCallsStats.filter((item) => item.picked_up).length;

  const categorizedStats = completedCallsStats.map((item) => {
    const rawOutcome = (item.call_outcome || "").toLowerCase().replace(/_/g, " ");
    const resultDataStatus = (item as unknown as { call_record?: { result_data?: { status?: string } } }).call_record
      ?.result_data?.status;
    const rawStatus = (resultDataStatus || item.status || "").toLowerCase().replace(/_/g, " ");

    let resolved = "pending";

    if (rawOutcome.includes("confirmed")) resolved = "confirmed";
    else if (rawOutcome.includes("declined") || rawOutcome.includes("rejected")) resolved = "rejected";
    else if (rawOutcome === "no answer") resolved = "no_answer";
    else if (rawOutcome === "voicemail") resolved = "voicemail";
    else if (rawOutcome === "busy") resolved = "busy";
    else if (rawOutcome === "failed") resolved = "failed";
    else if (rawStatus === "hanged up" || rawOutcome === "hanged up") resolved = "hanged_up";
    else if (item.picked_up === false) resolved = "no_answer";
    else if (rawStatus === "no answer") resolved = "no_answer";
    else if (rawStatus === "busy") resolved = "busy";
    else if (rawStatus === "failed") resolved = "failed";
    else if (rawStatus === "rejected" || rawStatus === "declined") resolved = "rejected";
    else if (item.picked_up === true) resolved = "completed";

    return { ...item, resolved };
  });

  const noAnswerCount = categorizedStats.filter((i) => i.resolved === "no_answer").length;
  const busyCount = categorizedStats.filter((i) => i.resolved === "busy").length;
  const failedCount = categorizedStats.filter((i) => i.resolved === "failed").length;
  const rejectedCount = categorizedStats.filter((i) => i.resolved === "rejected").length;
  const voicemailCount = categorizedStats.filter((i) => i.resolved === "voicemail").length;
  const hangupCount = categorizedStats.filter((i) => i.resolved === "hanged_up").length;

  const incompleteCount = noAnswerCount + busyCount + failedCount + rejectedCount + voicemailCount + hangupCount;

  const pickupRate =
    completedCallsStats.length > 0 ? Math.round((pickedUpCount / completedCallsStats.length) * 100) : 0;

  const activeSessionConcurrentCalls =
    (activeSession as (CallSession & { settings?: Partial<AutoDialSettings> | null }) | null)?.settings
      ?.concurrentCalls ?? settings.concurrentCalls;

  const filteredItems = (callListItems || []).filter((item) => {
    switch (activeTab) {
      case "pending":
        return item.status === "pending" || item.status === "retry_pending";
      case "calling":
        return item.status === "calling";
      case "completed":
        return ["completed", "success", "confirmed", "declined", "no_answer", "failed", "no_response"].includes(
          item.status,
        );
      default:
        return false;
    }
  });

  // Sort handler
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  // Sorted and filtered items
  const filteredCallListItems = [...filteredItems].sort((a, b) => {
    let aVal: string | number | boolean | null = null;
    let bVal: string | number | boolean | null = null;

    switch (sortField) {
      case "phone":
        aVal = a.debtor?.phone_number || "";
        bVal = b.debtor?.phone_number || "";
        break;
      case "status":
        aVal = a.status;
        bVal = b.status;
        break;
      case "picked_up":
        aVal = a.picked_up === true ? 1 : a.picked_up === false ? 0 : -1;
        bVal = b.picked_up === true ? 1 : b.picked_up === false ? 0 : -1;
        break;
      case "call_outcome":
        aVal = a.call_outcome || "";
        bVal = b.call_outcome || "";
        break;
      case "called_at":
        aVal = a.called_at ? new Date(a.called_at).getTime() : 0;
        bVal = b.called_at ? new Date(b.called_at).getTime() : 0;
        break;
      case "created_at":
        aVal = new Date(a.created_at).getTime();
        bVal = new Date(b.created_at).getTime();
        break;
    }

    if (aVal === null || bVal === null) return 0;

    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDirection === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }

    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    }

    return 0;
  });

  const queueAllCount = (allActiveDebtors || []).filter((d) => !queuedDebtorIds.has(d.id)).length;

  // Count uncalled debtors (those with 0 calls)
  const uncalledCount = (allActiveDebtors || []).filter((d) => {
    if (queuedDebtorIds.has(d.id)) return false;
    const stats = phoneStats?.[d.phone_number];
    const totalCalls = (stats?.picked_up ?? 0) + (stats?.not_picked_up ?? 0);
    return totalCalls === 0;
  }).length;

  const toggleDebtorSelection = (id: string) => {
    setSelectedDebtors((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  };

  const selectAllDebtors = () => {
    if (selectedDebtors.length === availableDebtors?.length) {
      setSelectedDebtors([]);
    } else {
      setSelectedDebtors(availableDebtors?.map((d) => d.id) || []);
    }
  };

  // Handle filter apply - calculate match count only
  const handleCalculateFilterCount = async (conditions: FilterConditions) => {
    setIsFilterLoading(true);

    try {
      const filteredDebtors = (allActiveDebtors || []).filter((d) => {
        if (queuedDebtorIds.has(d.id)) return false;

        // Get debt from variables.Debt (with capital D) or fall back to total_debt
        const vars = d.variables || {};
        const debtValue = parseFloat(vars.Debt || vars.debt || "0") || (d.total_debt ?? 0);

        if (conditions.minDebt !== undefined && debtValue < conditions.minDebt) return false;
        if (conditions.maxDebt !== undefined && debtValue > conditions.maxDebt) return false;

        // Get counts from call_records stats (same as DebtorsList UI displays)
        const debtorStats = phoneStats?.[d.phone_number];
        const pickedUp = debtorStats?.picked_up ?? 0;
        const notPickedUp = debtorStats?.not_picked_up ?? 0;
        const accepted = debtorStats?.confirmed ?? 0;
        const rejected = debtorStats?.declined ?? 0;

        if (conditions.minPickedUp !== undefined && pickedUp < conditions.minPickedUp) return false;
        if (conditions.maxPickedUp !== undefined && pickedUp > conditions.maxPickedUp) return false;
        if (conditions.minNotPickedUp !== undefined && notPickedUp < conditions.minNotPickedUp) return false;
        if (conditions.maxNotPickedUp !== undefined && notPickedUp > conditions.maxNotPickedUp) return false;
        if (conditions.minAccepted !== undefined && accepted < conditions.minAccepted) return false;
        if (conditions.maxAccepted !== undefined && accepted > conditions.maxAccepted) return false;
        if (conditions.minRejected !== undefined && rejected < conditions.minRejected) return false;
        if (conditions.maxRejected !== undefined && rejected > conditions.maxRejected) return false;
        if (conditions.status && d.status !== conditions.status) return false;

        return true;
      });

      setFilterMatchCount(filteredDebtors.length);

      if (filteredDebtors.length === 0) {
        toast.info("No debtors match the filter criteria");
      }
    } finally {
      setIsFilterLoading(false);
    }
  };

  // Confirm selection and queue filtered debtors
  const handleConfirmFilterSelection = (conditions: FilterConditions) => {
    if (filterMatchCount && filterMatchCount > 0) {
      queueFilteredDebtorsMutation.mutate(conditions);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Call List</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Queue debtors for automated calling with retry logic</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSettingsDialog(true)}>
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </Button>
          <Button variant="outline" size="sm" onClick={() => { refetch(); refetchAttempts(); }}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowAddDialog(true)}>
            <ListPlus className="w-4 h-4 mr-2" />
            Add to List
          </Button>
        </div>
      </div>

      <StatsCards
        totalCallsMade={completedCallsStats.length}
        completeCount={pickedUpCount}
        pickupRate={pickupRate}
        incompleteCount={incompleteCount}
      />

      {/* Business Hours Warning */}
      {settings.businessHoursOnly && !isWithinBusinessHours() && (
        <Card className="border-warning/50 bg-warning/10">
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="w-5 h-5 text-warning" />
            <div>
              <p className="font-medium text-warning">Outside Business Hours</p>
              <p className="text-sm text-muted-foreground">
                Calls are only allowed{" "}
                {settings.businessDays
                  .map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d])
                  .join(", ")}{" "}
                between {settings.businessHoursStart} - {settings.businessHoursEnd}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {activeSession && (
        <ActiveSessionBanner
          activeSession={activeSession}
          settings={settings}
          callingCount={callingCount}
          activeSessionConcurrentCalls={activeSessionConcurrentCalls}
          onResume={resumeCalling}
          onPause={pauseCalling}
          onStop={stopCalling}
        />
      )}

      <ActionsBar
        activeSession={activeSession}
        settings={settings}
        isWithinBusinessHours={isWithinBusinessHours}
        callListItems={callListItems}
        pendingCount={pendingCount}
        processedCount={processedCount}
        failedCount={failedCount}
        queueAllCount={queueAllCount}
        uncalledCount={uncalledCount}
        isLoadingAllActiveDebtors={isLoadingAllActiveDebtors}
        onStartCalling={startCalling}
        onQueueAll={() => queueAllDebtorsMutation.mutate()}
        onQueueUncalled={() => queueUncalledDebtorsMutation.mutate()}
        onOpenFilterDialog={() => setShowFilterDialog(true)}
        onRetryFailed={() => retryFailedMutation.mutate()}
        isQueueAllPending={queueAllDebtorsMutation.isPending}
        isQueueUncalledPending={queueUncalledDebtorsMutation.isPending}
        isRetryFailedPending={retryFailedMutation.isPending}
        onClearPending={() => clearPendingMutation.mutate()}
        isClearPendingPending={clearPendingMutation.isPending}
        onClearCompleted={() => clearCompletedMutation.mutate()}
        isClearCompletedPending={clearCompletedMutation.isPending}
        onClearAll={() => clearAllMutation.mutate()}
        isClearAllPending={clearAllMutation.isPending}
      />

      <CallQueueTable
        activeTab={activeTab}
        onTabChange={setActiveTab}
        pendingCount={pendingCount}
        callingCount={callingCount}
        processedCount={processedCount}
        isLoading={isLoading}
        filteredCallListItems={filteredCallListItems}
        callAttemptsByItemId={callAttemptsByItemId}
        sortField={sortField}
        sortDirection={sortDirection}
        onSort={handleSort}
        getStatusBadge={getStatusBadge}
        onExportCompletedCalls={() => exportCompletedCallsToExcel(callListItems || [], callAttemptsByItemId)}
        onPreviewCall={handlePreviewCall}
        onViewTranscript={handleViewTranscript}
        onRemoveFromList={(id) => removeFromListMutation.mutate(id)}
        isRemovingFromList={removeFromListMutation.isPending}
      />

      <AddToListDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        templates={templates}
        selectedTemplateId={selectedTemplateId}
        onSelectedTemplateIdChange={setSelectedTemplateId}
        scheduledTime={scheduledTime}
        onScheduledTimeChange={setScheduledTime}
        availableDebtors={availableDebtors}
        selectedDebtors={selectedDebtors}
        onToggleDebtorSelection={toggleDebtorSelection}
        onSelectAllDebtors={selectAllDebtors}
        onCancel={() => {
          setShowAddDialog(false);
          setSelectedDebtors([]);
          setScheduledTime("");
        }}
        onSubmit={() => addToListMutation.mutate()}
        isSubmitting={addToListMutation.isPending}
      />

      <SettingsDialog
        open={showSettingsDialog}
        onOpenChange={setShowSettingsDialog}
        settings={settings}
        onSettingsChange={setSettings}
        todayCallCount={todayCallCount || 0}
      />

      <PreviewDialog
        open={showPreviewDialog}
        onOpenChange={setShowPreviewDialog}
        previewPayload={previewPayload}
        onMakeCallNow={() => {
          setShowPreviewDialog(false);
          if (previewPayload?.item) {
            makeCall(previewPayload.item);
            toast.info("Call initiated - check logs for result");
          }
        }}
      />

      <FilterDialog
        open={showFilterDialog}
        onOpenChange={setShowFilterDialog}
        onCalculateCount={handleCalculateFilterCount}
        onConfirmSelection={handleConfirmFilterSelection}
        onClose={() => {
          setShowFilterDialog(false);
          setFilterMatchCount(undefined);
        }}
        isLoading={isFilterLoading}
        isConfirming={queueFilteredDebtorsMutation.isPending}
        matchCount={filterMatchCount}
        totalAvailable={queueAllCount}
      />

      <TranscriptDialog
        open={showTranscriptDialog}
        onOpenChange={setShowTranscriptDialog}
        transcriptData={transcriptData}
      />
    </div>
  );
};

export default CallList;
