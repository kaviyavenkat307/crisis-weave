import React, { useCallback, useEffect, useState } from 'react';
import { Activity, BedDouble, HeartPulse, Package } from 'lucide-react';
import { DashboardShell, type NavItem } from '../components/DashboardShell';
import { PriorityLabel, VerificationText } from '../components/StatusText';
import { apiRequest } from '../services/api';
import type { HospitalProfile, Organisation, PriorityLevel, Resource, ResourceRequest, Shipment } from '../types';

export const HospitalDashboard: React.FC<{ onGoHome: () => void }> = ({ onGoHome }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [org, setOrg] = useState<Organisation | null>(null);
  const [profile, setProfile] = useState<HospitalProfile | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [requests, setRequests] = useState<ResourceRequest[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);

  const [bedsForm, setBedsForm] = useState({ totalBeds: 180, availableBeds: 42, icuBedsAvailable: 8, emergencyWardStatus: 'Operational - Flood Trauma Triage' });
  const [reqForm, setReqForm] = useState({ resourceId: 4, quantityRequired: 50, priority: 'Critical' as PriorityLevel });
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [hospRes, resList, reqRes, shipRes] = await Promise.all([
        apiRequest<{ organisation: Organisation; hospitalProfile: HospitalProfile }>('/api/hospital/profile'),
        apiRequest<{ resources: Resource[] }>('/api/resources'),
        apiRequest<{ requests: ResourceRequest[] }>('/api/resource-requests'),
        apiRequest<{ shipments: Shipment[] }>('/api/shipments'),
      ]);
      setOrg(hospRes.organisation);
      setProfile(hospRes.hospitalProfile);
      if (hospRes.hospitalProfile) {
        setBedsForm({
          totalBeds: hospRes.hospitalProfile.total_beds,
          availableBeds: hospRes.hospitalProfile.available_beds,
          icuBedsAvailable: hospRes.hospitalProfile.icu_beds_available,
          emergencyWardStatus: hospRes.hospitalProfile.emergency_ward_status,
        });
      }
      setResources(resList.resources);
      setRequests(reqRes.requests.filter((r) => r.organisation_id === hospRes.organisation.id));
      setShipments(shipRes.shipments);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpdateBeds = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiRequest('/api/hospital/beds', {
      method: 'PUT',
      body: JSON.stringify(bedsForm),
    });
    setFeedback('Hospital bed capacity and emergency ward status updated.');
    await loadData();
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiRequest('/api/resource-requests', {
      method: 'POST',
      body: JSON.stringify(reqForm),
    });
    setFeedback('Emergency medical supply request submitted to Coordinator Allocation Engine.');
    await loadData();
  };

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Hospital Overview', icon: Activity },
    { id: 'beds', label: 'Bed Capacity', icon: BedDouble },
    { id: 'requests', label: 'Medical Requests', icon: HeartPulse, badge: requests.filter((r) => r.status === 'Open').length },
    { id: 'shipments', label: 'Incoming Allocations', icon: Package, badge: shipments.length },
  ];

  return (
    <DashboardShell
      title={org?.organisation_name || 'Hospital Medical Command'}
      navItems={navItems}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onGoHome={onGoHome}
    >
      {feedback && (
        <div className="mb-5 rounded-xl border border-[#39856D]/30 bg-[#39856D]/10 p-3.5 text-xs text-[#39856D]">
          {feedback}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-[#697780]">Available Beds</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#1E3043] tabular-nums">
            {profile?.available_beds ?? 0} / {profile?.total_beds ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-[#697780]">ICU Beds Available</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#D9534F] tabular-nums">
            {profile?.icu_beds_available ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-[#697780]">Pending Medical Requests</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#E49B43] tabular-nums">
            {requests.filter((r) => r.status === 'Open').length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-[#697780]">Incoming Shipments</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#268A87] tabular-nums">{shipments.length}</p>
        </div>
      </div>

      {(activeTab === 'overview' || activeTab === 'beds') && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 mb-6">
          <form onSubmit={handleUpdateBeds} className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 lg:col-span-6">
            <h2 className="font-display text-base font-semibold text-[#1E3043]">Update Bed & ICU Capacity</h2>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#1E3043]">Total Beds</label>
                <input
                  type="number"
                  value={bedsForm.totalBeds}
                  onChange={(e) => setBedsForm({ ...bedsForm, totalBeds: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1E3043]">Available Beds</label>
                <input
                  type="number"
                  value={bedsForm.availableBeds}
                  onChange={(e) => setBedsForm({ ...bedsForm, availableBeds: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1E3043]">ICU Available</label>
                <input
                  type="number"
                  value={bedsForm.icuBedsAvailable}
                  onChange={(e) => setBedsForm({ ...bedsForm, icuBedsAvailable: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono-tabular"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#1E3043]">Emergency Ward Status</label>
              <input
                type="text"
                value={bedsForm.emergencyWardStatus}
                onChange={(e) => setBedsForm({ ...bedsForm, emergencyWardStatus: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <button type="submit" className="rounded-lg bg-[#1E3043] px-4 py-2 text-xs font-semibold text-white">
              Save Capacity Update
            </button>
          </form>

          <form onSubmit={handleCreateRequest} className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 lg:col-span-6">
            <h2 className="font-display text-base font-semibold text-[#1E3043]">Submit Emergency Medical Request</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-[#1E3043]">Supply Item</label>
                <select
                  value={reqForm.resourceId}
                  onChange={(e) => setReqForm({ ...reqForm, resourceId: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  {resources.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.resource_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1E3043]">Quantity</label>
                <input
                  type="number"
                  min={1}
                  value={reqForm.quantityRequired}
                  onChange={(e) => setReqForm({ ...reqForm, quantityRequired: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1E3043]">Priority</label>
                <select
                  value={reqForm.priority}
                  onChange={(e) => setReqForm({ ...reqForm, priority: e.target.value as PriorityLevel })}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                </select>
              </div>
            </div>
            <button type="submit" className="rounded-lg bg-[#268A87] px-4 py-2 text-xs font-semibold text-white">
              Submit Medical Supply Request
            </button>
          </form>
        </div>
      )}

      {(activeTab === 'requests' || activeTab === 'overview') && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden mb-6">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-display text-sm font-semibold text-[#1E3043]">Medical Supply Request Ledger</h2>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[#697780]">
              <tr>
                <th className="px-4 py-3 font-medium">Request ID</th>
                <th className="px-4 py-3 font-medium">Resource</th>
                <th className="px-4 py-3 font-medium text-right">Required</th>
                <th className="px-4 py-3 font-medium text-right">Fulfilled</th>
                <th className="px-4 py-3 font-medium">Priority</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-mono-tabular">MED-{r.id}</td>
                  <td className="px-4 py-3 font-medium text-[#1E3043]">{r.resource_name}</td>
                  <td className="px-4 py-3 text-right font-mono-tabular">
                    {r.quantity_required} {r.unit}
                  </td>
                  <td className="px-4 py-3 text-right font-mono-tabular">{r.quantity_fulfilled}</td>
                  <td className="px-4 py-3">
                    <PriorityLabel priority={r.priority} />
                  </td>
                  <td className="px-4 py-3">
                    <VerificationText status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'shipments' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-display text-sm font-semibold text-[#1E3043]">Incoming Hospital Allocations</h2>
          </div>
          <div className="p-5 text-xs text-[#697780]">
            {shipments.length === 0 ? 'No active incoming shipments for this hospital.' : `${shipments.length} shipments tracked.`}
          </div>
        </div>
      )}
    </DashboardShell>
  );
};
