import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<any>;
  register: (username: string, email: string, password: string) => Promise<any>;
  verifyLogin: (email: string, code: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
  updateUser: (user: Partial<User>) => void;
  refreshUser: () => Promise<void>;
  forgotPassword: (email: string) => Promise<any>;
  resetPassword: (email: string, code: string, password: string) => Promise<any>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

const API_URL = import.meta.env.VITE_API_URL || 'https://maxcord.fun';
axios.defaults.baseURL = API_URL;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
    } else setLoading(false);
  }, [token]);

  const fetchUser = async () => {
    try {
      const response = await axios.get('/api/auth/me');
      setUser(response.data);
    } catch (error) {
      localStorage.removeItem('token');
      setToken(null);
      delete axios.defaults.headers.common['Authorization'];
    } finally { setLoading(false); }
  };

  const updateUser = (updatedUser: Partial<User>) => setUser(prev => prev ? { ...prev, ...updatedUser } : (updatedUser as User));
  const login = async (email: string, password: string) => {
    const response = await axios.post('/api/auth/login', { email, password }, { headers: { 'Content-Type': 'application/json' } });
    if (response.data.token) {
      const { token: newToken, user: newUser } = response.data;
      setToken(newToken);
      setUser(newUser);
      localStorage.setItem('token', newToken);
      axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    }
    return response.data;
  };

  const register = async (username: string, email: string, password: string) => {
    const response = await axios.post('/api/auth/register', { username, email, password });
    if (response.data.token) {
      const { token: newToken, user: newUser } = response.data;
      setToken(newToken);
      setUser(newUser);
      localStorage.setItem('token', newToken);
      axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    }
    return response.data;
  };

  const verifyLogin = async (email: string, code: string) => {
    const response = await axios.post('/api/auth/verify-login', { email, code });
    const { token: newToken, user: newUser } = response.data;
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('token', newToken);
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
  };

  const logout = () => { setToken(null); setUser(null); localStorage.removeItem('token'); delete axios.defaults.headers.common['Authorization']; };
  const refreshUser = async () => { await fetchUser(); };

  const forgotPassword = async (email: string) => {
    const response = await axios.post('/api/auth/forgot-password', { email });
    return response.data;
  };

  const resetPassword = async (email: string, code: string, password: string) => {
    const response = await axios.post('/api/auth/reset-password', { email, code, password });
    return response.data;
  };

  return <AuthContext.Provider value={{ user, token, login, register, verifyLogin, logout, loading, updateUser, refreshUser, forgotPassword, resetPassword }}>{children}</AuthContext.Provider>;
};
