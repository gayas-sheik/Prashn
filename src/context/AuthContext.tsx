import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiClient, getAuthToken, setAuthToken } from '../services/api/apiClient';

export interface User { id: string; name: string; email: string; organization: string; role: string; avatarUrl?: string; }
interface AuthContextType {
  user: User | null; isAuthenticated: boolean; loading: boolean;
  login: (email: string, password: string) => Promise<void>; logout: () => void;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
const asUser = (value: any): User => ({ id: value.id, name: value.fullName, email: value.email, role: value.role, organization: '' });

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const logout = () => { setAuthToken(null); setUser(null); localStorage.removeItem('prashn_auth_user'); };
  useEffect(() => {
    let disposed = false;
    const restore = async () => {
      try {
        if (await getAuthToken()) {
          const data = await apiClient('/auth/me');
          if (!disposed) setUser(asUser(data.user));
        }
      } catch { if (!disposed) logout(); }
      finally { if (!disposed) setLoading(false); }
    };
    void restore();
    window.addEventListener('prashn-session-expired', logout);
    return () => { disposed = true; window.removeEventListener('prashn-session-expired', logout); };
  }, []);
  const login = async (email: string, password: string) => {
    const data = await apiClient('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    setAuthToken(data.token); setUser(asUser(data.user));
  };
  return <AuthContext.Provider value={{ user, isAuthenticated: !!user, loading, login, logout }}>{children}</AuthContext.Provider>;
};
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
