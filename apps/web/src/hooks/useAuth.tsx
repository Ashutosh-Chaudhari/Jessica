import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { AuthUser, SignupResult } from "@jessica/types";
import { api } from "../services";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName: string) => Promise<SignupResult>;
  logout: () => Promise<void>;
  /** Reflect a name change made on the profile page without a refetch. */
  applyDisplayName: (displayName: string) => void;
  /** The account is gone; drop the session without calling sign-out again. */
  clearSession: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.auth
      .getSession()
      .then(setUser)
      .catch((e: unknown) => console.error("session restore failed:", e))
      // Always clears: otherwise a failed restore leaves the whole app stuck
      // behind the loading screen with no way out.
      .finally(() => setLoading(false));
  }, []);

  const value: AuthState = {
    user,
    loading,
    login: async (email, password) => setUser(await api.auth.login(email, password)),
    signup: async (email, password, displayName) => {
      const result = await api.auth.signup(email, password, displayName);
      if (result.user) setUser(result.user);
      return result;
    },
    logout: async () => {
      await api.auth.logout();
      setUser(null);
    },
    applyDisplayName: (displayName) =>
      setUser((current) => (current ? { ...current, display_name: displayName } : current)),
    clearSession: () => setUser(null),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
