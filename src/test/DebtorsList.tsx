import { useMemo, useState } from "react";
import { format, startOfDay, endOfDay } from "date-fns";
import { th } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listDebtorsByWorkspace,
  createDebtor,
  updateDebtor,
  deleteDebtor,
} from "@/test/api/debtors";
import { listCallListItemsByWorkspace, createCallListItem } from "@/test/api/callListItems";
import { listCallRecords, createCallRecord } from "@/test/api/callRecords";
import { makeCall } from "@/test/api/voicebot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Users,
  Plus,
  Search,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  PhoneCall,
  ListPlus,
  Clock,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Send,
  Download,
} from "lucide-react";
import * as XLSX from "xlsx";
import DebtorExcelUpload from "./DebtorExcelUpload";
import InlineTemplateEditor from "./InlineTemplateEditor";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAdmin } from "@/contexts/AdminContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toThaiPhonetic, shouldUsePhonetic, spellThaiName, isNameField } from "@/lib/thaiPhonetic";
import { maskPhoneNumber, maskLicensePlate, isLicensePlateField } from "@/lib/formatPhone";
import {
  DEBTOR_CUSTOMER_VARIABLE_KEYS,
  DEBTOR_CUSTOMER_VARIABLE_LABELS,
  emptyDebtorCustomerVariables,
  parseDebtAmountForColumn,
  splitThaiDate,
  formatThaiBuddhistDate,
  formatThaiBuddhistDateShort,
} from "@/lib/debtorVariables";
import {
  MAIN_STATUSES,
  SUB_STATUSES,
  ALL_STATUSES,
  resolveLatestStatusLabel,
  resolveLatestStatusTone,
  resolveMainStatus,
  resolveSubStatus,
  type CallStatusTone,
} from "@/lib/callStatuses";

const STATUS_TONE_CLASS: Record<CallStatusTone, string> = {
  callback: "bg-warning/15 text-warning border-warning/40",
  transfer: "bg-warning/15 text-warning border-warning/40",
  "soft-callback": "bg-warning/10 text-warning border-warning/25",
  done: "bg-success/15 text-success border-success/30",
  skip: "bg-destructive/10 text-destructive border-destructive/30",
  other: "bg-muted text-muted-foreground border-border",
  none: "",
};

function buildVariablesToSave(
  tv: Record<string, string>,
  preserveTemplateFrom?: Record<string, unknown> | null,
  dueDateIso?: string,
  paidDateIso?: string,
): Record<string, string> {
  const out: Record<string, string> = {};

  const dueParts = splitThaiDate(dueDateIso);
  const paidParts = splitThaiDate(paidDateIso);

  for (const k of DEBTOR_CUSTOMER_VARIABLE_KEYS) {
    if (k === "due_date") {
      out[k] = dueParts.day;
    } else if (k === "due_month") {
      out[k] = dueParts.month;
    } else if (k === "due_year") {
      out[k] = dueParts.year;
    } else if (k === "paid_date") {
      out[k] = paidParts.day;
    } else if (k === "paid_month") {
      out[k] = paidParts.month;
    } else if (k === "paid_year") {
      out[k] = paidParts.year;
    } else {
      out[k] = tv[k] ?? "";
    }
  }
  // Store ISO versions to restore date pickers when editing
  if (dueDateIso) out.due_date_iso = dueDateIso;
  if (paidDateIso) out.paid_date_iso = paidDateIso;

  const mt = preserveTemplateFrom?.message_template;
  if (typeof mt === "string" && mt.length > 0) {
    out.message_template = mt;
  }
  return out;
}

interface Debtor {
  id: string;
  phone_number: string;
  name: string | null;
  last_name: string | null;
  total_debt: number;
  due_date: string | null;
  status: string;
  contact_attempts: number;
  successful_contacts: number;
  last_contact_at: string | null;
  last_response: string | null;
  notes: string | null;
  created_at: string;
  picked_up_count: number;
  not_picked_up_count: number;
  accept_count: number;
  reject_count: number;
  other_count: number;
  variables: Record<string, string> | null;
  date_con: string | null;
  user_id?: string;
  is_blocked?: boolean;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  active: { label: "Active", color: "bg-primary/10 text-primary" },
  paid: { label: "Paid", color: "bg-success/10 text-success" },
  defaulted: { label: "Defaulted", color: "bg-destructive/10 text-destructive" },
  negotiating: { label: "Negotiating", color: "bg-warning/10 text-warning" },
  pending: { label: "Pending", color: "bg-muted text-muted-foreground" },
};

interface DebtorsListProps {
  onNextStep?: () => void;
}

