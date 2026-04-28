import { Card, CardContent } from "@/components/ui/card";
import { PhoneCall, CheckCircle, XCircle, PhoneOff, FileText } from "lucide-react";

interface CallListItem {
  id: string;
  status: string;
  picked_up: boolean | null;
  call_outcome: string | null;
  called_at: string | null;
}

interface AnalyticsStatsProps {
  callListItems: CallListItem[];
}

export const AnalyticsStats = ({ callListItems }: AnalyticsStatsProps) => {
  const completedCalls = callListItems.filter((item) => item.called_at);
  const pickedUp = completedCalls.filter((item) => item.picked_up);
  
  // Specific Incomplete Statuses
  const noAnswer = completedCalls.filter((item) => 
    item.call_outcome?.toLowerCase() === "no_answer" || 
    item.status?.toLowerCase() === "no_answer" ||
    (item.picked_up === false && !item.call_outcome)
  );
  const busy = completedCalls.filter((item) => item.call_outcome?.toLowerCase() === "busy" || item.status?.toLowerCase() === "busy");
  const failed = completedCalls.filter((item) => item.call_outcome?.toLowerCase() === "failed" || item.status?.toLowerCase() === "failed");
  const rejected = completedCalls.filter((item) => 
    item.call_outcome?.toLowerCase() === "rejected" || 
    item.call_outcome?.toLowerCase() === "declined" ||
    item.status?.toLowerCase() === "rejected" ||
    item.status?.toLowerCase() === "declined"
  );
  const voicemail = completedCalls.filter((item) => item.call_outcome?.toLowerCase() === "voicemail" || item.status?.toLowerCase() === "voicemail");

  const totalIncomplete = noAnswer.length + busy.length + failed.length + rejected.length + voicemail.length;
  
  const pickupRate = completedCalls.length > 0 
    ? Math.round((pickedUp.length / completedCalls.length) * 100) 
    : 0;

  return (
    <div className="space-y-6 w-full max-w-5xl mx-auto pb-6">
      {/* 1. Total Calls - Top Large Card */}
      <Card className="bg-blue-50 border-blue-200 shadow-sm">
        <CardContent className="p-6 text-center">
          <div className="text-4xl font-bold text-blue-600 mb-1">{completedCalls.length}</div>
          <div className="text-sm font-medium text-blue-500 uppercase tracking-wider">Total Calls Made</div>
        </CardContent>
      </Card>

      {/* 2. Main Status - Two Middle Cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-emerald-50 border-emerald-200 shadow-sm">
          <CardContent className="p-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              <span className="text-3xl font-bold text-emerald-600">{pickedUp.length}</span>
            </div>
            <div className="text-sm font-medium text-emerald-600 uppercase tracking-wider">Complete</div>
            <div className="text-xs text-emerald-500 mt-1">{pickupRate}% pickup rate</div>
          </CardContent>
        </Card>

        <Card className="bg-destructive/5 border-destructive/20">
          <CardContent className="p-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <XCircle className="w-5 h-5 text-destructive" />
              <span className="text-3xl font-bold text-destructive">{totalIncomplete}</span>
            </div>
            <div className="text-sm font-medium text-destructive/80 uppercase tracking-wider">Incomplete</div>
          </CardContent>
        </Card>
      </div>

      {/* 3. Incomplete Breakdown - 5 Bottom Small Cards */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: "No Answer", value: noAnswer.length, icon: PhoneOff },
          { label: "Busy", value: busy.length, icon: PhoneCall },
          { label: "Failed", value: failed.length, icon: XCircle },
          { label: "Rejected", value: rejected.length, icon: PhoneOff },
          { label: "Voicemail", value: voicemail.length, icon: FileText },
        ].map((item) => (
          <Card key={item.label} className="border-none shadow-sm bg-amber-500/10">
            <CardContent className="p-3 text-center">
              <div className="text-lg font-bold text-amber-600 mb-0.5">{item.value}</div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase truncate" title={item.label}>
                {item.label}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
