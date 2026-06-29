import { Badge } from "@/components/ui/badge";
import { statusConfig } from "./constants";

export function getStatusBadge(status: string) {
  const config = statusConfig[status] || statusConfig.pending;
  const Icon = config.icon;
  return (
    <Badge variant="secondary" className={`${config.color} gap-1 font-normal`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}

export function getOutcomeBadge(outcome: string | null, pickedUp: boolean | null) {
  if (outcome) {
    const o = outcome.toLowerCase();
    if (o.includes("hang")) {
      return (
        <Badge variant="secondary" className="bg-warning/10 text-warning gap-1 font-normal">
          Hang up
        </Badge>
      );
    }
    return getStatusBadge(o);
  }
  if (pickedUp === false) return getStatusBadge("no_answer");
  return <span className="text-muted-foreground text-xs">-</span>;
}
