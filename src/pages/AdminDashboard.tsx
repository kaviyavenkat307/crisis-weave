import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Boxes,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Cpu,
  Download,
  FileSearch,
  Layers,
  LayoutDashboard,
  MapPin,
  QrCode,
  Settings,
  ShieldAlert,
  Sliders,
  TrendingUp,
  Truck,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DashboardShell, type NavItem } from '../components/DashboardShell';
import { ChennaiMap, type MapIncidentMarker, type MapOrgMarker } from '../components/ChennaiMap';
import { PriorityLabel, VerificationText } from '../components/StatusText';
import { ShipmentQRModal } from '../components/ShipmentQRModal';
import { AllocationEngineView } from '../components/admin/AllocationEngineView';
import { DemandPredictionView, DigitalTwinView } from '../components/admin/PredictionAndTwinView';
import { TrustShieldView } from '../components/admin/TrustShieldView';
import { useAuth } from '../context/AuthContext';
import { PWAInstallButton } from '../hooks/usePWA';
import { apiRequest } from '../services/api';
import type {
  AIExtraction,
  Allocation,
  AnomalyFlag,
  AuditLog,
  DemandPrediction,
  EmergencyReport,
  Incident,
  InventoryItem,
  OptimisationComparison,
  ReportEvidence,
  Shipment,
  User,
} from '../types';

