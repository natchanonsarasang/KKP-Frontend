import { Badge } from "@/components/ui/badge";
import { statusConfig } from "./constants";
import { resolveMainStatus, resolveSubStatus } from "@/lib/callStatuses";

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
    // Normalize to the statusConfig key shape: lowercase, spaces → underscores
    // (outcomes arrive as "No Response" / "Not Convenient" / "Rejected"), so the
    // badge doesn't silently fall back to "Pending" for unknown keys.
    const o = outcome.toLowerCase().trim().replace(/\s+/g, "_");
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

/**
 * Badge for the AI-chosen conversation category (ai_category). Resolves the raw
 * label to the shared taxonomy so the color + wording match the analytics charts.
 * Falls back to the raw string, then to "-" when the AI never classified the call.
 */
export function getAICategoryBadge(category: string | null | undefined) {
  if (!category) return <span className="text-muted-foreground text-xs">-</span>;

  const def = resolveMainStatus(category) ?? resolveSubStatus(category);
  const color = def?.color ?? "#64748b";
  const label = def?.label ?? category;

  return (
    <Badge
      variant="secondary"
      className="gap-1.5 font-normal border-0"
      style={{ backgroundColor: `${color}1a`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      {label}
    </Badge>
  );
}

/**
 * Compact confidence meter (0–1 from the model) rendered as a mini bar + percent.
 * Color-coded: green ≥80%, amber ≥50%, red below. `null`/undefined → "-"
 * (the call was never AI-classified, e.g. missing key or unreachable).
 */
export function getConfidenceMeter(confidence: number | null | undefined) {
  if (confidence == null) return <span className="text-muted-foreground text-xs">-</span>;

  const pct = Math.round(Math.max(0, Math.min(1, confidence)) * 100);
  const color = pct >= 80 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#f43f5e";

  return (
    <div className="flex items-center gap-2" title={`AI confidence: ${pct}%`}>
      <div className="h-1.5 w-14 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground w-8">{pct}%</span>
    </div>
  );
}
