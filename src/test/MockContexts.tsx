import { useAdmin as useRealAdmin } from "@/contexts/AdminContext";
import { useWorkspace as useRealWorkspace } from "@/contexts/WorkspaceContext";

export const useAdmin = () => {
  try {
    const real = useRealAdmin();
    // If not logged in, return a mock admin context
    if (!real.currentUserId) {
      return {
        isAdmin: true,
        selectedUserId: null,
        setSelectedUserId: () => {},
        allUsers: [{ id: "mock-user-id", email: "test@example.com", full_name: "Test User" }],
        isLoadingUsers: false,
        currentUserId: "mock-user-id",
        effectiveUserId: "mock-user-id",
      };
    }
    return real;
  } catch (e) {
    return {
      isAdmin: true,
      selectedUserId: null,
      setSelectedUserId: () => {},
      allUsers: [{ id: "mock-user-id", email: "test@example.com", full_name: "Test User" }],
      isLoadingUsers: false,
      currentUserId: "mock-user-id",
      effectiveUserId: "mock-user-id",
    };
  }
};

export const useWorkspace = () => {
  try {
    const real = useRealWorkspace();
    // If not logged in or has no workspaces, return mock workspace
    if (!real.currentWorkspace && real.workspaces.length === 0) {
      const mockWorkspace = {
        id: "mock-workspace-id",
        name: "Test Workspace",
        owner_id: "mock-user-id",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      return {
        workspaces: [mockWorkspace],
        currentWorkspace: mockWorkspace,
        setCurrentWorkspace: () => {},
        isLoading: false,
        createWorkspace: async () => {},
        updateWorkspace: async () => {},
        deleteWorkspace: async () => {},
      };
    }
    return real;
  } catch (e) {
    const mockWorkspace = {
      id: "mock-workspace-id",
      name: "Test Workspace",
      owner_id: "mock-user-id",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return {
      workspaces: [mockWorkspace],
      currentWorkspace: mockWorkspace,
      setCurrentWorkspace: () => {},
      isLoading: false,
      createWorkspace: async () => {},
      updateWorkspace: async () => {},
      deleteWorkspace: async () => {},
    };
  }
};
