import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toThaiPhonetic, shouldUsePhonetic } from "@/lib/thaiPhonetic";
import { maskPhoneNumber } from "@/lib/formatPhone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Phone,
  Plus,
  Loader2,
  Trash2,
  Play,
  Square,
  Clock,
  CheckCircle,
  XCircle,
  PhoneOff,
  AlertCircle,
  Users,
  RefreshCw,
  Calendar,
  ListPlus,
  Coins,
  Settings,
  RotateCcw,
  Zap,
  Filter,
  FileText,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  Volume2,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { resolveMainStatus, resolveSubStatus, resolveLatestStatusLabel } from "@/lib/callStatuses";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAdmin } from "@/contexts/AdminContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { DebtorFilterPanel, FilterConditions } from "@/components/DebtorFilterPanel";

interface Debtor {
  id: string;
  phone_number: string;
  name: string | null;
  last_name: string | null;
  total_debt: number;
  due_date: string | null;
  status: string;
  contact_attempts: number;
  picked_up_count: number;
  not_picked_up_count: number;
  accept_count: number;
  reject_count: number;
  other_count: number;
  last_contact_at: string | null;
  variables: Record<string, string> | null;
}

interface CallListItem {
  id: string;
  debtor_id: string;
  user_id: string;
  template_id: string | null;
  scheduled_at: string | null;
  called_at: string | null;
  status: string;
  call_record_id: string | null;
  call_outcome: string | null;
  picked_up: boolean | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  ai_category?: string | null;
  debtor?: Debtor;
}

interface Template {
  id: string;
  template_id: string | null;
  org_name: string;
  message: string;
  is_system_default: boolean;
}

interface CallSession {
  id: string;
  user_id: string;
  workspace_id: string;
  status: string;
  total_calls: number;
  completed_calls: number;
  failed_calls: number;
  confirmed_calls: number;
  tokens_used: number;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
}

interface AutoDialSettings {
  maxRetries: number;
  dailyLimit: number;
  businessHoursOnly: boolean;
  businessHoursStart: string;
  businessHoursEnd: string;
  businessDays: number[]; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  delayBetweenCalls: number;
  concurrentCalls: number;
  testMode: boolean; // Mock mode - simulates calls without hitting real API
  timezoneOffset: number; // UTC offset in minutes (e.g., +7 hours = 420)
  interruptible: boolean; // Whether the bot can be interrupted
}

const DEFAULT_SETTINGS: AutoDialSettings = {
  maxRetries: 2,
  dailyLimit: 500,
  businessHoursOnly: true,
  businessHoursStart: "09:00",
  businessHoursEnd: "18:00",
  businessDays: [1, 2, 3, 4, 5], // Mon-Fri by default
  delayBetweenCalls: 5, // Default to 5 seconds for testing
  concurrentCalls: 5,
  testMode: false,
  timezoneOffset: -new Date().getTimezoneOffset(), // Auto-detect user's timezone
  interruptible: false,
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  pending: { label: "Pending", color: "bg-muted text-muted-foreground", icon: Clock },
  calling: { label: "Calling", color: "bg-primary/10 text-primary", icon: Phone },
  completed: { label: "Completed", color: "bg-success/10 text-success", icon: CheckCircle },
  success: { label: "Success", color: "bg-success/10 text-success", icon: CheckCircle },
  confirmed: { label: "Confirmed", color: "bg-success/10 text-success", icon: CheckCircle },
  declined: { label: "Declined", color: "bg-destructive/10 text-destructive", icon: XCircle },
  no_answer: { label: "No Answer", color: "bg-muted text-muted-foreground", icon: PhoneOff },
  failed: { label: "Failed", color: "bg-destructive/10 text-destructive", icon: AlertCircle },
  no_response: { label: "No Response", color: "bg-warning/10 text-warning", icon: Clock },
  retry_pending: { label: "Retry Pending", color: "bg-warning/10 text-warning", icon: RotateCcw },
};

// Sort types and icon component (moved outside to prevent recreation on each render)
type SortField = "phone" | "status" | "picked_up" | "call_outcome" | "called_at" | "created_at";
type SortDirection = "asc" | "desc";

