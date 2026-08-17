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
  DEBTOR_AMOUNT_VARIABLE_KEYS,
  parseDebtAmountForColumn,
  formatDebtorAmount,
  resolveDebtorImportHeader,
  isKnownIgnoredDebtorHeader,
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
  // Import notice. Two flavours:
  //  - `requiredMissing` set => the file was REJECTED (a required column, ชื่อ-นามสกุล
  //    or จำนวนงวดที่ค้าง, is absent) and nothing was imported.
  //  - otherwise it is a non-blocking notice: expected columns not found (missing or
  //    misspelled), unknown columns ignored, and rows skipped for a bad
  //    จำนวนงวดที่ค้าง value. The import still proceeds with the valid rows.
  const [importNotice, setImportNotice] = useState<{
    missing: string[];
    ignored: string[];
    requiredMissing?: string[];
    invalidInstallments?: { row: number; value: string }[];
    emptyNames?: number[];
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

  // Reset import notice when dialog closes
  useEffect(() => {
    if (!open) {
      setImportNotice(null);
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

    setImportNotice(null);

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

        // Required columns: ชื่อ-นามสกุล (name) and จำนวนงวดที่ค้าง (overdue_installment)
        // must both be present, otherwise the file is rejected outright.
        const presentKeys = new Set(
          resolved.flatMap((r) => (r.kind === "key" ? [r.key] : [])),
        );
        const requiredMissing = ["name", "overdue_installment"]
          .filter((k) => !presentKeys.has(k))
          .map((k) => debtorImportHeaderLabel(k));
        if (requiredMissing.length > 0) {
          setDebtorRows([]);
          setColumnHeaders([]);
          setImportNotice({ missing: [], ignored: [], requiredMissing });
          toast.error(`Missing required column(s): ${requiredMissing.join(", ")}`);
          return;
        }

        // Locate the phone column. If no header maps to phone (e.g. เบอร์โทร is
        // misspelled), fall back to the first column that isn't an always-ignored
        // standard column like "id" — that's the best guess for the phone data.
        let phoneIdx = resolved.findIndex((r) => r.kind === "key" && r.key === "phone_number");
        if (phoneIdx === -1) {
          phoneIdx = rawHeaders.findIndex((h) => h && !isKnownIgnoredDebtorHeader(h));
          if (phoneIdx === -1) phoneIdx = 0;
        }

        // Columns the system doesn't recognize are dropped (strict whitelist).
        // The always-ignored standard columns (id, "other expenses") don't count.
        const ignoredHeaders = rawHeaders.filter(
          (h, idx) =>
            idx !== phoneIdx &&
            resolved[idx].kind === "ignore" &&
            h &&
            !isKnownIgnoredDebtorHeader(h),
        );

        // Expected columns = phone + the workspace's variable schema (or the
        // standard customer keys for a fresh workspace). Any expected key with no
        // matching header was missing/misspelled — we still import, but tell the user.
        const resolvedKeys = new Set(
          resolved.flatMap((r) => (r.kind === "key" ? [r.key] : [])),
        );
        const expectedKeys = ["phone_number", ...(workspaceSchema ?? [...DEBTOR_CUSTOMER_VARIABLE_KEYS])];
        const missingLabels = expectedKeys
          .filter((k) => !resolvedKeys.has(k))
          .map((k) => debtorImportHeaderLabel(k));

        // Variable columns = every mapped column that isn't the phone column.
        const variableCols: { idx: number; key: string }[] = [];
        resolved.forEach((r, idx) => {
          if (idx === phoneIdx) return;
          if (r.kind === "key") variableCols.push({ idx, key: r.key });
        });
        const variableHeaders = variableCols.map((c) => c.key);

        // Surface missing/ignored columns as a non-blocking notice — the import
        // still proceeds with whatever columns were recognized.
        if (missingLabels.length > 0 || ignoredHeaders.length > 0) {
          setImportNotice({ missing: missingLabels, ignored: ignoredHeaders });
          if (missingLabels.length > 0) {
            toast.warning(`Missing column(s): ${missingLabels.join(", ")}`);
          }
          if (ignoredHeaders.length > 0) {
            toast.warning(`Ignored unknown column(s): ${ignoredHeaders.join(", ")}`);
          }
        }

        setColumnHeaders(variableHeaders);

        // The จำนวนงวดที่ค้าง column index — every row's value must be a whole
        // number ≥ 1 (1, 2, 3, …). 0, decimals (.5, .345), blanks and non-numbers
        // are rejected and the offending row is skipped.
        const installmentIdx = variableCols.find(
          (c) => c.key === "overdue_installment",
        )!.idx;
        // The ชื่อ-นามสกุล column index — every row must have a non-empty name.
        const nameIdx = variableCols.find((c) => c.key === "name")!.idx;

        // Parse data rows
        const rows: DebtorRow[] = [];
        const invalidInstallments: { row: number; value: string }[] = [];
        const emptyNames: number[] = [];
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          if (!row) continue;

          const phoneNumber = normalizeThaiPhone(String(row[phoneIdx] ?? ""));
          if (!phoneNumber) continue;

          // Validate ชื่อ-นามสกุล: must not be empty.
          if (!String(row[nameIdx] ?? "").trim()) {
            emptyNames.push(i + 1);
            continue;
          }

          // Validate จำนวนงวดที่ค้าง: whole number ≥ 1 only.
          const rawInstallment = String(row[installmentIdx] ?? "").trim();
          const installmentNum = Number(rawInstallment.replace(/,/g, ""));
          if (
            !rawInstallment ||
            !Number.isFinite(installmentNum) ||
            !Number.isInteger(installmentNum) ||
            installmentNum < 1
          ) {
            invalidInstallments.push({ row: i + 1, value: rawInstallment });
            continue;
          }

          const variables: Record<string, string> = {};
          variableCols.forEach(({ idx, key }) => {
            const value = row[idx];
            if (value !== undefined && value !== null && String(value).trim() !== "") {
              const str = String(value).trim();
              // Money columns keep their satang: "100.5" -> "100.50".
              variables[key] = DEBTOR_AMOUNT_VARIABLE_KEYS.has(key)
                ? formatDebtorAmount(str)
                : str;
            }
          });

          rows.push({
            phone_number: phoneNumber,
            variables,
          });
        }

        // If ANY row has an empty ชื่อ-นามสกุล or a bad จำนวนงวดที่ค้าง, reject the
        // whole file — nothing is imported until every row is valid.
        if (emptyNames.length > 0 || invalidInstallments.length > 0) {
          setDebtorRows([]);
          setColumnHeaders([]);
          setImportNotice({
            missing: [],
            ignored: [],
            requiredMissing: [],
            invalidInstallments,
            emptyNames,
          });
          const reasons: string[] = [];
          if (emptyNames.length > 0) {
            reasons.push(`${emptyNames.length} row(s) with an empty ชื่อ-นามสกุล`);
          }
          if (invalidInstallments.length > 0) {
            reasons.push(`${invalidInstallments.length} row(s) with an invalid จำนวนงวดที่ค้าง`);
          }
          toast.error(`File not imported: ${reasons.join(", ")}`);
          return;
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
    setImportNotice(null);
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

          {/*
            Blocking notice — nothing was imported. Two reasons:
              1. a required column (ชื่อ-นามสกุล / จำนวนงวดที่ค้าง) is missing, or
              2. one or more rows have an invalid จำนวนงวดที่ค้าง (not a whole number ≥ 1).
          */}
          {importNotice &&
            ((importNotice.requiredMissing && importNotice.requiredMissing.length > 0) ||
              (importNotice.invalidInstallments && importNotice.invalidInstallments.length > 0) ||
              (importNotice.emptyNames && importNotice.emptyNames.length > 0)) && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>File not imported</AlertTitle>
                <AlertDescription className="space-y-2">
                  {importNotice.emptyNames && importNotice.emptyNames.length > 0 && (
                    <>
                      <p className="text-sm">
                        Every row must have a <strong>ชื่อ-นามสกุล</strong>. These row(s) are
                        empty, so the whole file was rejected:
                      </p>
                      <p className="text-sm">
                        {importNotice.emptyNames
                          .slice(0, 20)
                          .map((r) => `row ${r}`)
                          .join(", ")}
                        {importNotice.emptyNames.length > 20 &&
                          ` … +${importNotice.emptyNames.length - 20} more`}
                      </p>
                      <p className="text-xs">
                        Fill in the ชื่อ-นามสกุล value(s) above, then upload again.
                      </p>
                    </>
                  )}
                  {importNotice.requiredMissing && importNotice.requiredMissing.length > 0 && (
                    <>
                      <p className="text-sm">
                        These required column(s) are missing, so the file cannot be imported:
                      </p>
                      <p className="text-sm">
                        <strong>{importNotice.requiredMissing.join(", ")}</strong>
                      </p>
                      <p className="text-xs">
                        Both <strong>ชื่อ-นามสกุล</strong> and <strong>จำนวนงวดที่ค้าง</strong> are required.
                        Add the missing column(s), then upload again — or download the template above.
                      </p>
                    </>
                  )}
                  {importNotice.invalidInstallments && importNotice.invalidInstallments.length > 0 && (
                    <>
                      <p className="text-sm">
                        Every <strong>จำนวนงวดที่ค้าง</strong> must be a whole number ≥ 1 (1, 2, 3, …).
                        These row(s) are invalid, so the whole file was rejected:
                      </p>
                      <p className="text-sm">
                        {importNotice.invalidInstallments
                          .slice(0, 20)
                          .map((r) => `row ${r.row}${r.value ? ` ("${r.value}")` : " (empty)"}`)
                          .join(", ")}
                        {importNotice.invalidInstallments.length > 20 &&
                          ` … +${importNotice.invalidInstallments.length - 20} more`}
                      </p>
                      <p className="text-xs">
                        Fix the จำนวนงวดที่ค้าง value(s) above, then upload again.
                      </p>
                    </>
                  )}
                </AlertDescription>
              </Alert>
            )}

          {/* Non-blocking import notice (missing / ignored columns) */}
          {importNotice &&
            !(importNotice.requiredMissing && importNotice.requiredMissing.length > 0) &&
            !(importNotice.invalidInstallments && importNotice.invalidInstallments.length > 0) &&
            !(importNotice.emptyNames && importNotice.emptyNames.length > 0) &&
            (importNotice.missing.length > 0 || importNotice.ignored.length > 0) && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Check your columns</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p className="text-sm">The file was imported, but some columns need attention:</p>
                  {importNotice.missing.length > 0 && (
                    <p className="text-sm">
                      <strong>Missing (check spelling):</strong> {importNotice.missing.join(", ")}
                    </p>
                  )}
                  {importNotice.ignored.length > 0 && (
                    <p className="text-sm">
                      <strong>Ignored (unknown):</strong> {importNotice.ignored.join(", ")}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Missing columns won't be filled in. Rename the headers to match the template, or download it above.
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
