import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, Loader2, Plus, Trash2 } from "lucide-react";

interface DebtorsHeaderProps {
  totalCount: number;
  onClearAll: () => void;
  isClearingAll: boolean;
  onImportExcel: () => void;
  onExportExcel: () => void;
  isExporting: boolean;
  onAddDebtor: () => void;
}

export function DebtorsHeader({
  totalCount,
  onClearAll,
  isClearingAll,
  onImportExcel,
  onExportExcel,
  isExporting,
  onAddDebtor,
}: DebtorsHeaderProps) {
  return (
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
              if (window.confirm(`Are you sure you want to delete all ${totalCount} debtors? This action cannot be undone.`)) {
                onClearAll();
              }
            }}
            disabled={isClearingAll}
            className="text-destructive hover:text-destructive"
          >
            {isClearingAll ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
            Clear All
          </Button>
        )}
        <Button variant="outline" onClick={onImportExcel}>
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          Import Excel
        </Button>
        <Button variant="outline" onClick={onExportExcel} disabled={isExporting || totalCount === 0}>
          {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
          {isExporting ? "Exporting..." : "Export Excel"}
        </Button>
        <Button onClick={onAddDebtor}>
          <Plus className="w-4 h-4 mr-2" />
          Add Debtor
        </Button>
      </div>
    </div>
  );
}
