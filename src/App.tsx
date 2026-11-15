import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { HomePage } from './pages/HomePage';
import { AuthPages } from './pages/AuthPages';
import { CitizenDashboard } from './pages/CitizenDashboard';
import { NGODashboard } from './pages/NGODashboard';
import { VolunteerDashboard } from './pages/VolunteerDashboard';
import { HospitalDashboard } from './pages/HospitalDashboard';
import { AdminDashboard } from './pages/AdminDashboard';

type AppRoute = 'home' | 'login' | 'register' | 'dashboard';

const CrisisWeaveRouter: React.FC = () => {
  const { user, loading } = useAuth();
  const [route, setRoute] = useState<AppRoute>('home');

  useEffect(() => {
    if (!loading && user && (route === 'login' || route === 'register')) {
      setRoute('dashboard');
    }
  }, [user, loading, route]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F7F7]">
        <div className="text-center space-y-2">
          <p className="font-display text-lg font-bold text-[#1E3043]">CrisisWeave</p>
          <p className="text-xs text-[#697780]">Loading coordination network...</p>
        </div>
      </div>
    );
  }

  if (route === 'login' || route === 'register') {
    return (
      <AuthPages
        mode={route}
        onSwitchMode={(next) => setRoute(next)}
        onSuccess={() => setRoute('dashboard')}
      />
    );
  }

  if (route === 'dashboard' && user) {
    if (user.role === 'admin') return <AdminDashboard onGoHome={() => setRoute('home')} />;
    if (user.role === 'ngo') return <NGODashboard onGoHome={() => setRoute('home')} />;
    if (user.role === 'volunteer') return <VolunteerDashboard onGoHome={() => setRoute('home')} />;
    if (user.role === 'hospital') return <HospitalDashboard onGoHome={() => setRoute('home')} />;
    return <CitizenDashboard onGoHome={() => setRoute('home')} />;
  }

  return <HomePage onNavigate={(next) => setRoute(next)} isAuthenticated={Boolean(user)} />;
};

export default function App() {
  return (
    <AuthProvider>
      <CrisisWeaveRouter />
    </AuthProvider>
  );
}
