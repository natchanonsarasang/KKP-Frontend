import { useState } from "react";
import { cn } from "@/lib/utils";
import { Users, Phone, BarChart3, LucideIcon } from "lucide-react";
import DhipayaCustomersList from "./CustomersList";
import DhipayaCallList from "./CallList";
import DhipayaAnalytics from "./Analytics";

type TabType = "analytics" | "customers" | "call-list";

const steps: { id: TabType; label: string; icon: LucideIcon }[] = [
  { id: "analytics", label: "Dashboard", icon: BarChart3 },
  { id: "customers", label: "Select Customer", icon: Users },
  { id: "call-list", label: "Start Calling", icon: Phone },
];

const StepIndicator = ({
  activeTab,
  onTabClick,
}: {
  activeTab: TabType;
  onTabClick: (t: TabType) => void;
}) => {
  return (
    <div className="flex items-center justify-center w-full max-w-4xl mx-auto mb-8">
      {steps.map((step, index) => {
        const isActive = activeTab === step.id;
        const isCompleted = steps.findIndex((s) => s.id === activeTab) > index;
        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            <button
              onClick={() => onTabClick(step.id)}
              className="flex flex-col items-center gap-2 group relative transition-all"
            >
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                  isActive
                    ? "bg-primary/10 border-primary text-primary shadow-sm"
                    : isCompleted
                      ? "bg-primary border-primary text-white"
                      : "bg-background border-muted text-muted-foreground group-hover:border-muted-foreground",
                )}
              >
                <step.icon className="w-5 h-5" />
                {isCompleted && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-background flex items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-white rounded-full" />
                  </div>
                )}
              </div>
              <span
                className={cn(
                  "text-xs font-medium whitespace-nowrap",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </button>
            {index < steps.length - 1 && (
              <div className="flex-1 h-[2px] mx-4 mb-6 bg-muted">
                <div
                  className={cn(
                    "h-full transition-all duration-500",
                    isCompleted ? "w-full bg-primary" : "w-0",
                  )}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const DhipayaDashboard = () => {
  const [tab, setTab] = useState<TabType>("analytics");

  return (
    <div>
      <StepIndicator activeTab={tab} onTabClick={setTab} />
      {tab === "analytics" && <DhipayaAnalytics />}
      {tab === "customers" && (
        <DhipayaCustomersList onNextStep={() => setTab("call-list")} />
      )}
      {tab === "call-list" && <DhipayaCallList />}
    </div>
  );
};

export default DhipayaDashboard;
