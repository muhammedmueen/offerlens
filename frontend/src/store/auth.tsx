import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import api, { SESSION_ENDED_EVENT, isSessionRejected } from "@/services/api";
import { ENDPOINTS } from "@/constants/api";
import { getGuestOfferIds, clearGuestOffers } from "@/lib/guest-offers";

export interface User {
  id: string;
  name?: string;
  email: string;
  avatarUrl?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name?: string) => Promise<void>;
  loginWithGoogle: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();
  const retryTimer = useRef<ReturnType<typeof setTimeout>>();

  // Local sign-out: UI, retry timer and cached queries (MIN-1: queries are not keyed by user).
  const endLocalSession = useCallback(() => {
    clearTimeout(retryTimer.current);
    setUser(null);
    setIsLoading(false);
    queryClient.removeQueries();
  }, [queryClient]);

  const fetchUser = useCallback(async () => {
    clearTimeout(retryTimer.current);
    if (!localStorage.getItem("access_token")) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    try {
      const { data } = await api.get(ENDPOINTS.USER_ME);
      setUser(data.data);
      setIsLoading(false);
    } catch (err) {
      if (isSessionRejected(err)) {
        // Still rejected after the interceptor's refresh: the session is really gone.
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        endLocalSession();
      } else {
        // AUTH-3: network, 5xx or 429. Keep the tokens; auth stays unknown (isLoading) and is retried.
        // ponytail: fixed 5 s retry. Upgrade: exponential backoff plus the `online` event.
        setIsLoading(true);
        retryTimer.current = setTimeout(() => void fetchUser(), 5000);
      }
    }
  }, [endLocalSession]);

  useEffect(() => {
    fetchUser();
    return () => clearTimeout(retryTimer.current);
  }, [fetchUser]);

  // api.ts ends a dead session outside React; mirror it so the UI shows "logged out".
  useEffect(() => {
    window.addEventListener(SESSION_ENDED_EVENT, endLocalSession);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, endLocalSession);
  }, [endLocalSession]);

  // Other tabs (FLOW-1/AUTH-4). Read storage, not the event: this tab may already hold a newer pair.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== "refresh_token") return;
      if (!localStorage.getItem("refresh_token")) endLocalSession();
      else if (e.key === "refresh_token" && e.oldValue === null) void fetchUser(); // logged in elsewhere
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [endLocalSession, fetchUser]);

  const login = async (email: string, password: string) => {
    const { data } = await api.post(ENDPOINTS.AUTH_LOGIN, { email, password });
    localStorage.setItem("access_token", data.data.tokens.accessToken);
    localStorage.setItem("refresh_token", data.data.tokens.refreshToken);
    await fetchUser();
  };

  const signup = async (email: string, password: string, name?: string) => {
    // Present the guest offers this browser created so the server can claim them.
    const offerIds = getGuestOfferIds();
    const { data } = await api.post(ENDPOINTS.AUTH_SIGNUP, { email, password, name, offerIds });
    localStorage.setItem("access_token", data.data.tokens.accessToken);
    localStorage.setItem("refresh_token", data.data.tokens.refreshToken);
    clearGuestOffers();
    await fetchUser();
  };

  const loginWithGoogle = async (token: string) => {
    const offerIds = getGuestOfferIds();
    const { data } = await api.post(ENDPOINTS.AUTH_GOOGLE, { accessToken: token, offerIds });
    localStorage.setItem("access_token", data.data.tokens.accessToken);
    localStorage.setItem("refresh_token", data.data.tokens.refreshToken);
    clearGuestOffers();
    await fetchUser();
  };

  // AUTH-5: revoke the refresh token server-side. Read it before clearing; logout is authenticated by
  // this body alone (no access token, no refresh flow). Local state is cleared first and the request is
  // not awaited, so a failing or hung network never blocks logging out.
  const logout = async () => {
    const refreshToken = localStorage.getItem("refresh_token");
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    endLocalSession();
    if (refreshToken) api.post(ENDPOINTS.AUTH_LOGOUT, { refreshToken }).catch(() => {});
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        // Unknown (boot, or a transient /users/me failure): follow what the interceptor sends (AUTH-3).
        isAuthenticated: !!user || (isLoading && !!localStorage.getItem("access_token")),
        isLoading,
        login,
        signup,
        loginWithGoogle,
        logout,
        refreshUser: fetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
