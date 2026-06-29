import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileDown, RefreshCw } from "lucide-react";
import { useAdmin } from "@/contexts/AdminContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
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
import { useDateRangeFilter } from "./useDateRangeFilter";
import { useAnalyticsData } from "./useAnalyticsData";
import { usePdfExport } from "./usePdfExport";
import { DateRangePicker } from "./DateRangePicker";
import { CallHistoryTab } from "./CallHistoryTab";
import { WebhookSettingsTab } from "./WebhookSettingsTab";
import { PdfExportLayout } from "./PdfExportLayout";
import { exportCallHistoryToExcel } from "./utils";
import type { Template } from "./types";

// call_templates is not served by the Go API; template analytics are unavailable.
const templates: Template[] = [];

const CallDashboard = () => {
  const { effectiveUserId } = useAdmin();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id;

  const [searchQuery, setSearchQuery] = useState("");

  const { dateRange, customRange, setCustomRange, setDateRange, dateRangeLabel, handleDateRangeChange, getDateFilter } =
    useDateRangeFilter();

  const { callListItems, debtorByPhone, filteredRecords, isLoading, handleRefresh } = useAnalyticsData({
    effectiveUserId,
    workspaceId,
    dateRange,
    customRange,
    getDateFilter,
    searchQuery,
  });

  const { exportRef, isExportingPdf, handleExportPdf } = usePdfExport();

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold">Analytics</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Monitor call performance, trends, and insights</p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangePicker
            dateRange={dateRange}
            customRange={customRange}
            onPresetChange={handleDateRangeChange}
            onCustomRangeChange={(range) => {
              setCustomRange(range);
              if (range) setDateRange("custom");
            }}
          />
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={isExportingPdf || isLoading}>
            <FileDown className="w-4 h-4 mr-2" />
            {isExportingPdf ? "กำลังส่งออก..." : "Export PDF"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="time-analysis">Time Analysis</TabsTrigger>
            <TabsTrigger value="history">Call History</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <AnalyticsStats callListItems={callListItems || []} />

            <MainStatusOverview callListItems={callListItems || []} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SubStatusOverview callListItems={callListItems || []} />
              <OutcomeDistributionChart callListItems={callListItems || []} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TemplatePerformanceChart callListItems={callListItems || []} templates={templates} />
              <BestTimeInsights callListItems={callListItems || []} />
            </div>
            <div className="grid grid-cols-1 gap-4">
              <TrendChart callListItems={callListItems || []} />
            </div>
          </TabsContent>

          <TabsContent value="time-analysis" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <HourlyPickupChart callListItems={callListItems || []} />
              <DayOfWeekChart callListItems={callListItems || []} />
            </div>
            <BestTimeInsights callListItems={callListItems || []} />
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <CallHistoryTab
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              filteredRecords={filteredRecords}
              onExportExcel={() => exportCallHistoryToExcel(filteredRecords, debtorByPhone)}
            />
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <WebhookSettingsTab />
          </TabsContent>
        </Tabs>
      )}

      <PdfExportLayout
        exportRef={exportRef}
        dateRangeLabel={dateRangeLabel}
        callListItems={callListItems || []}
        templates={templates}
      />
    </div>
  );
};

export default CallDashboard;
