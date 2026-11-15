import React from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Cpu, CheckCircle2, XCircle } from 'lucide-react';
import type { Allocation, OptimisationComparison } from '../../types';
import { PriorityLabel, VerificationText } from '../StatusText';

interface AllocationEngineViewProps {
  optimisation: OptimisationComparison | null;
  allocations: Allocation[];
  running: boolean;
  onRunOptimisation: () => void;
  onApproveAllocation: (id: number, decision: 'Approved' | 'Rejected') => void;
}

export const AllocationEngineView: React.FC<AllocationEngineViewProps> = ({
  optimisation,
  allocations,
  running,
  onRunOptimisation,
  onApproveAllocation,
}) => {
  const comparisonData = optimisation
    ? [
        {
          metric: 'Critical Fulfillment %',
          CrisisWeave: optimisation.metrics.optimiser.criticalFulfillmentPct,
          FCFS_Baseline: optimisation.metrics.fcfsBaseline.criticalFulfillmentPct,
        },
        {
          metric: 'Overall Fulfillment %',
          CrisisWeave: optimisation.metrics.optimiser.overallFulfillmentPct,
          FCFS_Baseline: optimisation.metrics.fcfsBaseline.overallFulfillmentPct,
        },
        {
          metric: 'Avg Distance (km)',
          CrisisWeave: optimisation.metrics.optimiser.avgDistanceKm,
          FCFS_Baseline: optimisation.metrics.fcfsBaseline.avgDistanceKm,
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5">
        <div>
          <h2 className="font-display text-base font-semibold text-[#1E3043]">
            Intelligent Multi-Criteria Resource Optimisation Engine
          </h2>
          <p className="mt-1 text-xs text-[#697780]">
            Optimizes allocations across verified NGO stocks using request priority, Haversine distance, and split-supply
            feasibility, benchmarked against a First-Come-First-Served (FCFS) baseline.
          </p>
        </div>
        <button
          type="button"
          disabled={running}
          onClick={onRunOptimisation}
          className="inline-flex items-center gap-2 rounded-lg bg-[#268A87] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#1f7572] disabled:opacity-60 whitespace-nowrap"
        >
          <Cpu className="h-3.5 w-3.5" />
          {running ? 'Solving Allocations...' : 'Generate Optimised Recommendations'}
        </button>
      </div>

      {optimisation && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5 space-y-4">
            <h3 className="font-display text-sm font-semibold text-[#1E3043]">
              Optimiser vs. FCFS Baseline Benchmark
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg bg-[#F5F7F7] p-3">
                <p className="text-[#697780]">Critical Demand Met</p>
                <p className="mt-1 font-display text-xl font-bold text-[#39856D] tabular-nums">
                  {optimisation.metrics.optimiser.criticalFulfillmentPct}%
                </p>
                <p className="text-[11px] text-[#697780] tabular-nums">
                  vs {optimisation.metrics.fcfsBaseline.criticalFulfillmentPct}% FCFS
                </p>
              </div>
              <div className="rounded-lg bg-[#F5F7F7] p-3">
                <p className="text-[#697780]">Avg Dispatch Distance</p>
                <p className="mt-1 font-display text-xl font-bold text-[#1E3043] tabular-nums">
                  {optimisation.metrics.optimiser.avgDistanceKm} km
                </p>
                <p className="text-[11px] text-[#268A87] tabular-nums">
                  Saves {optimisation.metrics.distanceSavedKm} km vs FCFS
                </p>
              </div>
            </div>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="metric" tick={{ fontSize: 11, fill: '#697780' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#697780' }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="CrisisWeave" name="CrisisWeave Optimiser" fill="#268A87" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="FCFS_Baseline" name="FCFS Baseline" fill="#94A3B8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden lg:col-span-7">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="font-display text-sm font-semibold text-[#1E3043]">
                Live Split-Supply Demand Breakdown
              </h3>
            </div>
            <div className="divide-y divide-slate-100 max-h-[360px] overflow-y-auto">
              {optimisation.recommendations.length === 0 ? (
                <p className="p-6 text-xs text-[#697780]">All open requests currently have pending or approved allocations.</p>
              ) : (
                optimisation.recommendations.map((rec) => (
                  <div key={rec.requestId} className="p-4 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[#1E3043]">
                        {rec.incidentName} · {rec.resourceName}
                      </span>
                      <PriorityLabel priority={rec.priority} />
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-[#697780] font-mono-tabular">
                      <span>Requested: {rec.requestedQuantity} {rec.unit}</span>
                      <span>Available: {rec.availableQuantity}</span>
                      <span className="text-[#268A87] font-semibold">Recommended: {rec.totalRecommended}</span>
                      {rec.unmetDemand > 0 && (
                        <span className="text-[#D9534F] font-semibold">Unmet: {rec.unmetDemand}</span>
                      )}
                    </div>
                    <div className="space-y-1 pl-3 border-l border-slate-200">
                      {rec.recommendedAllocations.map((s) => (
                        <p key={`${rec.requestId}-${s.organisationId}`} className="text-[#1E3043]">
                          → <strong>{s.organisationName}</strong> supplies{' '}
                          <span className="font-mono-tabular font-semibold">{s.quantity} {rec.unit}</span> ({s.distanceKm} km away ·{' '}
                          {s.remainingStock} remaining)
                        </p>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Allocation Approval Queue */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="font-display text-sm font-semibold text-[#1E3043]">
            Coordinator Allocation Approval Queue
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[#697780]">
              <tr>
                <th className="px-4 py-3 font-medium">ID</th>
                <th className="px-4 py-3 font-medium">Destination Incident</th>
                <th className="px-4 py-3 font-medium">Supplying NGO</th>
                <th className="px-4 py-3 font-medium">Resource</th>
                <th className="px-4 py-3 font-medium text-right">Qty</th>
                <th className="px-4 py-3 font-medium text-right">Distance</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allocations.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3 font-mono-tabular">AL-{a.id}</td>
                  <td className="px-4 py-3 font-medium text-[#1E3043]">{a.incident_name}</td>
                  <td className="px-4 py-3 text-[#1E3043]">{a.organisation_name}</td>
                  <td className="px-4 py-3 text-[#697780]">{a.resource_name}</td>
                  <td className="px-4 py-3 text-right font-mono-tabular font-semibold">
                    {a.allocated_quantity} {a.unit}
                  </td>
                  <td className="px-4 py-3 text-right font-mono-tabular">{a.distance_km} km</td>
                  <td className="px-4 py-3">
                    <VerificationText status={a.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {a.status === 'Recommended' ? (
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onApproveAllocation(a.id, 'Approved')}
                          className="inline-flex items-center gap-1 rounded bg-[#39856D] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#2f705b]"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => onApproveAllocation(a.id, 'Rejected')}
                          className="inline-flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-[#D9534F] hover:bg-red-50"
                        >
                          <XCircle className="h-3 w-3" />
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-[#697780]">Processed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
