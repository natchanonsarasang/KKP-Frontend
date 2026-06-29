import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  MoreHorizontal,
  Pencil,
  PhoneCall,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { maskLicensePlate, maskPhoneNumber, isLicensePlateField } from "@/lib/formatPhone";
import { formatThaiBuddhistDateShort } from "@/lib/debtorVariables";
import { resolveLatestStatusLabel, resolveLatestStatusTone, MAIN_STATUSES, SUB_STATUSES } from "@/lib/callStatuses";
import { statusConfig, STATUS_TONE_CLASS } from "./constants";
import { formatVariableValue } from "./utils";
import type { Debtor, PhoneCallStats, SortDirection } from "./types";

interface DebtorsTableProps {
  callStatusFilter: string;
  onCallStatusFilterChange: (value: string) => void;
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  debtors: Debtor[] | undefined;
  isLoading: boolean;
  variableColumns: string[];
  selectedDebtors: Set<string>;
  onToggleSelectAll: () => void;
  onToggleDebtorSelection: (id: string) => void;
  onSendToCallList: () => void;
  isSendingToCallList: boolean;
  sortField: string;
  sortDirection: SortDirection;
  onSort: (field: string) => void;
  callStats: Record<string, PhoneCallStats> | undefined;
  latestStatusByDebtor: Map<string, string | null> | undefined;
  onEdit: (debtor: Debtor) => void;
  onToggleBlock: (debtor: Debtor) => void;
  onDelete: (id: string) => void;
  totalPages: number;
  totalCount: number;
  page: number;
  onPageChange: (page: number) => void;
}

