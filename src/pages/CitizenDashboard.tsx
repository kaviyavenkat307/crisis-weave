import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Cpu,
  FileText,
  MapPin,
  Package,
  RefreshCw,
  Send,
  Upload,
  User as UserIcon,
  WifiOff,
} from 'lucide-react';
import { DashboardShell, type NavItem } from '../components/DashboardShell';
import { PriorityLabel, VerificationText } from '../components/StatusText';
import { ShipmentQRModal } from '../components/ShipmentQRModal';
import { useAuth } from '../context/AuthContext';
import { useOnlineStatus } from '../hooks/usePWA';
import { apiRequest } from '../services/api';
import {
  deleteOfflineDraft,
  getAllOfflineDrafts,
  saveOfflineReportDraft,
  updateOfflineDraftStatus,
} from '../services/offlineDb';
import type { AIExtraction, EmergencyReport, OfflineReportDraft, Resource, Shipment } from '../types';

const CHENNAI_ZONES = [
  { label: 'Velachery 100ft Road (Simulated)', lat: 12.9784, lng: 80.2212 },
  { label: 'Mudichur Main Road (Simulated)', lat: 12.9125, lng: 80.0725 },
  { label: 'Saidapet Riverbank (Simulated)', lat: 13.0213, lng: 80.2231 },
  { label: 'Pallikaranai Marsh Edge (Simulated)', lat: 12.9420, lng: 80.2088 },
  { label: 'Tambaram East Camp (Simulated)', lat: 12.9249, lng: 80.1275 },
  { label: 'Kotturpuram Canal Road (Simulated)', lat: 13.0169, lng: 80.2421 },
];

