import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { apiRequest, getStoredToken, setStoredToken } from '../services/api';
import type { AppNotification, User, UserRole } from '../types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  notifications: AppNotification[];
  unreadCount: number;
  socket: Socket | null;
  login: (email: string, password: string) => Promise<User>;
  demoLogin: (role: UserRole) => Promise<User>;
  register: (payload: Record<string, unknown>) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  markNotificationsRead: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);

  const refreshNotifications = useCallback(async () => {
    if (!getStoredToken()) return;
    try {
      const res = await apiRequest<{ notifications: AppNotification[] }>('/api/notifications');
      setNotifications(res.notifications);
    } catch {
      // ignore when offline or unauthenticated
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (!getStoredToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await apiRequest<{ user: User }>('/api/auth/me');
      setUser(res.user);
      await refreshNotifications();
    } catch {
      setStoredToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [refreshNotifications]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    if (!user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }
    const s = io({ transports: ['websocket', 'polling'] });
    s.on('connect', () => {
      s.emit('join-role', user.role);
    });
    s.on('notification:new', (notif: AppNotification) => {
      if (notif.user_id === user.id || notif.role_target === user.role) {
        setNotifications((prev) => {
          if (prev.some((n) => n.id === notif.id)) return prev;
          return [notif, ...prev].slice(0, 30);
        });
      }
    });
    setSocket(s);
    return () => {
      s.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role]);

  const login = async (email: string, password: string): Promise<User> => {
    const res = await apiRequest<{ user: User; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(res.token);
    setUser(res.user);
    await refreshNotifications();
    return res.user;
  };

  const demoLogin = async (role: UserRole): Promise<User> => {
    const res = await apiRequest<{ user: User; token: string }>('/api/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify({ role }),
    });
    setStoredToken(res.token);
    setUser(res.user);
    await refreshNotifications();
    return res.user;
  };

  const register = async (payload: Record<string, unknown>): Promise<User> => {
    const res = await apiRequest<{ user: User; token: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setStoredToken(res.token);
    setUser(res.user);
    await refreshNotifications();
    return res.user;
  };

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore offline
    }
    setStoredToken(null);
    setUser(null);
    setNotifications([]);
  };

  const markNotificationsRead = async () => {
    await apiRequest('/api/notifications/mark-read', { method: 'POST' });
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        notifications,
        unreadCount,
        socket,
        login,
        demoLogin,
        register,
        logout,
        refreshUser,
        refreshNotifications,
        markNotificationsRead,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
