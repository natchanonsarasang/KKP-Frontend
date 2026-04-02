import { useState } from "react";
import { Link } from "react-router-dom";
import { Phone, BarChart3, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import CallDashboard from "@/components/CallDashboard";
import DebtorsList from "@/components/DebtorsList";
import { Toaster } from "@/components/ui/sonner";

type TabType = "debtors" | "analytics";

const navItems = [
  { id: "debtors" as const, label: "Debtors", icon: Users },
  { id: "analytics" as const, label: "Analytics", icon: BarChart3 },
];

const Index = () => {
  const [activeTab, setActiveTab] = useState<TabType>("debtors");

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Toaster />
      
      <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card sticky top-0 z-40">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Phone className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg tracking-tight">Callecto</span>
          </Link>

          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
                  activeTab === item.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <p className="text-xs text-muted-foreground hidden sm:block">
          Automated Voice Collection
        </p>
      </header>

      <main className="flex-1 overflow-auto p-6">
        <div className="animate-fade-in">
          {activeTab === "debtors" && <DebtorsList />}
          {activeTab === "analytics" && <CallDashboard />}
        </div>
      </main>
    </div>
  );
};

export default Index;
