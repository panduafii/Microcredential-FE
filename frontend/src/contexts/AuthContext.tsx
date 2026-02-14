"use client";
import React, { createContext, useContext, useEffect, useState } from "react";
import {
  getCurrentUser,
  isAuthenticated,
  logout as authLogout,
  type User,
} from "@/lib/auth";

interface AuthContextType {
  user: User | null;
  isLoggedIn: boolean;
  logout: () => void;
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const refreshUser = () => {
    if (isAuthenticated()) {
      const currentUser = getCurrentUser();
      setUser(currentUser);
      setIsLoggedIn(!!currentUser);
    } else {
      setUser(null);
      setIsLoggedIn(false);
    }
  };

  useEffect(() => {
    // Check auth status on mount
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshUser();
  }, []);

  const logout = () => {
    authLogout();
    setUser(null);
    setIsLoggedIn(false);
  };

  return (
    <AuthContext.Provider value={{ user, isLoggedIn, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
