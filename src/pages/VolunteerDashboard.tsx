import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ClipboardCheck, PackageCheck, QrCode, UserCheck } from 'lucide-react';
import { DashboardShell, type NavItem } from '../components/DashboardShell';
import { VerificationText } from '../components/StatusText';
import { ShipmentQRModal } from '../components/ShipmentQRModal';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../services/api';
import type { Shipment, VolunteerAssignment, VolunteerProfile } from '../types';

export const VolunteerDashboard: React.FC<{ onGoHome: () => void }> = ({ onGoHome }) => {
  const { socket } = useAuth();
  const [activeTab, setActiveTab] = useState('tasks');
  const [tasks, setTasks] = useState<VolunteerAssignment[]>([]);
  const [profile, setProfile] = useState<VolunteerProfile | null>(null);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [confirmingShip, setConfirmingShip] = useState<Shipment | null>(null);
  const [receivedQty, setReceivedQty] = useState<number>(0);
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [taskRes, shipRes] = await Promise.all([
        apiRequest<{ tasks: VolunteerAssignment[]; volunteerProfile: VolunteerProfile | null }>('/api/volunteer/tasks'),
        apiRequest<{ shipments: Shipment[] }>('/api/shipments'),
      ]);
      setTasks(taskRes.tasks);
      setProfile(taskRes.volunteerProfile);
      setShipments(shipRes.shipments);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!socket) return;
    const onUpdate = () => loadData();
    socket.on('shipment:updated', onUpdate);
    socket.on('allocation:approved', onUpdate);
    return () => {
      socket.off('shipment:updated', onUpdate);
      socket.off('allocation:approved', onUpdate);
    };
  }, [socket, loadData]);

  const handleTaskAction = async (taskId: number, action: 'accept' | 'decline' | 'start' | 'complete') => {
    await apiRequest(`/api/volunteer/tasks/${taskId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
    await loadData();
  };

  const handleUpdateAvailability = async (availability: 'Available' | 'On Mission' | 'Offline') => {
    await apiRequest('/api/volunteer/availability', {
      method: 'PUT',
      body: JSON.stringify({ availability }),
    });
    setFeedback(`Availability updated to "${availability}".`);
    await loadData();
  };

  const handleConfirmDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmingShip) return;
    await apiRequest(`/api/shipments/${confirmingShip.id}/confirm-delivery`, {
      method: 'POST',
      body: JSON.stringify({ receivedQuantity: receivedQty, notes: deliveryNotes }),
    });
    setFeedback(`Delivery confirmed for ${confirmingShip.shipment_code}. Inventory and incident fulfillment updated.`);
    setConfirmingShip(null);
    setDeliveryNotes('');
    await loadData();
  };

  const assignedTasks = tasks.filter((t) => t.status === 'Assigned' || t.status === 'In Progress');
  const availableTasks = tasks.filter((t) => t.status === 'Available');
  const completedTasks = tasks.filter((t) => t.status === 'Completed');

  const navItems: NavItem[] = [
    { id: 'tasks', label: 'Assigned & Available Tasks', icon: ClipboardCheck, badge: assignedTasks.length },
    { id: 'deliveries', label: 'Shipment Handovers', icon: PackageCheck, badge: shipments.filter((s) => s.status !== 'Delivered').length },
    { id: 'history', label: 'Completed History', icon: CheckCircle2 },
    { id: 'profile', label: 'Availability & Skills', icon: UserCheck },
  ];

  return (
    <DashboardShell
      title="Volunteer Field Coordination"
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
          <p className="text-xs text-[#697780]">Assigned Tasks</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#1E3043] tabular-nums">{assignedTasks.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-[#697780]">Open Field Tasks</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#268A87] tabular-nums">{availableTasks.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-[#697780]">Completed Missions</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#39856D] tabular-nums">{completedTasks.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-[#697780]">Availability Status</p>
          <p className="mt-1 font-display text-lg font-bold text-[#1E3043]">{profile?.availability || 'Available'}</p>
        </div>
      </div>

      {activeTab === 'tasks' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-display text-sm font-semibold text-[#1E3043]">My Active Assignments</h2>
            <div className="mt-3 divide-y divide-slate-100">
              {assignedTasks.length === 0 ? (
                <p className="py-6 text-xs text-[#697780]">No active assignments.</p>
              ) : (
                assignedTasks.map((t) => (
                  <div key={t.id} className="py-3.5 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#1E3043]">{t.incident_name}</span>
                      <VerificationText status={t.status} />
                    </div>
                    <p className="text-xs text-[#697780]">{t.task_description}</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {t.status === 'Assigned' && (
                        <button
                          type="button"
                          onClick={() => handleTaskAction(t.id, 'start')}
                          className="rounded bg-[#268A87] px-3 py-1 text-xs font-semibold text-white"
                        >
                          Start Mission
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleTaskAction(t.id, 'complete')}
                        className="rounded bg-[#39856D] px-3 py-1 text-xs font-semibold text-white"
                      >
                        Mark Complete
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTaskAction(t.id, 'decline')}
                        className="rounded border border-slate-200 px-3 py-1 text-xs text-[#697780]"
                      >
                        Release Task
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-display text-sm font-semibold text-[#1E3043]">Available Field Missions</h2>
            <div className="mt-3 divide-y divide-slate-100">
              {availableTasks.length === 0 ? (
                <p className="py-6 text-xs text-[#697780]">All field missions are currently assigned.</p>
              ) : (
                availableTasks.map((t) => (
                  <div key={t.id} className="py-3.5 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#1E3043]">{t.incident_name}</span>
                      <span className="text-[#697780]">{t.location_name}</span>
                    </div>
                    <p className="text-xs text-[#697780]">{t.task_description}</p>
                    <button
                      type="button"
                      onClick={() => handleTaskAction(t.id, 'accept')}
                      className="rounded bg-[#1E3043] px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Accept Assignment
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'deliveries' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-display text-base font-semibold text-[#1E3043]">Relief Shipment Handover & Confirmation</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[#697780]">
                <tr>
                  <th className="px-4 py-3 font-medium">Shipment Code</th>
                  <th className="px-4 py-3 font-medium">Cargo</th>
                  <th className="px-4 py-3 font-medium">Destination</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shipments.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-mono-tabular font-semibold text-[#1E3043]">{s.shipment_code}</td>
                    <td className="px-4 py-3 font-mono-tabular">
                      {s.allocated_quantity} {s.unit} {s.resource_name}
                    </td>
                    <td className="px-4 py-3 text-[#697780]">{s.location_name}</td>
                    <td className="px-4 py-3">
                      <VerificationText status={s.status} />
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      {s.status !== 'Delivered' && (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmingShip(s);
                            setReceivedQty(s.allocated_quantity || 0);
                          }}
                          className="rounded bg-[#39856D] px-2.5 py-1 text-[11px] font-semibold text-white"
                        >
                          Confirm Delivery
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedShipment(s)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#268A87] hover:underline"
                      >
                        <QrCode className="h-3.5 w-3.5" />
                        QR
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 divide-y divide-slate-100">
          <h2 className="font-display text-sm font-semibold text-[#1E3043] pb-3">Completed Field Tasks</h2>
          {completedTasks.length === 0 ? (
            <p className="py-6 text-xs text-[#697780]">No completed tasks recorded yet.</p>
          ) : (
            completedTasks.map((t) => (
              <div key={t.id} className="py-3 text-xs flex items-center justify-between">
                <div>
                  <p className="font-semibold text-[#1E3043]">{t.incident_name}</p>
                  <p className="text-[#697780]">{t.task_description}</p>
                </div>
                <VerificationText status={t.status} />
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="max-w-xl rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <h2 className="font-display text-base font-semibold text-[#1E3043]">Availability & Field Skills</h2>
          <div className="flex flex-wrap gap-2">
            {(['Available', 'On Mission', 'Offline'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => handleUpdateAvailability(status)}
                className={`rounded-lg px-4 py-2 text-xs font-semibold border ${
                  profile?.availability === status
                    ? 'bg-[#1E3043] text-white border-[#1E3043]'
                    : 'bg-white text-[#697780] border-slate-200 hover:text-[#1E3043]'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
          <div className="text-xs space-y-2 pt-2 border-t border-slate-100">
            <p>
              <strong>Skills:</strong> {profile?.skills}
            </p>
            <p>
              <strong>Base Sector:</strong> {profile?.current_location}
            </p>
            <p>
              <strong>Experience:</strong> {profile?.experience}
            </p>
          </div>
        </div>
      )}

      {/* Delivery Confirmation Modal */}
      {confirmingShip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={handleConfirmDelivery} className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl space-y-4">
            <h3 className="font-display text-base font-semibold text-[#1E3043]">
              Confirm Handover — {confirmingShip.shipment_code}
            </h3>
            <p className="text-xs text-[#697780]">
              Allocated: {confirmingShip.allocated_quantity} {confirmingShip.unit} {confirmingShip.resource_name}
            </p>
            <div>
              <label className="block text-xs font-medium text-[#1E3043]">Received Quantity</label>
              <input
                type="number"
                min={0}
                max={confirmingShip.allocated_quantity}
                value={receivedQty}
                onChange={(e) => setReceivedQty(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#1E3043]">Handover Notes</label>
              <textarea
                rows={3}
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                placeholder="Received by camp coordinator / signed off..."
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmingShip(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-[#697780]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#39856D] px-4 py-2 text-xs font-semibold text-white"
              >
                Record Delivery
              </button>
            </div>
          </form>
        </div>
      )}

      <ShipmentQRModal shipment={selectedShipment} onClose={() => setSelectedShipment(null)} />
    </DashboardShell>
  );
};