export const AdminDashboard: React.FC<{ onGoHome: () => void }> = ({ onGoHome }) => {
  const { socket } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');

  const [reports, setReports] = useState<EmergencyReport[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [optimisation, setOptimisation] = useState<OptimisationComparison | null>(null);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyFlag[]>([]);
  const [evidence, setEvidence] = useState<Array<ReportEvidence & { location_name?: string }>>([]);
  const [predictions, setPredictions] = useState<DemandPrediction[]>([]);
  const [horizon, setHorizon] = useState<'6h' | '12h' | '24h'>('12h');
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [mapOrgs, setMapOrgs] = useState<MapOrgMarker[]>([]);
  const [pendingMarkers, setPendingMarkers] = useState<MapIncidentMarker[]>([]);
  const [directory, setDirectory] = useState<{
    users: User[];
    organisations: Array<MapOrgMarker & { contact_number?: string; verification_status?: string; available_beds?: number; total_beds?: number }>;
    volunteers: Array<{ id: number; full_name: string; skills: string; availability: string; current_location: string; phone: string }>;
  }>({ users: [], organisations: [], volunteers: [] });

  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [optRunning, setOptRunning] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Verification modal state
  const [reviewReasons, setReviewReasons] = useState<Record<number, string>>({});

  // Live AI tester state
  const [aiTestText, setAiTestText] = useState(
    '15 families stranded on rooftop in Velachery near 100ft road; elderly diabetic patient needs insulin and clean drinking water.'
  );
  const [aiTestResult, setAiTestResult] = useState<AIExtraction | null>(null);
  const [aiTestBusy, setAiTestBusy] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [
        repRes,
        incRes,
        invRes,
        allocRes,
        optPreview,
        shipRes,
        tsRes,
        predRes,
        auditRes,
        mapIncRes,
        mapOrgRes,
        dirRes,
      ] = await Promise.all([
        apiRequest<{ reports: EmergencyReport[] }>('/api/reports'),
        apiRequest<{ incidents: Incident[] }>('/api/incidents'),
        apiRequest<{ inventory: InventoryItem[] }>('/api/inventory'),
        apiRequest<{ allocations: Allocation[] }>('/api/allocations'),
        apiRequest<OptimisationComparison>('/api/optimisation/preview'),
        apiRequest<{ shipments: Shipment[] }>('/api/shipments'),
        apiRequest<{ anomalies: AnomalyFlag[]; evidence: Array<ReportEvidence & { location_name?: string }> }>(
          '/api/trustshield/overview'
        ),
        apiRequest<{ predictions: DemandPrediction[] }>(`/api/predictions?horizon=${horizon}`),
        apiRequest<{ logs: AuditLog[] }>('/api/audit-logs'),
        apiRequest<{ incidents: MapIncidentMarker[]; pendingReports: MapIncidentMarker[] }>('/api/map/incidents'),
        apiRequest<{ organisations: MapOrgMarker[] }>('/api/map/organisations'),
        apiRequest<{
          users: User[];
          organisations: Array<MapOrgMarker & { contact_number?: string; verification_status?: string; available_beds?: number; total_beds?: number }>;
          volunteers: Array<{ id: number; full_name: string; skills: string; availability: string; current_location: string; phone: string }>;
        }>('/api/admin/directory'),
      ]);

      setReports(repRes.reports);
      setIncidents(incRes.incidents);
      setInventory(invRes.inventory);
      setAllocations(allocRes.allocations);
      setOptimisation(optPreview);
      setShipments(shipRes.shipments);
      setAnomalies(tsRes.anomalies);
      setEvidence(tsRes.evidence);
      setPredictions(predRes.predictions);
      setAuditLogs(auditRes.logs);
      setPendingMarkers(
        (mapIncRes.pendingReports || []).map((p) => ({
          ...p,
          incident_name: `Pending Report #${p.id}`,
          severity: (p as unknown as { ai_priority: 'Critical' | 'High' | 'Medium' | 'Low' }).ai_priority || 'High',
          status: 'Pending',
        }))
      );
      setMapOrgs(mapOrgRes.organisations);
      setDirectory(dirRes);
    } catch {
      // ignore transient errors
    }
  }, [horizon]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!socket) return;
    const onRefresh = () => loadAll();
    socket.on('report:created', onRefresh);
    socket.on('report:verified', onRefresh);
    socket.on('allocation:approved', onRefresh);
    socket.on('shipment:updated', onRefresh);
    socket.on('inventory:updated', onRefresh);
    return () => {
      socket.off('report:created', onRefresh);
      socket.off('report:verified', onRefresh);
      socket.off('allocation:approved', onRefresh);
      socket.off('shipment:updated', onRefresh);
      socket.off('inventory:updated', onRefresh);
    };
  }, [socket, loadAll]);

  const handleVerifyReport = async (
    reportId: number,
    decision: 'Verified' | 'Rejected' | 'Duplicate Linked',
    linkToIncidentId?: number | null
  ) => {
    const reason = reviewReasons[reportId] || `Coordinator ${decision.toLowerCase()} report #${reportId}.`;
    await apiRequest(`/api/reports/${reportId}/verify`, {
      method: 'POST',
      body: JSON.stringify({ decision, reason, linkToIncidentId }),
    });
    setFeedback(`Report #${reportId} marked as ${decision}.`);
    await loadAll();
  };

  const handleRunOptimisation = async () => {
    setOptRunning(true);
    try {
      const res = await apiRequest<OptimisationComparison>('/api/optimisation/recommend', {
        method: 'POST',
        body: JSON.stringify({ persist: true }),
      });
      setOptimisation(res);
      setFeedback('Optimisation engine generated split-NGO recommendations ready for approval.');
      await loadAll();
    } finally {
      setOptRunning(false);
    }
  };

  const handleApproveAllocation = async (id: number, decision: 'Approved' | 'Rejected') => {
    try {
      const res = await apiRequest<{ shipmentCode?: string }>(`/api/allocations/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      setFeedback(
        decision === 'Approved'
          ? `Allocation AL-${id} approved and QR Shipment ${res.shipmentCode} created.`
          : `Allocation AL-${id} rejected.`
      );
      await loadAll();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Allocation decision failed.');
    }
  };

  const handleReviewAnomaly = async (id: number, reviewStatus: 'Cleared' | 'Escalated') => {
    await apiRequest(`/api/trustshield/anomalies/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ reviewStatus }),
    });
    setFeedback(`TrustShield flag #${id} marked ${reviewStatus}.`);
    await loadAll();
  };

  const handleChangeHorizon = async (next: '6h' | '12h' | '24h') => {
    setHorizon(next);
    const res = await apiRequest<{ predictions: DemandPrediction[] }>(`/api/predictions?horizon=${next}`);
    setPredictions(res.predictions);
  };

  const handleRunAiTest = async () => {
    setAiTestBusy(true);
    try {
      const res = await apiRequest<AIExtraction>('/api/ai/classify', {
        method: 'POST',
        body: JSON.stringify({ description: aiTestText, locationName: 'Velachery, Chennai' }),
      });
      setAiTestResult(res);
    } finally {
      setAiTestBusy(false);
    }
  };

  const handleExportAuditCSV = () => {
    const header = 'ID,Timestamp,Actor,Role,Action,Entity,EntityID,Decision\n';
    const rows = auditLogs
      .map(
        (l) =>
          `${l.id},"${l.created_at}","${l.actor_name}","${l.actor_role}","${l.action}","${l.entity_type}",${l.entity_id ?? ''},"${(l.decision_info || '').replace(/"/g, '""')}"`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'crisisweave_audit_report.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Derived KPI & Chart Metrics
  const pendingReports = useMemo(() => reports.filter((r) => r.verification_status === 'Pending'), [reports]);
  const criticalIncidents = useMemo(() => incidents.filter((i) => i.severity === 'Critical'), [incidents]);
  const pendingAllocations = useMemo(() => allocations.filter((a) => a.status === 'Recommended'), [allocations]);
  const openAnomalies = useMemo(() => anomalies.filter((a) => a.review_status === 'Open'), [anomalies]);
  const activeShipments = useMemo(
    () => shipments.filter((s) => ['Preparing', 'Dispatched', 'In Transit'].includes(s.status)),
    [shipments]
  );
  const deliveredShipments = useMemo(() => shipments.filter((s) => s.status === 'Delivered'), [shipments]);
  const totalStock = useMemo(() => inventory.reduce((sum, i) => sum + i.quantity_available, 0), [inventory]);

  const priorityDist = useMemo(() => {
    const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    for (const inc of incidents) counts[inc.severity] = (counts[inc.severity] || 0) + 1;
    return [
      { name: 'Critical', value: counts.Critical, color: '#D9534F' },
      { name: 'High', value: counts.High, color: '#E49B43' },
      { name: 'Medium', value: counts.Medium, color: '#268A87' },
      { name: 'Low', value: counts.Low, color: '#697780' },
    ];
  }, [incidents]);

  const stockVsDemandChart = useMemo(() => {
    return predictions.slice(0, 5).map((p) => ({
      name: p.resource_name.replace('Drinking ', ''),
      Available: p.available_inventory,
      Demand: p.current_demand,
      Shortage: p.expected_shortage,
    }));
  }, [predictions]);

  const filteredReports = useMemo(() => {
    if (!searchQuery.trim()) return reports;
    const q = searchQuery.toLowerCase();
    return reports.filter(
      (r) =>
        r.location_name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.ai_category.toLowerCase().includes(q)
    );
  }, [reports, searchQuery]);

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'incidents', label: 'Incidents', icon: AlertTriangle, badge: incidents.length },
    { id: 'verification', label: 'Verification', icon: ClipboardCheck, badge: pendingReports.length },
    { id: 'intelligence', label: 'AI Intelligence', icon: Cpu },
    { id: 'trustshield', label: 'TrustShield', icon: ShieldAlert, badge: openAnomalies.length },
    { id: 'resources', label: 'Resources', icon: Boxes },
    { id: 'allocation', label: 'Allocation', icon: Layers, badge: pendingAllocations.length },
    { id: 'map', label: 'Live GIS Map', icon: MapPin },
    { id: 'predictions', label: 'Predictions', icon: TrendingUp },
    { id: 'twin', label: 'Digital Twin', icon: Sliders },
    { id: 'shipments', label: 'Shipments', icon: Truck, badge: activeShipments.length },
    { id: 'organisations', label: 'Organisations', icon: Building2 },
    { id: 'volunteers', label: 'Volunteers', icon: Users },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'audit', label: 'Audit Logs', icon: FileSearch },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <DashboardShell
      title="Emergency Coordinator Command Centre"
      navItems={navItems}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onGoHome={onGoHome}
    >
      {feedback && (
        <div className="mb-5 flex items-center justify-between rounded-xl border border-[#268A87]/30 bg-[#268A87]/10 px-4 py-3 text-xs text-[#1E3043]">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="font-semibold text-[#268A87]">
            Dismiss
          </button>
        </div>
      )}

      {/* 1. OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-5">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-[#697780]">Total Reports</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums">{reports.length}</p>
              <p className="mt-0.5 text-[11px] text-[#E49B43] tabular-nums">{pendingReports.length} pending review</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-[#697780]">Verified Incidents</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums">{incidents.length}</p>
              <p className="mt-0.5 text-[11px] text-[#D9534F] tabular-nums">{criticalIncidents.length} critical</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-[#697780]">Pooled Stock Units</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums">{totalStock.toLocaleString()}</p>
              <p className="mt-0.5 text-[11px] text-[#39856D]">{directory.organisations.length} verified hubs</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-[#697780]">Shipments</p>
              <p className="mt-1 font-display text-2xl font-bold text-[#268A87] tabular-nums">
                {activeShipments.length} active
              </p>
              <p className="mt-0.5 text-[11px] text-[#39856D] tabular-nums">{deliveredShipments.length} delivered</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-[#697780]">TrustShield Alerts</p>
              <p className="mt-1 font-display text-2xl font-bold text-[#D9534F] tabular-nums">{openAnomalies.length}</p>
              <p className="mt-0.5 text-[11px] text-[#697780]">Open security flags</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-7">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-[#1E3043]">Resource Availability vs. Demand</h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('allocation')}
                  className="text-xs font-semibold text-[#268A87] hover:underline"
                >
                  Open Optimiser →
                </button>
              </div>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stockVsDemandChart} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#697780' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#697780' }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Available" fill="#39856D" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Demand" fill="#1E3043" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Shortage" fill="#D9534F" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-[#1E3043]">Incident Priority Breakdown</h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('incidents')}
                  className="text-xs font-semibold text-[#268A87] hover:underline"
                >
                  Manage Incidents →
                </button>
              </div>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={priorityDist} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={78} paddingAngle={3}>
                      {priorityDist.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <ChennaiMap
                incidents={incidents}
                pendingReports={pendingMarkers}
                organisations={mapOrgs}
                heightClass="h-[320px]"
                compact
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="font-display text-sm font-semibold text-[#1E3043]">Pending Verification & Approvals</h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('verification')}
                  className="text-xs font-semibold text-[#268A87] hover:underline"
                >
                  Review All
                </button>
              </div>
              <div className="divide-y divide-slate-100">
                {pendingReports.slice(0, 3).map((r) => (
                  <div key={r.id} className="py-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[#1E3043]">Report #{r.id} · {r.location_name}</span>
                      <PriorityLabel priority={r.ai_priority} />
                    </div>
                    <p className="mt-1 text-[#697780] line-clamp-1">{r.ai_explanation}</p>
                  </div>
                ))}
                {pendingReports.length === 0 && (
                  <p className="py-4 text-xs text-[#697780]">All incoming emergency reports have been reviewed.</p>
                )}
              </div>

              <div className="border-t border-slate-100 pt-3">
                <p className="text-xs font-semibold text-[#1E3043] mb-2">Recent Audit Activity</p>
                <div className="space-y-1.5 text-[11px] text-[#697780]">
                  {auditLogs.slice(0, 4).map((l) => (
                    <p key={l.id} className="truncate">
                      <span className="font-mono-tabular text-[#1E3043]">{l.action}</span> · {l.actor_name}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. INCIDENTS */}
      {activeTab === 'incidents' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-display text-base font-semibold text-[#1E3043]">Verified Disaster Incidents</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {incidents.map((inc) => (
              <div key={inc.id} className="p-5 flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-[#697780]">
                    <span className="font-mono-tabular font-semibold text-[#1E3043]">INC-{inc.id}</span>
                    <span>·</span>
                    <span>{inc.disaster_type}</span>
                    <span>·</span>
                    <span>{inc.affected_people} affected</span>
                    <span>·</span>
                    <span>{inc.report_count ?? 1} linked report(s)</span>
                  </div>
                  <h3 className="font-display text-sm font-semibold text-[#1E3043]">{inc.incident_name}</h3>
                  <p className="text-xs text-[#697780]">{inc.description}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <PriorityLabel priority={inc.severity} />
                  <VerificationText status={inc.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. REPORT VERIFICATION */}
      {activeTab === 'verification' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-display text-base font-semibold text-[#1E3043]">
              Coordinator Report Verification & Duplicate Triage
            </h2>
            <p className="mt-1 text-xs text-[#697780]">
              Review AI priority reasoning, potential duplicate proximity matches, and TrustShield flags before creating
              verified incidents and resource requests.
            </p>
          </div>

          {filteredReports.map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#697780]">
                  <span className="font-mono-tabular font-semibold text-[#1E3043]">Report #{r.id}</span>
                  <span>·</span>
                  <span>{r.reporter_name || 'Citizen Reporter'}</span>
                  <span>·</span>
                  <span>{r.location_name}</span>
                  <span>·</span>
                  <span className="tabular-nums">{r.affected_people} affected</span>
                </div>
                <div className="flex items-center gap-3">
                  <PriorityLabel priority={r.ai_priority} />
                  <span className="text-slate-300">·</span>
                  <VerificationText status={r.security_flag} />
                  <span className="text-slate-300">·</span>
                  <VerificationText status={r.verification_status} />
                </div>
              </div>

              <p className="text-sm text-[#1E3043]">{r.description}</p>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 text-xs">
                <div className="rounded-lg bg-[#F5F7F7] p-3">
                  <p className="font-semibold text-[#1E3043]">Explainable AI Score ({r.ai_score}/100)</p>
                  <p className="mt-1 text-[#697780]">{r.ai_explanation}</p>
                </div>
                <div className="rounded-lg bg-[#F5F7F7] p-3">
                  <p className="font-semibold text-[#1E3043]">Duplicate & TrustShield Check</p>
                  <p className="mt-1 text-[#697780]">
                    {r.duplicate_score > 0
                      ? `Potential duplicate (${r.duplicate_score}% match${r.matched_incident_id ? ` to Incident #${r.matched_incident_id}` : ''}).`
                      : 'No nearby duplicate submissions detected.'}{' '}
                    Security status: <strong>{r.security_flag}</strong>.
                  </p>
                </div>
              </div>

              {r.verification_status === 'Pending' && (
                <div className="flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center">
                  <input
                    type="text"
                    value={reviewReasons[r.id] || ''}
                    onChange={(e) => setReviewReasons({ ...reviewReasons, [r.id]: e.target.value })}
                    placeholder="Verification reason or audit note..."
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleVerifyReport(r.id, 'Verified')}
                      className="rounded-lg bg-[#39856D] px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Verify Incident
                    </button>
                    {r.matched_incident_id && (
                      <button
                        type="button"
                        onClick={() => handleVerifyReport(r.id, 'Duplicate Linked', r.matched_incident_id)}
                        className="rounded-lg bg-[#268A87] px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        Link to Incident #{r.matched_incident_id}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleVerifyReport(r.id, 'Rejected')}
                      className="rounded-lg border border-[#D9534F]/40 px-3 py-1.5 text-xs font-semibold text-[#D9534F]"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 4. AI INTELLIGENCE CENTRE */}
      {activeTab === 'intelligence' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5 space-y-4">
            <h2 className="font-display text-base font-semibold text-[#1E3043]">Live AI Crisis Analyzer</h2>
            <p className="text-xs text-[#697780]">
              Test real-time entity extraction, resource inference, and explainable priority scoring.
            </p>
            <textarea
              rows={4}
              value={aiTestText}
              onChange={(e) => setAiTestText(e.target.value)}
              className="w-full rounded-lg border border-slate-200 p-3 text-sm"
            />
            <button
              type="button"
              disabled={aiTestBusy}
              onClick={handleRunAiTest}
              className="rounded-lg bg-[#1E3043] px-4 py-2 text-xs font-semibold text-white"
            >
              {aiTestBusy ? 'Analyzing...' : 'Run AI Classification'}
            </button>
            {aiTestResult && (
              <div className="rounded-lg bg-[#F5F7F7] p-4 text-xs space-y-2">
                <p>
                  <strong>Category:</strong> {aiTestResult.category} · <strong>Priority:</strong> {aiTestResult.priority} (
                  {aiTestResult.priorityScore}/100)
                </p>
                <p>
                  <strong>Explanation:</strong> {aiTestResult.explanation}
                </p>
                <p>
                  <strong>Inferred Resources:</strong>{' '}
                  {aiTestResult.requestedResources.map((x) => `${x.quantity} ${x.unit} ${x.resourceName}`).join(', ')}
                </p>
                <p className="text-[#268A87]">Engine: {aiTestResult.modelUsed}</p>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-7">
            <h3 className="font-display text-sm font-semibold text-[#1E3043]">AI Triage Ledger</h3>
            <div className="mt-3 divide-y divide-slate-100">
              {reports.map((r) => (
                <div key={r.id} className="py-3 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="font-semibold text-[#1E3043]">
                      Report #{r.id} · {r.ai_category}
                    </span>
                    <PriorityLabel priority={r.ai_priority} />
                  </div>
                  <p className="text-[#697780]">{r.ai_explanation}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 5. TRUSTSHIELD */}
      {activeTab === 'trustshield' && (
        <TrustShieldView anomalies={anomalies} evidence={evidence} onReviewAnomaly={handleReviewAnomaly} />
      )}

      {/* 6. RESOURCES */}
      {activeTab === 'resources' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-display text-base font-semibold text-[#1E3043]">Network NGO Inventory Pool</h2>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[#697780]">
              <tr>
                <th className="px-4 py-3 font-medium">Organisation</th>
                <th className="px-4 py-3 font-medium">Resource</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium text-right">Quantity Available</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {inventory.map((i) => (
                <tr key={i.id}>
                  <td className="px-4 py-3 font-medium text-[#1E3043]">{i.organisation_name}</td>
                  <td className="px-4 py-3 text-[#1E3043]">{i.resource_name}</td>
                  <td className="px-4 py-3 text-[#697780]">{i.category}</td>
                  <td className="px-4 py-3 text-right font-mono-tabular font-semibold">
                    {i.quantity_available.toLocaleString()} {i.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 7. ALLOCATION */}
      {activeTab === 'allocation' && (
        <AllocationEngineView
          optimisation={optimisation}
          allocations={allocations}
          running={optRunning}
          onRunOptimisation={handleRunOptimisation}
          onApproveAllocation={handleApproveAllocation}
        />
      )}

      {/* 8. LIVE MAP */}
      {activeTab === 'map' && (
        <ChennaiMap incidents={incidents} pendingReports={pendingMarkers} organisations={mapOrgs} heightClass="h-[560px]" />
      )}

      {/* 9. PREDICTIONS */}
      {activeTab === 'predictions' && (
        <DemandPredictionView predictions={predictions} horizon={horizon} onChangeHorizon={handleChangeHorizon} />
      )}

      {/* 10. DIGITAL TWIN */}
      {activeTab === 'twin' && <DigitalTwinView />}

      {/* 11. SHIPMENTS */}
      {activeTab === 'shipments' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-display text-base font-semibold text-[#1E3043]">End-to-End Relief Shipment Tracker</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[#697780]">
                <tr>
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Source NGO</th>
                  <th className="px-4 py-3 font-medium">Destination</th>
                  <th className="px-4 py-3 font-medium">Cargo</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Waybill</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shipments.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-mono-tabular font-semibold">{s.shipment_code}</td>
                    <td className="px-4 py-3">{s.organisation_name}</td>
                    <td className="px-4 py-3 text-[#697780]">{s.location_name}</td>
                    <td className="px-4 py-3 font-mono-tabular">
                      {s.allocated_quantity} {s.unit} {s.resource_name}
                    </td>
                    <td className="px-4 py-3">
                      <VerificationText status={s.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedShipment(s)}
                        className="inline-flex items-center gap-1 font-semibold text-[#268A87] hover:underline"
                      >
                        <QrCode className="h-3.5 w-3.5" />
                        QR Waybill
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 12. ORGANISATIONS */}
      {activeTab === 'organisations' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-display text-base font-semibold text-[#1E3043]">Registered NGOs, Hospitals & Relief Centres</h2>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[#697780]">
              <tr>
                <th className="px-4 py-3 font-medium">Organisation</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Address</th>
                <th className="px-4 py-3 font-medium text-right">Capacity / Stock</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {directory.organisations.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-3 font-medium text-[#1E3043]">{o.organisation_name}</td>
                  <td className="px-4 py-3 text-[#697780]">{o.organisation_type}</td>
                  <td className="px-4 py-3 text-[#697780]">{o.address}</td>
                  <td className="px-4 py-3 text-right font-mono-tabular">
                    {o.organisation_type === 'Hospital'
                      ? `${o.available_beds ?? 0}/${o.total_beds ?? 0} beds`
                      : `${(o.total_stock ?? 0).toLocaleString()} units`}
                  </td>
                  <td className="px-4 py-3">
                    <VerificationText status={o.verification_status || 'Verified'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 13. VOLUNTEERS */}
      {activeTab === 'volunteers' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-display text-base font-semibold text-[#1E3043]">Volunteer Network & Field Readiness</h2>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[#697780]">
              <tr>
                <th className="px-4 py-3 font-medium">Volunteer</th>
                <th className="px-4 py-3 font-medium">Skills</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Availability</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {directory.volunteers.map((v) => (
                <tr key={v.id}>
                  <td className="px-4 py-3 font-medium text-[#1E3043]">{v.full_name}</td>
                  <td className="px-4 py-3 text-[#697780]">{v.skills}</td>
                  <td className="px-4 py-3 text-[#697780]">{v.current_location}</td>
                  <td className="px-4 py-3">
                    <VerificationText status={v.availability === 'Available' ? 'Verified' : 'Preparing'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 14. ANALYTICS */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5">
            <div>
              <h2 className="font-display text-base font-semibold text-[#1E3043]">Operational Analytics & Reporting</h2>
              <p className="mt-1 text-xs text-[#697780]">
                Export verified audit & coordination metrics for post-incident review.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportAuditCSV}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1E3043] px-4 py-2 text-xs font-semibold text-white"
            >
              <Download className="h-3.5 w-3.5" />
              Export Audit CSV
            </button>
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="font-display text-sm font-semibold text-[#1E3043]">Stock vs. Demand Snapshot</h3>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stockVsDemandChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="Available" fill="#268A87" />
                    <Bar dataKey="Shortage" fill="#D9534F" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 text-xs">
              <h3 className="font-display text-sm font-semibold text-[#1E3043]">Key Coordination Indicators</h3>
              <div className="flex justify-between border-b border-slate-100 py-2">
                <span className="text-[#697780]">Optimiser Critical Fulfillment</span>
                <span className="font-mono-tabular font-semibold text-[#39856D]">
                  {optimisation?.metrics.optimiser.criticalFulfillmentPct ?? 100}%
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-2">
                <span className="text-[#697780]">Average Dispatch Distance</span>
                <span className="font-mono-tabular font-semibold">
                  {optimisation?.metrics.optimiser.avgDistanceKm ?? 0} km
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-2">
                <span className="text-[#697780]">Registered System Users</span>
                <span className="font-mono-tabular font-semibold">{directory.users.length}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-[#697780]">Total Audit Ledger Events</span>
                <span className="font-mono-tabular font-semibold">{auditLogs.length}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 15. AUDIT LOGS */}
      {activeTab === 'audit' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="font-display text-base font-semibold text-[#1E3043]">Immutable Security & Action Audit Trail</h2>
            <button
              type="button"
              onClick={handleExportAuditCSV}
              className="text-xs font-semibold text-[#268A87] hover:underline"
            >
              Download CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[#697780]">
                <tr>
                  <th className="px-4 py-3 font-medium">Timestamp</th>
                  <th className="px-4 py-3 font-medium">Actor</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Entity</th>
                  <th className="px-4 py-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-3 font-mono-tabular text-[11px] text-[#697780]">{l.created_at}</td>
                    <td className="px-4 py-3 font-medium text-[#1E3043]">
                      {l.actor_name} <span className="text-[#697780]">({l.actor_role})</span>
                    </td>
                    <td className="px-4 py-3 font-mono-tabular text-[#268A87]">{l.action}</td>
                    <td className="px-4 py-3 text-[#697780]">
                      {l.entity_type} {l.entity_id ? `#${l.entity_id}` : ''}
                    </td>
                    <td className="px-4 py-3 text-[#697780] max-w-xs truncate">
                      {l.decision_info || l.new_value || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 16. SETTINGS */}
      {activeTab === 'settings' && (
        <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-6 space-y-5">
          <div>
            <h2 className="font-display text-base font-semibold text-[#1E3043]">Command Centre Configuration</h2>
            <p className="mt-1 text-xs text-[#697780]">
              Active demonstration scenario, PWA installation, and user access management.
            </p>
          </div>
          <div className="flex items-center justify-between border-y border-slate-100 py-4 text-xs">
            <div>
              <p className="font-semibold text-[#1E3043]">Install CrisisWeave Desktop / Mobile App</p>
              <p className="text-[#697780]">Enables standalone window and offline Service Worker shell caching.</p>
            </div>
            <PWAInstallButton />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#1E3043]">User Account Governance ({directory.users.length} users)</p>
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {directory.users.map((u) => (
                <div key={u.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
                  <div>
                    <span className="font-medium text-[#1E3043]">{u.full_name}</span>
                    <span className="ml-2 text-[#697780]">({u.role})</span>
                  </div>
                  <span className={u.is_active ? 'text-[#39856D] font-medium' : 'text-[#D9534F]'}>
                    {u.is_active ? 'Active' : 'Suspended'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <ShipmentQRModal shipment={selectedShipment} onClose={() => setSelectedShipment(null)} />
    </DashboardShell>
  );
};
