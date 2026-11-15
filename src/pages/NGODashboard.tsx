import React, { useCallback, useEffect, useState } from 'react';
import { Boxes, ClipboardList, PackageCheck, Plus, QrCode, Truck } from 'lucide-react';
import { DashboardShell, type NavItem } from '../components/DashboardShell';
import { PriorityLabel, VerificationText } from '../components/StatusText';
import { ShipmentQRModal } from '../components/ShipmentQRModal';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../services/api';
import type { Allocation, InventoryItem, Resource, ResourceRequest, Shipment, ShipmentStatus } from '../types';

export const NGODashboard: React.FC<{ onGoHome: () => void }> = ({ onGoHome }) => {
  const { user, socket } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [requests, setRequests] = useState<ResourceRequest[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);

  const [selectedResId, setSelectedResId] = useState<number>(1);
  const [newQty, setNewQty] = useState<number>(250);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [invRes, resList, allocRes, reqRes, shipRes] = await Promise.all([
        apiRequest<{ inventory: InventoryItem[] }>('/api/inventory'),
        apiRequest<{ resources: Resource[] }>('/api/resources'),
        apiRequest<{ allocations: Allocation[] }>('/api/allocations'),
        apiRequest<{ requests: ResourceRequest[] }>('/api/resource-requests'),
        apiRequest<{ shipments: Shipment[] }>('/api/shipments'),
      ]);
      setInventory(invRes.inventory);
      setResources(resList.resources);
      setAllocations(allocRes.allocations);
      setRequests(reqRes.requests);
      setShipments(shipRes.shipments);
    } catch {
      // ignore transient errors
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!socket) return;
    const onUpdate = () => loadData();
    socket.on('allocation:approved', onUpdate);
    socket.on('shipment:updated', onUpdate);
    return () => {
      socket.off('allocation:approved', onUpdate);
      socket.off('shipment:updated', onUpdate);
    };
  }, [socket, loadData]);

  const handleSaveStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await apiRequest<{ anomaly?: { flagged: boolean; description?: string } }>('/api/inventory', {
        method: 'POST',
        body: JSON.stringify({ resourceId: selectedResId, quantityAvailable: newQty }),
      });
      setFeedback(
        res.anomaly?.flagged
          ? `Inventory updated. TrustShield note: ${res.anomaly.description}`
          : 'Inventory quantity updated successfully.'
      );
      await loadData();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Failed to update stock.');
    }
  };

  const handleUpdateShipment = async (shipId: number, status: ShipmentStatus) => {
    await apiRequest(`/api/shipments/${shipId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    await loadData();
  };

  const totalStock = inventory.reduce((s, i) => s + i.quantity_available, 0);
  const lowStockItems = inventory.filter((i) => i.quantity_available < 40);
  const activeShipments = shipments.filter((s) => !['Delivered', 'Cancelled'].includes(s.status));
  const completedShipments = shipments.filter((s) => s.status === 'Delivered');

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Overview', icon: Boxes },
    { id: 'inventory', label: 'Inventory Management', icon: Plus, badge: lowStockItems.length },
    { id: 'allocations', label: 'Allocations & Requests', icon: ClipboardList, badge: allocations.length },
    { id: 'shipments', label: 'Shipments & Dispatch', icon: Truck, badge: activeShipments.length },
    { id: 'history', label: 'Delivery History', icon: PackageCheck },
  ];

  return (
    <DashboardShell
      title={user?.organisation?.organisation_name || 'NGO Relief Operations'}
      navItems={navItems}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onGoHome={onGoHome}
    >
      {feedback && (
        <div className="mb-5 rounded-xl border border-[#268A87]/30 bg-[#268A87]/10 p-3.5 text-xs text-[#1E3043]">
          {feedback}
        </div>
      )}

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-[#697780]">Total Available Stock</p>
              <p className="mt-1 font-display text-2xl font-bold text-[#1E3043] tabular-nums">
                {totalStock.toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-[#697780]">Open Incident Requests</p>
              <p className="mt-1 font-display text-2xl font-bold text-[#1E3043] tabular-nums">
                {requests.filter((r) => r.status === 'Open').length}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-[#697780]">Active Shipments</p>
              <p className="mt-1 font-display text-2xl font-bold text-[#268A87] tabular-nums">
                {activeShipments.length}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-[#697780]">Completed Deliveries</p>
              <p className="mt-1 font-display text-2xl font-bold text-[#39856D] tabular-nums">
                {completedShipments.length}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-[#697780]">Shortage Alerts</p>
              <p className="mt-1 font-display text-2xl font-bold text-[#D9534F] tabular-nums">
                {lowStockItems.length}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="font-display text-sm font-semibold text-[#1E3043]">Current Stock Pool</h3>
              <div className="mt-3 divide-y divide-slate-100">
                {inventory.map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-2.5 text-xs">
                    <span className="font-medium text-[#1E3043]">{item.resource_name}</span>
                    <span className="font-mono-tabular font-semibold text-[#1E3043]">
                      {item.quantity_available.toLocaleString()} {item.unit}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="font-display text-sm font-semibold text-[#1E3043]">Active Dispatch Queue</h3>
              <div className="mt-3 divide-y divide-slate-100">
                {activeShipments.length === 0 ? (
                  <p className="py-6 text-xs text-[#697780]">No active shipments waiting for dispatch.</p>
                ) : (
                  activeShipments.map((s) => (
                    <div key={s.id} className="flex items-center justify-between py-2.5 text-xs">
                      <div>
                        <p className="font-mono-tabular font-semibold text-[#1E3043]">{s.shipment_code}</p>
                        <p className="text-[#697780]">
                          {s.allocated_quantity} {s.unit} {s.resource_name} → {s.location_name}
                        </p>
                      </div>
                      <VerificationText status={s.status} />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'inventory' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form onSubmit={handleSaveStock} className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 lg:col-span-4 h-fit">
            <h2 className="font-display text-base font-semibold text-[#1E3043]">Add / Update Stock</h2>
            <div>
              <label className="block text-xs font-medium text-[#1E3043]">Resource Type</label>
              <select
                value={selectedResId}
                onChange={(e) => setSelectedResId(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {resources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.resource_name} ({r.unit})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#1E3043]">Available Quantity</label>
              <input
                type="number"
                min={0}
                value={newQty}
                onChange={(e) => setNewQty(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono-tabular"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-[#268A87] py-2.5 text-xs font-semibold text-white hover:bg-[#1f7572]"
            >
              Update Warehouse Stock
            </button>
          </form>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden lg:col-span-8">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="font-display text-base font-semibold text-[#1E3043]">Organisation Inventory Ledger</h2>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[#697780]">
                <tr>
                  <th className="px-4 py-3 font-medium">Resource</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium text-right">Available</th>
                  <th className="px-4 py-3 font-medium">Stock Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {inventory.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-medium text-[#1E3043]">{item.resource_name}</td>
                    <td className="px-4 py-3 text-[#697780]">{item.category}</td>
                    <td className="px-4 py-3 text-right font-mono-tabular font-semibold">
                      {item.quantity_available.toLocaleString()} {item.unit}
                    </td>
                    <td className="px-4 py-3">
                      <span className={item.quantity_available < 40 ? 'text-[#D9534F] font-semibold' : 'text-[#39856D]'}>
                        {item.quantity_available < 40 ? 'Low Stock Alert' : 'Nominal'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'allocations' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="font-display text-base font-semibold text-[#1E3043]">Coordinator Allocations Assigned to Us</h2>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[#697780]">
                <tr>
                  <th className="px-4 py-3 font-medium">Incident / Destination</th>
                  <th className="px-4 py-3 font-medium">Resource</th>
                  <th className="px-4 py-3 font-medium text-right">Quantity</th>
                  <th className="px-4 py-3 font-medium text-right">Distance</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allocations.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-3 font-medium text-[#1E3043]">{a.incident_name}</td>
                    <td className="px-4 py-3 text-[#697780]">{a.resource_name}</td>
                    <td className="px-4 py-3 text-right font-mono-tabular">
                      {a.allocated_quantity} {a.unit}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-tabular">{a.distance_km} km</td>
                    <td className="px-4 py-3">
                      <VerificationText status={a.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="font-display text-base font-semibold text-[#1E3043]">Verified Network Resource Requests</h2>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[#697780]">
                <tr>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium">Resource</th>
                  <th className="px-4 py-3 font-medium text-right">Required</th>
                  <th className="px-4 py-3 font-medium">Priority</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-medium text-[#1E3043]">{r.location_name || r.incident_name}</td>
                    <td className="px-4 py-3 text-[#697780]">{r.resource_name}</td>
                    <td className="px-4 py-3 text-right font-mono-tabular">
                      {r.quantity_required} {r.unit}
                    </td>
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
        </div>
      )}

      {(activeTab === 'shipments' || activeTab === 'history') && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-display text-base font-semibold text-[#1E3043]">
              {activeTab === 'shipments' ? 'Active Relief Shipments & Dispatch Controls' : 'Completed Relief Deliveries'}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[#697780]">
                <tr>
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Destination</th>
                  <th className="px-4 py-3 font-medium">Cargo</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(activeTab === 'shipments' ? activeShipments : completedShipments).map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-mono-tabular font-semibold text-[#1E3043]">{s.shipment_code}</td>
                    <td className="px-4 py-3 text-[#1E3043]">{s.location_name}</td>
                    <td className="px-4 py-3 font-mono-tabular">
                      {s.allocated_quantity} {s.unit} {s.resource_name}
                    </td>
                    <td className="px-4 py-3">
                      <VerificationText status={s.status} />
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      {s.status === 'Preparing' && (
                        <button
                          type="button"
                          onClick={() => handleUpdateShipment(s.id, 'Dispatched')}
                          className="rounded bg-[#1E3043] px-2.5 py-1 text-[11px] font-semibold text-white"
                        >
                          Dispatch Now
                        </button>
                      )}
                      {s.status === 'Dispatched' && (
                        <button
                          type="button"
                          onClick={() => handleUpdateShipment(s.id, 'In Transit')}
                          className="rounded bg-[#268A87] px-2.5 py-1 text-[11px] font-semibold text-white"
                        >
                          Mark In Transit
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

      <ShipmentQRModal shipment={selectedShipment} onClose={() => setSelectedShipment(null)} />
    </DashboardShell>
  );
};
