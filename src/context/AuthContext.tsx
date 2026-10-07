import React, { createContext, useContext, useState } from 'react';

export interface User {
  id: string;
  name: string;
  email: string;
  organization: string;
  role: string;
  avatarUrl?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string) => void;
  logout: () => void;
}

const defaultUser: User = {
  id: 'usr-9012',
  name: 'Alex Parker',
  email: 'alex.parker@enterprise.internal',
  organization: 'CloudTech Solutions Ltd.',
  role: 'Admin / Cloud Architect',
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('docflow_auth_user');
    if (stored) {
      try { return JSON.parse(stored); } catch { /* ignore */ }
    }
    return defaultUser;
  });

  const login = (email: string) => {
    const newUser: User = {
      ...defaultUser,
      email: email || defaultUser.email,
    };
    setUser(newUser);
    localStorage.setItem('docflow_auth_user', JSON.stringify(newUser));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('docflow_auth_user');
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
