import { useState } from "react";
import { cn } from "@/lib/utils";
import { Users, Phone, BarChart3, LucideIcon } from "lucide-react";
import DhipayaCustomersList from "./CustomersList";
import DhipayaCallList from "./CallList";
import DhipayaAnalytics from "./Analytics";

type TabType = "customers" | "call-list" | "analytics";

const steps: { id: TabType; label: string; icon: LucideIcon }[] = [
  { id: "customers", label: "Select Customers", icon: Users },
  { id: "call-list", label: "Start Calling", icon: Phone },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
];

const StepIndicator = ({ active, onClick }: { active: TabType; onClick: (t: TabType) => void }) => {
  const idx = steps.findIndex((s) => s.id === active);
  return (
    <div className="flex items-center justify-center w-full max-w-4xl mx-auto mb-8">
      {steps.map((step, i) => {
        const isActive = active === step.id;
        const isDone = idx > i;
        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            <button onClick={() => onClick(step.id)} className="flex flex-col items-center gap-2 group relative">
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                isActive
                  ? "bg-primary/10 border-primary text-primary"
                  : isDone
                  ? "bg-primary border-primary text-primary-foreground"
                  : "bg-background border-muted text-muted-foreground"
              )}>
                <step.icon className="w-5 h-5" />
              </div>
              <span className={cn("text-xs font-medium", isActive ? "text-primary" : "text-muted-foreground")}>
                {step.label}
              </span>
            </button>
            {i < steps.length - 1 && (
              <div className="flex-1 h-[2px] mx-4 mb-6 bg-muted">
                <div className={cn("h-full transition-all duration-500", isDone ? "w-full bg-primary" : "w-0")} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const DhipayaDashboard = () => {
  const [tab, setTab] = useState<TabType>("customers");

  return (
    <div>
      <StepIndicator active={tab} onClick={setTab} />
      {tab === "customers" && <DhipayaCustomersList onNextStep={() => setTab("call-list")} />}
      {tab === "call-list" && <DhipayaCallList />}
      {tab === "analytics" && <DhipayaAnalytics />}
    </div>
  );
};

export default DhipayaDashboard;
