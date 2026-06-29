import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, XCircle } from "lucide-react";

interface StatsCardsProps {
  totalCallsMade: number;
  completeCount: number;
  pickupRate: number;
  incompleteCount: number;
}

export function StatsCards({ totalCallsMade, completeCount, pickupRate, incompleteCount }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="bg-primary/5 border-primary/20 shadow-sm">
        <CardContent className="p-4 text-center">
          <div className="text-3xl font-bold text-primary mb-1">{totalCallsMade}</div>
          <div className="text-xs font-medium text-primary/80 uppercase tracking-wider">Total Calls Made</div>
        </CardContent>
      </Card>

      <Card className="bg-success/5 border-success/20 shadow-sm">
        <CardContent className="p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <CheckCircle className="w-5 h-5 text-success" />
            <span className="text-2xl font-bold text-success">{completeCount}</span>
          </div>
          <div className="text-xs font-medium text-success uppercase tracking-wider">Complete</div>
          <div className="text-[10px] text-success/70 mt-1">{pickupRate}% pickup rate</div>
        </CardContent>
      </Card>

      <Card className="bg-destructive/5 border-destructive/20 shadow-sm">
        <CardContent className="p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <XCircle className="w-5 h-5 text-destructive" />
            <span className="text-2xl font-bold text-destructive">{incompleteCount}</span>
          </div>
          <div className="text-xs font-medium text-destructive/80 uppercase tracking-wider">Incomplete</div>
        </CardContent>
      </Card>
    </div>
  );
}
