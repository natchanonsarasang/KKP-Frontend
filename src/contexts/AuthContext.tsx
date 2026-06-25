import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  loginWithPassword,
  registerAccount,
  loginWithGoogle,
  loginWithMicrosoft,
  logout as clearAuth,
} from "@/test/api/auth";
import { getStoredUser, subscribeAuth, type AuthUser } from "@/test/api/authToken";

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signInWithMicrosoft: (idToken: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient();
  // The token/user live in localStorage and are read synchronously, so there is
  // no async bootstrap and the app never hangs on a loading state.
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  const prevUserId = useRef<string | null>(user?.id ?? null);

  useEffect(() => {
    // React to login/logout from anywhere (this tab or another).
    const unsubscribe = subscribeAuth(() => {
      const next = getStoredUser();
      setUser(next);

      // On any auth boundary, clear the react-query cache so one user's cached
      // data can never bleed into another's session.
      const nextId = next?.id ?? null;
      if (nextId !== prevUserId.current) {
        queryClient.clear();
        prevUserId.current = nextId;
      }
    });
    return unsubscribe;
  }, [queryClient]);

  const signInWithPassword = async (email: string, password: string) => {
    await loginWithPassword(email, password); // setSession -> subscribeAuth updates `user`
  };
  const signUp = async (email: string, password: string, name: string) => {
    await registerAccount(email, password, name);
  };
  const signInWithGoogle = async (idToken: string) => {
    await loginWithGoogle(idToken);
  };
  const signInWithMicrosoft = async (idToken: string) => {
    await loginWithMicrosoft(idToken);
  };
  const signOut = () => {
    clearAuth();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading: false,
        signInWithPassword,
        signUp,
        signInWithGoogle,
        signInWithMicrosoft,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
