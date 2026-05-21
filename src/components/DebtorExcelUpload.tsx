import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Loader2, Trash2, X, AlertTriangle, Download } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import * as XLSX from "xlsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/contexts/AdminContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  DEBTOR_CUSTOMER_VARIABLE_KEYS,
  parseDebtAmountForColumn,
  parseDueDateForColumn,
  constructIsoDateFromThaiParts,
} from "@/lib/debtorVariables";

interface DebtorRow {
  phone_number: string;
  variables: Record<string, string>;
}

interface DebtorExcelUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DebtorExcelUpload = ({ open, onOpenChange }: DebtorExcelUploadProps) => {
  const queryClient = useQueryClient();
  const { effectiveUserId } = useAdmin();
  const { currentWorkspace } = useWorkspace();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [debtorRows, setDebtorRows] = useState<DebtorRow[]>([]);
  const [columnHeaders, setColumnHeaders] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [formatMismatch, setFormatMismatch] = useState<{
    expected: string[];
    received: string[];
  } | null>(null);

  // Fetch existing workspace schema (variable columns) from debtors
  const { data: workspaceSchema } = useQuery({
    queryKey: ["workspace-schema", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return null;

      // Get one sample debtor to extract the schema
      const { data, error } = await supabase
        .from("debtors")
        .select("variables")
        .eq("workspace_id", currentWorkspace.id)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      
      if (!data || !data.variables) return null;

      // Extract column keys (excluding message_template)
      const variables = data.variables as Record<string, string>;
      const columns = Object.keys(variables).filter(
        (k) => k !== "message_template"
      );

      return columns.length > 0
        ? columns
        : [...DEBTOR_CUSTOMER_VARIABLE_KEYS];
    },
    enabled: !!currentWorkspace?.id && open,
  });

  // Reset format mismatch when dialog closes
  useEffect(() => {
    if (!open) {
      setFormatMismatch(null);
    }
  }, [open]);

