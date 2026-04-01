import { Card, CardContent } from "@/components/ui/card";
import { PhoneCall, CheckCircle, XCircle, PhoneOff, TrendingUp } from "lucide-react";

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
  const confirmed = completedCalls.filter((item) => item.call_outcome === "confirmed");
  const declined = completedCalls.filter((item) => item.call_outcome === "declined");
  const noAnswer = completedCalls.filter((item) => item.picked_up === false);

  const pickupRate = completedCalls.length > 0 
    ? Math.round((pickedUp.length / completedCalls.length) * 100) 
    : 0;
  
  const conversionRate = pickedUp.length > 0 
    ? Math.round((confirmed.length / pickedUp.length) * 100) 
    : 0;

  const stats = [
    {
      label: "Total Calls Made",
      value: completedCalls.length,
      icon: PhoneCall,
      color: "text-foreground",
      bgColor: "bg-muted",
    },
    {
      label: "Picked Up",
      value: pickedUp.length,
      subValue: `${pickupRate}%`,
      icon: PhoneCall,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      label: "Confirmed",
      value: confirmed.length,
      subValue: `${conversionRate}% conv.`,
      icon: CheckCircle,
      color: "text-success",
      bgColor: "bg-success/10",
    },
    {
      label: "Declined",
      value: declined.length,
      icon: XCircle,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
    },
    {
      label: "No Answer",
      value: noAnswer.length,
      icon: PhoneOff,
      color: "text-muted-foreground",
      bgColor: "bg-muted",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {stats.map((stat) => (
        <Card key={stat.label} className={stat.bgColor.replace("/10", "/5")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className={`text-2xl font-semibold ${stat.color}`}>{stat.value}</span>
                  {stat.subValue && (
                    <span className="text-xs text-muted-foreground">{stat.subValue}</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">{stat.label}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
