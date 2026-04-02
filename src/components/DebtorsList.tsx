import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
} from "lucide-react";
import DebtorExcelUpload from "./DebtorExcelUpload";
import InlineTemplateEditor from "./InlineTemplateEditor";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAdmin } from "@/contexts/AdminContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toThaiPhonetic, shouldUsePhonetic, spellThaiName, isNameField } from "@/lib/thaiPhonetic";
import { maskPhoneNumber, maskLicensePlate, isLicensePlateField } from "@/lib/formatPhone";
import {
  DEBTOR_CUSTOMER_VARIABLE_KEYS,
  DEBTOR_CUSTOMER_VARIABLE_LABELS,
  emptyDebtorCustomerVariables,
  parseDebtAmountForColumn,
} from "@/lib/debtorVariables";

function buildVariablesToSave(
  tv: Record<string, string>,
  preserveTemplateFrom?: Record<string, unknown> | null,
  dueDateIso?: string
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of DEBTOR_CUSTOMER_VARIABLE_KEYS) {
    if (k === "due_date") {
      out[k] = dueDateIso?.trim() ?? "";
    } else {
      out[k] = tv[k] ?? "";
    }
  }
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
}

const statusConfig: Record<string, { label: string; color: string }> = {
  active: { label: "Active", color: "bg-primary/10 text-primary" },
  paid: { label: "Paid", color: "bg-success/10 text-success" },
  defaulted: { label: "Defaulted", color: "bg-destructive/10 text-destructive" },
  negotiating: { label: "Negotiating", color: "bg-warning/10 text-warning" },
  pending: { label: "Pending", color: "bg-muted text-muted-foreground" },
};


