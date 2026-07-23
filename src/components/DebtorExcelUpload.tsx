import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Loader2, Trash2, X, AlertTriangle, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listDebtorsByWorkspace, createDebtor } from "@/api/debtors";
import { useAdmin } from "@/contexts/AdminContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  DEBTOR_CUSTOMER_VARIABLE_KEYS,
  parseDebtAmountForColumn,
  resolveDebtorImportHeader,
  normalizeThaiPhone,
  debtorImportHeaderLabel,
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
      const debtors = await listDebtorsByWorkspace(currentWorkspace.id);
      const sample = debtors[0];

      if (!sample || !sample.variables) return null;

      // Extract column keys (excluding message_template)
      const variables = sample.variables;
      const columns = Object.keys(variables).filter((k) => k !== "message_template");

      return columns.length > 0 ? columns : [...DEBTOR_CUSTOMER_VARIABLE_KEYS];
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
    const keys = ["phone_number", ...(workspaceSchema ?? [...DEBTOR_CUSTOMER_VARIABLE_KEYS])];
    // Header row uses the Thai labels users upload; the plate + province go in
    // one combined "car_detail" cell (the backend splits them).
    const headers = keys.map((k) => debtorImportHeaderLabel(k));
    const sampleRow = keys.map((h) => {
      switch (h) {
        case "phone_number":
          return "0891234567";
        case "name":
          return "สมหญิง";
        case "car_detail":
          return "ฅฆ 9091 ประจวบคีรีขันธ์";
        case "total_debt":
          return 4000;
        case "total_interest":
          return 200;
        case "total_fine":
          return 100;
        case "overdue_installment":
          return 2;
        default:
          return "ตัวอย่าง";
      }
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
    ws["!cols"] = headers.map(() => ({ wch: 22 }));
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

        // First row is headers. Resolve each column to a canonical debtor key
        // (Thai labels and English aliases both map through), dropping ignored
        // columns like "id" and "other expenses".
        const rawHeaders = data[0].map((h) => String(h || "").trim());
        if (rawHeaders.every((h) => !h)) {
          toast.error("Header row is empty");
          return;
        }

        const resolved = rawHeaders.map(resolveDebtorImportHeader);

        // Locate the phone column (fall back to the first column for older sheets).
        let phoneIdx = resolved.findIndex((r) => r.kind === "key" && r.key === "phone_number");
        if (phoneIdx === -1) phoneIdx = 0;

        // Variable columns = every mapped column that isn't the phone column.
        const variableCols: { idx: number; key: string }[] = [];
        resolved.forEach((r, idx) => {
          if (idx === phoneIdx) return;
          if (r.kind === "key") variableCols.push({ idx, key: r.key });
        });
        const variableHeaders = variableCols.map((c) => c.key);

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
          if (!row) continue;

          const phoneNumber = normalizeThaiPhone(String(row[phoneIdx] ?? ""));
          if (!phoneNumber) continue;

          const variables: Record<string, string> = {};
          variableCols.forEach(({ idx, key }) => {
            const value = row[idx];
            if (value !== undefined && value !== null && String(value).trim() !== "") {
              variables[key] = String(value).trim();
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

        // The Go API creates debtors one at a time (POST /debtors); send the batch
        // concurrently. The owner (user_id) is bound server-side from the JWT.
        await Promise.all(
          batch.map((row) =>
            createDebtor({
              phone_number: row.phone_number,
              variables: row.variables,
              workspace_id: currentWorkspace.id,
              status: "active",
              total_debt: parseDebtAmountForColumn(row.variables.total_debt ?? ""),
            }),
          ),
        );

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
            Upload an Excel file (.xlsx) with the Thai column headers (
            <code className="text-xs">เบอร์โทร</code>, <code className="text-xs">ชื่อ-นามสกุล</code>,{" "}
            <code className="text-xs">หมายเลขทะเบียนรถ จังหวัด</code>, …)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 min-h-0 overflow-hidden flex flex-col">
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
                <strong>Expected columns:</strong> เบอร์โทร,{" "}
                {workspaceSchema.map((k) => debtorImportHeaderLabel(k)).join(", ")}
              </p>
            )}
            {!workspaceSchema && (
              <p className="text-xs text-muted-foreground">
                <strong>Suggested headers after phone:</strong>{" "}
                {DEBTOR_CUSTOMER_VARIABLE_KEYS.map((k) => debtorImportHeaderLabel(k)).join(", ")}
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
                  <p>
                    <strong>Expected columns:</strong> {formatMismatch.expected.join(", ") || "(none)"}
                  </p>
                  <p>
                    <strong>Found columns:</strong> {formatMismatch.received.join(", ") || "(none)"}
                  </p>
                </div>
                <p className="text-xs">
                  Please use the same Excel format as your existing data, or create a new workspace for different
                  formats.
                </p>
              </AlertDescription>
            </Alert>
          )}

          {/* Preview Table */}
          {debtorRows.length > 0 && (
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm">Preview ({debtorRows.length} rows)</Label>
                {columnHeaders.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    Variables: {columnHeaders.map((h) => `{${h}}`).join(", ")}
                  </span>
                )}
              </div>
              {/*
                Native scroll container that owns BOTH axes. min-h-0 lets this
                flex child shrink so vertical overflow actually scrolls;
                [&>div]:overflow-visible disables the shadcn Table's own inner
                overflow-auto wrapper so we don't get a second, nested scrollbar;
                the Table's min-w forces horizontal overflow for wide sheets.
              */}
              <div className="flex-1 min-h-0 overflow-auto border rounded-md [&>div]:overflow-visible">
                <Table className="min-w-[720px]">
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Phone Number</TableHead>
                      {columnHeaders.map((header) => (
                        <TableHead key={header} className="whitespace-nowrap">{header}</TableHead>
                      ))}
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {debtorRows.slice(0, 100).map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                        <TableCell className="font-mono text-sm whitespace-nowrap">{row.phone_number}</TableCell>
                        {columnHeaders.map((header) => (
                          <TableCell key={header} className="text-sm whitespace-nowrap">
                            {row.variables[header] || "-"}
                          </TableCell>
                        ))}
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeRow(idx)}>
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
              </div>
            </div>
          )}

          {/* Progress */}
          {isUploading && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-center text-muted-foreground">Uploading... {progress}%</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={isUploading}>
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
