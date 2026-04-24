import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Phone, Users, FileText, BarChart3, LogOut, LucideIcon, Shield, UserCog, ListChecks, ClipboardList, Coins } from "lucide-react";
import DebtorsList from "@/components/DebtorsList";
import CallReportDashboard from "@/components/reports/CallReportDashboard";
import TemplateSetup from "@/components/TemplateSetup";
import CallDashboard from "@/components/CallDashboard";
import CallList from "@/components/CallList";
import WorkspaceSelector from "@/components/WorkspaceSelector";
import CreateWorkspaceDialog from "@/components/CreateWorkspaceDialog";
import { cn } from "@/lib/utils";
import { useAdmin } from "@/contexts/AdminContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";

type TabType = "debtors" | "call-list" | "analytics";

interface DashboardNavLinkProps {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  children: React.ReactNode;
}

const DashboardNavLink = ({ active, onClick, icon: Icon, children }: DashboardNavLinkProps) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
      active
        ? "bg-primary/10 text-primary"
        : "text-muted-foreground hover:text-foreground hover:bg-muted"
    )}
  >
    <Icon className="w-4 h-4" />
    {children}
  </button>
);

const StepIndicator = ({ activeTab, onTabClick }: { activeTab: TabType, onTabClick: (tab: TabType) => void }) => {
  const steps: { id: TabType, label: string, icon: LucideIcon }[] = [
    { id: "debtors", label: "Select Debtors", icon: Users },
    { id: "call-list", label: "Start Calling", icon: Phone },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
  ];

  return (
    <div className="flex items-center justify-center w-full max-w-4xl mx-auto mb-8">
      {steps.map((step, index) => {
        const isActive = activeTab === step.id;
        const isCompleted = steps.findIndex(s => s.id === activeTab) > index;

        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            <button
              onClick={() => onTabClick(step.id)}
              className="flex flex-col items-center gap-2 group relative transition-all"
            >
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                isActive
                  ? "bg-primary/10 border-primary text-primary shadow-sm"
                  : isCompleted
                    ? "bg-primary border-primary text-white"
                    : "bg-background border-muted text-muted-foreground group-hover:border-muted-foreground"
              )}>
                <step.icon className="w-5 h-5" />
                {isCompleted && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-background flex items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-white rounded-full" />
                  </div>
                )}
              </div>
              <span className={cn(
                "text-xs font-medium whitespace-nowrap",
                isActive ? "text-primary" : "text-muted-foreground"
              )}>
                {step.label}
              </span>
            </button>

            {index < steps.length - 1 && (
              <div className="flex-1 h-[2px] mx-4 mb-6 bg-muted">
                <div className={cn(
                  "h-full transition-all duration-500",
                  isCompleted ? "w-full bg-primary" : "w-0"
                )} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("debtors");
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);

  // Get admin context
  const { isAdmin, selectedUserId, setSelectedUserId, allUsers, isLoadingUsers, effectiveUserId } = useAdmin();

  // Get workspace context
  const { currentWorkspace, workspaces, isLoading: workspacesLoading, createWorkspace } = useWorkspace();

  // Fetch user tokens for the header
  const { data: userTokens } = useQuery({
    queryKey: ["call-tokens", effectiveUserId],
    queryFn: async () => {
      if (!effectiveUserId) return null;
      const { data, error } = await supabase
        .from("call_tokens")
        .select("tokens")
        .eq("user_id", effectiveUserId)
        .maybeSingle();

      if (error) throw error;
      return data?.tokens ?? 0;
    },
    enabled: !!effectiveUserId,
  });

  // Show/hide create workspace dialog based on whether workspaces exist
  useEffect(() => {
    if (!workspacesLoading && session) {
      if (workspaces.length === 0) {
        setShowCreateWorkspace(true);
      } else {
        setShowCreateWorkspace(false);
      }
    }
  }, [workspaces, workspacesLoading, session]);

  // Get selected user info for display
  const selectedUserInfo = allUsers.find(u => u.id === selectedUserId);

  useEffect(() => {
    let cancelled = false;

    const finish = (nextSession: Session | null) => {
      if (cancelled) return;

      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);

      if (!nextSession) {
        navigate("/");
      }
    };

    const init = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) console.warn("dashboard getSession error", error);
        finish(data.session);
      } catch (e) {
        console.warn("dashboard getSession threw", e);
        finish(null);
      }
    };

    init();

    // Failsafe: never hang on a loading screen in production
    const failSafe = window.setTimeout(() => {
      finish(null);
    }, 3000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      window.clearTimeout(failSafe);
      finish(nextSession);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(failSafe);
      subscription.unsubscribe();
    };
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const userInitials = user?.user_metadata?.full_name
    ?.split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase() || user?.email?.[0].toUpperCase() || "U";

  return (
    <div className="min-h-screen bg-background">
      {/* Create Workspace Dialog - Required when no workspaces exist */}
      <CreateWorkspaceDialog
        open={showCreateWorkspace}
        onOpenChange={setShowCreateWorkspace}
        onCreateWorkspace={createWorkspace}
        isRequired={workspaces.length === 0}
      />
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-8">
            {/* Logo - links to landing */}
            <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
                <Phone className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="text-lg font-semibold tracking-tight">Callecto</span>
            </Link>

          </div>

          <div className="flex items-center gap-3">
            {/* Token Balance Hidden for Testing */}
            {/* 
            <div className="hidden sm:flex items-center gap-2 px-3 h-10 rounded-lg border border-orange-200 bg-orange-50/50 text-orange-700">
              <div className="w-5 h-5 rounded-full bg-orange-100 flex items-center justify-center">
                <Coins className="w-3 h-3 text-orange-600" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold leading-none">{userTokens ?? 0}</span>
                <span className="text-[10px] font-medium uppercase tracking-tight text-orange-600/80 leading-none">Call Tokens</span>
              </div>
            </div>
            */}

            {/* Workspace Selector */}
            <WorkspaceSelector />
            {/* Admin User Selector */}
            {isAdmin && (
              <div className="flex items-center gap-2">
                <UserCog className="w-4 h-4 text-yellow-600" />
                <Select
                  value={selectedUserId || "self"}
                  onValueChange={(value) => setSelectedUserId(value === "self" ? null : value)}
                >
                  <SelectTrigger className={cn(
                    "w-[200px] h-9",
                    selectedUserId && "border-yellow-500 bg-yellow-500/10"
                  )}>
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="self">
                      <span className="font-medium">My Account</span>
                    </SelectItem>
                    {allUsers
                      .filter(u => u.id !== user?.id)
                      .map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.full_name || u.email || u.id.slice(0, 8)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={user?.user_metadata?.avatar_url} alt={user?.email || ""} />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <div className="flex flex-col space-y-1 p-2">
                  <p className="text-sm font-medium">{user?.user_metadata?.full_name || "User"}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                {isAdmin && (
                  <>
                    <DropdownMenuItem onClick={() => navigate("/admin")} className="cursor-pointer">
                      <Shield className="mr-2 h-4 w-4 text-yellow-600" />
                      Admin Panel
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={handleLogout} className="text-destructive cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

      </header>

      {/* Admin Impersonation Banner */}
      {isAdmin && selectedUserId && selectedUserInfo && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/30 px-6 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <UserCog className="w-4 h-4 text-yellow-600" />
            <span className="text-yellow-700 dark:text-yellow-400">
              Operating as: <strong>{selectedUserInfo.full_name || selectedUserInfo.email}</strong>
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedUserId(null)}
            className="text-yellow-700 hover:text-yellow-800 hover:bg-yellow-500/20"
          >
            Exit
          </Button>
        </div>
      )}

      <main className="p-6 max-w-7xl mx-auto w-full">
        <StepIndicator activeTab={activeTab} onTabClick={(tab) => setActiveTab(tab)} />

        {activeTab === "debtors" && (
          <DebtorsList onNextStep={() => setActiveTab("call-list")} />
        )}
        {activeTab === "call-list" && <CallList />}
        {activeTab === "analytics" && <CallDashboard />}
      </main>
    </div>
  );
};

export default Dashboard;