export function DebtorsTable({
  callStatusFilter,
  onCallStatusFilterChange,
  dateRange,
  onDateRangeChange,
  debtors,
  isLoading,
  variableColumns,
  selectedDebtors,
  onToggleSelectAll,
  onToggleDebtorSelection,
  onSendToCallList,
  isSendingToCallList,
  sortField,
  sortDirection,
  onSort,
  callStats,
  latestStatusByDebtor,
  onEdit,
  onToggleBlock,
  onDelete,
  totalPages,
  totalCount,
  page,
  onPageChange,
}: DebtorsTableProps) {
  const getSortIcon = (field: string) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-50" />;
    return sortDirection === "asc" ? <ArrowUp className="w-3 h-3 ml-1" /> : <ArrowDown className="w-3 h-3 ml-1" />;
  };

  const selectableDebtors = (debtors || []).filter((d) => d.status !== "paid");
  const allSelected = selectableDebtors.length > 0 && selectableDebtors.every((d) => selectedDebtors.has(d.id));

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-medium">Debtor List</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={callStatusFilter} onValueChange={onCallStatusFilterChange}>
            <SelectTrigger className="h-8 w-56 text-xs">
              <SelectValue placeholder="All Call Statuses" />
            </SelectTrigger>
            <SelectContent className="bg-popover max-h-80">
              <SelectItem value="all">All Call Statuses</SelectItem>
              <SelectItem value="never">Never Called</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
              <SelectGroup>
                <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Main Status</SelectLabel>
                {MAIN_STATUSES.map((s) => (
                  <SelectItem key={`main-${s.key}`} value={s.label}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Sub Status</SelectLabel>
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
              <Button variant="outline" size="sm" className="h-8 justify-start text-left font-normal gap-2 min-w-[220px] text-xs">
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
                      onDateRangeChange(undefined);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        onDateRangeChange(undefined);
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
                onSelect={onDateRangeChange}
                initialFocus
                locale={th}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          <Button
            variant="default"
            size="sm"
            onClick={onSendToCallList}
            disabled={selectedDebtors.size === 0 || isSendingToCallList}
            className="h-8 gap-1.5 bg-primary/90 hover:bg-primary shadow-sm"
          >
            {isSendingToCallList ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Send to Call List
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onToggleSelectAll}
            disabled={!debtors || debtors.length === 0}
            className="h-8 text-xs"
          >
            {allSelected ? "Deselect" : "Select All"}
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
                      <Checkbox checked={allSelected} onCheckedChange={onToggleSelectAll} disabled={isSendingToCallList} />
                    </TableHead>
                    <TableHead className="text-xs w-12">#</TableHead>
                    <TableHead className="text-xs">Contact</TableHead>
                    <TableHead className="text-xs">Name</TableHead>
                    <TableHead className="text-xs">Latest Call Status</TableHead>
                    <TableHead className="text-xs cursor-pointer hover:bg-muted/50 select-none" onClick={() => onSort("date_con")}>
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
                        onClick={() => onSort(`var:${varKey}`)}
                      >
                        <div className="flex items-center">
                          {varKey}
                          {getSortIcon(`var:${varKey}`)}
                        </div>
                      </TableHead>
                    ))}
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs cursor-pointer hover:bg-muted/50 select-none" onClick={() => onSort("picked_up_count")}>
                      <div className="flex items-center">
                        Picked
                        {getSortIcon("picked_up_count")}
                      </div>
                    </TableHead>
                    <TableHead className="text-xs cursor-pointer hover:bg-muted/50 select-none" onClick={() => onSort("not_picked_up_count")}>
                      <div className="flex items-center">
                        No Pick
                        {getSortIcon("not_picked_up_count")}
                      </div>
                    </TableHead>
                    <TableHead className="text-xs cursor-pointer hover:bg-muted/50 select-none" onClick={() => onSort("accept_count")}>
                      <div className="flex items-center">
                        Accept
                        {getSortIcon("accept_count")}
                      </div>
                    </TableHead>
                    <TableHead className="text-xs cursor-pointer hover:bg-muted/50 select-none" onClick={() => onSort("reject_count")}>
                      <div className="flex items-center">
                        Reject
                        {getSortIcon("reject_count")}
                      </div>
                    </TableHead>
                    <TableHead className="text-xs cursor-pointer hover:bg-muted/50 select-none" onClick={() => onSort("other_count")}>
                      <div className="flex items-center">
                        Other
                        {getSortIcon("other_count")}
                      </div>
                    </TableHead>
                    <TableHead className="text-xs cursor-pointer hover:bg-muted/50 select-none" onClick={() => onSort("contact_attempts")}>
                      <div className="flex items-center">
                        Calls
                        {getSortIcon("contact_attempts")}
                      </div>
                    </TableHead>
                    <TableHead className="text-xs cursor-pointer hover:bg-muted/50 select-none" onClick={() => onSort("last_contact_at")}>
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
                    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                    .map((debtor, index) => {
                      const phoneStats = callStats?.[debtor.phone_number];
                      const isSelected = selectedDebtors.has(debtor.id);
                      const rowNumber = index + 1;

                      return (
                        <TableRow key={debtor.id} className={`${isSelected ? "bg-muted/30" : ""} ${debtor.is_blocked ? "opacity-50" : ""}`}>
                          <TableCell>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => onToggleDebtorSelection(debtor.id)}
                              disabled={isSendingToCallList || debtor.status === "paid"}
                            />
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground font-mono">{rowNumber}</TableCell>
                          <TableCell>
                            <div className="font-mono text-sm">{maskPhoneNumber(debtor.phone_number)}</div>
                          </TableCell>
                          <TableCell className="text-sm">{formatVariableValue("name", debtor.variables?.name)}</TableCell>
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
                                  {isHighPriority && <span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />}
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
                          <TableCell className="text-sm">{formatVariableValue("policy_no", debtor.variables?.policy_no)}</TableCell>
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
                            <Badge variant="secondary" className={`${statusConfig[debtor.status]?.color} font-normal`}>
                              {statusConfig[debtor.status]?.label || debtor.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className={`text-sm font-medium ${(phoneStats?.picked_up || 0) > 0 ? "text-success" : "text-muted-foreground"}`}>
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
                            <span className={`text-sm font-medium ${(phoneStats?.confirmed || 0) > 0 ? "text-success" : "text-muted-foreground"}`}>
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
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="bg-popover">
                                  <DropdownMenuItem onClick={() => onEdit(debtor)}>
                                    <Pencil className="w-4 h-4 mr-2" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => onToggleBlock(debtor)}>
                                    {debtor.is_blocked ? "🔓 Unblock" : "🚫 Block (ห้ามโทร)"}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => onDelete(debtor.id)} className="text-destructive focus:text-destructive">
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
                  <Button variant="outline" size="sm" onClick={() => onPageChange(Math.max(0, page - 1))} disabled={page === 0}>
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
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
  );
}
