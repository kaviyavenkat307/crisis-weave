import React, { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, ShieldCheck, MapPin, Cpu, PackageCheck, TrendingUp, Layers, WifiOff } from 'lucide-react';
import { ChennaiMap, type MapIncidentMarker, type MapOrgMarker } from '../components/ChennaiMap';
import { PriorityLabel } from '../components/StatusText';
import { PWAInstallButton } from '../hooks/usePWA';

interface PublicOverview {
  incidents: MapIncidentMarker[];
  organisations: MapOrgMarker[];
  totals: {
    activeIncidents: number;
    criticalIncidents: number;
    totalStockUnits: number;
    activeShipments: number;
    verifiedOrgs: number;
  };
  simulatedLabel: string;
}

interface HomePageProps {
  onNavigate: (view: 'home' | 'login' | 'register' | 'dashboard') => void;
  isAuthenticated: boolean;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate, isAuthenticated }) => {
  const [overview, setOverview] = useState<PublicOverview | null>(null);
  const [contactForm, setContactForm] = useState({ name: '', email: '', organisation: '', message: '' });
  const [contactStatus, setContactStatus] = useState<{ type: 'idle' | 'submitting' | 'success' | 'error'; text?: string }>({
    type: 'idle',
  });

  useEffect(() => {
    fetch('/api/public/overview')
      .then((r) => r.json())
      .then((data) => setOverview(data))
      .catch(() => undefined);
  }, []);

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactForm.name.trim() || !contactForm.email.includes('@') || !contactForm.message.trim()) {
      setContactStatus({ type: 'error', text: 'Please enter a valid name, email address, and message.' });
      return;
    }
    setContactStatus({ type: 'submitting' });
    try {
      const res = await fetch('/api/public/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contactForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed');
      setContactStatus({ type: 'success', text: data.message });
      setContactForm({ name: '', email: '', organisation: '', message: '' });
    } catch (err) {
      setContactStatus({ type: 'error', text: err instanceof Error ? err.message : 'Submission error' });
    }
  };

  const modules = [
    {
      num: '01',
      title: 'AI-Powered Crisis Intelligence',
      desc: 'Automatically classifies disaster categories, extracts affected people & required supplies, detects nearby duplicates, and computes explainable priority scores.',
      icon: Cpu,
      span: 'lg:col-span-2',
    },
    {
      num: '02',
      title: 'TrustShield Security Layer',
      desc: 'Validates uploads via SHA-256 hashing, flags repeated evidence or burst submissions for human review, enforces RBAC, and logs every mutation.',
      icon: ShieldCheck,
      span: 'lg:col-span-1',
    },
    {
      num: '03',
      title: 'Intelligent Resource Optimisation',
      desc: 'Matches priority requests against multi-NGO stock and road distance, demonstrating measurable gains over First-Come-First-Served baselines.',
      icon: Layers,
      span: 'lg:col-span-1',
    },
    {
      num: '04',
      title: 'GIS & GeoAI Disaster Monitoring',
      desc: 'Interactive OpenStreetMap command view displaying verified incidents, pending triage pins, NGO depots, hospitals, and relief shelters.',
      icon: MapPin,
      span: 'lg:col-span-2',
    },
    {
      num: '05',
      title: 'Predictive Demand Forecasting',
      desc: 'Estimates 6h, 12h, and 24h water, food, medical, and shelter shortages using statistical growth baselines with transparent assumptions.',
      icon: TrendingUp,
      span: 'lg:col-span-1',
    },
    {
      num: '06',
      title: 'Digital Twin Response Simulator',
      desc: 'Lets coordinators stress-test family counts, road accessibility drops, and stock shortages side-by-side before approving dispatches.',
      icon: Layers,
      span: 'lg:col-span-1',
    },
    {
      num: '07',
      title: 'Offline PWA Emergency Reporting',
      desc: 'Saves citizen SOS drafts locally in IndexedDB with idempotency keys and synchronizes automatically once connectivity returns.',
      icon: WifiOff,
      span: 'lg:col-span-1',
    },
    {
      num: '08',
      title: 'End-to-End Delivery Tracking',
      desc: 'Generates unique QR waybills per approved allocation, tracks NGO dispatch to volunteer handover, and reconciles stock atomically.',
      icon: PackageCheck,
      span: 'lg:col-span-3',
    },
  ];

  const workflowSteps = [
    { step: '01', title: 'Report', body: 'Citizens or hospitals submit geolocated needs online or offline via IndexedDB.' },
    { step: '02', title: 'Analyse', body: 'AI extracts quantities, scores urgency with plain-text reasoning, and spots duplicates.' },
    { step: '03', title: 'Verify', body: 'TrustShield hashes evidence and coordinators confirm genuine incidents.' },
    { step: '04', title: 'Match', body: 'Optimisation engine recommends optimal multi-NGO split allocations by distance & priority.' },
    { step: '05', title: 'Dispatch', body: 'NGOs prepare cargo and generate QR-coded relief shipments for field volunteers.' },
    { step: '06', title: 'Track', body: 'Volunteers confirm received quantities, updating inventory and citizen timelines live.' },
  ];

  return (
    <div className="min-h-screen bg-[#F5F7F7] text-[#1E3043]">
      {/* Strict 3-Zone Top Bar */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-6 py-4">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="font-display text-lg font-bold tracking-tight text-[#1E3043] whitespace-nowrap shrink-0"
          >
            CrisisWeave
          </button>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#697780]">
            <a href="#about" className="hover:text-[#1E3043] transition-colors whitespace-nowrap shrink-0">
              About
            </a>
            <a href="#features" className="hover:text-[#1E3043] transition-colors whitespace-nowrap shrink-0">
              Features
            </a>
            <a href="#how-it-works" className="hover:text-[#1E3043] transition-colors whitespace-nowrap shrink-0">
              How It Works
            </a>
            <a href="#impact" className="hover:text-[#1E3043] transition-colors whitespace-nowrap shrink-0">
              Impact
            </a>
            <button
              type="button"
              onClick={() => onNavigate(isAuthenticated ? 'dashboard' : 'login')}
              className="hover:text-[#1E3043] transition-colors whitespace-nowrap shrink-0"
            >
              {isAuthenticated ? 'Dashboard' : 'Login'}
            </button>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate(isAuthenticated ? 'dashboard' : 'register')}
              className="rounded-lg bg-[#268A87] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1f7572] transition-colors whitespace-nowrap shrink-0"
            >
              {isAuthenticated ? 'Open Command Centre' : 'Get Started'}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="mx-auto max-w-7xl px-6 pt-12 pb-10 lg:pt-16">
        <div className="grid grid-cols-1 items-stretch gap-10 lg:grid-cols-12">
          <div className="flex flex-col justify-center lg:col-span-6">
            <p className="text-xs font-semibold tracking-wide text-[#268A87]">
              AI-Powered Disaster Intelligence · Simulated Chennai Flood Demonstration
            </p>
            <h1
              className="mt-3 font-display font-bold tracking-tight text-[#1E3043] leading-[1.08]"
              style={{ fontSize: 'clamp(2.25rem, 4vw, 3.5rem)', textWrap: 'balance' }}
            >
              Disasters Create Chaos. We Connect the Response.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-[#697780]">
              An intelligent disaster-response platform connecting affected communities, relief organisations and
              emergency coordinators through AI-powered insights, secure information and smarter resource coordination.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => onNavigate(isAuthenticated ? 'dashboard' : 'login')}
                className="inline-flex items-center gap-2 rounded-lg bg-[#1E3043] px-5 py-3 text-sm font-semibold text-white hover:bg-[#162433] transition-colors whitespace-nowrap shrink-0"
              >
                Explore Platform
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('register')}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-[#1E3043] hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                Get Started
              </button>
              <PWAInstallButton />
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-200 pt-5 text-xs text-[#697780]">
              <span>5 Role-Based Portals</span>
              <span aria-hidden="true">·</span>
              <span>TrustShield SHA-256 Verification</span>
              <span aria-hidden="true">·</span>
              <span>Offline IndexedDB Reporting</span>
            </div>
          </div>

          {/* Interactive Command Centre Preview */}
          <div className="lg:col-span-6">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <p className="text-xs font-semibold text-[#1E3043]">Chennai Flood Command Preview</p>
                  <p className="text-[11px] text-[#697780]">Simulated demonstration dataset · Real-time GIS layer</p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('login')}
                  className="text-xs font-semibold text-[#268A87] hover:underline whitespace-nowrap shrink-0"
                >
                  Launch 5-Role Demo →
                </button>
              </div>

              <ChennaiMap
                incidents={overview?.incidents || []}
                organisations={overview?.organisations || []}
                heightClass="h-[270px]"
                compact
              />

              <div className="mt-3 divide-y divide-slate-100">
                {(overview?.incidents || []).slice(0, 3).map((inc) => (
                  <div key={inc.id} className="flex items-center justify-between py-2 text-xs">
                    <div className="min-w-0 pr-3">
                      <p className="truncate font-medium text-[#1E3043]">{inc.incident_name}</p>
                      <p className="truncate text-[11px] text-[#697780]">
                        {inc.location_name} · {inc.affected_people} affected
                      </p>
                    </div>
                    <PriorityLabel priority={inc.severity} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Full-Width 4-Column Operational KPI Strip */}
        <div className="mt-10 grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-5 lg:grid-cols-4">
          <div className="border-r border-slate-100 pr-4 last:border-r-0">
            <p className="text-xs text-[#697780]">Active Simulated Incidents</p>
            <p className="mt-1 font-display text-2xl font-bold text-[#1E3043] tabular-nums">
              {overview?.totals.activeIncidents ?? 4}
            </p>
            <p className="mt-0.5 text-[11px] text-[#D9534F] tabular-nums">
              {overview?.totals.criticalIncidents ?? 2} critical priority
            </p>
          </div>
          <div className="lg:border-r border-slate-100 pr-4">
            <p className="text-xs text-[#697780]">Verified Relief Organisations</p>
            <p className="mt-1 font-display text-2xl font-bold text-[#1E3043] tabular-nums">
              {overview?.totals.verifiedOrgs ?? 5}
            </p>
            <p className="mt-0.5 text-[11px] text-[#697780]">NGOs, hospitals & shelters</p>
          </div>
          <div className="border-r border-slate-100 pr-4">
            <p className="text-xs text-[#697780]">Available Stock Pooled</p>
            <p className="mt-1 font-display text-2xl font-bold text-[#1E3043] tabular-nums">
              {(overview?.totals.totalStockUnits ?? 2354).toLocaleString()}
            </p>
            <p className="mt-0.5 text-[11px] text-[#39856D]">Units ready for dispatch</p>
          </div>
          <div>
            <p className="text-xs text-[#697780]">Active Relief Shipments</p>
            <p className="mt-1 font-display text-2xl font-bold text-[#1E3043] tabular-nums">
              {overview?.totals.activeShipments ?? 1}
            </p>
            <p className="mt-0.5 text-[11px] text-[#268A87]">QR-tracked chain of custody</p>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section id="about" className="border-y border-slate-200 bg-white py-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold text-[#268A87]">The Coordination Gap</p>
            <h2
              className="mt-2 font-display text-3xl font-bold tracking-tight text-[#1E3043]"
              style={{ textWrap: 'balance' }}
            >
              When Every Second Matters, Coordination Matters More.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[#697780]">
              During floods and cyclones, emergency requests arrive across fragmented messaging apps and spreadsheets,
              creating critical blind spots between field demand and available inventory.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: 'Scattered Emergency Information',
                body: 'Citizen distress calls and hospital shortages sit in siloed channels with no shared geospatial picture.',
              },
              {
                title: 'Delayed Identification of Urgent Needs',
                body: 'Manual triage slows recognition of life-threatening entrapment, elderly isolation, and duplicate reports.',
              },
              {
                title: 'Resource Mismatch & Waste',
                body: 'First-come-first-served dispatch leaves nearby critical zones starved while distant NGOs over-ship.',
              },
              {
                title: 'Lack of Transparent Tracking',
                body: 'Without verified chain-of-custody or audit logs, coordinators cannot confirm whether relief arrived.',
              },
            ].map((item) => (
              <div key={item.title} className="bg-white p-6">
                <h3 className="font-display text-base font-semibold text-[#1E3043]">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#697780]">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Solution & How It Works */}
      <section id="how-it-works" className="mx-auto max-w-7xl px-6 py-16">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold text-[#268A87]">Unified Relief Workflow</p>
            <h2
              className="mt-2 font-display text-3xl font-bold tracking-tight text-[#1E3043]"
              style={{ textWrap: 'balance' }}
            >
              One Connected Platform. A More Coordinated Response.
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('login')}
            className="text-sm font-semibold text-[#268A87] hover:underline whitespace-nowrap shrink-0"
          >
            Test all 6 stages in Demo Mode →
          </button>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6">
          {workflowSteps.map((s) => (
            <div key={s.step} className="rounded-xl border border-slate-200 bg-white p-5">
              <span className="font-mono-tabular text-xs font-semibold text-[#268A87]">{s.step}</span>
              <h3 className="mt-2 font-display text-base font-semibold text-[#1E3043]">{s.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-[#697780]">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Eight Modules Bento */}
      <section id="features" className="border-t border-slate-200 bg-white py-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold text-[#268A87]">Core Architecture</p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#1E3043]">
              Eight Integrated Intelligence & Coordination Modules
            </h2>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {modules.map((m) => {
              const Icon = m.icon;
              return (
                <div key={m.num} className={`rounded-xl border border-slate-200 bg-[#F5F7F7]/60 p-6 ${m.span}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-mono-tabular text-xs font-semibold text-[#697780]">
                      {m.num}. Module
                    </span>
                    <Icon className="h-4 w-4 text-[#268A87]" />
                  </div>
                  <h3 className="mt-3 font-display text-lg font-semibold text-[#1E3043]">{m.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#697780]">{m.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* SDG Impact & Contact */}
      <section id="impact" className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p className="text-xs font-semibold text-[#268A87]">Global Alignment & Measurable Impact</p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#1E3043]">
              Built for Sustainable, Resilient Disaster Response
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[#697780]">
              CrisisWeave directly advances United Nations Sustainable Development Goals by strengthening municipal
              resilience, climate response speed, and cross-sector humanitarian partnerships.
            </p>

            <div className="mt-8 space-y-4">
              {[
                {
                  sdg: 'SDG 11 · Sustainable Cities & Communities',
                  detail: 'Protects urban neighbourhoods with GIS flood-zone triage, offline citizen reporting, and shelter coordination.',
                },
                {
                  sdg: 'SDG 13 · Climate Action',
                  detail: 'Strengthens adaptive response capacity during cyclones and monsoon floods via Digital Twin scenario planning.',
                },
                {
                  sdg: 'SDG 17 · Partnerships for the Goals',
                  detail: 'Unifies citizens, NGOs, hospitals, volunteers, and municipal coordinators on one auditable network.',
                },
              ].map((item) => (
                <div key={item.sdg} className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#39856D] shrink-0" />
                    <h3 className="font-display text-sm font-semibold text-[#1E3043]">{item.sdg}</h3>
                  </div>
                  <p className="mt-1.5 pl-6 text-sm text-[#697780]">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="font-display text-lg font-semibold text-[#1E3043]">Request Coordinator Access</h3>
              <p className="mt-1 text-xs text-[#697780]">
                Connect your municipal agency, NGO warehouse, or hospital network.
              </p>
              <form onSubmit={handleContactSubmit} className="mt-5 space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-[#1E3043]">Full Name</label>
                  <input
                    type="text"
                    value={contactForm.name}
                    onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-[#1E3043] focus:border-[#268A87] focus:outline-none"
                    placeholder="Dr. Meera Krishnan"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1E3043]">Email Address</label>
                  <input
                    type="email"
                    value={contactForm.email}
                    onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-[#1E3043] focus:border-[#268A87] focus:outline-none"
                    placeholder="operations@relief-org.in"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1E3043]">Organisation</label>
                  <input
                    type="text"
                    value={contactForm.organisation}
                    onChange={(e) => setContactForm({ ...contactForm, organisation: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-[#1E3043] focus:border-[#268A87] focus:outline-none"
                    placeholder="Chennai State Disaster Authority"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1E3043]">Message</label>
                  <textarea
                    rows={3}
                    value={contactForm.message}
                    onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-[#1E3043] focus:border-[#268A87] focus:outline-none"
                    placeholder="Share your operational requirements..."
                  />
                </div>
                {contactStatus.text && (
                  <p className={`text-xs ${contactStatus.type === 'error' ? 'text-[#D9534F]' : 'text-[#39856D]'}`}>
                    {contactStatus.text}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={contactStatus.type === 'submitting'}
                  className="w-full rounded-lg bg-[#1E3043] py-2.5 text-sm font-semibold text-white hover:bg-[#162433] disabled:opacity-60"
                >
                  {contactStatus.type === 'submitting' ? 'Sending...' : 'Send Inquiry'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 px-6 py-10 md:flex-row md:items-center">
          <div>
            <p className="font-display text-base font-bold text-[#1E3043]">CrisisWeave</p>
            <p className="mt-1 max-w-md text-xs text-[#697780]">
              Turning Disaster Chaos into Coordinated Action. Built for ethical AI triage, verifiable relief delivery,
              and resilient communities.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-xs text-[#697780]">
            <a href="#about" className="hover:text-[#1E3043]">About</a>
            <a href="#features" className="hover:text-[#1E3043]">Features</a>
            <a href="#how-it-works" className="hover:text-[#1E3043]">Workflow</a>
            <button type="button" onClick={() => onNavigate('login')} className="hover:text-[#1E3043]">
              Login
            </button>
            <span>coordination@crisisweave.org</span>
          </div>
          <p className="text-xs text-[#697780]">&copy; 2026 CrisisWeave. Simulated demonstration data.</p>
        </div>
      </footer>
    </div>
  );
};
