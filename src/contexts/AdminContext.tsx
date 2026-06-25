import { createContext, useContext, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";

interface UserInfo {
  id: string;
  email: string | null;
  full_name: string | null;
}

interface AdminContextType {
  isAdmin: boolean;
  selectedUserId: string | null;
  setSelectedUserId: (id: string | null) => void;
  allUsers: UserInfo[];
  isLoadingUsers: boolean;
  currentUserId: string | null;
  effectiveUserId: string | null; // The user ID to use for queries
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

// Admin / user-impersonation was backed by Supabase `user_roles`/`profiles`.
// The Callecto Go API has no roles endpoint, so that feature is dropped: every
// signed-in user operates as themselves. This context now just surfaces the
// current user id (from the Go session) so existing consumers keep working.
export const AdminProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;

  return (
    <AdminContext.Provider
      value={{
        isAdmin: false,
        selectedUserId: null,
        setSelectedUserId: () => {},
        allUsers: [],
        isLoadingUsers: false,
        currentUserId,
        effectiveUserId: currentUserId,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
};

export const useAdmin = () => {
  const context = useContext(AdminContext);
  if (context === undefined) {
    throw new Error("useAdmin must be used within an AdminProvider");
  }
  return context;
};
