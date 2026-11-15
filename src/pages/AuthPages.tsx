import React, { useState } from 'react';
import { ArrowLeft, KeyRound, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../types';

interface AuthPagesProps {
  mode: 'login' | 'register';
  onSwitchMode: (mode: 'login' | 'register' | 'home') => void;
  onSuccess: () => void;
}

export const AuthPages: React.FC<AuthPagesProps> = ({ mode, onSwitchMode, onSuccess }) => {
  const { login, demoLogin, register } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Forgot/Reset Password inline view
  const [resetView, setResetView] = useState<'none' | 'forgot' | 'reset'>('none');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  // Registration state
  const [regForm, setRegForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    role: 'citizen' as Exclude<UserRole, 'admin'>,
    organisation_name: '',
    address: 'Velachery, Chennai',
    skills: 'First Aid, Flood Relief Logistics',
    experience: 'Community Volunteer',
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleDemoLogin = async (role: UserRole) => {
    setError(null);
    setBusy(true);
    try {
      await demoLogin(role);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo login failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await register(regForm);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetMessage(null);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResetMessage(
        `${data.message}${data.demoResetCode ? ` Demo reset code: ${data.demoResetCode}` : ''}`
      );
      setResetView('reset');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reset code.');
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, resetCode, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResetMessage(data.message);
      setResetView('none');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset password.');
    }
  };

  const demoRoles: Array<{ role: UserRole; label: string; desc: string }> = [
    { role: 'admin', label: 'Coordinator (Admin)', desc: 'Verify reports, TrustShield, Optimiser, GIS & Digital Twin' },
    { role: 'citizen', label: 'Citizen', desc: 'Submit emergency SOS, upload photo, test offline IndexedDB sync' },
    { role: 'ngo', label: 'NGO Relief Hub', desc: 'Manage inventory, accept allocations & create QR shipments' },
    { role: 'volunteer', label: 'Volunteer', desc: 'Accept field tasks & confirm relief delivery handover' },
    { role: 'hospital', label: 'Hospital', desc: 'Update bed capacity & submit emergency medical supply requests' },
  ];

  return (
    <div className="min-h-screen bg-[#F5F7F7] px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <button
          type="button"
          onClick={() => onSwitchMode('home')}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#697780] hover:text-[#1E3043]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to CrisisWeave Home
        </button>

        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Left: Auth Form */}
          <div className="rounded-xl border border-slate-200 bg-white p-7 lg:col-span-7">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h1 className="font-display text-2xl font-bold text-[#1E3043]">
                  {mode === 'login' ? 'Sign In to CrisisWeave' : 'Create Coordination Account'}
                </h1>
                <p className="mt-1 text-xs text-[#697780]">
                  {mode === 'login'
                    ? 'Protected by TrustShield rate-limiting & HMAC session verification'
                    : 'Register as Citizen, NGO, Volunteer, or Hospital'}
                </p>
              </div>
              <div className="flex rounded-lg bg-slate-100 p-1 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setResetView('none');
                    onSwitchMode('login');
                  }}
                  className={`rounded-md px-3 py-1.5 whitespace-nowrap ${
                    mode === 'login' ? 'bg-white text-[#1E3043] shadow-sm' : 'text-[#697780]'
                  }`}
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setResetView('none');
                    onSwitchMode('register');
                  }}
                  className={`rounded-md px-3 py-1.5 whitespace-nowrap ${
                    mode === 'register' ? 'bg-white text-[#1E3043] shadow-sm' : 'text-[#697780]'
                  }`}
                >
                  Register
                </button>
              </div>
            </div>

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-[#D9534F]/30 bg-[#D9534F]/5 p-3 text-xs text-[#D9534F]">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {resetMessage && (
              <div className="mt-4 rounded-lg border border-[#39856D]/30 bg-[#39856D]/5 p-3 text-xs text-[#39856D]">
                {resetMessage}
              </div>
            )}

            {mode === 'login' && resetView === 'none' && (
              <form onSubmit={handleLogin} className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#1E3043]">Email Address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="coordinator@crisisweave.org"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-[#1E3043] focus:border-[#268A87] focus:outline-none"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-[#1E3043]">Password</label>
                    <button
                      type="button"
                      onClick={() => setResetView('forgot')}
                      className="text-xs font-medium text-[#268A87] hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-[#1E3043] focus:border-[#268A87] focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-lg bg-[#1E3043] py-2.5 text-sm font-semibold text-white hover:bg-[#162433] disabled:opacity-60"
                >
                  {busy ? 'Authenticating...' : 'Sign In'}
                </button>
              </form>
            )}

            {mode === 'login' && resetView === 'forgot' && (
              <form onSubmit={handleForgot} className="mt-6 space-y-4">
                <p className="text-xs text-[#697780]">Enter your registered email to receive a password reset code.</p>
                <div>
                  <label className="block text-xs font-medium text-[#1E3043]">Email Address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm"
                  />
                </div>
                <div className="flex gap-3">
                  <button type="submit" className="rounded-lg bg-[#268A87] px-4 py-2 text-xs font-semibold text-white">
                    Request Reset Code
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetView('none')}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-[#697780]"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {mode === 'login' && resetView === 'reset' && (
              <form onSubmit={handleReset} className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#1E3043]">Reset Code</label>
                  <input
                    type="text"
                    required
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    placeholder="CW-RESET-2026"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1E3043]">New Password</label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm"
                  />
                </div>
                <div className="flex gap-3">
                  <button type="submit" className="rounded-lg bg-[#1E3043] px-4 py-2 text-xs font-semibold text-white">
                    Update Password
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetView('none')}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-[#697780]"
                  >
                    Back to Login
                  </button>
                </div>
              </form>
            )}

            {mode === 'register' && (
              <form onSubmit={handleRegister} className="mt-6 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-[#1E3043]">Full Name</label>
                    <input
                      type="text"
                      required
                      value={regForm.full_name}
                      onChange={(e) => setRegForm({ ...regForm, full_name: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#1E3043]">Phone Number</label>
                    <input
                      type="text"
                      required
                      value={regForm.phone}
                      onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                      placeholder="+91-98400-00000"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-[#1E3043]">Email Address</label>
                    <input
                      type="email"
                      required
                      value={regForm.email}
                      onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#1E3043]">Password (min 6 chars)</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={regForm.password}
                      onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#1E3043]">Account Role</label>
                  <select
                    value={regForm.role}
                    onChange={(e) => setRegForm({ ...regForm, role: e.target.value as Exclude<UserRole, 'admin'> })}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="citizen">Citizen (Affected Community / Reporter)</option>
                    <option value="ngo">NGO / Relief Organisation</option>
                    <option value="volunteer">Field Volunteer</option>
                    <option value="hospital">Hospital / Medical Centre</option>
                  </select>
                  <p className="mt-1 text-[11px] text-[#697780]">
                    Administrator accounts are provisioned strictly through controlled command centre setup.
                  </p>
                </div>

                {(regForm.role === 'ngo' || regForm.role === 'hospital') && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-[#1E3043]">Organisation Name</label>
                      <input
                        type="text"
                        required
                        value={regForm.organisation_name}
                        onChange={(e) => setRegForm({ ...regForm, organisation_name: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#1E3043]">Base Location / Address</label>
                      <input
                        type="text"
                        required
                        value={regForm.address}
                        onChange={(e) => setRegForm({ ...regForm, address: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                )}

                {regForm.role === 'volunteer' && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-[#1E3043]">Skills</label>
                      <input
                        type="text"
                        value={regForm.skills}
                        onChange={(e) => setRegForm({ ...regForm, skills: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#1E3043]">Base Location</label>
                      <input
                        type="text"
                        value={regForm.address}
                        onChange={(e) => setRegForm({ ...regForm, address: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-lg bg-[#268A87] py-2.5 text-sm font-semibold text-white hover:bg-[#1f7572] disabled:opacity-60"
                >
                  {busy ? 'Creating Account...' : 'Create Account'}
                </button>
              </form>
            )}
          </div>

          {/* Right: One-Click 5-Role Hackathon Evaluation Access */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5">
            <div className="flex items-center gap-2 text-[#268A87]">
              <KeyRound className="h-4 w-4" />
              <h2 className="font-display text-base font-semibold text-[#1E3043]">
                Chennai Flood Demo Access
              </h2>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-[#697780]">
              Evaluate the end-to-end relief lifecycle immediately across all five user roles using simulated Chennai
              demonstration accounts.
            </p>

            <div className="mt-5 space-y-2.5">
              {demoRoles.map((item) => (
                <button
                  key={item.role}
                  type="button"
                  disabled={busy}
                  onClick={() => handleDemoLogin(item.role)}
                  className="w-full rounded-lg border border-slate-200 bg-[#F5F7F7]/60 p-3.5 text-left hover:border-[#268A87] hover:bg-white transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-sm font-semibold text-[#1E3043]">{item.label}</span>
                    <span className="text-xs font-semibold text-[#268A87]">Enter →</span>
                  </div>
                  <p className="mt-1 text-xs text-[#697780]">{item.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
