import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { api, ApiError, authToken, type AuthUserPayload } from "./api";

export type AuthUser = AuthUserPayload;
type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<string>;
  verifyOtp: (email: string, code: string) => Promise<void>;
  resendOtp: (email: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readToken(): string | null {
  return authToken.get();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    if (!readToken()) {
      setLoading(false);
      return;
    }

    // Restore the session from the stored JWT; drop it when invalid/expired.
    api
      .me()
      .then(({ user: restored }) => {
        if (active) setUser(restored);
      })
      .catch((error) => {
        if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
          authToken.clear();
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isLoading,
      login: async (email, password) => {
        if (!email || !password) {
          throw new Error("Email and password are required.");
        }

        const session = await api.login({ email, password });
        authToken.set(session.token);
        setUser(session.user);
      },
      signup: async (name, email, password) => {
        if (!name || !email || !password) {
          throw new Error("Name, email and password are required.");
        }

        // Account is created unverified — an OTP code is emailed to the user.
        // The session only starts after verifyOtp() succeeds.
        const result = await api.signup({ name, email, password });
        return result.email;
      },
      verifyOtp: async (email, code) => {
        if (!email || !code) {
          throw new Error("Enter the code from your email.");
        }

        const session = await api.verifyOtp({ email, code });
        authToken.set(session.token);
        setUser(session.user);
      },
      resendOtp: async (email) => {
        await api.resendOtp(email);
      },
      logout: () => {
        authToken.clear();
        setUser(null);
      },
    }),
    [user, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
