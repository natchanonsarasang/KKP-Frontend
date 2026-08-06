import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  loginWithPassword,
  registerAccount,
  loginWithGoogle,
  loginWithMicrosoft,
  logout as clearAuth,
} from "@/api/auth";
import { getStoredUser, subscribeAuth, type AuthUser } from "@/api/authToken";
import { fetchGraphProfile, type GraphProfile } from "@/api/graph";
import {
  getStoredGraphProfile,
  setStoredGraphProfile,
  clearStoredGraphProfile,
} from "@/api/graphProfile";

interface AuthContextType {
  user: AuthUser | null;
  /** Microsoft Graph profile (User.Read), when signed in with Microsoft. */
  graphProfile: GraphProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signInWithMicrosoft: (idToken: string, accessToken: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient();
  // The token/user live in localStorage and are read synchronously, so there is
  // no async bootstrap and the app never hangs on a loading state.
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  const [graphProfile, setGraphProfile] = useState<GraphProfile | null>(() =>
    getStoredUser() ? getStoredGraphProfile() : null,
  );
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
      // Drop the cached Graph profile whenever the session goes away.
      if (!next) {
        clearStoredGraphProfile();
        setGraphProfile(null);
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
  const signInWithMicrosoft = async (idToken: string, accessToken: string) => {
    await loginWithMicrosoft(idToken); // setSession -> subscribeAuth updates `user`
    // Actually call Microsoft Graph with the access token (User.Read). A Graph
    // failure must not block a successful sign-in, so it's best-effort.
    try {
      const profile = await fetchGraphProfile(accessToken);
      setStoredGraphProfile(profile);
      setGraphProfile(profile);
    } catch (err) {
      console.warn("[graph] failed to fetch /me profile", err);
    }
  };
  const signOut = () => {
    clearAuth();
    clearStoredGraphProfile();
    setGraphProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        graphProfile,
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