  const downloadTemplate = () => {
    const headers = ["phone_number", ...(workspaceSchema ?? [...DEBTOR_CUSTOMER_VARIABLE_KEYS])];
    const sampleRow = headers.map((h) => {
      switch (h) {
        case "phone_number": return "0891234567";
        case "policy_no": return "J12345";
        case "name": return "สมหญิง";
        case "due_date": return "10";
        case "due_month": return "เมษายน";
        case "due_year": return "2569";
        case "outstanding_amount": return "4000";
        case "paid_date": return "30";
        case "paid_month": return "เมษายน";
        case "paid_year": return "2569";
        default: return "ตัวอย่าง";
      }
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
    ws["!cols"] = headers.map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Debtors");
    XLSX.writeFile(wb, "debtor_template.xlsx");
    toast.success("ดาวน์โหลด Template สำเร็จ!");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFormatMismatch(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as string[][];

        if (data.length < 2) {
          toast.error("File must have at least a header row and one data row");
          return;
        }

        // First row is headers
        const headers = data[0].map((h) => String(h || "").trim());
        if (!headers[0]) {
          toast.error("First column header (phone number) is required");
          return;
        }

        // Store headers (skip first one which is phone_number)
        const variableHeaders = headers.slice(1).filter(Boolean);

        // Validate format matches existing workspace schema
        if (workspaceSchema && workspaceSchema.length > 0) {
          const sortedExpected = [...workspaceSchema].sort();
          const sortedReceived = [...variableHeaders].sort();
          
          const columnsMatch = 
            sortedExpected.length === sortedReceived.length &&
            sortedExpected.every((col, idx) => col === sortedReceived[idx]);

          if (!columnsMatch) {
            setFormatMismatch({
              expected: workspaceSchema,
              received: variableHeaders,
            });
            toast.error("Excel format doesn't match workspace schema");
            return;
          }
        }

        setColumnHeaders(variableHeaders);

        // Parse data rows
        const rows: DebtorRow[] = [];
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          if (!row || !row[0]) continue;

          const phoneNumber = String(row[0]).trim();
          if (!phoneNumber) continue;

          const variables: Record<string, string> = {};
          variableHeaders.forEach((header, idx) => {
            const value = row[idx + 1];
            if (value !== undefined && value !== null && value !== "") {
              variables[header] = String(value);
            }
          });

          rows.push({
            phone_number: phoneNumber,
            variables,
          });
        }

        if (rows.length === 0) {
          toast.error("No valid data rows found");
          return;
        }

        setDebtorRows(rows);
        toast.success(`Loaded ${rows.length} debtors from file`);
      } catch (error) {
        console.error("Error parsing Excel file:", error);
        toast.error("Failed to parse Excel file");
      }
    };
    reader.readAsBinaryString(file);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeRow = (index: number) => {
    setDebtorRows((prev) => prev.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    setDebtorRows([]);
    setColumnHeaders([]);
    setProgress(0);
    setFormatMismatch(null);
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveUserId) throw new Error("Not authenticated");
      if (!currentWorkspace?.id) throw new Error("No workspace selected");
      if (debtorRows.length === 0) throw new Error("No debtors to upload");

      setIsUploading(true);
      setProgress(0);

      const batchSize = 50;
      const total = debtorRows.length;
      let uploaded = 0;

      for (let i = 0; i < debtorRows.length; i += batchSize) {
        const batch = debtorRows.slice(i, i + batchSize);
        
        const insertData = batch.map((row) => {
          let dueDate = parseDueDateForColumn(row.variables.due_date);
          
          // If the date column only had a day number (like "10"), 
          // try to construct a full ISO date from day, month, and year parts if they exist.
          if (!dueDate && row.variables.due_date && row.variables.due_month && row.variables.due_year) {
            dueDate = constructIsoDateFromThaiParts(
              row.variables.due_date,
              row.variables.due_month,
              row.variables.due_year
            );
          }

          const variables = {
            ...row.variables,
            ...(dueDate ? { due_date_iso: dueDate } : {}),
          };
          return {
            phone_number: row.phone_number,
            variables,
            user_id: effectiveUserId,
            workspace_id: currentWorkspace.id,
            status: "active",
            total_debt: parseDebtAmountForColumn(row.variables.total_debt ?? ""),
            due_date: dueDate,
          };
        });

        const { error } = await supabase.from("debtors").insert(insertData);
        if (error) {
          throw error;
        }

        uploaded += batch.length;
        setProgress(Math.round((uploaded / total) * 100));
      }

      return uploaded;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["debtors"] });
      queryClient.invalidateQueries({ queryKey: ["debtors-stats"] });
      toast.success(`Successfully uploaded ${count} debtors`);
      clearAll();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to upload debtors");
    },
    onSettled: () => {
      setIsUploading(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Import Debtors from Excel
          </DialogTitle>
          <DialogDescription>
           Upload an Excel file (.xlsx). First column = phone number. Remaining columns should
            match bot variables such as{" "}
            <code className="text-xs">policy_no</code>,{" "}
            <code className="text-xs">name</code>,{" "}
            <code className="text-xs">outstanding_amount</code>, etc.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* File Upload */}
          <div className="space-y-2">
            <Label>Excel File</Label>
            <div className="flex gap-2">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="flex-1"
              />
              {debtorRows.length > 0 && (
                <Button variant="outline" size="icon" onClick={clearAll}>
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={downloadTemplate} className="w-fit">
              <Download className="w-4 h-4 mr-1" />
              ดาวน์โหลด Template
            </Button>
            {workspaceSchema && workspaceSchema.length > 0 && (
              <p className="text-xs text-muted-foreground">
                <strong>Expected columns:</strong> Phone Number, {workspaceSchema.join(", ")}
              </p>
            )}
            {!workspaceSchema && (
              <p className="text-xs text-muted-foreground">
                <strong>Suggested headers after phone:</strong>{" "}
                {DEBTOR_CUSTOMER_VARIABLE_KEYS.join(", ")}
              </p>
            )}
          </div>

          {/* Format Mismatch Alert */}
          {formatMismatch && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Format Mismatch</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>The uploaded file doesn't match the existing workspace format.</p>
                <div className="text-sm">
                  <p><strong>Expected columns:</strong> {formatMismatch.expected.join(", ") || "(none)"}</p>
                  <p><strong>Found columns:</strong> {formatMismatch.received.join(", ") || "(none)"}</p>
                </div>
                <p className="text-xs">Please use the same Excel format as your existing data, or create a new workspace for different formats.</p>
              </AlertDescription>
            </Alert>
          )}

          {/* Preview Table */}
          {debtorRows.length > 0 && (
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm">
                  Preview ({debtorRows.length} rows)
                </Label>
                {columnHeaders.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    Variables: {columnHeaders.map((h) => `{${h}}`).join(", ")}
                  </span>
                )}
              </div>
              <ScrollArea className="flex-1 border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Phone Number</TableHead>
                      {columnHeaders.map((header) => (
                        <TableHead key={header}>{header}</TableHead>
                      ))}
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {debtorRows.slice(0, 100).map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-muted-foreground text-xs">
                          {idx + 1}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {row.phone_number}
                        </TableCell>
                        {columnHeaders.map((header) => (
                          <TableCell key={header} className="text-sm">
                            {row.variables[header] || "-"}
                          </TableCell>
                        ))}
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => removeRow(idx)}
                          >
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {debtorRows.length > 100 && (
                  <div className="p-2 text-center text-xs text-muted-foreground border-t">
                    Showing first 100 of {debtorRows.length} rows
                  </div>
                )}
              </ScrollArea>
            </div>
          )}

          {/* Progress */}
          {isUploading && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-center text-muted-foreground">
                Uploading... {progress}%
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={() => uploadMutation.mutate()}
              disabled={debtorRows.length === 0 || isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload {debtorRows.length} Debtors
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DebtorExcelUpload;
