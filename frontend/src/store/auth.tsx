import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import api from "@/services/api";
import { ENDPOINTS } from "@/constants/api";

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

  const fetchUser = useCallback(async () => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    try {
      const { data } = await api.get(ENDPOINTS.USER_ME);
      setUser(data.data);
    } catch {
      setUser(null);
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = async (email: string, password: string) => {
    const { data } = await api.post(ENDPOINTS.AUTH_LOGIN, { email, password });
    localStorage.setItem("access_token", data.data.tokens.accessToken);
    localStorage.setItem("refresh_token", data.data.tokens.refreshToken);
    await fetchUser();
  };

  const signup = async (email: string, password: string, name?: string) => {
    const { data } = await api.post(ENDPOINTS.AUTH_SIGNUP, { email, password, name });
    localStorage.setItem("access_token", data.data.tokens.accessToken);
    localStorage.setItem("refresh_token", data.data.tokens.refreshToken);
    await fetchUser();
  };

  const loginWithGoogle = async (token: string) => {
    const { data } = await api.post(ENDPOINTS.AUTH_GOOGLE, { accessToken: token });
    localStorage.setItem("access_token", data.data.tokens.accessToken);
    localStorage.setItem("refresh_token", data.data.tokens.refreshToken);
    await fetchUser();
  };

  const logout = async () => {
    try {
      await api.post(ENDPOINTS.AUTH_LOGOUT);
    } catch {
      // ignore
    }
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
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
