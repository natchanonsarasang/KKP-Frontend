import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
  effectiveUserId: string | null; // The user ID to use for queries (selected or current)
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export const AdminProvider = ({ children }: { children: ReactNode }) => {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const currentUserIdRef = useRef<string | null>(null);

  // Get current user + keep react-query cache in sync with auth changes
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const id = user?.id ?? null;
      currentUserIdRef.current = id;
      setCurrentUserId(id);
    };
    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      let newUserId = session?.user?.id ?? null;
      const previousUserId = currentUserIdRef.current;

      currentUserIdRef.current = newUserId;
      setCurrentUserId(newUserId);

      // Reset selected user when logging out
      if (!session) {
        setSelectedUserId(null);
      }

      // IMPORTANT: after logout/login, cached call list data can appear under the wrong tab.
      // Clear the entire query cache on any auth boundary.
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || previousUserId !== newUserId) {
        console.log(`Auth state changed: ${event} (${previousUserId} -> ${newUserId}), clearing query cache`);
        queryClient.clear();
      }
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);


  // Check if current user is admin
  const { data: isAdmin = false } = useQuery({
    queryKey: ["is-admin-context", currentUserId],
    queryFn: async () => {
      if (!currentUserId) return false;

      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", currentUserId)
        .eq("role", "admin")
        .maybeSingle();

      return !!data;
    },
    enabled: !!currentUserId,
  });

  // Fetch all users if admin
  const { data: allUsers = [], isLoading: isLoadingUsers } = useQuery({
    queryKey: ["admin-all-users", isAdmin],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as UserInfo[];
    },
    enabled: isAdmin,
  });

  // Effective user ID: selected user if admin has selected one, otherwise current user
  const effectiveUserId = isAdmin && selectedUserId ? selectedUserId : currentUserId;

  return (
    <AdminContext.Provider
      value={{
        isAdmin,
        selectedUserId,
        setSelectedUserId,
        allUsers,
        isLoadingUsers,
        currentUserId,
        effectiveUserId,
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
