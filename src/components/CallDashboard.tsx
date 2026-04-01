import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PhoneCall, CheckCircle, XCircle, Clock, AlertCircle, PhoneOff, RefreshCw, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnalyticsStats } from "./analytics/AnalyticsStats";
import {
  HourlyPickupChart,
  DayOfWeekChart,
  OutcomeDistributionChart,
  TemplatePerformanceChart,
  TrendChart,
} from "./analytics/CallAnalyticsCharts";
import { BestTimeInsights } from "./analytics/BestTimeInsights";
import { useAdmin } from "@/contexts/AdminContext";

interface CallRecord {
  id: string;
  phone_number: string;
  due_date: string | null;
  amount: string | null;
  status: string;
  botnoi_call_id: string | null;
  created_at: string;
  updated_at: string;
  template_id: string | null;
}

interface CallListItem {
  id: string;
  status: string;
  picked_up: boolean | null;
  call_outcome: string | null;
  scheduled_at: string | null;
  called_at: string | null;
  created_at: string;
  template_id: string | null;
}

interface Template {
  id: string;
  message: string;
  org_name: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  pending: { label: "Pending", color: "bg-muted text-muted-foreground", icon: Clock },
  calling: { label: "Calling", color: "bg-primary/10 text-primary", icon: PhoneCall },
  confirmed: { label: "Confirmed", color: "bg-success/10 text-success", icon: CheckCircle },
  declined: { label: "Declined", color: "bg-destructive/10 text-destructive", icon: XCircle },
  completed: { label: "Completed", color: "bg-muted text-muted-foreground", icon: PhoneCall },
  no_response: { label: "No Response", color: "bg-warning/10 text-warning", icon: Clock },
  failed: { label: "Failed", color: "bg-destructive/10 text-destructive", icon: AlertCircle },
  no_answer: { label: "No Answer", color: "bg-muted text-muted-foreground", icon: PhoneOff },
};

const CallDashboard = () => {
  const queryClient = useQueryClient();
  const { effectiveUserId } = useAdmin();

  const { data: callRecords, isLoading: loadingRecords, refetch: refetchRecords } = useQuery({
    queryKey: ["call-records", effectiveUserId],
    queryFn: async () => {
      let query = supabase
        .from("call_records")
        .select("*")
        .order("created_at", { ascending: false });

      // Filter by effective user if admin is impersonating
      if (effectiveUserId) {
        query = query.eq("user_id", effectiveUserId);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      return data as CallRecord[];
    },
    refetchInterval: 10000,
    enabled: !!effectiveUserId,
  });

  const { data: callListItems, isLoading: loadingItems, refetch: refetchItems } = useQuery({
    queryKey: ["call-list-items-analytics", effectiveUserId],
    queryFn: async () => {
      let query = supabase
        .from("call_list_items")
        .select("*")
        .order("created_at", { ascending: false });

      // Filter by effective user if admin is impersonating
      if (effectiveUserId) {
        query = query.eq("user_id", effectiveUserId);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      return data as CallListItem[];
    },
    refetchInterval: 10000,
    enabled: !!effectiveUserId,
  });

  const { data: templates } = useQuery({
    queryKey: ["templates-analytics", effectiveUserId],
    queryFn: async () => {
      let query = supabase
        .from("call_templates")
        .select("id, message, org_name");

      // Filter by effective user if admin is impersonating
      if (effectiveUserId) {
        query = query.or(`user_id.eq.${effectiveUserId},is_system_default.eq.true`);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      return data as Template[];
    },
    enabled: !!effectiveUserId,
  });

  useEffect(() => {
    const channel = supabase
      .channel("analytics-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "call_records" },
        () => queryClient.invalidateQueries({ queryKey: ["call-records"] })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "call_list_items" },
        () => queryClient.invalidateQueries({ queryKey: ["call-list-items-analytics"] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const handleRefresh = () => {
    refetchRecords();
    refetchItems();
    toast.success("Data refreshed");
  };

  const getStatusBadge = (status: string) => {
    const config = statusConfig[status] || statusConfig.pending;
    const Icon = config.icon;
    
    return (
      <Badge variant="secondary" className={`${config.color} gap-1 font-normal`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/botnoi-webhook`;

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success("Webhook URL copied");
  };

  const isLoading = loadingRecords || loadingItems;

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Analytics</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Monitor call performance, trends, and insights
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
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
            {/* Stats */}
            <AnalyticsStats callListItems={callListItems || []} />

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <OutcomeDistributionChart callListItems={callListItems || []} />
              <TemplatePerformanceChart callListItems={callListItems || []} templates={templates || []} />
              <BestTimeInsights callListItems={callListItems || []} />
            </div>

            {/* Trend Chart */}
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
            {/* Call History */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Recent Calls</CardTitle>
              </CardHeader>
              <CardContent>
                {callRecords && callRecords.length > 0 ? (
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Phone</TableHead>
                          <TableHead className="text-xs">Due Date</TableHead>
                          <TableHead className="text-xs">Amount</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs">Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {callRecords.slice(0, 50).map((record) => (
                          <TableRow key={record.id}>
                            <TableCell className="font-mono text-sm">{record.phone_number}</TableCell>
                            <TableCell className="text-sm">{record.due_date || "-"}</TableCell>
                            <TableCell className="text-sm">{record.amount ? `฿${record.amount}` : "-"}</TableCell>
                            <TableCell>{getStatusBadge(record.status)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {new Date(record.created_at).toLocaleString("th-TH", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <PhoneCall className="w-10 h-10 mx-auto mb-3 opacity-50" />
                    <p>No calls yet</p>
                    <p className="text-sm">Start a campaign to see results here</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            {/* Webhook */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Webhook URL</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-3 rounded-md bg-muted text-sm font-mono text-muted-foreground truncate">
                    {webhookUrl}
                  </code>
                  <Button variant="outline" size="icon" onClick={copyWebhook}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Configure this URL in Botnoi Voice dashboard to receive call results
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default CallDashboard;
