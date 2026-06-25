import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, TrendingUp, Star } from "lucide-react";

interface CallListItem {
  id: string;
  picked_up: boolean | null;
  call_outcome: string | null;
  called_at: string | null;
}

interface BestTimeInsightsProps {
  callListItems: CallListItem[];
}

export const BestTimeInsights = ({ callListItems }: BestTimeInsightsProps) => {
  const insights = useMemo(() => {
    // Calculate best hour
    const hourStats: Record<number, { total: number; pickedUp: number; confirmed: number }> = {};
    
    callListItems.forEach((item) => {
      if (item.called_at) {
        const hour = new Date(item.called_at).getHours();
        if (!hourStats[hour]) {
          hourStats[hour] = { total: 0, pickedUp: 0, confirmed: 0 };
        }
        hourStats[hour].total++;
        if (item.picked_up) hourStats[hour].pickedUp++;
        if (item.call_outcome === "confirmed") hourStats[hour].confirmed++;
      }
    });

    // Find best hour for pickup (min 5 calls to be considered)
    let bestHour = { hour: -1, rate: 0 };
    Object.entries(hourStats).forEach(([hour, stats]) => {
      if (stats.total >= 5) {
        const rate = (stats.pickedUp / stats.total) * 100;
        if (rate > bestHour.rate) {
          bestHour = { hour: parseInt(hour), rate };
        }
      }
    });

    // Calculate best day
    const dayStats: Record<number, { total: number; pickedUp: number; confirmed: number }> = {};
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    
    callListItems.forEach((item) => {
      if (item.called_at) {
        const day = new Date(item.called_at).getDay();
        if (!dayStats[day]) {
          dayStats[day] = { total: 0, pickedUp: 0, confirmed: 0 };
        }
        dayStats[day].total++;
        if (item.picked_up) dayStats[day].pickedUp++;
        if (item.call_outcome === "confirmed") dayStats[day].confirmed++;
      }
    });

    let bestDay = { day: -1, rate: 0 };
    Object.entries(dayStats).forEach(([day, stats]) => {
      if (stats.total >= 5) {
        const rate = (stats.pickedUp / stats.total) * 100;
        if (rate > bestDay.rate) {
          bestDay = { day: parseInt(day), rate };
        }
      }
    });

    // Overall conversion rate
    const totalCalls = callListItems.filter((i) => i.called_at).length;
    const totalPickedUp = callListItems.filter((i) => i.picked_up).length;
    const totalConfirmed = callListItems.filter((i) => i.call_outcome === "confirmed").length;

    return {
      bestHour: bestHour.hour >= 0 ? `${bestHour.hour.toString().padStart(2, "0")}:00` : "N/A",
      bestHourRate: Math.round(bestHour.rate),
      bestDay: bestDay.day >= 0 ? dayNames[bestDay.day] : "N/A",
      bestDayRate: Math.round(bestDay.rate),
      overallPickupRate: totalCalls > 0 ? Math.round((totalPickedUp / totalCalls) * 100) : 0,
      overallConversionRate: totalPickedUp > 0 ? Math.round((totalConfirmed / totalPickedUp) * 100) : 0,
    };
  }, [callListItems]);

  if (callListItems.filter((i) => i.called_at).length < 10) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Star className="w-4 h-4" />
            Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Need at least 10 calls to generate insights
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Star className="w-4 h-4" />
          Key Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Clock className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">Best Time to Call</p>
            <p className="text-2xl font-bold text-primary">{insights.bestHour}</p>
            <p className="text-xs text-muted-foreground">{insights.bestHourRate}% pickup rate</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-success/10">
            <TrendingUp className="w-4 h-4 text-success" />
          </div>
          <div>
            <p className="text-sm font-medium">Best Day</p>
            <p className="text-2xl font-bold text-success">{insights.bestDay}</p>
            <p className="text-xs text-muted-foreground">{insights.bestDayRate}% pickup rate</p>
          </div>
        </div>

        <div className="pt-3 border-t border-border">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">{insights.overallPickupRate}%</p>
              <p className="text-xs text-muted-foreground">Pickup Rate</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-success">{insights.overallConversionRate}%</p>
              <p className="text-xs text-muted-foreground">Conversion Rate</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