const CallList = () => {
  const queryClient = useQueryClient();
  const { effectiveUserId, isAdmin, selectedUserId } = useAdmin();
  const { currentWorkspace } = useWorkspace();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showFilterDialog, setShowFilterDialog] = useState(false);
  const [selectedDebtors, setSelectedDebtors] = useState<string[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [scheduledTime, setScheduledTime] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"pending" | "calling" | "completed">("pending");
  // Unused legacy state - kept for backwards compatibility but session-based now
  const stopAutoDialRef = useRef(false);
  const [filterMatchCount, setFilterMatchCount] = useState<number | undefined>(undefined);
  const [isFilterLoading, setIsFilterLoading] = useState(false);
  const [previewPayload, setPreviewPayload] = useState<{
    phone: string;
    templateId: string;
    message: string;
    item: CallListItem;
  } | null>(null);
  const [nextBatchCountdown, setNextBatchCountdown] = useState<number>(0);
  const countdownIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [showTranscriptDialog, setShowTranscriptDialog] = useState(false);
  const [transcriptData, setTranscriptData] = useState<{
    conversationLog: string | null;
    audioUrl: string | null;
  } | null>(null);

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

  // Realtime subscription for call_list_items updates
  useEffect(() => {
    if (!currentWorkspace?.id) return;

    const channel = supabase
      .channel("call-list-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "call_list_items",
          filter: `workspace_id=eq.${currentWorkspace.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["call-list-items"] });
          queryClient.invalidateQueries({ queryKey: ["active-call-session"] });
          queryClient.invalidateQueries({ queryKey: ["call-tokens"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentWorkspace?.id, queryClient]);

  // Helper to parse notes field (could be JSON with audio_url/conversation_log or legacy plain URL)
  const parseNotesData = useCallback(
    (notes: string | null): { audioUrl: string | null; conversationLog: string | null } => {
      if (!notes) return { audioUrl: null, conversationLog: null };

      // Try to parse as JSON first (new format)
      try {
        const parsed = JSON.parse(notes);
        return {
          audioUrl: parsed.audio_url || null,
          conversationLog: parsed.conversation_log || parsed.transcription || null,
        };
      } catch {
        // Legacy format: notes is just the audio URL
        if (notes.startsWith("http")) {
          return { audioUrl: notes, conversationLog: null };
        }
        return { audioUrl: null, conversationLog: null };
      }
    },
    [],
  );

  // Handle viewing transcript
  const handleViewTranscript = useCallback(
    (notes: string | null) => {
      const data = parseNotesData(notes);
      setTranscriptData({ conversationLog: data.conversationLog, audioUrl: data.audioUrl });
      setShowTranscriptDialog(true);
    },
    [parseNotesData],
  );

  // Check if currently within business hours and days
  const isWithinBusinessHours = useCallback(() => {
    if (!settings.businessHoursOnly) return true;

    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday

    // Check if today is a business day
    if (!settings.businessDays.includes(currentDay)) return false;

    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentTime = hours * 60 + minutes;

    const [startHour, startMin] = settings.businessHoursStart.split(":").map(Number);
    const [endHour, endMin] = settings.businessHoursEnd.split(":").map(Number);
    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    return currentTime >= startTime && currentTime <= endTime;
  }, [settings]);

  // Fetch call list items with debtor info (with pagination to bypass 1000 row limit)
  const {
    data: callListItems,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["call-list-items", effectiveUserId, currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return [] as CallListItem[];

      // Paginate to fetch all call list items
      let allItems: CallListItem[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from("call_list_items")
          .select("*")
          .eq("workspace_id", currentWorkspace.id)
          // Exclude "incomplete" entirely from the system (hanged_up rows ARE included)
          .not("status", "in", '("incomplete")')
          .order("created_at", { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        // Filter by effective user if admin is impersonating
        if (effectiveUserId) {
          query = query.eq("user_id", effectiveUserId);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (data && data.length > 0) {
          // Defensive client-side filter in case any leak through
          const filtered = data.filter((it: any) => it.status !== "incomplete");
          allItems = [...allItems, ...filtered];
          page++;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      console.log(`Total call list items fetched: ${allItems.length}`);

      // Fetch debtor info for each item (in chunks to avoid 1000-row and payload limits)
      const debtorIds = [...new Set(allItems.map((item) => item.debtor_id))];
      if (debtorIds.length === 0) return [] as CallListItem[];

      const chunkSize = 500;
      let allDebtors: Debtor[] = [];

      for (let i = 0; i < debtorIds.length; i += chunkSize) {
        const chunk = debtorIds.slice(i, i + chunkSize);
        const { data: debtorsChunk, error: debtorsError } = await supabase
          .from("debtors")
          .select(
            "id, phone_number, name, last_name, total_debt, due_date, status, contact_attempts, picked_up_count, not_picked_up_count, accept_count, reject_count, other_count, last_contact_at, variables",
          )
          .in("id", chunk);

        if (debtorsError) {
          console.error("Error fetching debtors chunk:", debtorsError);
          throw debtorsError;
        }
        if (debtorsChunk?.length) {
          console.log(`Fetched ${debtorsChunk.length} debtors for chunk ${i / chunkSize + 1}`);
          allDebtors = allDebtors.concat(debtorsChunk as Debtor[]);
        }
      }

      console.log(`Total debtors fetched: ${allDebtors.length} for ${debtorIds.length} unique IDs`);
      const debtorMap = new Map(allDebtors.map((d) => [d.id, d]));

      const result = allItems.map((item) => ({
        ...item,
        debtor: debtorMap.get(item.debtor_id),
      })) as CallListItem[];

      // Log a sample to debug
      if (result.length > 0) {
        console.log("Sample call list item with debtor:", JSON.stringify(result[0], null, 2));
      }

      return result;
    },
    enabled: !!effectiveUserId && !!currentWorkspace?.id,
    staleTime: 0, // Always fetch fresh data
  });

  // Fetch all active debtors for bulk queue (with pagination to bypass 1000 row limit)
  const { data: allActiveDebtors, isLoading: isLoadingAllActiveDebtors } = useQuery({
    queryKey: ["all-active-debtors", effectiveUserId, currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return [] as Debtor[];

      let allDebtors: Debtor[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from("debtors")
          .select("*")
          .eq("workspace_id", currentWorkspace.id)
          .in("status", ["active", "pending", "negotiating"])
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (effectiveUserId) {
          query = query.eq("user_id", effectiveUserId);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (data && data.length > 0) {
          allDebtors = [...allDebtors, ...(data as Debtor[])];
          page++;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      return allDebtors;
    },
    enabled: !!effectiveUserId && !!currentWorkspace?.id,
  });

  // Fetch call records stats for filtering (same logic as DebtorsList)
  const { data: phoneStats } = useQuery({
    queryKey: ["call-records-stats-for-filter", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id)
        return {} as Record<string, { picked_up: number; not_picked_up: number; confirmed: number; declined: number }>;

      const { data, error } = await supabase
        .from("call_records")
        .select("phone_number, status")
        .eq("workspace_id", currentWorkspace.id)
        .not("status", "in", '("hanged_up","incomplete")');

      if (error) throw error;

      const stats: Record<
        string,
        {
          picked_up: number;
          not_picked_up: number;
          confirmed: number;
          declined: number;
        }
      > = {};

      data.forEach((record) => {
        if (!stats[record.phone_number]) {
          stats[record.phone_number] = {
            picked_up: 0,
            not_picked_up: 0,
            confirmed: 0,
            declined: 0,
          };
        }

        if (record.status === "confirmed") {
          stats[record.phone_number].confirmed++;
          stats[record.phone_number].picked_up++;
        } else if (record.status === "declined") {
          stats[record.phone_number].declined++;
          stats[record.phone_number].picked_up++;
        } else if (record.status === "no_response" || record.status === "completed") {
          stats[record.phone_number].picked_up++;
        } else if (record.status === "no_answer" || record.status === "failed") {
          stats[record.phone_number].not_picked_up++;
        }
      });
      return stats;
    },
    enabled: !!currentWorkspace?.id,
  });

  // Get today's call count for daily limit
  const { data: todayCallCount } = useQuery({
    queryKey: ["today-call-count", effectiveUserId, currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return 0;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let query = supabase
        .from("call_list_items")
        .select("id", { count: "exact" })
        .eq("workspace_id", currentWorkspace.id)
        .not("called_at", "is", null)
        .gte("called_at", today.toISOString());

      if (effectiveUserId) {
        query = query.eq("user_id", effectiveUserId);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    enabled: !!effectiveUserId && !!currentWorkspace?.id,
  });

  // Fetch available debtors (not already in pending call list)
  const { data: availableDebtors } = useQuery({
    queryKey: ["available-debtors-for-call", effectiveUserId, currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return [] as Debtor[];

      let pendingQuery = supabase
        .from("call_list_items")
        .select("debtor_id")
        .in("status", ["pending", "retry_pending", "calling"])
        .eq("workspace_id", currentWorkspace.id);

      if (effectiveUserId) {
        pendingQuery = pendingQuery.eq("user_id", effectiveUserId);
      }

      const { data: pendingItems } = await pendingQuery;
      const pendingDebtorIds = pendingItems?.map((item) => item.debtor_id) || [];

      let query = supabase
        .from("debtors")
        .select("*")
        .eq("workspace_id", currentWorkspace.id)
        .in("status", ["active", "pending", "negotiating"]);

      if (effectiveUserId) {
        query = query.eq("user_id", effectiveUserId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Filter out debtors already in pending list
      return (data as Debtor[]).filter((d) => !pendingDebtorIds.includes(d.id));
    },
    enabled: !!effectiveUserId && !!currentWorkspace?.id,
  });

  // Fetch templates
  const { data: templates } = useQuery({
    queryKey: ["templates-for-call-list", effectiveUserId, currentWorkspace?.id],
    queryFn: async () => {
      let query = supabase
        .from("call_templates")
        .select("*")
        .not("template_id", "is", null)
        .order("created_at", { ascending: false });

      // For templates, also show system defaults
      if (effectiveUserId) {
        query = query.or(`user_id.eq.${effectiveUserId},is_system_default.eq.true`);
      }

      // Filter by workspace if available
      if (currentWorkspace?.id) {
        query = query.or(`workspace_id.eq.${currentWorkspace.id},is_system_default.eq.true`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Template[];
    },
    enabled: !!effectiveUserId,
  });

  // Fetch active call session for this workspace
  const { data: activeSession, refetch: refetchSession } = useQuery({
    queryKey: ["active-call-session", effectiveUserId, currentWorkspace?.id],
    queryFn: async () => {
      if (!effectiveUserId || !currentWorkspace?.id) return null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("call_sessions") as any)
        .select("*")
        .eq("user_id", effectiveUserId)
        .eq("workspace_id", currentWorkspace.id)
        .in("status", ["running", "stopping", "paused"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as CallSession | null;
    },
    enabled: !!effectiveUserId && !!currentWorkspace?.id,
    refetchInterval: 2000, // Poll every 2 seconds for updates
  });

  // Countdown timer for next batch
  useEffect(() => {
    // Clear any existing interval
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    // Cleanup countdown interval on unmount
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [activeSession?.status, settings.delayBetweenCalls]);

  // Fetch user tokens for the effective user
  const { data: userTokens, refetch: refetchTokens } = useQuery({
    queryKey: ["call-tokens", effectiveUserId],
    queryFn: async () => {
      if (!effectiveUserId) return null;

      const { data, error } = await supabase
        .from("call_tokens")
        .select("tokens")
        .eq("user_id", effectiveUserId)
        .maybeSingle();

      if (error) throw error;
      return data?.tokens ?? 0;
    },
    enabled: !!effectiveUserId,
  });

  // Queue all active debtors mutation
  // NOTE: Daily limit applies to CALLING, not QUEUEING. We allow queueing all, then startCalling will respect daily limit.
  const queueAllDebtorsMutation = useMutation({
    mutationFn: async () => {
      const targetUserId = effectiveUserId;
      if (!targetUserId) throw new Error("Not authenticated");
      if (!currentWorkspace?.id) throw new Error("No workspace selected");

      // Get debtors not already in pending queue
      const queuedDebtorIds = new Set(
        (callListItems || [])
          .filter((item) => ["pending", "retry_pending", "calling"].includes(item.status))
          .map((item) => item.debtor_id),
      );

      const debtorsToQueue = (allActiveDebtors || []).filter((d) => !queuedDebtorIds.has(d.id));

      if (debtorsToQueue.length === 0) {
        throw new Error("No new debtors to queue");
      }

      const preferredTemplate = selectedTemplateId ? templates?.find((t) => t.id === selectedTemplateId) : undefined;

      const defaultTemplate =
        preferredTemplate ||
        templates?.find((t) => !t.is_system_default) ||
        templates?.find((t) => t.is_system_default) ||
        templates?.[0];

      // Insert in chunks to avoid request size limits
      const chunkSize = 500;
      let inserted = 0;

      for (let i = 0; i < debtorsToQueue.length; i += chunkSize) {
        const chunk = debtorsToQueue.slice(i, i + chunkSize);
        const items = chunk.map((debtor) => ({
          debtor_id: debtor.id,
          user_id: targetUserId,
          workspace_id: currentWorkspace.id,
          template_id: defaultTemplate?.id || null,
          status: "pending",
          phone_number: debtor.phone_number,
        }));

        const { error } = await supabase.from("call_list_items").insert(items);
        if (error) throw error;
        inserted += items.length;
      }

      return inserted;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["call-list-items"] });
      queryClient.invalidateQueries({ queryKey: ["available-debtors-for-call"] });
      toast.success(`Queued ${count} debtors for calling`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Queue only uncalled debtors (those with 0 calls)
  const queueUncalledDebtorsMutation = useMutation({
    mutationFn: async () => {
      const targetUserId = effectiveUserId;
      if (!targetUserId) throw new Error("Not authenticated");
      if (!currentWorkspace?.id) throw new Error("No workspace selected");

      // Get debtors not already in pending queue
      const queuedDebtorIds = new Set(
        (callListItems || [])
          .filter((item) => ["pending", "retry_pending", "calling"].includes(item.status))
          .map((item) => item.debtor_id),
      );

      // Filter to only debtors with 0 calls
      const debtorsToQueue = (allActiveDebtors || []).filter((d) => {
        if (queuedDebtorIds.has(d.id)) return false;
        const stats = phoneStats?.[d.phone_number];
        const totalCalls = (stats?.picked_up ?? 0) + (stats?.not_picked_up ?? 0);
        return totalCalls === 0;
      });

      if (debtorsToQueue.length === 0) {
        throw new Error("No uncalled debtors to queue");
      }

      const preferredTemplate = selectedTemplateId ? templates?.find((t) => t.id === selectedTemplateId) : undefined;

      const defaultTemplate =
        preferredTemplate ||
        templates?.find((t) => !t.is_system_default) ||
        templates?.find((t) => t.is_system_default) ||
        templates?.[0];

      // Insert in chunks to avoid request size limits
      const chunkSize = 500;
      let inserted = 0;

      for (let i = 0; i < debtorsToQueue.length; i += chunkSize) {
        const chunk = debtorsToQueue.slice(i, i + chunkSize);
        const items = chunk.map((debtor) => ({
          debtor_id: debtor.id,
          user_id: targetUserId,
          workspace_id: currentWorkspace.id,
          template_id: defaultTemplate?.id || null,
          status: "pending",
          phone_number: debtor.phone_number,
        }));

        const { error } = await supabase.from("call_list_items").insert(items);
        if (error) throw error;
        inserted += items.length;
      }

      return inserted;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["call-list-items"] });
      queryClient.invalidateQueries({ queryKey: ["available-debtors-for-call"] });
      toast.success(`Queued ${count} uncalled debtors`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
  // Add debtors to call list
  const addToListMutation = useMutation({
    mutationFn: async () => {
      const targetUserId = effectiveUserId;
      if (!targetUserId) throw new Error("Not authenticated");
      if (!currentWorkspace?.id) throw new Error("No workspace selected");

      const items = selectedDebtors.map((debtorId) => ({
        debtor_id: debtorId,
        user_id: targetUserId,
        workspace_id: currentWorkspace.id,
        template_id: selectedTemplateId || null,
        scheduled_at: scheduledTime ? new Date(scheduledTime).toISOString() : null,
        status: "pending",
      }));

      const { error } = await supabase.from("call_list_items").insert(items);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["call-list-items"] });
      queryClient.invalidateQueries({ queryKey: ["available-debtors-for-call"] });
      toast.success(`Added ${selectedDebtors.length} contacts to call list`);
      setShowAddDialog(false);
      setSelectedDebtors([]);
      setScheduledTime("");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to add to call list");
    },
  });

  // Remove from call list
  const removeFromListMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("call_list_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["call-list-items"] });
      queryClient.invalidateQueries({ queryKey: ["available-debtors-for-call"] });
      toast.success("Removed from call list");
    },
    onError: () => {
      toast.error("Failed to remove");
    },
  });

  // Queue-only statuses — these are the active queue. Completed/historical
  // statuses are intentionally excluded so clearing the queue never wipes
  // Latest Call Status / call history shown on the Debtor List.
  const QUEUE_STATUSES = ["pending", "retry_pending", "calling", "scheduled"] as const;

  // Clear pending items only
  const clearPendingMutation = useMutation({
    mutationFn: async () => {
      if (!currentWorkspace?.id) throw new Error("No workspace selected");
      const { error } = await supabase
        .from("call_list_items")
        .delete()
        .eq("status", "pending")
        .eq("workspace_id", currentWorkspace.id)
        .eq("user_id", effectiveUserId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["call-list-items"] });
      queryClient.invalidateQueries({ queryKey: ["available-debtors-for-call"] });
      queryClient.invalidateQueries({ queryKey: ["all-active-debtors"] });
      toast.success("Cleared pending calls");
    },
  });

  // Clear completed items (explicit user action to wipe history rows)
  const clearCompletedMutation = useMutation({
    mutationFn: async () => {
      if (!currentWorkspace?.id) throw new Error("No workspace selected");
      const { error } = await supabase
        .from("call_list_items")
        .delete()
        .in("status", ["completed", "confirmed", "declined", "no_answer", "failed", "no_response", "success"])
        .eq("workspace_id", currentWorkspace.id)
        .eq("user_id", effectiveUserId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["call-list-items"] });
      queryClient.invalidateQueries({ queryKey: ["available-debtors-for-call"] });
      queryClient.invalidateQueries({ queryKey: ["debtor-latest-call-status"] });
      toast.success("Cleared completed calls");
    },
  });

  // Clear the active queue only. Preserves completed/failed history so the
  // Debtor List "Latest Call Status" remains intact.
  const clearAllMutation = useMutation({
    mutationFn: async () => {
      if (!currentWorkspace?.id) throw new Error("No workspace selected");

      const { error } = await supabase
        .from("call_list_items")
        .delete()
        .in("status", QUEUE_STATUSES as unknown as string[])
        .eq("workspace_id", currentWorkspace.id)
        .eq("user_id", effectiveUserId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["call-list-items"] });
      queryClient.invalidateQueries({ queryKey: ["available-debtors-for-call"] });
      queryClient.invalidateQueries({ queryKey: ["all-active-debtors"] });
      toast.success("Queue cleared (call history preserved)");
    },
  });

  // Queue failed calls for retry - create NEW items so failed records stay visible
  const retryFailedMutation = useMutation({
    mutationFn: async () => {
      const failedItems =
        callListItems?.filter((item) => ["failed", "no_answer", "no_response"].includes(item.status)) || [];

      if (failedItems.length === 0) {
        throw new Error("No failed calls to retry");
      }

      // Create new pending items based on the failed ones
      const newItems = failedItems.map((item) => ({
        debtor_id: item.debtor_id,
        user_id: item.user_id,
        template_id: item.template_id,
        workspace_id: currentWorkspace?.id,
        status: "pending" as string,
        notes: `Retry of failed call`,
      }));

      const { error } = await supabase.from("call_list_items").insert(newItems);

      if (error) throw error;
      return failedItems.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["call-list-items"] });
      toast.success(`Created ${count} new retry calls`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Queue filtered debtors mutation
  const queueFilteredDebtorsMutation = useMutation({
    mutationFn: async (conditions: FilterConditions) => {
      const targetUserId = effectiveUserId;
      if (!targetUserId) throw new Error("Not authenticated");
      if (!currentWorkspace?.id) throw new Error("No workspace selected");

      // Get debtors not already in pending queue
      const queuedDebtorIds = new Set(
        (callListItems || [])
          .filter((item) => ["pending", "retry_pending", "calling"].includes(item.status))
          .map((item) => item.debtor_id),
      );

      // Filter debtors based on conditions
      let filteredDebtors = (allActiveDebtors || []).filter((d) => {
        if (queuedDebtorIds.has(d.id)) return false;

        // Get debt from variables.Debt (with capital D) or fall back to total_debt
        const vars = d.variables || {};
        const debtValue = parseFloat(vars.Debt || vars.debt || "0") || (d.total_debt ?? 0);

        // Apply debt filters
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

      if (filteredDebtors.length === 0) {
        throw new Error("No debtors match the filter criteria");
      }

      // If maxDebtors is set and we have more debtors than the limit, randomly pick
      if (conditions.maxDebtors !== undefined && filteredDebtors.length > conditions.maxDebtors) {
        // Fisher-Yates shuffle and take first maxDebtors
        const shuffled = [...filteredDebtors];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        filteredDebtors = shuffled.slice(0, conditions.maxDebtors);
      }

      const preferredTemplate = selectedTemplateId ? templates?.find((t) => t.id === selectedTemplateId) : undefined;

      const defaultTemplate =
        preferredTemplate ||
        templates?.find((t) => !t.is_system_default) ||
        templates?.find((t) => t.is_system_default) ||
        templates?.[0];

      // Insert in chunks
      const chunkSize = 500;
      let inserted = 0;

      for (let i = 0; i < filteredDebtors.length; i += chunkSize) {
        const chunk = filteredDebtors.slice(i, i + chunkSize);
        const items = chunk.map((debtor) => ({
          debtor_id: debtor.id,
          user_id: targetUserId,
          workspace_id: currentWorkspace.id,
          template_id: defaultTemplate?.id || null,
          status: "pending",
          phone_number: debtor.phone_number,
        }));

        const { error } = await supabase.from("call_list_items").insert(items);
        if (error) throw error;
        inserted += items.length;
      }

      return inserted;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["call-list-items"] });
      queryClient.invalidateQueries({ queryKey: ["available-debtors-for-call"] });
      setShowFilterDialog(false);
      setFilterMatchCount(undefined);
      toast.success(`Queued ${count} filtered debtors for calling`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Handle filter apply - calculate match count only
  const [pendingFilterConditions, setPendingFilterConditions] = useState<FilterConditions | null>(null);

  const handleCalculateFilterCount = async (conditions: FilterConditions) => {
    setIsFilterLoading(true);
    setPendingFilterConditions(conditions);

    try {
      // Get debtors not already in pending queue
      const queuedDebtorIds = new Set(
        (callListItems || [])
          .filter((item) => ["pending", "retry_pending", "calling"].includes(item.status))
          .map((item) => item.debtor_id),
      );

      // Filter debtors based on conditions
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

  // Convert number to Thai text
  const numberToThaiText = (num: number): string => {
    if (num === 0) return "ศูนย์";

    const ones = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
    const positions = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];

    let result = "";
    let position = 0;
    let tempNum = Math.floor(num);

    while (tempNum > 0) {
      const digit = tempNum % 10;

      if (digit !== 0) {
        let digitText = ones[digit];

        if (position === 1 && digit === 2) {
          digitText = "ยี่";
        } else if (position === 1 && digit === 1) {
          digitText = "";
        } else if (position === 0 && digit === 1 && tempNum > 10) {
          digitText = "เอ็ด";
        }

        result = digitText + positions[position] + result;
      }

      tempNum = Math.floor(tempNum / 10);
      position++;
    }

    return result;
  };

  // BOTNOI TEMPLATE ID - registered with "{Appointment Date}" placeholder
  const BOTNOI_TEMPLATE_ID = "2015208747";

  // Build the payload for preview/call
  const buildCallPayload = useCallback(
    (item: CallListItem) => {
      const selectedTemplate = templates?.find((t) => t.id === item.template_id) || templates?.[0];
      if (!selectedTemplate?.message || !item.debtor) return null;

      const debtor = item.debtor;
      const debtorVars = debtor.variables || {};

      // Construct the full message by replacing placeholders with debtor variables
      let constructedMessage = selectedTemplate.message;

      // Replace all {placeholder} with actual values from debtor variables
      Object.entries(debtorVars).forEach(([key, value]) => {
        const placeholder = new RegExp(`\\{${key}\\}`, "gi");
        let processedValue = String(value);

        // Convert license plate fields to Thai phonetic reading
        if (shouldUsePhonetic(key)) {
          processedValue = toThaiPhonetic(processedValue);
        }

        constructedMessage = constructedMessage.replace(placeholder, processedValue);
      });

      // Also replace standard placeholders
      const debtAmount = debtor.total_debt ? numberToThaiText(debtor.total_debt) + "บาท" : "-";
      const formattedDueDate = debtor.due_date
        ? new Date(debtor.due_date).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })
        : "-";

      constructedMessage = constructedMessage.replace(/\{debt\}/gi, debtAmount);
      constructedMessage = constructedMessage.replace(/\{Debt\}/g, debtAmount);
      constructedMessage = constructedMessage.replace(/\{due_date\}/gi, formattedDueDate);

      return {
        phone: debtor.phone_number,
        templateId: BOTNOI_TEMPLATE_ID,
        message: constructedMessage,
        item,
      };
    },
    [templates],
  );

  // Show preview before calling
  const handlePreviewCall = useCallback(
    (item: CallListItem) => {
      const payload = buildCallPayload(item);
      if (payload) {
        setPreviewPayload(payload);
        setShowPreviewDialog(true);
      } else {
        toast.error("Cannot build call payload - missing template or debtor data");
      }
    },
    [buildCallPayload],
  );

  // Make a single call
  const makeCall = useCallback(
    async (item: CallListItem, isRetry: boolean = false): Promise<{ success: boolean; shouldRetry: boolean }> => {
      const selectedTemplate = templates?.find((t) => t.id === item.template_id) || templates?.[0];
      if (!selectedTemplate?.template_id || !item.debtor) return { success: false, shouldRetry: false };

      try {
        const debtor = item.debtor;
        const debtorVars = {
          ...((debtor.variables || {}) as Record<string, string>),
        };

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        // Update call list item to calling
        await supabase
          .from("call_list_items")
          .update({ status: "calling", called_at: new Date().toISOString() })
          .eq("id", item.id);

        // Create call record
        const { data: callRecord, error: dbError } = await supabase
          .from("call_records")
          .insert({
            phone_number: debtor.phone_number,
            amount: debtor.total_debt?.toString() || "",
            due_date: debtor.due_date || "",
            status: "calling",
            template_id: selectedTemplate.id,
            user_id: user.id,
          })
          .select()
          .single();

        if (dbError) throw dbError;

        // Link call record to call list item
        await supabase.from("call_list_items").update({ call_record_id: callRecord.id }).eq("id", item.id);

        // Make call via voicebot edge function - send variables directly
        console.log("Sending to voicebot-make-call with variables:", debtorVars);
        const { data: callResponse, error: callError } = await supabase.functions.invoke("voicebot-make-call", {
          body: {
            phone_number: debtor.phone_number,
            variables: debtorVars,
            interruptible: settings.interruptible ? "True" : "False",
          },
        });

        if (callError) {
          await supabase
            .from("call_records")
            .update({ status: "failed", result_data: { error: callError.message } })
            .eq("id", callRecord.id);
          await supabase.from("call_list_items").update({ status: "failed" }).eq("id", item.id);
          return { success: false, shouldRetry: true };
        }

        // Update call record with Botnoi ID
        await supabase
          .from("call_records")
          .update({
            botnoi_call_id: callResponse?.outbound_id || null,
            status: "pending",
          })
          .eq("id", callRecord.id);

        // Token deduction disabled for testing
        /*
      const { data: tokenData } = await supabase
        .from("call_tokens")
        .select("tokens")
        .eq("user_id", user.id)
        .single();
      
      if (tokenData && tokenData.tokens > 0) {
        await supabase
          .from("call_tokens")
          .update({ tokens: tokenData.tokens - 1, updated_at: new Date().toISOString() })
          .eq("user_id", user.id);
        refetchTokens();
      }
      */

        // Update debtor contact attempts
        await supabase
          .from("debtors")
          .update({
            contact_attempts: (debtor.contact_attempts || 0) + 1,
            last_contact_at: new Date().toISOString(),
          })
          .eq("id", debtor.id);

        // Wait for call to complete
        const maxWaitTime = 5 * 60 * 1000;
        const pollInterval = 3000;
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitTime) {
          if (stopAutoDialRef.current) return { success: false, shouldRetry: false };

          await new Promise((resolve) => setTimeout(resolve, pollInterval));

          const { data: updatedRecord } = await supabase
            .from("call_records")
            .select("status")
            .eq("id", callRecord.id)
            .single();

          if (updatedRecord) {
            const finalStatuses = ["confirmed", "declined", "no_response", "failed", "no_answer", "completed"];
            if (finalStatuses.includes(updatedRecord.status || "")) {
              const shouldRetry = ["failed", "no_answer", "no_response"].includes(updatedRecord.status || "");
              // Update call list item with final status
              await supabase
                .from("call_list_items")
                .update({
                  status: updatedRecord.status,
                  call_outcome: updatedRecord.status,
                  picked_up: ["confirmed", "declined", "no_response", "completed"].includes(updatedRecord.status || ""),
                })
                .eq("id", item.id);
              return { success: true, shouldRetry };
            }
          }
        }

        // Timeout
        await supabase.from("call_list_items").update({ status: "completed" }).eq("id", item.id);
        return { success: true, shouldRetry: false };
      } catch (error) {
        console.error("Error making call:", error);
        await supabase.from("call_list_items").update({ status: "failed" }).eq("id", item.id);
        return { success: false, shouldRetry: true };
      }
    },
    [templates],
  );

  // Start calling using backend session (persists even if page closed)
  const startCallingSession = useCallback(async () => {
    // Check business hours
    if (!isWithinBusinessHours()) {
      toast.error(`Outside business hours (${settings.businessHoursStart} - ${settings.businessHoursEnd})`);
      return;
    }

    if (!effectiveUserId || !currentWorkspace?.id) {
      toast.error("Not authenticated or no workspace selected");
      return;
    }

    const pendingItems =
      callListItems?.filter((item) => (item.status === "pending" || item.status === "retry_pending") && item.debtor) ||
      [];

    if (pendingItems.length === 0) {
      toast.error("No pending calls in the list");
      return;
    }

    // Token check disabled for testing
    /*
    const currentTokens = userTokens ?? 0;
    if (currentTokens < 1) {
      toast.error(`You have no tokens. Please add tokens to start calling.`);
      return;
    }
    */

    try {
      // Create a call session in the database
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: session, error: sessionError } = await (supabase.from("call_sessions") as any)
        .insert({
          user_id: effectiveUserId,
          workspace_id: currentWorkspace.id,
          status: "running",
          total_calls: pendingItems.length,
          settings: settings,
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      // Start processing in the background via edge function
      const { error: invokeError } = await supabase.functions.invoke("process-call-session", {
        body: { session_id: session.id, action: "start" },
      });

      if (invokeError) throw invokeError;

      toast.success(
        `Started calling ${pendingItems.length} debtors. You can close this page - calls will continue in the background.`,
      );
      refetchSession();
    } catch (error) {
      console.error("Error starting call session:", error);
      toast.error("Failed to start call session");
    }
  }, [
    callListItems,
    settings,
    effectiveUserId,
    currentWorkspace?.id,
    userTokens,
    isWithinBusinessHours,
    refetchSession,
  ]);

  // Pause the active session
  const pauseCallingSession = useCallback(async () => {
    if (!activeSession) return;

    try {
      const { error } = await supabase.functions.invoke("process-call-session", {
        body: { session_id: activeSession.id, action: "pause" },
      });

      if (error) throw error;

      toast.info("Pausing calls...");
      refetchSession();
    } catch (error) {
      console.error("Error pausing call session:", error);
      toast.error("Failed to pause call session");
    }
  }, [activeSession, refetchSession]);

  // Resume a paused session
  const resumeCallingSession = useCallback(async () => {
    if (!activeSession || activeSession.status !== "paused") return;

    try {
      // Update status to running
      await supabase
        .from("call_sessions")
        .update({ status: "running", error_message: null })
        .eq("id", activeSession.id);

      // Start processing again
      const { error } = await supabase.functions.invoke("process-call-session", {
        body: { session_id: activeSession.id, action: "start" },
      });

      if (error) throw error;

      toast.success("Resumed calling");
      refetchSession();
    } catch (error) {
      console.error("Error resuming call session:", error);
      toast.error("Failed to resume call session");
    }
  }, [activeSession, refetchSession]);

  // Stop/terminate the active session completely
  const stopCallingSession = useCallback(async () => {
    if (!activeSession) return;

    try {
      const { error } = await supabase.functions.invoke("process-call-session", {
        body: { session_id: activeSession.id, action: "stop" },
      });

      if (error) throw error;

      toast.info("Stopping session...");
      refetchSession();
    } catch (error) {
      console.error("Error stopping call session:", error);
      toast.error("Failed to stop call session");
    }
  }, [activeSession, refetchSession]);

  // Legacy local startCalling (kept for reference, now using session-based)
  const startCalling = startCallingSession;
  const pauseCalling = pauseCallingSession;
  const stopCalling = stopCallingSession;

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
    const r = ((item as any).call_record?.result_data?.status || "").toLowerCase();
    return s !== "incomplete" && r !== "incomplete";
  });

  const completedCallsStats = visibleCallListItems.filter(
    (item) => item.called_at || (item.status && item.status !== "pending" && item.status !== "retry_pending"),
  );

  const pickedUpCount = completedCallsStats.filter((item) => item.picked_up).length;

  const categorizedStats = completedCallsStats.map((item) => {
    const rawOutcome = (item.call_outcome || "").toLowerCase().replace(/_/g, " ");
    const resultDataStatus = (item as any).call_record?.result_data?.status;
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

  // Sort icon helper function (not a component to avoid recreation issues)
  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 ml-1 opacity-50" />;
    }
    return sortDirection === "asc" ? <ArrowUp className="w-3 h-3 ml-1" /> : <ArrowDown className="w-3 h-3 ml-1" />;
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

  // Export completed calls to Excel
  const handleExportCompletedCalls = useCallback(() => {
    const completedStatuses = new Set([
      "completed",
      "success",
      "confirmed",
      "declined",
      "no_answer",
      "no_response",
      "failed",
      "busy",
      "cancelled",
      "invalid_number",
      "timeout",
    ]);
    const completedItems = (callListItems || []).filter((item) => completedStatuses.has(item.status));

    if (completedItems.length === 0) {
      toast.error("No completed calls to export");
      return;
    }

    const thaiMonths: Record<string, string> = {
      "มกราคม": "01", "กุมภาพันธ์": "02", "มีนาคม": "03", "เมษายน": "04",
      "พฤษภาคม": "05", "มิถุนายน": "06", "กรกฎาคม": "07", "สิงหาคม": "08",
      "กันยายน": "09", "ตุลาคม": "10", "พฤศจิกายน": "11", "ธันวาคม": "12",
    };
    const engMonths: Record<string, string> = {
      january: "01", february: "02", march: "03", april: "04", may: "05",
      june: "06", july: "07", august: "08", september: "09", october: "10",
      november: "11", december: "12",
      jan: "01", feb: "02", mar: "03", apr: "04", jun: "06", jul: "07",
      aug: "08", sep: "09", sept: "09", oct: "10", nov: "11", dec: "12",
    };
    const normalizeMonth = (m: string): string => {
      const s = String(m || "").trim();
      if (!s) return "";
      if (/^\d{1,2}$/.test(s)) return s.padStart(2, "0");
      if (thaiMonths[s]) return thaiMonths[s];
      return engMonths[s.toLowerCase()] || "";
    };
    const formatDueDate = (vars: Record<string, string>, isoFallback: string | null | undefined): string => {
      const dayRaw = String(vars.due_date || "").trim();
      const monthRaw = String(vars.due_month || "").trim();
      const yearRaw = String(vars.due_year || "").trim();
      if (dayRaw && monthRaw && yearRaw) {
        const dd = /^\d{1,2}$/.test(dayRaw) ? dayRaw.padStart(2, "0") : dayRaw;
        const mm = normalizeMonth(monthRaw);
        if (mm) return `${dd}/${mm}/${yearRaw}`;
      }
      const iso = String(isoFallback || "").trim();
      if (iso && /^\d{4}-\d{2}-\d{2}/.test(iso)) {
        const [y, m, d] = iso.slice(0, 10).split("-");
        const buddhistYear = String(parseInt(y, 10) + 543);
        return `${d}/${m}/${buddhistYear}`;
      }
      return "-";
    };

    const exportData = completedItems.map((item) => {
      const debtor = item.debtor;
      const vars = (debtor?.variables || {}) as Record<string, string>;
      const rawAmount = vars.amount || vars.outstanding_amount;
      const amount = rawAmount != null && rawAmount !== ""
        ? Number(String(rawAmount).replace(/,/g, ""))
        : debtor?.total_debt;

      // AI Status label (matches table badge)
      const cat = item.ai_category;
      let aiStatus = "-";
      if (cat) {
        const def = resolveMainStatus(cat) ?? resolveSubStatus(cat);
        aiStatus = def ? def.label : resolveLatestStatusLabel(cat);
      }

      return {
        เบอร์โทร: debtor?.phone_number || "-",
        ชื่อ: vars.name || debtor?.name || "-",
        ยอด: amount && Number.isFinite(amount) ? amount : "-",
        วันครบกำหนด: formatDueDate(vars, debtor?.due_date),
        รับสาย: item.picked_up === true ? "Yes" : item.picked_up === false ? "No" : "-",
        ผลการโทร: item.call_outcome || "-",
        สถานะ: item.status,
        "AI Status": aiStatus,
        เวลา: item.called_at ? new Date(item.called_at).toLocaleString("th-TH") : "-",
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Completed Calls");

    // Auto-size columns
    const colWidths = Object.keys(exportData[0] || {}).map((key) => ({
      wch: Math.max(key.length, 15),
    }));
    worksheet["!cols"] = colWidths;

    const fileName = `completed_calls_${new Date().toISOString().split("T")[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    toast.success(`Exported ${completedItems.length} completed calls`);
  }, [callListItems, parseNotesData]);

  const queuedDebtorIds = new Set(
    (callListItems || [])
      .filter((item) => ["pending", "retry_pending", "calling"].includes(item.status))
      .map((item) => item.debtor_id),
  );
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

  const remainingDailyQuota = Math.max(0, settings.dailyLimit - (todayCallCount || 0));

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
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowAddDialog(true)}>
            <ListPlus className="w-4 h-4 mr-2" />
            Add to List
          </Button>
        </div>
      </div>

      {/* Simplified Stats: 3 Cards in a Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-primary/5 border-primary/20 shadow-sm">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-primary mb-1">{completedCallsStats.length}</div>
            <div className="text-xs font-medium text-primary/80 uppercase tracking-wider">Total Calls Made</div>
          </CardContent>
        </Card>

        <Card className="bg-success/5 border-success/20 shadow-sm">
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <CheckCircle className="w-5 h-5 text-success" />
              <span className="text-2xl font-bold text-success">{pickedUpCount}</span>
            </div>
            <div className="text-xs font-medium text-success uppercase tracking-wider">Complete</div>
            <div className="text-[10px] text-success/70 mt-1">{pickupRate}% pickup rate</div>
          </CardContent>
        </Card>

        <Card className="bg-destructive/5 border-destructive/20 shadow-sm">
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <XCircle className="w-5 h-5 text-destructive" />
              <span className="text-2xl font-bold text-destructive">{incompleteCount}</span>
            </div>
            <div className="text-xs font-medium text-destructive/80 uppercase tracking-wider">Incomplete</div>
          </CardContent>
        </Card>
      </div>

      {/* Business Hours Warning */}
      {settings.businessHoursOnly && !isWithinBusinessHours() && (
        <Card className="border-warning/50 bg-warning/10">
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="w-5 h-5 text-warning" />
            <div>
              <p className="font-medium text-warning">Outside Business Hours</p>
              <p className="text-sm text-muted-foreground">
                Calls are only allowed {settings.businessDays.map((d) => DAY_NAMES[d]).join(", ")} between{" "}
                {settings.businessHoursStart} - {settings.businessHoursEnd}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Session Banner */}
      {activeSession && (
        <Card
          className={`border-primary/50 ${activeSession.status === "paused" ? "bg-warning/10" : settings.testMode ? "bg-warning/20 border-warning" : "bg-primary/10"}`}
        >
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {activeSession.status === "running" ? (
                  activeSession.completed_calls + activeSession.failed_calls >= activeSession.total_calls ? (
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
                      ? activeSession.completed_calls + activeSession.failed_calls >= activeSession.total_calls
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
                      (activeSession.completed_calls + activeSession.failed_calls >= activeSession.total_calls
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
                    <Button size="sm" onClick={resumeCallingSession}>
                      <Play className="w-4 h-4 mr-2" />
                      Resume
                    </Button>
                    <Button size="sm" variant="destructive" onClick={stopCalling}>
                      <XCircle className="w-4 h-4 mr-2" />
                      Stop
                    </Button>
                  </>
                )}
                {activeSession.status === "running" && (
                  <>
                    {activeSession.completed_calls + activeSession.failed_calls >= activeSession.total_calls ? (
                      <Button size="sm" variant="outline" onClick={stopCalling}>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Finish Session
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" variant="secondary" onClick={pauseCalling}>
                          <Square className="w-4 h-4 mr-2" />
                          Pause
                        </Button>
                        <Button size="sm" variant="destructive" onClick={stopCalling}>
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
                        ? ((activeSession.completed_calls + activeSession.failed_calls) / activeSession.total_calls) *
                          100
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
      )}

      {/* Actions */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            {!activeSession ? (
              <>
                <Button
                  onClick={startCalling}
                  disabled={pendingCount === 0 || (settings.businessHoursOnly && !isWithinBusinessHours())}
                  className={settings.testMode ? "bg-warning hover:bg-warning/90 text-warning-foreground" : ""}
                >
                  <Play className="w-4 h-4 mr-2" />
                  {settings.testMode ? "🧪 Test Calls" : "Start Calls"} ({pendingCount})
                </Button>

                <Button
                  variant="secondary"
                  onClick={() => queueAllDebtorsMutation.mutate()}
                  disabled={queueAllDebtorsMutation.isPending || isLoadingAllActiveDebtors || queueAllCount === 0}
                >
                  {queueAllDebtorsMutation.isPending || isLoadingAllActiveDebtors ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4 mr-2" />
                  )}
                  Queue All ({isLoadingAllActiveDebtors ? "…" : queueAllCount})
                </Button>

                <Button
                  variant="secondary"
                  onClick={() => queueUncalledDebtorsMutation.mutate()}
                  disabled={queueUncalledDebtorsMutation.isPending || isLoadingAllActiveDebtors || uncalledCount === 0}
                >
                  {queueUncalledDebtorsMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Users className="w-4 h-4 mr-2" />
                  )}
                  Queue Uncalled ({isLoadingAllActiveDebtors ? "…" : uncalledCount})
                </Button>

                <Button
                  variant="outline"
                  onClick={() => setShowFilterDialog(true)}
                  disabled={isLoadingAllActiveDebtors}
                >
                  <Filter className="w-4 h-4 mr-2" />
                  Smart Queue
                </Button>

                {failedCount > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => retryFailedMutation.mutate()}
                    disabled={retryFailedMutation.isPending}
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Retry Failed ({failedCount})
                  </Button>
                )}
              </>
            ) : null}

            {pendingCount > 0 && !activeSession && (
              <Button
                variant="outline"
                onClick={() => clearPendingMutation.mutate()}
                disabled={clearPendingMutation.isPending}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear Pending
              </Button>
            )}

            {processedCount > 0 && !activeSession && (
              <Button
                variant="outline"
                onClick={() => clearCompletedMutation.mutate()}
                disabled={clearCompletedMutation.isPending}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear Completed
              </Button>
            )}

            {callListItems && callListItems.length > 0 && !activeSession && (
              <Button
                variant="destructive"
                onClick={() => clearAllMutation.mutate()}
                disabled={clearAllMutation.isPending}
              >
                {clearAllMutation.isPending ? (
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

      {/* Call List Table with Tabs */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Call Queue</CardTitle>
            <div className="flex items-center gap-2">
              {activeTab === "completed" && (
                <Button variant="outline" size="sm" onClick={handleExportCompletedCalls} className="h-8 text-xs">
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Export Excel
                </Button>
              )}
              <div className="flex gap-1 bg-muted p-1 rounded-lg">
                <button
                  onClick={() => setActiveTab("pending")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    activeTab === "pending"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Pending ({pendingCount})
                </button>
                <button
                  onClick={() => setActiveTab("calling")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    activeTab === "calling"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {callingCount > 0 && <Loader2 className="w-3 h-3 animate-spin" />}
                    Calling ({callingCount})
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab("completed")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    activeTab === "completed"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Completed ({processedCount})
                </button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredCallListItems.length > 0 ? (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead
                      className="text-xs cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort("phone")}
                    >
                      <span className="flex items-center">
                        เบอร์โทร
                        {getSortIcon("phone")}
                      </span>
                    </TableHead>
                    <TableHead className="text-xs">ชื่อ</TableHead>
                    <TableHead className="text-xs">ยอด</TableHead>
                    <TableHead
                      className="text-xs cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort("picked_up")}
                    >
                      <span className="flex items-center">
                        รับสาย
                        {getSortIcon("picked_up")}
                      </span>
                    </TableHead>
                    <TableHead
                      className="text-xs cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort("call_outcome")}
                    >
                      <span className="flex items-center">
                        ผลการโทร
                        {getSortIcon("call_outcome")}
                      </span>
                    </TableHead>
                    <TableHead
                      className="text-xs cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort("status")}
                    >
                      <span className="flex items-center">
                        สถานะ
                        {getSortIcon("status")}
                      </span>
                    </TableHead>
                    <TableHead className="text-xs">AI Status</TableHead>
                    <TableHead
                      className="text-xs cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort("called_at")}
                    >
                      <span className="flex items-center">
                        เวลา
                        {getSortIcon("called_at")}
                      </span>
                    </TableHead>
                    <TableHead className="text-xs w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCallListItems.map((item, index) => {
                    const debtor = item.debtor;
                    const isCurrentlyCalling = item.status === "calling";

                    // Determine picked up display
                    const getPickedUpDisplay = () => {
                      if (item.picked_up === true)
                        return (
                          <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                            Yes
                          </Badge>
                        );
                      if (item.picked_up === false)
                        return (
                          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                            No
                          </Badge>
                        );
                      return <span className="text-muted-foreground">-</span>;
                    };

                    // Determine outcome display
                    const getOutcomeDisplay = () => {
                      if (!item.call_outcome) return <span className="text-muted-foreground">-</span>;
                      const outcome = item.call_outcome.toLowerCase();
                      if (outcome.includes("ยืนยัน") || outcome.includes("confirm")) {
                        return (
                          <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                            {item.call_outcome}
                          </Badge>
                        );
                      }
                      if (outcome.includes("ปฏิเสธ") || outcome.includes("decline") || outcome.includes("reject")) {
                        return (
                          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                            {item.call_outcome}
                          </Badge>
                        );
                      }
                      if (outcome.includes("hang") || outcome.includes("hanged")) {
                        return (
                          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                            Hang up
                          </Badge>
                        );
                      }
                      return (
                        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                          {item.call_outcome}
                        </Badge>
                      );
                    };

                    return (
                      <TableRow key={item.id} className={isCurrentlyCalling ? "bg-primary/5 animate-pulse" : ""}>
                        <TableCell className="font-mono text-sm">
                          <div className="flex items-center gap-2">
                            {isCurrentlyCalling && <Phone className="w-3.5 h-3.5 text-primary animate-bounce" />}
                            <span>{debtor ? maskPhoneNumber(debtor.phone_number) : "-"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {debtor?.variables?.name || debtor?.name || "-"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {(() => {
                            const vars = debtor?.variables || {};
                            const raw = vars.amount || vars.outstanding_amount;
                            const amount = raw != null && raw !== ""
                              ? Number(String(raw).replace(/,/g, ""))
                              : debtor?.total_debt;
                            return amount && Number.isFinite(amount)
                              ? new Intl.NumberFormat("th-TH", {
                                  style: "currency",
                                  currency: "THB",
                                  maximumFractionDigits: 0,
                                }).format(amount)
                              : "-";
                          })()}
                        </TableCell>
                        <TableCell>{getPickedUpDisplay()}</TableCell>
                        <TableCell>{getOutcomeDisplay()}</TableCell>
                        <TableCell>{getStatusBadge(item.status)}</TableCell>
                        <TableCell>
                          {(() => {
                            const cat = item.ai_category;
                            if (!cat) return <span className="text-muted-foreground">-</span>;
                            const def = resolveMainStatus(cat) ?? resolveSubStatus(cat);
                            const label = resolveLatestStatusLabel(cat);
                            if (!def) {
                              return (
                                <Badge variant="outline" className="bg-muted text-muted-foreground">
                                  {label}
                                </Badge>
                              );
                            }
                            return (
                              <Badge
                                variant="outline"
                                style={{
                                  color: def.color,
                                  borderColor: `${def.color}66`,
                                  backgroundColor: `${def.color}1a`,
                                }}
                              >
                                {def.thai || def.label}
                              </Badge>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {item.called_at
                            ? new Date(item.called_at).toLocaleString("th-TH", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "-"}
                        </TableCell>
                        <TableCell className="flex gap-1">
                          {/* Show view transcript for completed calls, preview for pending */}
                          {item.status === "success" ||
                          item.status === "confirmed" ||
                          item.status === "declined" ||
                          item.status === "no_response" ||
                          item.status === "no_answer" ||
                          item.status === "failed" ? (
                            (() => {
                              const { conversationLog } = parseNotesData(item.notes);
                              return conversationLog ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-primary"
                                  onClick={() => handleViewTranscript(item.notes)}
                                  title="View conversation"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                </Button>
                              ) : null;
                            })()
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-primary"
                              onClick={() => handlePreviewCall(item)}
                              title="Preview call payload"
                            >
                              <Phone className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {(item.status === "pending" || item.status === "retry_pending") && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => removeFromListMutation.mutate(item.id)}
                              disabled={removeFromListMutation.isPending}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              {activeTab === "pending" ? (
                <>
                  <Clock className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p>No pending calls</p>
                  <p className="text-sm">Add debtors to start making calls</p>
                </>
              ) : activeTab === "calling" ? (
                <>
                  <Phone className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p>No calls in progress</p>
                  <p className="text-sm">Start a session to begin processing</p>
                </>
              ) : (
                <>
                  <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p>No completed calls</p>
                  <p className="text-sm">Processed calls will appear here</p>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add to List Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Add to Call List</DialogTitle>
            <DialogDescription>Select debtors to add to the call queue</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* Template Selection */}
            <div className="space-y-1.5">
              <Label className="text-sm">Template</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select template" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  {templates?.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.org_name} {t.is_system_default && "(Default)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Schedule Time (Optional) */}
            <div className="space-y-1.5">
              <Label className="text-sm">Schedule (Optional)</Label>
              <Input type="datetime-local" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
            </div>

            {/* Debtor Selection */}
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm">Select Debtors ({selectedDebtors.length} selected)</Label>
                <Button variant="ghost" size="sm" onClick={selectAllDebtors}>
                  {selectedDebtors.length === availableDebtors?.length ? "Deselect All" : "Select All"}
                </Button>
              </div>

              {availableDebtors && availableDebtors.length > 0 ? (
                <div className="flex-1 overflow-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead className="text-xs">Phone</TableHead>
                        <TableHead className="text-xs">Name</TableHead>
                        <TableHead className="text-xs">Debt</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {availableDebtors.map((debtor) => (
                        <TableRow
                          key={debtor.id}
                          className="cursor-pointer"
                          onClick={() => toggleDebtorSelection(debtor.id)}
                        >
                          <TableCell>
                            <Checkbox
                              checked={selectedDebtors.includes(debtor.id)}
                              onCheckedChange={() => toggleDebtorSelection(debtor.id)}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-sm">{maskPhoneNumber(debtor.phone_number)}</TableCell>
                          <TableCell className="text-sm">{debtor.name || "-"}</TableCell>
                          <TableCell className="text-sm">
                            {debtor.total_debt
                              ? new Intl.NumberFormat("th-TH", {
                                  style: "currency",
                                  currency: "THB",
                                  minimumFractionDigits: 0,
                                }).format(debtor.total_debt)
                              : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              {debtor.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground border rounded-md">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No available debtors</p>
                  <p className="text-xs">All debtors are already in the call queue</p>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowAddDialog(false);
                  setSelectedDebtors([]);
                  setScheduledTime("");
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={() => addToListMutation.mutate()}
                disabled={selectedDebtors.length === 0 || addToListMutation.isPending}
              >
                {addToListMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Add {selectedDebtors.length} to List
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="mx-auto w-[calc(100%-2rem)] max-w-lg max-h-[85vh] p-0 flex flex-col gap-0 sm:rounded-lg">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle>Auto-Dial Settings</DialogTitle>
            <DialogDescription>Configure retry logic, limits, and business hours</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {/* Test Mode Toggle */}
            <div className="rounded-lg border-2 border-dashed border-warning/50 bg-warning/5 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-warning" />
                    Test Mode
                  </Label>
                  <p className="text-xs text-muted-foreground">Simulate calls without hitting real phone numbers</p>
                </div>
                <Switch
                  checked={settings.testMode}
                  onCheckedChange={(checked) => setSettings((s) => ({ ...s, testMode: checked }))}
                />
              </div>
              {settings.testMode && (
                <p className="text-xs text-warning font-medium">
                  🧪 Test mode enabled - calls will be simulated with random outcomes
                </p>
              )}
            </div>

            {/* Interruptible Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-primary" />
                  Interruptible
                </Label>
                <p className="text-xs text-muted-foreground">Allow the bot to be interrupted by the user speaking</p>
              </div>
              <Switch
                checked={settings.interruptible}
                onCheckedChange={(checked) => setSettings((s) => ({ ...s, interruptible: checked }))}
              />
            </div>

            {/* Max Retries */}
            <div className="space-y-2">
              <Label>Max Retries per Contact</Label>
              <Input
                type="number"
                min={0}
                max={5}
                value={settings.maxRetries}
                onChange={(e) => setSettings((s) => ({ ...s, maxRetries: parseInt(e.target.value) || 0 }))}
              />
              <p className="text-xs text-muted-foreground">
                How many times to retry failed/no-answer calls (0 = no retry)
              </p>
            </div>

            {/* Daily Limit */}
            <div className="space-y-2">
              <Label>Daily Call Limit</Label>
              <Input
                type="number"
                min={1}
                max={10000}
                value={settings.dailyLimit}
                onChange={(e) => setSettings((s) => ({ ...s, dailyLimit: parseInt(e.target.value) || 100 }))}
              />
              <p className="text-xs text-muted-foreground">Maximum calls per day ({todayCallCount || 0} made today)</p>
            </div>

            {/* Delay Between Calls */}
            <div className="space-y-2">
              <Label>Delay Between Calls (seconds)</Label>
              <Input
                type="number"
                min={1}
                max={60}
                value={settings.delayBetweenCalls === 0 ? "" : settings.delayBetweenCalls}
                onChange={(e) => {
                  const val = e.target.value === "" ? 0 : parseInt(e.target.value);
                  setSettings((s) => ({ ...s, delayBetweenCalls: isNaN(val) ? 0 : val }));
                }}
                onBlur={(e) => {
                  const val = parseInt(e.target.value);
                  if (isNaN(val) || val < 1) {
                    setSettings((s) => ({ ...s, delayBetweenCalls: 3 }));
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">Wait time between each batch of calls</p>
            </div>

            {/* Concurrent Calls */}
            <div className="space-y-2">
              <Label>Calls Per Batch</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={settings.concurrentCalls === 0 ? "" : settings.concurrentCalls}
                onChange={(e) => {
                  const val = e.target.value === "" ? 0 : parseInt(e.target.value);
                  setSettings((s) => ({ ...s, concurrentCalls: isNaN(val) ? 0 : val }));
                }}
                onBlur={(e) => {
                  const val = parseInt(e.target.value);
                  if (isNaN(val) || val < 1) {
                    setSettings((s) => ({ ...s, concurrentCalls: 5 }));
                  } else if (val > 10) {
                    setSettings((s) => ({ ...s, concurrentCalls: 10 }));
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">Number of calls to make simultaneously</p>
            </div>

            {/* Business Hours */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Business Hours Only</Label>
                  <p className="text-xs text-muted-foreground">Only allow calls during set hours</p>
                </div>
                <Switch
                  checked={settings.businessHoursOnly}
                  onCheckedChange={(checked) => setSettings((s) => ({ ...s, businessHoursOnly: checked }))}
                />
              </div>

              {settings.businessHoursOnly && (
                <div className="space-y-4">
                  {/* Day Selection */}
                  <div className="space-y-2">
                    <Label className="text-xs">Business Days</Label>
                    <div className="flex flex-wrap gap-2">
                      {DAY_NAMES.map((day, index) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            setSettings((s) => ({
                              ...s,
                              businessDays: s.businessDays.includes(index)
                                ? s.businessDays.filter((d) => d !== index)
                                : [...s.businessDays, index].sort(),
                            }));
                          }}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                            settings.businessDays.includes(index)
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                          }`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Time Selection */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Start Time</Label>
                      <Input
                        type="time"
                        value={settings.businessHoursStart}
                        onChange={(e) => setSettings((s) => ({ ...s, businessHoursStart: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">End Time</Label>
                      <Input
                        type="time"
                        value={settings.businessHoursEnd}
                        onChange={(e) => setSettings((s) => ({ ...s, businessHoursEnd: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 px-6 py-4 border-t shrink-0 bg-background">
            <Button variant="outline" className="flex-1" onClick={() => setSettings(DEFAULT_SETTINGS)}>
              Reset to Default
            </Button>
            <Button className="flex-1" onClick={() => setShowSettingsDialog(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Payload Dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
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
                <Button variant="outline" className="flex-1" onClick={() => setShowPreviewDialog(false)}>
                  Close
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    setShowPreviewDialog(false);
                    if (previewPayload.item) {
                      makeCall(previewPayload.item);
                      toast.info("Call initiated - check logs for result");
                    }
                  }}
                >
                  <Phone className="w-4 h-4 mr-2" />
                  Make Call Now
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Filter Dialog */}
      <Dialog open={showFilterDialog} onOpenChange={setShowFilterDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Smart Queue</DialogTitle>
            <DialogDescription>Filter debtors by conditions and queue them for calling</DialogDescription>
          </DialogHeader>
          <DebtorFilterPanel
            onCalculateCount={handleCalculateFilterCount}
            onConfirmSelection={handleConfirmFilterSelection}
            onClose={() => {
              setShowFilterDialog(false);
              setFilterMatchCount(undefined);
              setPendingFilterConditions(null);
            }}
            isLoading={isFilterLoading}
            isConfirming={queueFilteredDebtorsMutation.isPending}
            matchCount={filterMatchCount}
            totalAvailable={queueAllCount}
          />
        </DialogContent>
      </Dialog>

      {/* Transcript Dialog */}
      <Dialog open={showTranscriptDialog} onOpenChange={setShowTranscriptDialog}>
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
              </div>

              {transcriptData.audioUrl && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Volume2 className="w-4 h-4" />
                    Audio Recording
                  </Label>
                  <audio controls className="w-full" src={transcriptData.audioUrl}>
                    Your browser does not support the audio element.
                  </audio>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={async () => {
                      try {
                        const proxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/audio-proxy?download=1&filename=call_audio.mp3&url=${encodeURIComponent(transcriptData.audioUrl!)}`;
                        const res = await fetch(proxyUrl);
                        if (!res.ok) throw new Error("Download failed");
                        const blob = await res.blob();
                        const blobUrl = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = blobUrl;
                        a.download = "call_audio.mp3";
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(blobUrl);
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

              <Button variant="outline" className="w-full" onClick={() => setShowTranscriptDialog(false)}>
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CallList;
