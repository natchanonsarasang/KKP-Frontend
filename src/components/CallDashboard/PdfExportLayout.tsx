import type { RefObject } from "react";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { AnalyticsStats } from "../analytics/AnalyticsStats";
import {
  HourlyPickupChart,
  DayOfWeekChart,
  OutcomeDistributionChart,
  TemplatePerformanceChart,
  TrendChart,
  MainStatusOverview,
  SubStatusOverview,
} from "../analytics/CallAnalyticsCharts";
import { BestTimeInsights } from "../analytics/BestTimeInsights";
import type { CallListItem, Template } from "./types";

interface PdfExportLayoutProps {
  exportRef: RefObject<HTMLDivElement>;
  dateRangeLabel: string;
  callListItems: CallListItem[];
  templates: Template[];
}

// Hidden off-screen layout rendered purely so usePdfExport's html2canvas
// snapshot has full-size charts to capture. Always mounted so charts size
// correctly even before the user opens the export flow.
export function PdfExportLayout({ exportRef, dateRangeLabel, callListItems, templates }: PdfExportLayoutProps) {
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        left: "-100000px",
        top: 0,
        width: "1100px",
        background: "#ffffff",
        pointerEvents: "none",
      }}
    >
      <div ref={exportRef} className="pdf-export bg-background text-foreground p-6 space-y-6" style={{ width: "1100px" }}>
        <div className="flex items-start justify-between border-b pb-4">
          <div>
            <h2 className="text-2xl font-bold">Analytics Report</h2>
            <p className="text-sm text-muted-foreground mt-1">ช่วงเวลา: {dateRangeLabel || "-"}</p>
          </div>
          <p className="text-xs text-muted-foreground">สร้างเมื่อ {format(new Date(), "d MMM yyyy HH:mm", { locale: th })}</p>
        </div>

        <div data-pdf-section className="page-break-avoid pb-6 min-h-[80px]">
          <AnalyticsStats callListItems={callListItems} />
        </div>
        <div data-pdf-section className="page-break-avoid pb-6 min-h-[120px]">
          <MainStatusOverview callListItems={callListItems} />
        </div>

        <div className="grid grid-cols-2 gap-4 pb-6">
          <div data-pdf-section className="page-break-avoid min-h-[280px]">
            <SubStatusOverview callListItems={callListItems} />
          </div>
          <div data-pdf-section className="page-break-avoid min-h-[280px]">
            <OutcomeDistributionChart callListItems={callListItems} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pb-6">
          <div data-pdf-section className="page-break-avoid min-h-[280px]">
            <TemplatePerformanceChart callListItems={callListItems} templates={templates} />
          </div>
          <div data-pdf-section className="page-break-avoid min-h-[280px]">
            <BestTimeInsights callListItems={callListItems} />
          </div>
        </div>

        <div data-pdf-section className="page-break-avoid pb-6 min-h-[300px]">
          <TrendChart callListItems={callListItems} />
        </div>

        <div className="grid grid-cols-2 gap-4 pb-6">
          <div data-pdf-section className="page-break-avoid min-h-[280px]">
            <HourlyPickupChart callListItems={callListItems} />
          </div>
          <div data-pdf-section className="page-break-avoid min-h-[280px]">
            <DayOfWeekChart callListItems={callListItems} />
          </div>
        </div>
      </div>
    </div>
  );
}