export const CitizenDashboard: React.FC<{ onGoHome: () => void }> = ({ onGoHome }) => {
  const { user, socket } = useAuth();
  const realOnline = useOnlineStatus();
  const [simulatedOffline, setSimulatedOffline] = useState(false);
  const isOnline = realOnline && !simulatedOffline;

  const [activeTab, setActiveTab] = useState('overview');
  const [reports, setReports] = useState<EmergencyReport[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [offlineDrafts, setOfflineDrafts] = useState<OfflineReportDraft[]>([]);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [loading, setLoading] = useState(true);

  // Submission Form State
  const [disasterType, setDisasterType] = useState('Flood');
  const [locationName, setLocationName] = useState(CHENNAI_ZONES[0].label);
  const [latitude, setLatitude] = useState(CHENNAI_ZONES[0].lat);
  const [longitude, setLongitude] = useState(CHENNAI_ZONES[0].lng);
  const [description, setDescription] = useState('');
  const [affectedPeople, setAffectedPeople] = useState(20);
  const [vulnerablePresent, setVulnerablePresent] = useState(true);
  const [urgency, setUrgency] = useState('Immediate');
  const [waterQty, setWaterQty] = useState(200);
  const [foodQty, setFoodQty] = useState(100);
  const [medicalQty, setMedicalQty] = useState(0);
  const [evidenceFile, setEvidenceFile] = useState<{ fileName: string; fileType: string; dataUrl: string } | null>(null);

  const [aiPreview, setAiPreview] = useState<AIExtraction | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const drafts = await getAllOfflineDrafts();
      setOfflineDrafts(drafts);

      if (isOnline) {
        const [repRes, shipRes, resRes] = await Promise.all([
          apiRequest<{ reports: EmergencyReport[] }>('/api/reports'),
          apiRequest<{ shipments: Shipment[] }>('/api/shipments'),
          apiRequest<{ resources: Resource[] }>('/api/resources'),
        ]);
        setReports(repRes.reports);
        setShipments(shipRes.shipments);
        setResources(resRes.resources);
      }
    } catch {
      // keep cached/offline state
    } finally {
      setLoading(false);
    }
  }, [isOnline]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!socket) return;
    const onUpdate = () => loadData();
    socket.on('report:verified', onUpdate);
    socket.on('shipment:updated', onUpdate);
    return () => {
      socket.off('report:verified', onUpdate);
      socket.off('shipment:updated', onUpdate);
    };
  }, [socket, loadData]);

  const syncOfflineDrafts = useCallback(async () => {
    if (!isOnline) return;
    const drafts = await getAllOfflineDrafts();
    const pending = drafts.filter((d) => d.syncStatus !== 'Synced');
    if (pending.length === 0) return;

    for (const draft of pending) {
      await updateOfflineDraftStatus(draft.clientReportId, { syncStatus: 'Syncing' });
      setOfflineDrafts(await getAllOfflineDrafts());
      try {
        const res = await apiRequest<{ report: EmergencyReport }>('/api/reports', {
          method: 'POST',
          body: JSON.stringify({
            disasterType: draft.disasterType,
            locationName: draft.locationName,
            description: draft.description,
            latitude: draft.latitude,
            longitude: draft.longitude,
            affectedPeople: draft.affectedPeople,
            vulnerablePresent: draft.vulnerablePresent,
            urgency: draft.urgency,
            requestedResources: draft.requestedResources,
            idempotencyKey: draft.idempotencyKey,
            evidence: draft.evidenceDataUrl
              ? {
                  fileName: draft.evidenceName || 'offline_evidence.jpg',
                  fileType: draft.evidenceType || 'image/jpeg',
                  dataUrl: draft.evidenceDataUrl,
                }
              : null,
          }),
        });
        await updateOfflineDraftStatus(draft.clientReportId, {
          syncStatus: 'Synced',
          syncedReportId: res.report.id,
          errorMessage: undefined,
        });
      } catch (err) {
        await updateOfflineDraftStatus(draft.clientReportId, {
          syncStatus: 'Sync Failed',
          errorMessage: err instanceof Error ? err.message : 'Sync failed',
        });
      }
    }
    setOfflineDrafts(await getAllOfflineDrafts());
    await loadData();
  }, [isOnline, loadData]);

  // Auto-sync when connectivity returns
  useEffect(() => {
    if (isOnline) {
      syncOfflineDrafts();
    }
  }, [isOnline, syncOfflineDrafts]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setFeedback({ type: 'error', message: 'File size must be under 5 MB.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setEvidenceFile({
        fileName: file.name,
        fileType: file.type || 'image/jpeg',
        dataUrl: String(reader.result),
      });
    };
    reader.readAsDataURL(file);
  };

  const handleRunAIPreview = async () => {
    if (!description.trim()) {
      setFeedback({ type: 'error', message: 'Enter an emergency description first.' });
      return;
    }
    if (!isOnline) {
      setFeedback({ type: 'info', message: 'AI Pre-Analysis requires connectivity. Report will be analyzed automatically upon sync.' });
      return;
    }
    setAiBusy(true);
    setFeedback(null);
    try {
      const analysis = await apiRequest<AIExtraction>('/api/ai/classify', {
        method: 'POST',
        body: JSON.stringify({
          description,
          disasterType,
          locationName,
          affectedPeople,
          vulnerablePresent,
          urgency,
        }),
      });
      setAiPreview(analysis);
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'AI analysis failed.' });
    } finally {
      setAiBusy(false);
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setFeedback({ type: 'error', message: 'Please describe the emergency situation.' });
      return;
    }

    const requestedResources: Array<{ resourceName: string; quantity: number }> = [];
    if (waterQty > 0) requestedResources.push({ resourceName: 'Drinking Water', quantity: waterQty });
    if (foodQty > 0) requestedResources.push({ resourceName: 'Food Packets', quantity: foodQty });
    if (medicalQty > 0) requestedResources.push({ resourceName: 'Medical Kits', quantity: medicalQty });

    const clientReportId = `CW-OFF-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const idempotencyKey = `idem-${user?.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (!isOnline) {
      const draft: OfflineReportDraft = {
        clientReportId,
        idempotencyKey,
        disasterType,
        locationName,
        description,
        latitude,
        longitude,
        affectedPeople,
        vulnerablePresent,
        urgency,
        requestedResources,
        evidenceName: evidenceFile?.fileName,
        evidenceType: evidenceFile?.fileType,
        evidenceDataUrl: evidenceFile?.dataUrl,
        syncStatus: 'Saved Offline',
        createdAt: new Date().toISOString(),
      };
      await saveOfflineReportDraft(draft);
      setOfflineDrafts(await getAllOfflineDrafts());
      setDescription('');
      setEvidenceFile(null);
      setAiPreview(null);
      setFeedback({
        type: 'info',
        message: `Saved offline (${clientReportId}). Will automatically sync with idempotency key when online.`,
      });
      setActiveTab('offline');
      return;
    }

    setSubmitBusy(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{ report: EmergencyReport; aiAnalysis: AIExtraction }>('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          disasterType,
          locationName,
          description,
          latitude,
          longitude,
          affectedPeople,
          vulnerablePresent,
          urgency,
          requestedResources,
          idempotencyKey,
          evidence: evidenceFile,
        }),
      });
      setFeedback({
        type: 'success',
        message: `Report #${res.report.id} submitted (${res.aiAnalysis.priority} priority · ${res.aiAnalysis.modelUsed}).`,
      });
      setDescription('');
      setEvidenceFile(null);
      setAiPreview(null);
      await loadData();
      setActiveTab('reports');
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Submission failed.' });
    } finally {
      setSubmitBusy(false);
    }
  };

  const pendingOfflineCount = offlineDrafts.filter((d) => d.syncStatus !== 'Synced').length;

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Overview', icon: AlertTriangle },
    { id: 'submit', label: 'Submit Emergency Report', icon: Send },
    { id: 'reports', label: 'My Reports & Status', icon: FileText, badge: reports.length },
    { id: 'tracking', label: 'Relief Tracking', icon: Package, badge: shipments.length },
    { id: 'offline', label: 'Offline Sync Queue', icon: WifiOff, badge: pendingOfflineCount },
    { id: 'profile', label: 'Profile', icon: UserIcon },
  ];

  return (
    <DashboardShell
      title="Citizen Emergency Portal"
      navItems={navItems}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      simulatedOffline={simulatedOffline}
      onToggleSimulatedOffline={() => setSimulatedOffline(!simulatedOffline)}
      onGoHome={onGoHome}
    >
      {feedback && (
        <div
          className={`mb-5 rounded-xl border p-3.5 text-xs ${
            feedback.type === 'error'
              ? 'border-[#D9534F]/30 bg-[#D9534F]/10 text-[#D9534F]'
              : feedback.type === 'success'
              ? 'border-[#39856D]/30 bg-[#39856D]/10 text-[#39856D]'
              : 'border-[#268A87]/30 bg-[#268A87]/10 text-[#1E3043]'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5">
            <div>
              <h2 className="font-display text-lg font-semibold text-[#1E3043]">
                Report an Emergency or Track Relief Delivery
              </h2>
              <p className="mt-1 text-xs text-[#697780]">
                Submissions are analyzed by AI for urgency and checked by TrustShield before coordinator dispatch.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('submit')}
              className="inline-flex items-center gap-2 rounded-lg bg-[#D9534F] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#c54743] whitespace-nowrap"
            >
              <Send className="h-3.5 w-3.5" />
              Submit Emergency Report
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-[#697780]">My Reports</p>
              <p className="mt-1 font-display text-2xl font-bold text-[#1E3043] tabular-nums">{reports.length}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-[#697780]">Verified Reports</p>
              <p className="mt-1 font-display text-2xl font-bold text-[#39856D] tabular-nums">
                {reports.filter((r) => r.verification_status === 'Verified').length}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-[#697780]">Active Shipments</p>
              <p className="mt-1 font-display text-2xl font-bold text-[#268A87] tabular-nums">
                {shipments.filter((s) => s.status !== 'Delivered').length}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-[#697780]">Offline Pending Sync</p>
              <p className="mt-1 font-display text-2xl font-bold text-[#E49B43] tabular-nums">{pendingOfflineCount}</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="font-display text-sm font-semibold text-[#1E3043]">Recent Reports</h3>
            {loading ? (
              <p className="py-6 text-xs text-[#697780]">Loading reports...</p>
            ) : reports.length === 0 ? (
              <p className="py-6 text-xs text-[#697780]">No reports submitted yet.</p>
            ) : (
              <div className="mt-3 divide-y divide-slate-100">
                {reports.slice(0, 5).map((r) => (
                  <div key={r.id} className="flex flex-col justify-between gap-2 py-3 sm:flex-row sm:items-center">
                    <div>
                      <p className="text-sm font-medium text-[#1E3043]">
                        #{r.id} · {r.location_name}
                      </p>
                      <p className="mt-0.5 text-xs text-[#697780] line-clamp-1">{r.description}</p>
                    </div>
                    <div className="flex items-center gap-4 text-xs shrink-0">
                      <PriorityLabel priority={r.ai_priority} />
                      <span className="text-slate-300">·</span>
                      <VerificationText status={r.verification_status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'submit' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form onSubmit={handleSubmitReport} className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 lg:col-span-7">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="font-display text-base font-semibold text-[#1E3043]">New Emergency Report</h2>
                <p className="text-xs text-[#697780]">
                  {isOnline ? 'Connected — Live AI triage & TrustShield active' : 'Offline — Will save safely to IndexedDB'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[#1E3043]">Disaster Category</label>
                <select
                  value={disasterType}
                  onChange={(e) => setDisasterType(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option>Flood</option>
                  <option>Cyclone</option>
                  <option>Landslide</option>
                  <option>Medical emergency</option>
                  <option>Food shortage</option>
                  <option>Drinking water shortage</option>
                  <option>Shelter requirement</option>
                  <option>Rescue requirement</option>
                  <option>Other emergency</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1E3043]">Chennai Zone Preset</label>
                <select
                  value={locationName}
                  onChange={(e) => {
                    const zone = CHENNAI_ZONES.find((z) => z.label === e.target.value);
                    setLocationName(e.target.value);
                    if (zone) {
                      setLatitude(zone.lat);
                      setLongitude(zone.lng);
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  {CHENNAI_ZONES.map((z) => (
                    <option key={z.label} value={z.label}>
                      {z.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-[#1E3043]">Affected People</label>
                <input
                  type="number"
                  min={1}
                  value={affectedPeople}
                  onChange={(e) => setAffectedPeople(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1E3043]">Latitude</label>
                <input
                  type="number"
                  step="0.0001"
                  value={latitude}
                  onChange={(e) => setLatitude(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1E3043]">Longitude</label>
                <input
                  type="number"
                  step="0.0001"
                  value={longitude}
                  onChange={(e) => setLongitude(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono-tabular"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1E3043]">Situation Description</label>
              <textarea
                rows={4}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe trapped residents, water depth, medical needs, and landmark..."
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-[#1E3043]">Drinking Water (litres)</label>
                <input
                  type="number"
                  min={0}
                  value={waterQty}
                  onChange={(e) => setWaterQty(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1E3043]">Food Packets</label>
                <input
                  type="number"
                  min={0}
                  value={foodQty}
                  onChange={(e) => setFoodQty(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1E3043]">Medical Kits</label>
                <input
                  type="number"
                  min={0}
                  value={medicalQty}
                  onChange={(e) => setMedicalQty(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono-tabular"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-[#1E3043]">
                <input
                  type="checkbox"
                  checked={vulnerablePresent}
                  onChange={(e) => setVulnerablePresent(e.target.checked)}
                  className="rounded border-slate-300 text-[#268A87]"
                />
                Elderly, infants, or medical patients present
              </label>

              <select
                aria-label="Urgency"
                value={urgency}
                onChange={(e) => setUrgency(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
              >
                <option value="Immediate">Immediate / Life-Threatening</option>
                <option value="High">High Urgency</option>
                <option value="Medium">Moderate</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1E3043]">Supporting Photograph (TrustShield SHA-256 Verified)</label>
              <label className="mt-1 flex cursor-pointer items-center justify-between rounded-lg border border-dashed border-slate-300 bg-[#F5F7F7] px-4 py-3 text-xs text-[#697780] hover:border-[#268A87]">
                <span className="flex items-center gap-2">
                  <Upload className="h-4 w-4 text-[#268A87]" />
                  {evidenceFile ? evidenceFile.fileName : 'Attach JPG, PNG, WebP, or PDF (max 5 MB)'}
                </span>
                <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={handleFileChange} className="hidden" />
              </label>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={handleRunAIPreview}
                disabled={aiBusy}
                className="inline-flex items-center gap-2 rounded-lg border border-[#268A87] bg-white px-4 py-2.5 text-xs font-semibold text-[#268A87] hover:bg-[#268A87]/5"
              >
                <Cpu className="h-3.5 w-3.5" />
                {aiBusy ? 'Analyzing...' : 'Run AI Pre-Analysis'}
              </button>
              <button
                type="submit"
                disabled={submitBusy}
                className="inline-flex items-center gap-2 rounded-lg bg-[#1E3043] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#162433] disabled:opacity-60"
              >
                <Send className="h-3.5 w-3.5" />
                {submitBusy ? 'Submitting...' : isOnline ? 'Submit Emergency Report' : 'Save Offline to Queue'}
              </button>
            </div>
          </form>

          {/* AI Pre-Analysis Preview Panel */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5">
            <h3 className="font-display text-sm font-semibold text-[#1E3043]">AI Crisis Intelligence Preview</h3>
            <p className="mt-1 text-xs text-[#697780]">
              Shows how CrisisWeave classifies and explains urgency before coordinator review.
            </p>

            {aiPreview ? (
              <div className="mt-5 space-y-4 text-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-[#697780]">Suggested Category</span>
                  <span className="font-semibold text-[#1E3043]">{aiPreview.category}</span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-[#697780]">AI Priority Score</span>
                  <span className="font-mono-tabular font-semibold text-[#1E3043]">
                    {aiPreview.priority} ({aiPreview.priorityScore}/100)
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-[#1E3043]">Explainable Reasoning</p>
                  <p className="mt-1 rounded-lg bg-[#F5F7F7] p-3 text-[#1E3043] leading-relaxed">
                    {aiPreview.explanation}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-[#1E3043]">Extracted Indicators</p>
                  <p className="mt-1 text-[#697780]">{aiPreview.urgencyIndicators.join(' · ')}</p>
                </div>
                <div>
                  <p className="font-semibold text-[#1E3043]">Engine</p>
                  <p className="mt-1 text-[#268A87]">{aiPreview.modelUsed}</p>
                </div>
              </div>
            ) : (
              <div className="mt-8 rounded-xl border border-slate-100 bg-[#F5F7F7] p-5 text-center text-xs text-[#697780]">
                Fill in the description and click <strong>Run AI Pre-Analysis</strong> to inspect extracted entities,
                keywords, and explainable priority scoring.
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-display text-base font-semibold text-[#1E3043]">My Submitted Emergency Reports</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {reports.length === 0 ? (
              <p className="p-6 text-xs text-[#697780]">No reports found.</p>
            ) : (
              reports.map((r) => (
                <div key={r.id} className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-[#697780]">
                      <span className="font-mono-tabular font-semibold text-[#1E3043]">Report #{r.id}</span>
                      <span>·</span>
                      <span>{r.ai_category}</span>
                      <span>·</span>
                      <span>{r.affected_people} people</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <PriorityLabel priority={r.ai_priority} />
                      <span className="text-slate-300">/</span>
                      <VerificationText status={r.verification_status} />
                    </div>
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-[#1E3043]">
                    <MapPin className="h-3.5 w-3.5 text-[#268A87]" />
                    {r.location_name}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-[#697780]">{r.description}</p>
                  <p className="mt-2 rounded-lg bg-[#F5F7F7] px-3 py-2 text-xs text-[#1E3043]">
                    <strong>AI Reasoning:</strong> {r.ai_explanation}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'tracking' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-display text-base font-semibold text-[#1E3043]">Relief Allocation & Delivery Progress</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[#697780]">
                <tr>
                  <th className="px-4 py-3 font-medium">Shipment Code</th>
                  <th className="px-4 py-3 font-medium">Incident / Location</th>
                  <th className="px-4 py-3 font-medium">Resource</th>
                  <th className="px-4 py-3 font-medium text-right">Qty</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Waybill</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shipments.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono-tabular font-semibold text-[#1E3043]">{s.shipment_code}</td>
                    <td className="px-4 py-3 text-[#1E3043]">{s.location_name}</td>
                    <td className="px-4 py-3 text-[#697780]">{s.resource_name}</td>
                    <td className="px-4 py-3 text-right font-mono-tabular">
                      {s.allocated_quantity} {s.unit}
                    </td>
                    <td className="px-4 py-3">
                      <VerificationText status={s.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedShipment(s)}
                        className="text-xs font-semibold text-[#268A87] hover:underline"
                      >
                        View QR
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'offline' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5">
            <div>
              <h2 className="font-display text-base font-semibold text-[#1E3043]">
                Offline IndexedDB Emergency Queue
              </h2>
              <p className="mt-1 text-xs text-[#697780]">
                Reports saved without internet receive unique idempotency keys and sync automatically once connected.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSimulatedOffline(!simulatedOffline)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-[#1E3043] hover:bg-slate-50"
              >
                {simulatedOffline ? 'Restore Connectivity' : 'Simulate Offline Mode'}
              </button>
              <button
                type="button"
                disabled={!isOnline || pendingOfflineCount === 0}
                onClick={syncOfflineDrafts}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#268A87] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Sync Pending ({pendingOfflineCount})
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
            {offlineDrafts.length === 0 ? (
              <p className="p-6 text-center text-xs text-[#697780]">
                No offline drafts queued. Toggle <strong>Simulate Offline Mode</strong> and submit a report to demonstrate PWA persistence.
              </p>
            ) : (
              offlineDrafts.map((d) => (
                <div key={d.clientReportId} className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
                  <div>
                    <p className="font-mono-tabular text-xs font-semibold text-[#1E3043]">
                      {d.clientReportId} · {d.locationName}
                    </p>
                    <p className="mt-1 text-xs text-[#697780]">{d.description}</p>
                    <p className="mt-1 font-mono-tabular text-[11px] text-[#697780]">
                      Idempotency Key: {d.idempotencyKey}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <VerificationText status={d.syncStatus} />
                    {d.syncStatus === 'Synced' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteOfflineDraft(d.clientReportId);
                          setOfflineDrafts(await getAllOfflineDrafts());
                        }}
                        className="text-xs text-[#697780] hover:text-[#1E3043]"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="max-w-xl rounded-xl border border-slate-200 bg-white p-6 space-y-3 text-sm">
          <h2 className="font-display text-base font-semibold text-[#1E3043]">Citizen Profile</h2>
          <div className="flex justify-between border-b border-slate-100 py-2">
            <span className="text-[#697780]">Full Name</span>
            <span className="font-medium">{user?.full_name}</span>
          </div>
          <div className="flex justify-between border-b border-slate-100 py-2">
            <span className="text-[#697780]">Email</span>
            <span className="font-medium">{user?.email}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-[#697780]">Phone</span>
            <span className="font-mono-tabular font-medium">{user?.phone}</span>
          </div>
          <p className="text-xs text-[#697780] pt-2">
            Available catalog resources: {resources.map((r) => r.resource_name).join(', ')}.
          </p>
        </div>
      )}

      <ShipmentQRModal shipment={selectedShipment} onClose={() => setSelectedShipment(null)} />
    </DashboardShell>
  );
};
