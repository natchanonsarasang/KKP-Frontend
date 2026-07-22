import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle,
  Clock,
  Download,
  FileText,
  Loader2,
  Phone,
  Trash2,
} from "lucide-react";
import { maskPhoneNumber } from "@/lib/formatPhone";
import type { CallAttempt } from "@/api/types";
import type { CallListItem, SortDirection, SortField } from "./types";

interface CallQueueTableProps {
  activeTab: "pending" | "calling" | "completed";
  onTabChange: (tab: "pending" | "calling" | "completed") => void;
  pendingCount: number;
  callingCount: number;
  processedCount: number;
  isLoading: boolean;
  filteredCallListItems: CallListItem[];
  callAttemptsByItemId: Map<string, CallAttempt> | undefined;
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  getStatusBadge: (status: string) => JSX.Element;
  onExportCompletedCalls: () => void;
  onPreviewCall: (item: CallListItem) => void;
  onViewTranscript: (attempt: CallAttempt | null) => void;
  onRemoveFromList: (id: string) => void;
  isRemovingFromList: boolean;
}

export function CallQueueTable({
  activeTab,
  onTabChange,
  pendingCount,
  callingCount,
  processedCount,
  isLoading,
  filteredCallListItems,
  callAttemptsByItemId,
  sortField,
  sortDirection,
  onSort,
  getStatusBadge,
  onExportCompletedCalls,
  onPreviewCall,
  onViewTranscript,
  onRemoveFromList,
  isRemovingFromList,
}: CallQueueTableProps) {
  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 ml-1 opacity-50" />;
    }
    return sortDirection === "asc" ? <ArrowUp className="w-3 h-3 ml-1" /> : <ArrowDown className="w-3 h-3 ml-1" />;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Call Queue</CardTitle>
          <div className="flex items-center gap-2">
            {activeTab === "completed" && (
              <Button variant="outline" size="sm" onClick={onExportCompletedCalls} className="h-8 text-xs">
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Export Excel
              </Button>
            )}
            <div className="flex gap-1 bg-muted p-1 rounded-lg">
              <button
                onClick={() => onTabChange("pending")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  activeTab === "pending"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Pending ({pendingCount})
              </button>
              <button
                onClick={() => onTabChange("calling")}
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
                onClick={() => onTabChange("completed")}
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
                  <TableHead className="text-xs cursor-pointer hover:bg-muted/50 select-none" onClick={() => onSort("phone")}>
                    <span className="flex items-center">
                      เบอร์โทร
                      {getSortIcon("phone")}
                    </span>
                  </TableHead>
                  <TableHead className="text-xs">ชื่อ</TableHead>
                  <TableHead className="text-xs">ยอด</TableHead>
                  <TableHead className="text-xs cursor-pointer hover:bg-muted/50 select-none" onClick={() => onSort("call_outcome")}>
                    <span className="flex items-center">
                      ผลการโทร
                      {getSortIcon("call_outcome")}
                    </span>
                  </TableHead>
                  <TableHead className="text-xs cursor-pointer hover:bg-muted/50 select-none" onClick={() => onSort("status")}>
                    <span className="flex items-center">
                      สถานะ
                      {getSortIcon("status")}
                    </span>
                  </TableHead>
                  <TableHead className="text-xs cursor-pointer hover:bg-muted/50 select-none" onClick={() => onSort("called_at")}>
                    <span className="flex items-center">
                      เวลา
                      {getSortIcon("called_at")}
                    </span>
                  </TableHead>
                  <TableHead className="text-xs w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCallListItems.map((item) => {
                  const debtor = item.debtor;
                  const isCurrentlyCalling = item.status === "calling";
                  // Rejected / hang-up calls have no meaningful conversation to view.
                  const hasNoTranscript = /reject|hang/i.test(item.call_outcome || "");

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
                      <TableCell className="text-sm">{debtor?.variables?.name || debtor?.name || "-"}</TableCell>
                      <TableCell className="text-sm">
                        {(() => {
                          const vars = debtor?.variables || {};
                          const raw = vars.total_debt || vars.amount || vars.outstanding_amount;
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
                      <TableCell>{getOutcomeDisplay()}</TableCell>
                      <TableCell>{getStatusBadge(item.status)}</TableCell>
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
                          hasNoTranscript ? (
                            <span className="text-muted-foreground text-xs px-2">-</span>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-primary"
                              onClick={() => onViewTranscript(callAttemptsByItemId?.get(item.id) ?? null)}
                              title="View conversation"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </Button>
                          )
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-primary"
                            onClick={() => onPreviewCall(item)}
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
                            onClick={() => onRemoveFromList(item.id)}
                            disabled={isRemovingFromList}
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
  );
}