const DebtorsList = () => {
  const queryClient = useQueryClient();
  const { effectiveUserId, isAdmin, selectedUserId } = useAdmin();
  const { currentWorkspace } = useWorkspace();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingDebtor, setEditingDebtor] = useState<Debtor | null>(null);
  const [addingToCallList, setAddingToCallList] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    phone_number: "",
    status: "active",
    notes: "",
    due_date: "",
  });
  const [templateVariables, setTemplateVariables] = useState<
    Record<string, string>
  >(() => emptyDebtorCustomerVariables());
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [sortField, setSortField] = useState<string>("created_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [showExcelUpload, setShowExcelUpload] = useState(false);
  
  // Selection for send to call list
  const [selectedDebtors, setSelectedDebtors] = useState<Set<string>>(new Set());
  
  const pageSize = 50;

  // Server-side paginated query with sorting and filtering
  const { data: debtorsData, isLoading, isFetching } = useQuery({
    queryKey: ["debtors", searchQuery, statusFilter, sortField, sortDirection, page, effectiveUserId, currentWorkspace?.id],
    queryFn: async () => {
      let query = supabase
        .from("debtors")
        .select("*", { count: "exact" });

      // Filter by workspace
      if (currentWorkspace?.id) {
        query = query.eq("workspace_id", currentWorkspace.id);
      }

      // Filter by effective user if admin is impersonating
      if (effectiveUserId) {
        query = query.eq("user_id", effectiveUserId);
      }

      // Apply status filter
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      // Apply search filter (server-side)
      if (searchQuery) {
        query = query.or(`phone_number.ilike.%${searchQuery}%,name.ilike.%${searchQuery}%`);
      }

      // Apply sorting - handle variable column sorting with JSONB
      if (sortField.startsWith("var:")) {
        const varKey = sortField.replace("var:", "");
        // Sort by JSONB field using ->> operator for text extraction
        query = query.order(`variables->${varKey}`, { ascending: sortDirection === "asc", nullsFirst: false });
      } else {
        query = query.order(sortField, { ascending: sortDirection === "asc", nullsFirst: false });
      }

      // Apply pagination
      const from = page * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;
      return { debtors: data as Debtor[], totalCount: count || 0 };
    },
    placeholderData: (prev) => prev,
    enabled: !!effectiveUserId,
  });

  const debtors = debtorsData?.debtors;
  const totalCount = debtorsData?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  // Variable columns: standard customer keys first, then any legacy keys
  const variableColumns = useMemo(() => {
    if (!debtors?.length) return [];
    const allKeys = new Set(
      debtors.flatMap((d) =>
        d.variables
          ? Object.keys(d.variables).filter((k) => k !== "message_template")
          : []
      )
    );
    const ordered: string[] = [];
    for (const k of DEBTOR_CUSTOMER_VARIABLE_KEYS) {
      if (allKeys.has(k)) ordered.push(k);
    }
    const rest = [...allKeys]
      .filter((k) => !DEBTOR_CUSTOMER_VARIABLE_KEYS.includes(k as (typeof DEBTOR_CUSTOMER_VARIABLE_KEYS)[number]))
      .sort();
    return [...ordered, ...rest];
  }, [debtors]);

  const { data: templates } = useQuery({
    queryKey: ["templates-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_templates")
        .select("*")
        .not("template_id", "is", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Extract placeholders from template messages
  const extractPlaceholdersFromTemplate = (template: NonNullable<typeof templates>[number] | undefined) => {
    if (!template) return [];
    const allText = [template.message, template.confirm_message, template.decline_message, template.fallback_message].join(" ");
    const matches = allText.match(/\{([^}]+)\}/g) || [];
    const placeholders = [...new Set(matches.map(m => m.slice(1, -1)))];
    // Filter out org_name as it comes from template itself
    return placeholders.filter(p => !p.toLowerCase().includes('org'));
  };

  // Get current template placeholders
  const currentTemplate = templates?.find(t => t.id === selectedTemplateId) || templates?.[0];
  const templatePlaceholders = currentTemplate ? extractPlaceholdersFromTemplate(currentTemplate) : [];

  // Fetch call stats from raw call_records (like a CDP)
  const { data: callStats } = useQuery({
    queryKey: ["call-stats-by-phone"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_records")
        .select("phone_number, status");

      if (error) throw error;

      // Calculate stats per phone number from raw data
      const stats: Record<string, { 
        total: number; 
        confirmed: number; 
        declined: number; 
        no_response: number;
        picked_up: number;
        not_picked_up: number;
      }> = {};
      
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
      
      const variablesData = buildVariablesToSave(
        data.variables,
        null,
        data.formData.due_date
      );
      const totalDebt = parseDebtAmountForColumn(variablesData.total_debt);

      const { error } = await supabase.from("debtors").insert({
        phone_number: data.formData.phone_number,
        status: data.formData.status,
        notes: data.formData.notes || null,
        total_debt: totalDebt,
        due_date: data.formData.due_date,
        variables: variablesData,
        user_id: targetUserId,
        workspace_id: currentWorkspace.id,
      });
      if (error) throw error;
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
        data.formData.due_date
      );
      const totalDebt = parseDebtAmountForColumn(variablesData.total_debt);

      const { error } = await supabase
        .from("debtors")
        .update({
          phone_number: data.formData.phone_number,
          status: data.formData.status,
          notes: data.formData.notes || null,
          total_debt: totalDebt,
          due_date: data.formData.due_date,
          variables: variablesData,
        })
        .eq("id", id);
      if (error) throw error;
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
      const { error } = await supabase.from("debtors").delete().eq("id", id);
      if (error) throw error;
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

      const { error } = await supabase
        .from("debtors")
        .delete()
        .eq("workspace_id", currentWorkspace.id)
        .eq("user_id", effectiveUserId);

      if (error) throw error;
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

  // Fetch workspace template for calls
  const { data: workspaceTemplate } = useQuery({
    queryKey: ["workspace-template", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return null;

      const { data, error } = await supabase
        .from("call_templates")
        .select("*")
        .eq("workspace_id", currentWorkspace.id)
        .not("template_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!currentWorkspace?.id,
  });

  // Make call mutation - directly call the debtor
  const makeCallMutation = useMutation({
    mutationFn: async (debtor: Debtor) => {
      if (!workspaceTemplate?.template_id) {
        throw new Error("No template configured. Please set up a call template first.");
      }

      // Construct the full message by replacing placeholders with debtor variables
      let constructedMessage = workspaceTemplate.message;
      const debtorVars = debtor.variables || {};
      
      // Replace all {placeholder} with actual values from debtor variables
      // Apply Thai phonetic conversion for license plate fields
      Object.entries(debtorVars).forEach(([key, value]) => {
        const placeholder = new RegExp(`\\{${key}\\}`, 'g');
        let processedValue = String(value);
        
        // Convert license plate fields to Thai phonetic reading (karaoke style)
        if (shouldUsePhonetic(key)) {
          processedValue = toThaiPhonetic(processedValue);
        }
        // Spell out difficult Thai names phonetically
        else if (isNameField(key)) {
          processedValue = spellThaiName(processedValue);
        }
        
        constructedMessage = constructedMessage.replace(placeholder, processedValue);
      });
      
      console.log("Constructed message:", constructedMessage);

      const { data, error } = await supabase.functions.invoke("botnoi-make-call", {
        body: {
          phone_number: debtor.phone_number,
          template_id: workspaceTemplate.template_id,
          constructed_message: constructedMessage,
        },
      });

      if (error) throw error;
      
      // Create call record
      await supabase.from("call_records").insert({
        phone_number: debtor.phone_number,
        template_id: workspaceTemplate.id,
        user_id: effectiveUserId,
        workspace_id: currentWorkspace?.id,
        status: "pending",
        botnoi_call_id: data?.outbound_id || null,
      });

      return data;
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

      const debtorsToAdd = debtors?.filter(d => selectedDebtors.has(d.id)) || [];
      if (debtorsToAdd.length === 0) throw new Error("No debtors selected");

      // Get default template
      const defaultTemplate = templates?.find(t => !t.is_system_default) || templates?.[0];

      const items = debtorsToAdd.map(debtor => ({
        debtor_id: debtor.id,
        user_id: targetUserId,
        workspace_id: currentWorkspace.id,
        template_id: defaultTemplate?.id || null,
        status: "pending",
      }));

      const { error } = await supabase.from("call_list_items").insert(items);
      if (error) throw error;

      return debtorsToAdd.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["call-list-items"] });
      toast.success(`Added ${count} debtors to Call List`);
      setSelectedDebtors(new Set());
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to add to call list");
    },
  });

  // Select/deselect all visible debtors
  const toggleSelectAll = () => {
    if (!debtors) return;
    
    const selectableDebtors = debtors.filter(d => d.status !== "paid");
    const allSelected = selectableDebtors.every(d => selectedDebtors.has(d.id));
    
    if (allSelected) {
      // Deselect all
      const newSelected = new Set(selectedDebtors);
      selectableDebtors.forEach(d => newSelected.delete(d.id));
      setSelectedDebtors(newSelected);
    } else {
      // Select all
      const newSelected = new Set(selectedDebtors);
      selectableDebtors.forEach(d => newSelected.add(d.id));
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
    });
    const next = emptyDebtorCustomerVariables();
    for (const k of DEBTOR_CUSTOMER_VARIABLE_KEYS) {
      if (k === "due_date") continue;
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
    return sortDirection === "asc" 
      ? <ArrowUp className="w-3 h-3 ml-1" /> 
      : <ArrowDown className="w-3 h-3 ml-1" />;
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

  // Fetch aggregate stats separately using count queries to avoid 1000 row limit
  const { data: statsData } = useQuery({
    queryKey: ["debtors-stats", effectiveUserId, currentWorkspace?.id],
    queryFn: async () => {
      // Get total count
      let totalQuery = supabase
        .from("debtors")
        .select("*", { count: "exact", head: true });
      if (currentWorkspace?.id) {
        totalQuery = totalQuery.eq("workspace_id", currentWorkspace.id);
      }
      if (effectiveUserId) {
        totalQuery = totalQuery.eq("user_id", effectiveUserId);
      }
      const { count: totalCount, error: totalError } = await totalQuery;
      if (totalError) throw totalError;

      // Get active count
      let activeQuery = supabase
        .from("debtors")
        .select("*", { count: "exact", head: true })
        .eq("status", "active");
      if (currentWorkspace?.id) {
        activeQuery = activeQuery.eq("workspace_id", currentWorkspace.id);
      }
      if (effectiveUserId) {
        activeQuery = activeQuery.eq("user_id", effectiveUserId);
      }
      const { count: activeCount, error: activeError } = await activeQuery;
      if (activeError) throw activeError;

      // Get paid count
      let paidQuery = supabase
        .from("debtors")
        .select("*", { count: "exact", head: true })
        .eq("status", "paid");
      if (currentWorkspace?.id) {
        paidQuery = paidQuery.eq("workspace_id", currentWorkspace.id);
      }
      if (effectiveUserId) {
        paidQuery = paidQuery.eq("user_id", effectiveUserId);
      }
      const { count: paidCount, error: paidError } = await paidQuery;
      if (paidError) throw paidError;

      // Get total debt sum - use pagination to fetch ALL rows (avoid 1000 row limit)
      let allDebtData: { variables: unknown }[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        let debtQuery = supabase
          .from("debtors")
          .select("variables");
        if (currentWorkspace?.id) {
          debtQuery = debtQuery.eq("workspace_id", currentWorkspace.id);
        }
        if (effectiveUserId) {
          debtQuery = debtQuery.eq("user_id", effectiveUserId);
        }
        const { data: debtData, error: debtError } = await debtQuery
          .range(page * pageSize, (page + 1) * pageSize - 1);
        
        if (debtError) {
          console.error("Error fetching debt sum:", debtError);
          break;
        }

        if (debtData && debtData.length > 0) {
          allDebtData = [...allDebtData, ...debtData];
          page++;
          hasMore = debtData.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      // Sum Debt values from variables
      const totalDebt = allDebtData.reduce((sum, d) => {
        const vars = d.variables as Record<string, unknown> | null;
        const debtValue =
          vars?.Debt || vars?.debt || vars?.total_debt || 0;
        const numericValue = Number(String(debtValue).replace(/,/g, '')) || 0;
        return sum + numericValue;
      }, 0) || 0;

      return {
        total: totalCount || 0,
        totalDebt,
        active: activeCount || 0,
        paid: paidCount || 0,
      };
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
                  Use in call templates as{" "}
                  <code className="text-xs bg-muted px-1 rounded">
                    {"{agent_name}"}
                  </code>
                  ,{" "}
                  <code className="text-xs bg-muted px-1 rounded">
                    {"{customer_name}"}
                  </code>
                  ,{" "}
                  <code className="text-xs bg-muted px-1 rounded">
                    {"{total_debt}"}
                  </code>
                  ,{" "}
                  <code className="text-xs bg-muted px-1 rounded">
                    {"{due_date}"}
                  </code>
                  , etc.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {DEBTOR_CUSTOMER_VARIABLE_KEYS.map((key) => (
                  <div key={key} className="space-y-1.5">
                    <Label className="text-sm">
                      {DEBTOR_CUSTOMER_VARIABLE_LABELS[key]}
                      {key === "due_date" ? " *" : ""}
                    </Label>
                    {key === "due_date" ? (
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
                    ) : (
                      <Input
                        value={templateVariables[key] ?? ""}
                        onChange={(e) =>
                          setTemplateVariables((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }))
                        }
                        placeholder={key}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(v) => setFormData((p) => ({ ...p, status: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="negotiating">Negotiating</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="defaulted">Defaulted</SelectItem>
                </SelectContent>
              </Select>
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
          <p className="text-sm text-muted-foreground mt-0.5">
            Track and manage debt collection contacts
          </p>
        </div>
        <div className="flex gap-2">
          {totalCount > 0 && (
            <Button 
              variant="outline" 
              onClick={() => {
                if (window.confirm(`Are you sure you want to delete all ${totalCount} debtors? This action cannot be undone.`)) {
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
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Debtor
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-primary/10">
                <Users className="w-4 h-4 text-primary" />
              </div>
              <div>
                <div className="text-2xl font-semibold">{stats.total}</div>
                <div className="text-xs text-muted-foreground">Total Debtors</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-destructive/10">
                <TrendingUp className="w-4 h-4 text-destructive" />
              </div>
              <div>
                <div className="text-xl font-semibold">{formatCurrency(stats.totalDebt)}</div>
                <div className="text-xs text-muted-foreground">Total Outstanding</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-warning/10">
                <AlertCircle className="w-4 h-4 text-warning" />
              </div>
              <div>
                <div className="text-2xl font-semibold">{stats.active}</div>
                <div className="text-xs text-muted-foreground">Active Cases</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-success/10">
                <CheckCircle className="w-4 h-4 text-success" />
              </div>
              <div>
                <div className="text-2xl font-semibold">{stats.paid}</div>
                <div className="text-xs text-muted-foreground">Paid</div>
              </div>
            </div>
          </CardContent>
        </Card>
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
          {isFetching && !isLoading && (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          )}
          <div className="text-sm text-muted-foreground ml-auto">
            {totalCount.toLocaleString()} results
          </div>
        </div>

        {/* Send to Call List Controls */}
        <div className="flex gap-3 items-center flex-wrap p-3 bg-muted/30 rounded-lg border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Bulk Actions:</span>
            <Badge variant="outline" className="font-mono">
              {selectedDebtors.size} selected
            </Badge>
          </div>
          
          <Button
            variant="default"
            size="sm"
            onClick={() => sendToCallListMutation.mutate()}
            disabled={selectedDebtors.size === 0 || sendToCallListMutation.isPending}
            className="gap-1.5"
          >
            {sendToCallListMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Send to Call List
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleSelectAll}
            disabled={!debtors || debtors.length === 0}
          >
            {debtors && debtors.filter(d => d.status !== "paid").every(d => selectedDebtors.has(d.id))
              ? "Deselect All"
              : "Select All on Page"}
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Debtor List</CardTitle>
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
                          checked={debtors && debtors.filter(d => d.status !== "paid").length > 0 && 
                            debtors.filter(d => d.status !== "paid").every(d => selectedDebtors.has(d.id))}
                          onCheckedChange={toggleSelectAll}
                          disabled={sendToCallListMutation.isPending}
                        />
                      </TableHead>
                      <TableHead className="text-xs w-20">ID</TableHead>
                      <TableHead className="text-xs">Contact</TableHead>
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
                    {debtors.map((debtor) => {
                      const phoneStats = callStats?.[debtor.phone_number];
                      const isAdding = addingToCallList === debtor.id;
                      const isSelected = selectedDebtors.has(debtor.id);
                      
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
                          <TableCell className="text-sm text-muted-foreground font-mono">
                            {debtor.id.slice(0, 8)}
                          </TableCell>
                          <TableCell>
                            <div className="font-mono text-sm">{maskPhoneNumber(debtor.phone_number)}</div>
                          </TableCell>
                          {variableColumns.map((varKey) => {
                            const value = debtor.variables?.[varKey];
                            // Format numbers with commas for Debt, Installment, or any numeric-looking values
                            const isNumeric = value && !isNaN(Number(String(value).replace(/,/g, '')));
                            let displayValue = value 
                              ? (isNumeric 
                                  ? Number(String(value).replace(/,/g, '')).toLocaleString('th-TH')
                                  : String(value))
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
                            <span className={`text-sm font-medium ${(phoneStats?.picked_up || 0) > 0 ? 'text-success' : 'text-muted-foreground'}`}>
                              {phoneStats?.picked_up || 0}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={`text-sm font-medium ${(phoneStats?.not_picked_up || 0) > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                              {phoneStats?.not_picked_up || 0}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={`text-sm font-medium ${(phoneStats?.confirmed || 0) > 0 ? 'text-success' : 'text-muted-foreground'}`}>
                              {phoneStats?.confirmed || 0}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={`text-sm font-medium ${(phoneStats?.declined || 0) > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                              {phoneStats?.declined || 0}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={`text-sm font-medium ${(phoneStats?.no_response || 0) > 0 ? 'text-warning' : 'text-muted-foreground'}`}>
                              {phoneStats?.no_response || 0}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <PhoneCall className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-sm">{phoneStats?.total || 0}</span>
                              {phoneStats && phoneStats.confirmed > 0 && (
                                <span className="text-xs text-success">
                                  ({phoneStats.confirmed} ✓)
                                </span>
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
                                      const { error } = await supabase.from("debtors").update({ is_blocked: newBlocked } as any).eq("id", debtor.id);
                                      if (error) { toast.error("Failed to update block status"); return; }
                                      queryClient.invalidateQueries({ queryKey: ["debtors"] });
                                      toast.success(newBlocked ? "Blocked - จะไม่โทรหาลูกค้านี้" : "Unblocked - สามารถโทรได้อีกครั้ง");
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