const DebtorsList = ({ onNextStep }: DebtorsListProps) => {
  const queryClient = useQueryClient();
  const { effectiveUserId, isAdmin, selectedUserId } = useAdmin();
  const { currentWorkspace } = useWorkspace();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [callStatusFilter, setCallStatusFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingDebtor, setEditingDebtor] = useState<Debtor | null>(null);
  const [addingToCallList, setAddingToCallList] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    phone_number: "",
    status: "active",
    notes: "",
    due_date: "",
    paid_date: "",
  });
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>(() =>
    emptyDebtorCustomerVariables(),
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [sortField, setSortField] = useState<string>("created_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [showExcelUpload, setShowExcelUpload] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Selection for send to call list
  const [selectedDebtors, setSelectedDebtors] = useState<Set<string>>(new Set());

  const pageSize = 50;

  // Latest call status per debtor (from call_list_items.ai_category, ordered by called_at)
  const { data: latestStatusByDebtor } = useQuery({
    queryKey: ["debtor-latest-call-status", effectiveUserId, currentWorkspace?.id],
    queryFn: async () => {
      const map = new Map<string, string | null>();
      if (!currentWorkspace?.id) return map;
      let rows = await listCallListItemsByWorkspace(currentWorkspace.id);
      if (effectiveUserId) rows = rows.filter((r) => r.user_id === effectiveUserId);
      // Order by called_at desc (Go zero-time "0001-..." naturally sorts last), then created_at desc.
      rows = [...rows].sort((a, b) => {
        const ca = a.called_at || "";
        const cb = b.called_at || "";
        if (ca !== cb) return cb.localeCompare(ca);
        return (b.created_at || "").localeCompare(a.created_at || "");
      });
      rows.forEach((row) => {
        if (!map.has(row.debtor_id)) map.set(row.debtor_id, row.ai_category ?? null);
      });
      return map;
    },
    enabled: !!effectiveUserId && !!currentWorkspace?.id,
    refetchInterval: 10000,
  });

  // Debtor IDs matching the active call-status filter (server-side scope)
  const filteredDebtorIds = useMemo<string[] | null>(() => {
    if (callStatusFilter === "all" || !latestStatusByDebtor) return null;
    const ids: string[] = [];
    latestStatusByDebtor.forEach((cat, debtorId) => {
      if (callStatusFilter === "never") return; // handled separately
      const label = resolveLatestStatusLabel(cat);
      if (callStatusFilter === "Other") {
        if (label === "Other") ids.push(debtorId);
        return;
      }
      // Match by resolved label (works whether DB stores English, Thai, or raw keywords)
      const mainOrSub = resolveMainStatus(cat) ?? resolveSubStatus(cat);
      if (mainOrSub?.label === callStatusFilter || cat === callStatusFilter) {
        ids.push(debtorId);
      }
    });
    return ids;
  }, [callStatusFilter, latestStatusByDebtor]);

  // The Go API returns all debtors for a workspace; filtering/sorting/pagination
  // that used to run in SQL now runs client-side here (and is reused by export).
  const applyDebtorFilters = (all: Debtor[]): Debtor[] => {
    let rows = all;

    if (effectiveUserId) rows = rows.filter((d) => d.user_id === effectiveUserId);
    if (statusFilter !== "all") rows = rows.filter((d) => d.status === statusFilter);

    if (callStatusFilter === "never") {
      const calledIds = new Set(latestStatusByDebtor?.keys() ?? []);
      rows = rows.filter((d) => !calledIds.has(d.id));
    } else if (callStatusFilter !== "all") {
      const ids = new Set(filteredDebtorIds ?? []);
      rows = rows.filter((d) => ids.has(d.id));
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(
        (d) =>
          (d.phone_number || "").toLowerCase().includes(q) ||
          (d.name || "").toLowerCase().includes(q),
      );
    }

    if (dateRange?.from) {
      const fromStr = format(startOfDay(dateRange.from), "yyyy-MM-dd");
      rows = rows.filter((d) => d.date_con && d.date_con >= fromStr);
    }
    if (dateRange?.to || dateRange?.from) {
      const toStr = format(endOfDay(dateRange.to ?? dateRange.from!), "yyyy-MM-dd");
      rows = rows.filter((d) => d.date_con && d.date_con <= toStr);
    }

    const dir = sortDirection === "asc" ? 1 : -1;
    const getVal = (d: Debtor): unknown => {
      if (sortField.startsWith("var:")) return d.variables?.[sortField.slice(4)];
      return (d as unknown as Record<string, unknown>)[sortField];
    };
    rows = [...rows].sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      const aNull = va === null || va === undefined || va === "";
      const bNull = vb === null || vb === undefined || vb === "";
      if (aNull && bNull) return 0;
      if (aNull) return 1; // nulls last regardless of direction
      if (bNull) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });

    return rows;
  };

  // Paginated query (fetch-all + client-side filter/sort/slice)
  const {
    data: debtorsData,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: [
      "debtors",
      searchQuery,
      statusFilter,
      callStatusFilter,
      filteredDebtorIds,
      sortField,
      sortDirection,
      page,
      effectiveUserId,
      currentWorkspace?.id,
      dateRange?.from?.toISOString() ?? null,
      dateRange?.to?.toISOString() ?? null,
    ],
    queryFn: async () => {
      if (!currentWorkspace?.id) return { debtors: [] as Debtor[], totalCount: 0 };
      const all = (await listDebtorsByWorkspace(currentWorkspace.id)) as unknown as Debtor[];
      const filtered = applyDebtorFilters(all);
      const from = page * pageSize;
      return { debtors: filtered.slice(from, from + pageSize), totalCount: filtered.length };
    },
    placeholderData: (prev) => prev,
    enabled: !!effectiveUserId,
  });

  const debtors = debtorsData?.debtors;
  const totalCount = debtorsData?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  // Variable columns: standard customer keys first, then any legacy keys
  // Pinned keys are rendered as dedicated fixed columns and excluded here.
  const PINNED_VARIABLE_KEYS = ["name", "policy_no", "outstanding_amount", "overdue_installments"] as const;
  const HIDDEN_VARIABLE_KEYS = ["due_date_iso", "paid_date_iso", "policy_number", "price"] as const;
  const variableColumns = useMemo(() => {
    if (!debtors?.length) return [];
    const allKeys = new Set(
      debtors.flatMap((d) => (d.variables ? Object.keys(d.variables).filter((k) => k !== "message_template") : [])),
    );
    const isHidden = (k: string) =>
      PINNED_VARIABLE_KEYS.includes(k as (typeof PINNED_VARIABLE_KEYS)[number]) ||
      HIDDEN_VARIABLE_KEYS.includes(k as (typeof HIDDEN_VARIABLE_KEYS)[number]);
    const ordered: string[] = [];
    for (const k of DEBTOR_CUSTOMER_VARIABLE_KEYS) {
      if (allKeys.has(k) && !isHidden(k)) ordered.push(k);
    }
    const rest = [...allKeys]
      .filter((k) => !DEBTOR_CUSTOMER_VARIABLE_KEYS.includes(k as (typeof DEBTOR_CUSTOMER_VARIABLE_KEYS)[number]))
      .filter((k) => !isHidden(k))
      .sort();
    return [...ordered, ...rest];
  }, [debtors]);

  // Format a variable value for display (numeric formatting + license-plate mask)
  const formatVariableValue = (varKey: string, value: unknown): string => {
    if (value === null || value === undefined || value === "") return "-";
    const str = String(value);
    const isNumeric = !isNaN(Number(str.replace(/,/g, "")));
    const isYearField = varKey.toLowerCase().includes("year");
    let display = isNumeric && !isYearField ? Number(str.replace(/,/g, "")).toLocaleString("th-TH") : str;
    if (isLicensePlateField(varKey)) display = maskLicensePlate(str);
    return display;
  };

  // call_templates is not served by the Go API; no templates available here.
  type FullTemplate = {
    id: string;
    is_system_default?: boolean;
    message?: string;
    confirm_message?: string;
    decline_message?: string;
    fallback_message?: string;
  };
  const templates: FullTemplate[] = [];

  // Extract placeholders from template messages
  const extractPlaceholdersFromTemplate = (template: NonNullable<typeof templates>[number] | undefined) => {
    if (!template) return [];
    const allText = [
      template.message,
      template.confirm_message,
      template.decline_message,
      template.fallback_message,
    ].join(" ");
    const matches = allText.match(/\{([^}]+)\}/g) || [];
    const placeholders = [...new Set(matches.map((m) => m.slice(1, -1)))];
    // Filter out org_name as it comes from template itself
    return placeholders.filter((p) => !p.toLowerCase().includes("org"));
  };

  // Get current template placeholders
  const currentTemplate = templates?.find((t) => t.id === selectedTemplateId) || templates?.[0];
  const templatePlaceholders = currentTemplate ? extractPlaceholdersFromTemplate(currentTemplate) : [];

  // Fetch call stats from raw call_records (like a CDP)
  const { data: callStats } = useQuery({
    queryKey: ["call-stats-by-phone"],
    queryFn: async () => {
      const data = await listCallRecords({});

      // Calculate stats per phone number from raw data
      const stats: Record<
        string,
        {
          total: number;
          confirmed: number;
          declined: number;
          no_response: number;
          picked_up: number;
          not_picked_up: number;
        }
      > = {};

      data.forEach((record) => {
        if (!stats[record.phone_number]) {
          stats[record.phone_number] = {
            total: 0,
            confirmed: 0,
            declined: 0,
            no_response: 0,
            picked_up: 0,
            not_picked_up: 0,
          };
        }
        stats[record.phone_number].total++;

        // Count by status from call_records
        if (record.status === "confirmed") {
          stats[record.phone_number].confirmed++;
          stats[record.phone_number].picked_up++;
        } else if (record.status === "declined") {
          stats[record.phone_number].declined++;
          stats[record.phone_number].picked_up++;
        } else if (record.status === "no_response") {
          stats[record.phone_number].no_response++;
          stats[record.phone_number].picked_up++;
        } else if (record.status === "completed") {
          stats[record.phone_number].picked_up++;
        } else if (record.status === "no_answer" || record.status === "failed") {
          stats[record.phone_number].not_picked_up++;
        }
      });
      return stats;
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const createDebtorMutation = useMutation({
    mutationFn: async (data: { formData: typeof formData; variables: Record<string, string> }) => {
      // Use effectiveUserId for admin impersonation
      const targetUserId = effectiveUserId;
      if (!targetUserId) throw new Error("Not authenticated");
      if (!currentWorkspace?.id) throw new Error("No workspace selected");

      const variablesData = buildVariablesToSave(data.variables, null, data.formData.due_date, data.formData.paid_date);
      const totalDebt = parseDebtAmountForColumn(variablesData.total_debt);

      await createDebtor({
        phone_number: data.formData.phone_number,
        status: data.formData.status,
        notes: data.formData.notes || "",
        total_debt: totalDebt,
        ...(data.formData.due_date ? { due_date: data.formData.due_date } : {}),
        variables: variablesData,
        workspace_id: currentWorkspace.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["debtors"] });
      toast.success("Debtor added");
      setShowAddDialog(false);
      resetForm();
    },
    onError: (error: Error) => {
      if (error.message.includes("duplicate")) {
        toast.error("Phone number already exists");
      } else {
        toast.error("Failed to add debtor");
      }
    },
  });

  const updateDebtorMutation = useMutation({
    mutationFn: async ({
      id,
      data,
      existingVariables,
    }: {
      id: string;
      data: { formData: typeof formData; variables: Record<string, string> };
      existingVariables: Record<string, unknown> | null | undefined;
    }) => {
      const variablesData = buildVariablesToSave(
        data.variables,
        existingVariables,
        data.formData.due_date,
        data.formData.paid_date,
      );
      const totalDebt = parseDebtAmountForColumn(variablesData.total_debt);

      await updateDebtor(id, currentWorkspace?.id ?? "", {
        phone_number: data.formData.phone_number,
        status: data.formData.status,
        notes: data.formData.notes || "",
        total_debt: totalDebt,
        ...(data.formData.due_date ? { due_date: data.formData.due_date } : {}),
        variables: variablesData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["debtors"] });
      toast.success("Debtor updated");
      setEditingDebtor(null);
      resetForm();
    },
    onError: () => {
      toast.error("Failed to update debtor");
    },
  });

  const deleteDebtorMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteDebtor(id, currentWorkspace?.id ?? "");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["debtors"] });
      toast.success("Debtor removed");
    },
    onError: () => {
      toast.error("Failed to remove debtor");
    },
  });

  const clearAllDebtorsMutation = useMutation({
    mutationFn: async () => {
      if (!currentWorkspace?.id) throw new Error("No workspace selected");
      if (!effectiveUserId) throw new Error("Not authenticated");

      // No bulk-delete endpoint; remove this user's debtors one at a time.
      const all = await listDebtorsByWorkspace(currentWorkspace.id);
      const mine = all.filter((d) => d.user_id === effectiveUserId);
      await Promise.all(mine.map((d) => deleteDebtor(d.id, currentWorkspace.id)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["debtors"] });
      queryClient.invalidateQueries({ queryKey: ["debtors-stats"] });
      queryClient.invalidateQueries({ queryKey: ["workspace-schema"] });
      toast.success("All debtors cleared");
      setSelectedDebtors(new Set());
    },
    onError: () => {
      toast.error("Failed to clear debtors");
    },
  });

  // call_templates is not served by the Go API; no workspace template available.
  const workspaceTemplate: { id: string } | null = null;

  // Make call mutation - directly call the debtor
  const makeCallMutation = useMutation({
    mutationFn: async (debtor: Debtor) => {
      const debtorVars = {
        ...((debtor.variables || {}) as Record<string, string>),
      };

      await makeCall({ phone_number: debtor.phone_number, variables: debtorVars });

      // Create call record (botnoi_call_id is not returned by the Go make-call endpoint)
      await createCallRecord({
        phone_number: debtor.phone_number,
        template_id: workspaceTemplate?.id ?? null,
        workspace_id: currentWorkspace?.id,
        status: "pending",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["call-records"] });
      queryClient.invalidateQueries({ queryKey: ["call-stats-by-phone"] });
      toast.success("Call initiated successfully");
      setAddingToCallList(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to make call");
      setAddingToCallList(null);
    },
  });

  const handleMakeCall = (debtor: Debtor) => {
    setAddingToCallList(debtor.id);
    makeCallMutation.mutate(debtor);
  };

  // Send selected debtors to call list
  const sendToCallListMutation = useMutation({
    mutationFn: async () => {
      const targetUserId = effectiveUserId;
      if (!targetUserId) throw new Error("Not authenticated");
      if (!currentWorkspace?.id) throw new Error("No workspace selected");

      const debtorsToAdd = debtors?.filter((d) => selectedDebtors.has(d.id)) || [];
      if (debtorsToAdd.length === 0) throw new Error("No debtors selected");

      // Get default template
      const defaultTemplate = templates.find((t) => !t.is_system_default) || templates[0];

      // No bulk-create endpoint; create call-list items one at a time (user bound server-side).
      await Promise.all(
        debtorsToAdd.map((debtor) =>
          createCallListItem({
            debtor_id: debtor.id,
            workspace_id: currentWorkspace.id,
            template_id: defaultTemplate?.id || "",
            status: "pending",
          }),
        ),
      );

      return debtorsToAdd.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["call-list-items"] });
      toast.success(`Added ${count} debtors to Call List`);
      setSelectedDebtors(new Set());
      if (onNextStep) {
        onNextStep();
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to add to call list");
    },
  });

  // Select/deselect all visible debtors
  const toggleSelectAll = () => {
    if (!debtors) return;

    const selectableDebtors = debtors.filter((d) => d.status !== "paid");
    const allSelected = selectableDebtors.every((d) => selectedDebtors.has(d.id));

    if (allSelected) {
      // Deselect all
      const newSelected = new Set(selectedDebtors);
      selectableDebtors.forEach((d) => newSelected.delete(d.id));
      setSelectedDebtors(newSelected);
    } else {
      // Select all
      const newSelected = new Set(selectedDebtors);
      selectableDebtors.forEach((d) => newSelected.add(d.id));
      setSelectedDebtors(newSelected);
    }
  };

  // Toggle single debtor selection
  const toggleDebtorSelection = (debtorId: string) => {
    const newSelected = new Set(selectedDebtors);
    if (newSelected.has(debtorId)) {
      newSelected.delete(debtorId);
    } else {
      newSelected.add(debtorId);
    }
    setSelectedDebtors(newSelected);
  };

  const resetForm = () => {
    setFormData({
      phone_number: "",
      status: "active",
      notes: "",
      due_date: "",
      paid_date: "",
    });
    setTemplateVariables(emptyDebtorCustomerVariables());
  };

  const handleEdit = (debtor: Debtor) => {
    setEditingDebtor(debtor);
    const debtorVars = debtor.variables || {};
    setFormData({
      phone_number: debtor.phone_number,
      status: debtor.status,
      notes: debtor.notes || "",
      due_date: debtor.due_date ? debtor.due_date.slice(0, 10) : "",
      paid_date: debtor.variables?.paid_date_iso || "",
    });
    const next = emptyDebtorCustomerVariables();
    for (const k of DEBTOR_CUSTOMER_VARIABLE_KEYS) {
      if (["due_date", "due_month", "due_year", "paid_date", "paid_month", "paid_year"].includes(k)) continue;
      const v = debtorVars[k];
      next[k] = v != null && v !== undefined ? String(v) : "";
    }
    setTemplateVariables(next);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.phone_number) {
      toast.error("Phone number is required");
      return;
    }
    if (!formData.due_date?.trim()) {
      toast.error("Due date is required");
      return;
    }
    if (!templateVariables.policy_no?.trim()) {
      toast.error("Policy number is required");
      return;
    }
    if (!templateVariables.name?.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!templateVariables.outstanding_amount?.trim()) {
      toast.error("Outstanding amount is required");
      return;
    }
    if (!templateVariables.overdue_installments?.toString().trim()) {
      toast.error("Overdue Installments is required");
      return;
    }

    if (editingDebtor) {
      updateDebtorMutation.mutate({
        id: editingDebtor.id,
        data: { formData, variables: templateVariables },
        existingVariables: editingDebtor.variables,
      });
    } else {
      createDebtorMutation.mutate({ formData, variables: templateVariables });
    }
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
    setPage(0); // Reset to first page on sort change
  };

  const getSortIcon = (field: string) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-50" />;
    return sortDirection === "asc" ? <ArrowUp className="w-3 h-3 ml-1" /> : <ArrowDown className="w-3 h-3 ml-1" />;
  };

  // Reset page when filters change
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPage(0);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPage(0);
  };

  const handleCallStatusChange = (value: string) => {
    setCallStatusFilter(value);
    setPage(0);
  };

  // Fetch aggregate stats separately using count queries to avoid 1000 row limit
  const { data: statsData } = useQuery({
    queryKey: ["debtors-stats", effectiveUserId, currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return { total: 0, totalDebt: 0, active: 0, paid: 0 };

      const all = await listDebtorsByWorkspace(currentWorkspace.id);
      const scoped = effectiveUserId ? all.filter((d) => d.user_id === effectiveUserId) : all;

      const active = scoped.filter((d) => d.status === "active").length;
      const paid = scoped.filter((d) => d.status === "paid").length;

      const totalDebt = scoped.reduce((sum, d) => {
        const vars = (d.variables ?? {}) as Record<string, unknown>;
        const debtValue = vars.Debt || vars.debt || vars.total_debt || 0;
        const numericValue = Number(String(debtValue).replace(/,/g, "")) || 0;
        return sum + numericValue;
      }, 0);

      return { total: scoped.length, totalDebt, active, paid };
    },
    enabled: !!effectiveUserId,
  });

  const stats = statsData || { total: 0, totalDebt: 0, active: 0, paid: 0 };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("th-TH", {
      style: "currency",
      currency: "THB",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const handleExportExcel = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      if (!currentWorkspace?.id) {
        toast.info("No workspace selected");
        return;
      }

      // Fetch all workspace debtors, then apply the same filters/sort as the table.
      const allRaw = (await listDebtorsByWorkspace(currentWorkspace.id)) as unknown as Debtor[];
      const all = applyDebtorFilters(allRaw);

      if (all.length === 0) {
        toast.info("No debtors to export");
        return;
      }

      // Compute call stats from the user's call_records (scoped server-side by JWT).
      const exportStats: Record<
        string,
        { total: number; picked_up: number; not_picked_up: number }
      > = {};
      const recs = await listCallRecords({});
      recs.forEach((r) => {
        if (!r.phone_number) return;
        const s = (exportStats[r.phone_number] ||= { total: 0, picked_up: 0, not_picked_up: 0 });
        s.total++;
        if (
          r.status === "confirmed" ||
          r.status === "declined" ||
          r.status === "no_response" ||
          r.status === "completed"
        ) {
          s.picked_up++;
        } else if (r.status === "no_answer" || r.status === "failed") {
          s.not_picked_up++;
        }
      });

      const fmtLastContact = (iso: string | null | undefined) =>
        iso
          ? new Date(iso).toLocaleDateString("th-TH", {
              day: "numeric",
              month: "long", // full month name
              year: "numeric", // full year number (B.E)
              hour: "2-digit",
              minute: "2-digit",
            })
          : "-";

      const rows = all.map((d: any) => {
        const v = (d.variables ?? {}) as Record<string, string>;
        const rawStatus = latestStatusByDebtor?.get(d.id) ?? null;
        const statusLabel = rawStatus ? resolveLatestStatusLabel(rawStatus) : "-";
        const dueParts = [v.due_date, v.due_month, v.due_year].filter((p) => p && String(p).trim());
        const s = exportStats[d.phone_number];
        return {
          Contact: d.phone_number || "-",
          Name: v.name || "-",
          "Latest Call Status": statusLabel || "-",
          "Callback Date": d.date_con ? formatThaiBuddhistDateShort(d.date_con) : "-",
          "Policy Number": v.policy_no || "-",
          "Outstanding Amount": v.outstanding_amount || "-",
          "Overdue Installments": v.overdue_installments || "-",
          "Due Date": dueParts.length > 0 ? dueParts.join(" ") : "-",
          Picked: s?.picked_up ?? 0,
          "No Pick": s?.not_picked_up ?? 0,
          Calls: s?.total ?? 0,
          "Last Contact": fmtLastContact(d.last_contact_at),
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Debtors");

      // Auto-size columns
      const colWidths = Object.keys(rows[0] || {}).map((key) => ({
        wch: Math.max(key.length, ...rows.map((r) => String(r[key as keyof typeof r] ?? "").length)),
      }));
      ws["!cols"] = colWidths;

      const fileName = `debtors-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
      XLSX.writeFile(wb, fileName);

      toast.success(`Exported ${rows.length} debtors`);
    } catch (err: any) {
      console.error("Export error:", err);
      toast.error(err?.message || "Failed to export debtors");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Excel Upload Dialog */}
      <DebtorExcelUpload open={showExcelUpload} onOpenChange={setShowExcelUpload} />

      {/* Form Dialog */}
      <Dialog
        open={showAddDialog || !!editingDebtor}
        onOpenChange={(open) => {
          if (!open) {
            setShowAddDialog(false);
            setEditingDebtor(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingDebtor ? "Edit Debtor" : "Add Debtor"}</DialogTitle>
            <DialogDescription>
              {editingDebtor ? "Update debtor information" : "Add a new debtor to track"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4 max-h-[60vh] overflow-y-auto pr-2">
            {/* Phone Number - Always required */}
            <div className="space-y-1.5">
              <Label className="text-sm">Phone Number *</Label>
              <Input
                value={formData.phone_number}
                onChange={(e) => setFormData((p) => ({ ...p, phone_number: e.target.value }))}
                placeholder="0812345678"
              />
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-sm">Customer data</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Variables sent to bot: <code className="text-xs bg-muted px-1 rounded">{"{policy_no}"}</code>,{" "}
                  <code className="text-xs bg-muted px-1 rounded">{"{name}"}</code>,{" "}
                  <code className="text-xs bg-muted px-1 rounded">{"{outstanding_amount}"}</code>,{" "}
                  <code className="text-xs bg-muted px-1 rounded">{"{due_date}"}</code>, etc.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">Due Date *</Label>
                  <Input
                    type="date"
                    required
                    value={formData.due_date || ""}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        due_date: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm">Paid Date</Label>
                  <Input
                    type="date"
                    value={formData.paid_date || ""}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        paid_date: e.target.value,
                      }))
                    }
                  />
                </div>

                {DEBTOR_CUSTOMER_VARIABLE_KEYS.filter(
                  (key) => !["due_date", "due_month", "due_year", "paid_date", "paid_month", "paid_year"].includes(key),
                ).map((key) => {
                  const isRequired = ["policy_no", "name", "outstanding_amount", "overdue_installments"].includes(key);
                  return (
                    <div key={key} className="space-y-1.5">
                      <Label className="text-sm">
                        {DEBTOR_CUSTOMER_VARIABLE_LABELS[key]}
                        {isRequired && <span className="text-destructive ml-0.5">*</span>}
                      </Label>
                      <Input
                        type={key === "overdue_installments" ? "number" : "text"}
                        min={key === "overdue_installments" ? 0 : undefined}
                        step={key === "overdue_installments" ? 1 : undefined}
                        required={isRequired}
                        value={templateVariables[key] ?? ""}
                        onChange={(e) =>
                          setTemplateVariables((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }))
                        }
                        placeholder={key}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Add notes..."
                className="resize-none"
                rows={2}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowAddDialog(false);
                  setEditingDebtor(null);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={createDebtorMutation.isPending || updateDebtorMutation.isPending}
              >
                {(createDebtorMutation.isPending || updateDebtorMutation.isPending) && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                {editingDebtor ? "Update" : "Add Debtor"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Debtors</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Track and manage debt collection contacts</p>
        </div>
        <div className="flex gap-2">
          {totalCount > 0 && (
            <Button
              variant="outline"
              onClick={() => {
                if (
                  window.confirm(
                    `Are you sure you want to delete all ${totalCount} debtors? This action cannot be undone.`,
                  )
                ) {
                  clearAllDebtorsMutation.mutate();
                }
              }}
              disabled={clearAllDebtorsMutation.isPending}
              className="text-destructive hover:text-destructive"
            >
              {clearAllDebtorsMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Clear All
            </Button>
          )}
          <Button variant="outline" onClick={() => setShowExcelUpload(true)}>
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Import Excel
          </Button>
          <Button variant="outline" onClick={handleExportExcel} disabled={isExporting || totalCount === 0}>
            {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            {isExporting ? "Exporting..." : "Export Excel"}
          </Button>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Debtor
          </Button>
        </div>
      </div>

      {/* Filters & Auto-Dial */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-3 items-center flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by phone or name..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="negotiating">Negotiating</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="defaulted">Defaulted</SelectItem>
            </SelectContent>
          </Select>
          {isFetching && !isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          <div className="text-sm text-muted-foreground ml-auto">{totalCount.toLocaleString()} results</div>
        </div>

        {/* Send to Call List Controls - Selection Count Only */}
        <div className="flex gap-3 items-center flex-wrap p-3 bg-muted/30 rounded-lg border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Bulk Actions:</span>
            <Badge variant="outline" className="font-mono">
              {selectedDebtors.size} selected
            </Badge>
          </div>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base font-medium">Debtor List</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={callStatusFilter} onValueChange={handleCallStatusChange}>
              <SelectTrigger className="h-8 w-56 text-xs">
                <SelectValue placeholder="All Call Statuses" />
              </SelectTrigger>
              <SelectContent className="bg-popover max-h-80">
                <SelectItem value="all">All Call Statuses</SelectItem>
                <SelectItem value="never">Never Called</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
                <SelectGroup>
                  <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Main Status
                  </SelectLabel>
                  {MAIN_STATUSES.map((s) => (
                    <SelectItem key={`main-${s.key}`} value={s.label}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Sub Status
                  </SelectLabel>
                  {SUB_STATUSES.map((s) => (
                    <SelectItem key={`sub-${s.key}`} value={s.label}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 justify-start text-left font-normal gap-2 min-w-[220px] text-xs"
                >
                  <CalendarIcon className="h-3.5 w-3.5 opacity-60" />
                  {dateRange?.from ? (
                    <span className="flex-1 truncate">
                      {format(dateRange.from, "d MMM yyyy", { locale: th })} -{" "}
                      {format(dateRange.to ?? dateRange.from, "d MMM yyyy", { locale: th })}
                    </span>
                  ) : (
                    <span className="flex-1 text-muted-foreground">เลือกช่วงวันที่</span>
                  )}
                  {dateRange?.from && (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label="Clear date range"
                      className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded hover:bg-muted"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDateRange(undefined);
                        setPage(0);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          setDateRange(undefined);
                          setPage(0);
                        }
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-popover" align="start">
                <Calendar
                  mode="range"
                  numberOfMonths={2}
                  selected={dateRange}
                  onSelect={(range) => {
                    setDateRange(range);
                    setPage(0);
                  }}
                  initialFocus
                  locale={th}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <Button
              variant="default"
              size="sm"
              onClick={() => sendToCallListMutation.mutate()}
              disabled={selectedDebtors.size === 0 || sendToCallListMutation.isPending}
              className="h-8 gap-1.5 bg-primary/90 hover:bg-primary shadow-sm"
            >
              {sendToCallListMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              Send to Call List
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={toggleSelectAll}
              disabled={!debtors || debtors.length === 0}
              className="h-8 text-xs"
            >
              {debtors && debtors.filter((d) => d.status !== "paid").every((d) => selectedDebtors.has(d.id))
                ? "Deselect"
                : "Select All"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : debtors && debtors.length > 0 ? (
            <>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={
                            debtors &&
                            debtors.filter((d) => d.status !== "paid").length > 0 &&
                            debtors.filter((d) => d.status !== "paid").every((d) => selectedDebtors.has(d.id))
                          }
                          onCheckedChange={toggleSelectAll}
                          disabled={sendToCallListMutation.isPending}
                        />
                      </TableHead>
                      <TableHead className="text-xs w-12">#</TableHead>
                      <TableHead className="text-xs">Contact</TableHead>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs">Latest Call Status</TableHead>
                      <TableHead
                        className="text-xs cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort("date_con")}
                      >
                        <div className="flex items-center whitespace-nowrap">
                          Callback Date
                          {getSortIcon("date_con")}
                        </div>
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap">Policy Number</TableHead>
                      <TableHead className="text-xs whitespace-nowrap">Outstanding Amount</TableHead>
                      <TableHead className="text-xs whitespace-nowrap">Overdue Installment</TableHead>
                      {variableColumns.map((varKey) => (
                        <TableHead
                          key={varKey}
                          className="text-xs cursor-pointer hover:bg-muted/50 select-none"
                          onClick={() => handleSort(`var:${varKey}`)}
                        >
                          <div className="flex items-center">
                            {varKey}
                            {getSortIcon(`var:${varKey}`)}
                          </div>
                        </TableHead>
                      ))}
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead
                        className="text-xs cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort("picked_up_count")}
                      >
                        <div className="flex items-center">
                          Picked
                          {getSortIcon("picked_up_count")}
                        </div>
                      </TableHead>
                      <TableHead
                        className="text-xs cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort("not_picked_up_count")}
                      >
                        <div className="flex items-center">
                          No Pick
                          {getSortIcon("not_picked_up_count")}
                        </div>
                      </TableHead>
                      <TableHead
                        className="text-xs cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort("accept_count")}
                      >
                        <div className="flex items-center">
                          Accept
                          {getSortIcon("accept_count")}
                        </div>
                      </TableHead>
                      <TableHead
                        className="text-xs cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort("reject_count")}
                      >
                        <div className="flex items-center">
                          Reject
                          {getSortIcon("reject_count")}
                        </div>
                      </TableHead>
                      <TableHead
                        className="text-xs cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort("other_count")}
                      >
                        <div className="flex items-center">
                          Other
                          {getSortIcon("other_count")}
                        </div>
                      </TableHead>
                      <TableHead
                        className="text-xs cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort("contact_attempts")}
                      >
                        <div className="flex items-center">
                          Calls
                          {getSortIcon("contact_attempts")}
                        </div>
                      </TableHead>
                      <TableHead
                        className="text-xs cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort("last_contact_at")}
                      >
                        <div className="flex items-center">
                          Last Contact
                          {getSortIcon("last_contact_at")}
                        </div>
                      </TableHead>
                      <TableHead className="text-xs w-24">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...debtors]
                      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                      .map((debtor, index) => {
                        const phoneStats = callStats?.[debtor.phone_number];
                        const isAdding = addingToCallList === debtor.id;
                        const isSelected = selectedDebtors.has(debtor.id);
                        const rowNumber = index + 1;

                        return (
                          <TableRow
                            key={debtor.id}
                            className={`${isSelected ? "bg-muted/30" : ""} ${(debtor as any).is_blocked ? "opacity-50" : ""}`}
                          >
                            <TableCell>
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleDebtorSelection(debtor.id)}
                                disabled={sendToCallListMutation.isPending || debtor.status === "paid"}
                              />
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground font-mono">{rowNumber}</TableCell>
                            <TableCell>
                              <div className="font-mono text-sm">{maskPhoneNumber(debtor.phone_number)}</div>
                            </TableCell>
                            <TableCell className="text-sm">
                              {formatVariableValue("name", debtor.variables?.name)}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {(() => {
                                const raw = latestStatusByDebtor?.get(debtor.id) ?? null;
                                const label = resolveLatestStatusLabel(raw);
                                const tone = resolveLatestStatusTone(raw);
                                if (tone === "none") {
                                  return <span className="text-sm text-muted-foreground">–</span>;
                                }
                                const isHighPriority = tone === "callback" || tone === "transfer";
                                return (
                                  <Badge variant="outline" className={`gap-1.5 font-medium ${STATUS_TONE_CLASS[tone]}`}>
                                    {isHighPriority && (
                                      <span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />
                                    )}
                                    {label}
                                  </Badge>
                                );
                              })()}
                            </TableCell>
                            <TableCell>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {formatThaiBuddhistDateShort(debtor.date_con)}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm">
                              {formatVariableValue("policy_no", debtor.variables?.policy_no)}
                            </TableCell>
                            <TableCell className="text-sm">
                              {formatVariableValue("outstanding_amount", debtor.variables?.outstanding_amount)}
                            </TableCell>
                            <TableCell className="text-sm">
                              {formatVariableValue("overdue_installments", debtor.variables?.overdue_installments)}
                            </TableCell>

                            {variableColumns.map((varKey) => {
                              const value = debtor.variables?.[varKey];
                              // Format numbers with commas for Debt, Installment, or any numeric-looking values
                              const isNumeric = value && !isNaN(Number(String(value).replace(/,/g, "")));
                              const isYearField = varKey.toLowerCase().includes("year");

                              let displayValue = value
                                ? isNumeric && !isYearField
                                  ? Number(String(value).replace(/,/g, "")).toLocaleString("th-TH")
                                  : String(value)
                                : "-";

                              // Mask license plate fields
                              if (value && isLicensePlateField(varKey)) {
                                displayValue = maskLicensePlate(String(value));
                              }

                              return (
                                <TableCell key={varKey} className="text-sm">
                                  {displayValue}
                                </TableCell>
                              );
                            })}
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className={`${statusConfig[debtor.status]?.color} font-normal`}
                              >
                                {statusConfig[debtor.status]?.label || debtor.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span
                                className={`text-sm font-medium ${(phoneStats?.picked_up || 0) > 0 ? "text-success" : "text-muted-foreground"}`}
                              >
                                {phoneStats?.picked_up || 0}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span
                                className={`text-sm font-medium ${(phoneStats?.not_picked_up || 0) > 0 ? "text-destructive" : "text-muted-foreground"}`}
                              >
                                {phoneStats?.not_picked_up || 0}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span
                                className={`text-sm font-medium ${(phoneStats?.confirmed || 0) > 0 ? "text-success" : "text-muted-foreground"}`}
                              >
                                {phoneStats?.confirmed || 0}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span
                                className={`text-sm font-medium ${(phoneStats?.declined || 0) > 0 ? "text-destructive" : "text-muted-foreground"}`}
                              >
                                {phoneStats?.declined || 0}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span
                                className={`text-sm font-medium ${(phoneStats?.no_response || 0) > 0 ? "text-warning" : "text-muted-foreground"}`}
                              >
                                {phoneStats?.no_response || 0}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <PhoneCall className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-sm">{phoneStats?.total || 0}</span>
                                {phoneStats && phoneStats.confirmed > 0 && (
                                  <span className="text-xs text-success">({phoneStats.confirmed} ✓)</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                {debtor.last_contact_at
                                  ? new Date(debtor.last_contact_at).toLocaleDateString("th-TH", {
                                      day: "numeric",
                                      month: "short",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : "-"}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {/* Call button hidden
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1.5"
                                onClick={() => handleMakeCall(debtor)}
                                disabled={isAdding || debtor.status === "paid" || (debtor as any).is_blocked}
                              >
                                {isAdding ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <PhoneCall className="w-3.5 h-3.5" />
                                )}
                                Call
                              </Button>
                              */}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                      <MoreHorizontal className="w-4 h-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="bg-popover">
                                    <DropdownMenuItem onClick={() => handleEdit(debtor)}>
                                      <Pencil className="w-4 h-4 mr-2" />
                                      Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={async () => {
                                        const newBlocked = !(debtor as any).is_blocked;
                                        try {
                                          await updateDebtor(debtor.id, currentWorkspace?.id ?? "", {
                                            is_blocked: newBlocked,
                                          });
                                        } catch {
                                          toast.error("Failed to update block status");
                                          return;
                                        }
                                        queryClient.invalidateQueries({ queryKey: ["debtors"] });
                                        toast.success(
                                          newBlocked
                                            ? "Blocked - จะไม่โทรหาลูกค้านี้"
                                            : "Unblocked - สามารถโทรได้อีกครั้ง",
                                        );
                                      }}
                                    >
                                      {(debtor as any).is_blocked ? "🔓 Unblock" : "🚫 Block (ห้ามโทร)"}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => deleteDebtorMutation.mutate(debtor.id)}
                                      className="text-destructive focus:text-destructive"
                                    >
                                      <Trash2 className="w-4 h-4 mr-2" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </div>
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Page {page + 1} of {totalPages} ({totalCount.toLocaleString()} total)
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                    >
                      Next
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>No debtors found</p>
              <p className="text-sm">Add debtors to start tracking</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DebtorsList;
