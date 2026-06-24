import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  listWorkspaces,
  createWorkspace as apiCreateWorkspace,
  updateWorkspace as apiUpdateWorkspace,
  deleteWorkspace as apiDeleteWorkspace,
} from "@/test/api/workspaces";
import type { Workspace } from "@/test/api/types";
import { toast } from "sonner";

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

  // The Callecto session (token + user) is read synchronously from localStorage,
  // so auth is always "ready" — no async bootstrap or failsafe timeout needed.
  const { user, isLoading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const authReady = !authLoading;

  // Fetch user's workspaces (scoped to the JWT user by the Go API)
  const workspacesQuery = useQuery({
    queryKey: ["workspaces", userId],
    queryFn: async () => {
      if (!userId) return [];

      const data = await listWorkspaces();
      // Preserve the previous `.order("created_at", { ascending: true })` behavior.
      return [...data].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    },
    enabled: authReady && !!userId,
    retry: 1,
  });

  const workspaces = workspacesQuery.data ?? [];
  const isLoading = !authReady ? true : userId ? workspacesQuery.isLoading : false;

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
      // The Go API binds the owner from the JWT and adds the owner membership
      // server-side. Create returns only `{ message }`, so re-fetch to get the row.
      await apiCreateWorkspace({ name });
      const list = await listWorkspaces();
      const newest = [...list].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )[0];
      return newest ?? null;
    },
    onSuccess: (workspace) => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      if (workspace) setCurrentWorkspace(workspace);
      toast.success("Workspace created");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create workspace");
    },
  });

  const updateWorkspaceMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      await apiUpdateWorkspace(id, { name });
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
      await apiDeleteWorkspace(id);
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
