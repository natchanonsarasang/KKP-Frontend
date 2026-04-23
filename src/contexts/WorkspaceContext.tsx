import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

interface WorkspaceContextType {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  setCurrentWorkspace: (workspace: Workspace | null) => void;
  isLoading: boolean;
  createWorkspace: (name: string) => Promise<void>;
  updateWorkspace: (id: string, name: string) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const WorkspaceProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient();
  const [currentWorkspace, setCurrentWorkspaceState] = useState<Workspace | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // Listen for auth state changes
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        // Read session from local storage (fast) and avoid blocking the UI forever
        const { data, error } = await supabase.auth.getSession();
        if (error) console.warn("getSession error", error);
        if (!cancelled) {
          const id = data.session?.user?.id ?? null;
          setUserId(id);
          setAuthReady(true);
        }
      } catch (e) {
        console.warn("getSession threw", e);
        if (!cancelled) {
          setUserId(null);
          setAuthReady(true);
        }
      }
    };

    init();

    // Failsafe: never let the app be stuck in a perpetual auth loading state
    const failSafe = window.setTimeout(() => {
      if (!cancelled) setAuthReady(true);
    }, 3000);

    // Subscribe to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const newUserId = session?.user?.id ?? null;
      setUserId(newUserId);
      setAuthReady(true);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(failSafe);
      subscription.unsubscribe();
    };
  }, []);

  // Fetch user's workspaces
  const workspacesQuery = useQuery({
    queryKey: ["workspaces", userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from("workspaces")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as Workspace[];
    },
    enabled: authReady && !!userId,
    retry: 1,
  });

  const workspaces = workspacesQuery.data ?? [];
  const isLoading = !authReady ? true : !!userId ? workspacesQuery.isLoading : false;

  // Set default workspace when workspaces load
  useEffect(() => {
    if (workspaces.length > 0 && !currentWorkspace) {
      // Try to restore from localStorage
      const savedWorkspaceId = localStorage.getItem("currentWorkspaceId");
      const savedWorkspace = workspaces.find(w => w.id === savedWorkspaceId);
      setCurrentWorkspaceState(savedWorkspace || workspaces[0]);
    }
  }, [workspaces, currentWorkspace]);

  const setCurrentWorkspace = (workspace: Workspace | null) => {
    setCurrentWorkspaceState(workspace);
    if (workspace) {
      localStorage.setItem("currentWorkspaceId", workspace.id);
    } else {
      localStorage.removeItem("currentWorkspaceId");
    }
  };

  const createWorkspaceMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create workspace
      const { data: workspace, error: workspaceError } = await supabase
        .from("workspaces")
        .insert({ name, owner_id: user.id })
        .select()
        .single();

      if (workspaceError) throw workspaceError;

      // Add user as owner member
      const { error: memberError } = await supabase
        .from("workspace_members")
        .insert({ workspace_id: workspace.id, user_id: user.id, role: "owner" });

      if (memberError) throw memberError;

      return workspace;
    },
    onSuccess: (workspace) => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      setCurrentWorkspace(workspace);
      toast.success("Workspace created");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create workspace");
    },
  });

  const updateWorkspaceMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase
        .from("workspaces")
        .update({ name })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      toast.success("Workspace updated");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update workspace");
    },
  });

  const deleteWorkspaceMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("workspaces")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      // Switch to first remaining workspace
      const remaining = workspaces.filter(w => w.id !== currentWorkspace?.id);
      if (remaining.length > 0) {
        setCurrentWorkspace(remaining[0]);
      } else {
        setCurrentWorkspace(null);
      }
      toast.success("Workspace deleted");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete workspace");
    },
  });

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        currentWorkspace,
        setCurrentWorkspace,
        isLoading,
        createWorkspace: async (name) => {
          await createWorkspaceMutation.mutateAsync(name);
        },
        updateWorkspace: async (id, name) => {
          await updateWorkspaceMutation.mutateAsync({ id, name });
        },
        deleteWorkspace: async (id) => {
          await deleteWorkspaceMutation.mutateAsync(id);
        },
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
};
