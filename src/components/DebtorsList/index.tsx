import { useMemo, useState, type FormEvent } from "react";
import type { DateRange } from "react-day-picker";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { updateDebtor } from "@/api/debtors";
import { useAdmin } from "@/contexts/AdminContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { DEBTOR_CUSTOMER_VARIABLE_KEYS, emptyDebtorCustomerVariables } from "@/lib/debtorVariables";
import DebtorExcelUpload from "../DebtorExcelUpload";
import { PINNED_VARIABLE_KEYS, HIDDEN_VARIABLE_KEYS } from "./constants";
import { exportDebtorsToExcel } from "./utils";
import { useDebtorsQueries } from "./useDebtorsQueries";
import { useDebtorsMutations } from "./useDebtorsMutations";
import { DebtorsHeader } from "./DebtorsHeader";
import { DebtorsFilters } from "./DebtorsFilters";
import { DebtorsTable } from "./DebtorsTable";
import { DebtorFormDialog } from "./DebtorFormDialog";
import type { Debtor, DebtorFormData, DebtorsListProps, SortDirection } from "./types";

const DebtorsList = ({ onNextStep }: DebtorsListProps) => {
  const queryClient = useQueryClient();
  const { effectiveUserId } = useAdmin();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id;

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [callStatusFilter, setCallStatusFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingDebtor, setEditingDebtor] = useState<Debtor | null>(null);
  const [formData, setFormData] = useState<DebtorFormData>({
    phone_number: "",
    status: "active",
    notes: "",
    due_date: "",
    paid_date: "",
  });
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>(() => emptyDebtorCustomerVariables());
  const [sortField, setSortField] = useState<string>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(0);
  const [showExcelUpload, setShowExcelUpload] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Selection for send to call list
  const [selectedDebtors, setSelectedDebtors] = useState<Set<string>>(new Set());

  const { latestStatusByDebtor, filteredDebtorIds, debtors, totalCount, totalPages, isLoading, isFetching, callStats } =
    useDebtorsQueries({
      effectiveUserId,
      workspaceId,
      searchQuery,
      statusFilter,
      callStatusFilter,
      dateRange,
      sortField,
      sortDirection,
      page,
    });

  // Variable columns: standard customer keys first, then any legacy keys
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

  // call_templates is not served by the Go API; no templates available here.
  const templates: { id: string; is_system_default?: boolean }[] = [];

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

  const { createDebtorMutation, updateDebtorMutation, deleteDebtorMutation, clearAllDebtorsMutation, sendToCallListMutation } =
    useDebtorsMutations({
      effectiveUserId,
      workspaceId,
      templates,
      onAddSuccess: () => {
        setShowAddDialog(false);
        resetForm();
      },
      onUpdateSuccess: () => {
        setEditingDebtor(null);
        resetForm();
      },
      onClearAllSuccess: () => setSelectedDebtors(new Set()),
      onMakeCallSettled: () => {},
      onSendToCallListSuccess: () => {
        setSelectedDebtors(new Set());
        onNextStep?.();
      },
    });

  // Select/deselect all visible debtors
  const toggleSelectAll = () => {
    if (!debtors) return;

    const selectableDebtors = debtors.filter((d) => d.status !== "paid");
    const allSelected = selectableDebtors.every((d) => selectedDebtors.has(d.id));

    const newSelected = new Set(selectedDebtors);
    if (allSelected) {
      selectableDebtors.forEach((d) => newSelected.delete(d.id));
    } else {
      selectableDebtors.forEach((d) => newSelected.add(d.id));
    }
    setSelectedDebtors(newSelected);
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

  const handleSubmit = (e: FormEvent) => {
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

  const handleDateRangeChange = (range: DateRange | undefined) => {
    setDateRange(range);
    setPage(0);
  };

  const handleToggleBlock = async (debtor: Debtor) => {
    const newBlocked = !debtor.is_blocked;
    try {
      await updateDebtor(debtor.id, workspaceId ?? "", { is_blocked: newBlocked });
    } catch {
      toast.error("Failed to update block status");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["debtors"] });
    toast.success(newBlocked ? "Blocked - จะไม่โทรหาลูกค้านี้" : "Unblocked - สามารถโทรได้อีกครั้ง");
  };

  const handleSendToCallList = () => {
    const debtorsToAdd = debtors?.filter((d) => selectedDebtors.has(d.id)) || [];
    sendToCallListMutation.mutate(debtorsToAdd);
  };

  const handleExportExcel = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await exportDebtorsToExcel(
        workspaceId,
        {
          effectiveUserId,
          statusFilter,
          callStatusFilter,
          latestStatusByDebtor,
          filteredDebtorIds,
          searchQuery,
          dateRange,
          sortField,
          sortDirection,
        },
        latestStatusByDebtor,
      );
    } catch (err) {
      console.error("Export error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to export debtors");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Excel Upload Dialog */}
      <DebtorExcelUpload open={showExcelUpload} onOpenChange={setShowExcelUpload} />

      {/* Form Dialog */}
      <DebtorFormDialog
        open={showAddDialog || !!editingDebtor}
        onOpenChange={(open) => {
          if (!open) {
            setShowAddDialog(false);
            setEditingDebtor(null);
            resetForm();
          }
        }}
        editingDebtor={editingDebtor}
        formData={formData}
        onFormDataChange={setFormData}
        templateVariables={templateVariables}
        onTemplateVariablesChange={setTemplateVariables}
        onSubmit={handleSubmit}
        onCancel={() => {
          setShowAddDialog(false);
          setEditingDebtor(null);
          resetForm();
        }}
        isSubmitting={createDebtorMutation.isPending || updateDebtorMutation.isPending}
      />

      <DebtorsHeader
        totalCount={totalCount}
        onClearAll={() => clearAllDebtorsMutation.mutate()}
        isClearingAll={clearAllDebtorsMutation.isPending}
        onImportExcel={() => setShowExcelUpload(true)}
        onExportExcel={handleExportExcel}
        isExporting={isExporting}
        onAddDebtor={() => setShowAddDialog(true)}
      />

      <DebtorsFilters
        searchQuery={searchQuery}
        onSearchQueryChange={handleSearchChange}
        statusFilter={statusFilter}
        onStatusFilterChange={handleStatusChange}
        isFetching={isFetching}
        isLoading={isLoading}
        totalCount={totalCount}
        selectedCount={selectedDebtors.size}
      />

      <DebtorsTable
        callStatusFilter={callStatusFilter}
        onCallStatusFilterChange={handleCallStatusChange}
        dateRange={dateRange}
        onDateRangeChange={handleDateRangeChange}
        debtors={debtors}
        isLoading={isLoading}
        variableColumns={variableColumns}
        selectedDebtors={selectedDebtors}
        onToggleSelectAll={toggleSelectAll}
        onToggleDebtorSelection={toggleDebtorSelection}
        onSendToCallList={handleSendToCallList}
        isSendingToCallList={sendToCallListMutation.isPending}
        sortField={sortField}
        sortDirection={sortDirection}
        onSort={handleSort}
        callStats={callStats}
        latestStatusByDebtor={latestStatusByDebtor}
        onEdit={handleEdit}
        onToggleBlock={handleToggleBlock}
        onDelete={(id) => deleteDebtorMutation.mutate(id)}
        totalPages={totalPages}
        totalCount={totalCount}
        page={page}
        onPageChange={setPage}
      />
    </div>
  );
};

export default DebtorsList;
