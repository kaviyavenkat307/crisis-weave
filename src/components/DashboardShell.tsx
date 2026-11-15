import React, { useState } from 'react';
import { Bell, LogOut, Menu, Search, Wifi, WifiOff, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { OfflineIndicator, PWAInstallButton, useOnlineStatus } from '../hooks/usePWA';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

interface DashboardShellProps {
  title: string;
  navItems: NavItem[];
  activeTab: string;
  onTabChange: (id: string) => void;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  simulatedOffline?: boolean;
  onToggleSimulatedOffline?: () => void;
  onGoHome: () => void;
  children: React.ReactNode;
}

export const DashboardShell: React.FC<DashboardShellProps> = ({
  title,
  navItems,
  activeTab,
  onTabChange,
  searchQuery = '',
  onSearchChange,
  simulatedOffline = false,
  onToggleSimulatedOffline,
  onGoHome,
  children,
}) => {
  const { user, logout, notifications, unreadCount, markNotificationsRead } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [scenario, setScenario] = useState('Simulated Chennai Flood 2026');
  const realOnline = useOnlineStatus();
  const isOnline = realOnline && !simulatedOffline;

  return (
    <div className="flex min-h-screen bg-[#F5F7F7] text-[#1E3043]">
      {/* Desktop & Mobile Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-[#1E3043] text-slate-100 transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={onGoHome}
            className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap"
          >
            CrisisWeave
          </button>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="rounded p-1 text-slate-300 hover:bg-white/10 lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-white/10 px-5 py-3">
          <p className="text-[11px] text-slate-300">Active Role</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-white capitalize">{user?.role} Portal</p>
          <p className="truncate text-xs text-slate-300">{user?.full_name}</p>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onTabChange(item.id);
                  setSidebarOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${
                  active
                    ? 'bg-[#268A87] text-white'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span className="ml-2 rounded bg-white/15 px-1.5 py-0.5 font-mono-tabular text-[11px] text-white">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3 space-y-2">
          {onToggleSimulatedOffline && (
            <button
              type="button"
              onClick={onToggleSimulatedOffline}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                simulatedOffline ? 'bg-[#E49B43] text-[#1E3043]' : 'bg-white/10 text-slate-200 hover:bg-white/15'
              }`}
            >
              <span className="flex items-center gap-2">
                {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                {simulatedOffline ? 'Simulated Offline' : 'Network: Online'}
              </span>
              <span className="text-[11px] underline">{simulatedOffline ? 'Go Online' : 'Test Offline'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Viewport */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top Navigation */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg border border-slate-200 p-1.5 text-[#1E3043] lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate font-display text-base font-bold text-[#1E3043]">{title}</h1>
              <p className="truncate text-[11px] text-[#697780]">
                Simulated Demonstration Data · {scenario}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {onSearchChange && (
              <div className="relative hidden md:block w-56">
                <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-[#697780]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Search records..."
                  className="w-full rounded-lg border border-slate-200 bg-[#F5F7F7] py-1.5 pl-8 pr-3 text-xs text-[#1E3043] focus:border-[#268A87] focus:bg-white focus:outline-none"
                />
              </div>
            )}

            <select
              aria-label="Active disaster scenario"
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              className="hidden xl:block rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-[#1E3043] focus:border-[#268A87] focus:outline-none"
            >
              <option>Simulated Chennai Flood 2026</option>
              <option>Cyclone Surge Drill (Staging)</option>
            </select>

            <PWAInstallButton compact />

            {/* Live Notifications */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotifOpen(!notifOpen);
                  if (!notifOpen && unreadCount > 0) markNotificationsRead();
                }}
                className="relative rounded-lg border border-slate-200 bg-white p-2 text-[#1E3043] hover:bg-slate-50"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#D9534F] px-1 font-mono-tabular text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-lg z-50">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs font-semibold text-[#1E3043]">Live Alerts & Updates</span>
                    <button
                      type="button"
                      onClick={() => setNotifOpen(false)}
                      className="text-xs text-[#697780] hover:text-[#1E3043]"
                    >
                      Close
                    </button>
                  </div>
                  <div className="mt-2 max-h-72 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <p className="py-6 text-center text-xs text-[#697780]">No notifications yet.</p>
                    ) : (
                      notifications.map((n) => (
                        <div key={n.id} className="py-2.5 text-xs">
                          <p className="font-semibold text-[#1E3043]">{n.title}</p>
                          <p className="mt-0.5 text-[#697780] leading-snug">{n.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>

      <OfflineIndicator simulatedOffline={simulatedOffline} />
    </div>
  );
};
