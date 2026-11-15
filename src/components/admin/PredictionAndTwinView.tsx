import React, { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { RotateCcw, Sliders } from 'lucide-react';
import type { DemandPrediction, SimulationInput, SimulationResult } from '../../types';
import { apiRequest } from '../../services/api';

interface PredictionViewProps {
  predictions: DemandPrediction[];
  horizon: '6h' | '12h' | '24h';
  onChangeHorizon: (h: '6h' | '12h' | '24h') => void;
}

export const DemandPredictionView: React.FC<PredictionViewProps> = ({
  predictions,
  horizon,
  onChangeHorizon,
}) => {
  const chartData = predictions.slice(0, 6).map((p) => ({
    name: p.resource_name.replace('Drinking ', '').replace(' Materials', ''),
    Current: p.current_demand,
    ProjectedTotal: p.predicted_quantity,
    Available: p.available_inventory,
    Shortage: p.expected_shortage,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5">
        <div>
          <h2 className="font-display text-base font-semibold text-[#1E3043]">
            Predictive Resource Demand Analysis (Statistical Baseline)
          </h2>
          <p className="mt-1 text-xs text-[#697780]">
            Estimates short-term resource requirements over 6h, 12h, and 24h windows from active verified incidents and NGO inventory.
          </p>
        </div>
        <div className="flex rounded-lg bg-slate-100 p-1 text-xs font-medium">
          {(['6h', '12h', '24h'] as const).map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => onChangeHorizon(h)}
              className={`rounded-md px-3.5 py-1.5 whitespace-nowrap ${
                horizon === h ? 'bg-[#1E3043] text-white' : 'text-[#697780] hover:text-[#1E3043]'
              }`}
            >
              Next {h}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="font-display text-sm font-semibold text-[#1E3043]">
          Forecasted Demand vs. Available Stock ({horizon} Horizon)
        </h3>
        <div className="mt-4 h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#697780' }} />
              <YAxis tick={{ fontSize: 11, fill: '#697780' }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Current" name="Current Verified Demand" fill="#1E3043" radius={[3, 3, 0, 0]} />
              <Bar dataKey="ProjectedTotal" name={`Projected Total (${horizon})`} fill="#268A87" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Available" name="Available NGO Stock" fill="#39856D" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Shortage" name="Expected Shortage" fill="#D9534F" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-[#697780]">
            <tr>
              <th className="px-4 py-3 font-medium">Resource</th>
              <th className="px-4 py-3 font-medium text-right">Current Demand</th>
              <th className="px-4 py-3 font-medium text-right">Est. Additional ({horizon})</th>
              <th className="px-4 py-3 font-medium text-right">Total Forecast</th>
              <th className="px-4 py-3 font-medium text-right">Available Stock</th>
              <th className="px-4 py-3 font-medium text-right">Expected Shortage</th>
              <th className="px-4 py-3 font-medium text-right">Confidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {predictions.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 font-medium text-[#1E3043]">{p.resource_name}</td>
                <td className="px-4 py-3 text-right font-mono-tabular">
                  {p.current_demand.toLocaleString()} {p.unit}
                </td>
                <td className="px-4 py-3 text-right font-mono-tabular text-[#268A87]">
                  +{p.estimated_additional.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right font-mono-tabular font-semibold">
                  {p.predicted_quantity.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right font-mono-tabular text-[#39856D]">
                  {p.available_inventory.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right font-mono-tabular font-semibold text-[#D9534F]">
                  {p.expected_shortage > 0 ? p.expected_shortage.toLocaleString() : '0'}
                </td>
                <td className="px-4 py-3 text-right font-mono-tabular text-[#697780]">
                  {Math.round(p.confidence * 100)}% ({p.uncertainty_margin})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {predictions[0] && (
          <div className="border-t border-slate-100 bg-[#F5F7F7] px-4 py-3 text-xs text-[#697780]">
            <strong>Model Assumptions:</strong> {predictions[0].assumptions}
          </div>
        )}
      </div>
    </div>
  );
};

const BASELINE_INPUT: SimulationInput = {
  scenarioName: 'Scenario A · Baseline Flood Impact',
  severity: 'Medium',
  affectedPopulation: 2000,
  affectedFamilies: 500,
  availableWater: 1000,
  availableFood: 2500,
  availableMedical: 150,
  roadAccessibilityPct: 80,
  volunteerCount: 24,
  reliefCentreCapacity: 900,
};

const PRESET_SCENARIOS: Record<'Low' | 'Medium' | 'High', SimulationInput> = {
  Low: {
    scenarioName: 'Low-Impact Flood Scenario',
    severity: 'Low',
    affectedPopulation: 1000,
    affectedFamilies: 250,
    availableWater: 5000,
    availableFood: 2500,
    availableMedical: 150,
    roadAccessibilityPct: 90,
    volunteerCount: 25,
    reliefCentreCapacity: 1000,
  },
  Medium: BASELINE_INPUT,
  High: {
    scenarioName: 'Scenario B · High-Impact Surge',
    severity: 'High',
    affectedPopulation: 4200,
    affectedFamilies: 1000,
    availableWater: 1000,
    availableFood: 2500,
    availableMedical: 150,
    roadAccessibilityPct: 40,
    volunteerCount: 24,
    reliefCentreCapacity: 900,
  },
};

function computeClientMirror(input: SimulationInput): SimulationResult {
  const severityFactor =
    input.severity === 'High' ? 1.35 : input.severity === 'Medium' ? 1.1 : input.severity === 'Low' ? 0.85 : 1.15;
  const effectivePop = Math.max(input.affectedPopulation, input.affectedFamilies * 4);
  const waterRequired = Math.round(effectivePop * 4 * severityFactor);
  const foodRequired = Math.round(input.affectedFamilies * 6 * severityFactor);
  const medicalRequired = Math.round((effectivePop / 12) * severityFactor);
  const shelterRequired = Math.round(effectivePop * 0.45 * severityFactor);

  const accessRatio = Math.max(10, Math.min(100, input.roadAccessibilityPct)) / 100;
  const accessibilityPenaltyFactor = Number((1 / accessRatio).toFixed(2));
  const estimatedDeliveryDelayHours = Number((0.75 * accessibilityPenaltyFactor * severityFactor).toFixed(1));
  const requiredVolunteers = Math.max(1, Math.ceil(input.affectedFamilies / 25));
  const volunteerCoveragePct = Math.min(100, Math.round((input.volunteerCount / requiredVolunteers) * 100));

  const recommendedStrategy: string[] = [];
  if (waterRequired > input.availableWater) {
    recommendedStrategy.push(`Procure ${(waterRequired - input.availableWater).toLocaleString()} L extra drinking water.`);
  }
  if (foodRequired > input.availableFood) {
    recommendedStrategy.push(`Dispatch ${(foodRequired - input.availableFood).toLocaleString()} additional food packets.`);
  }
  if (input.roadAccessibilityPct < 55) {
    recommendedStrategy.push(`Road accessibility at ${input.roadAccessibilityPct}% requires boat rerouting & forward hubs.`);
  }
  if (recommendedStrategy.length === 0) {
    recommendedStrategy.push('Current resources cover projected operational scenario demand.');
  }

  return {
    input,
    demand: { waterRequired, foodRequired, medicalRequired, shelterRequired },
    shortages: {
      waterShortage: Math.max(0, waterRequired - input.availableWater),
      foodShortage: Math.max(0, foodRequired - input.availableFood),
      medicalShortage: Math.max(0, medicalRequired - input.availableMedical),
      shelterOverflow: Math.max(0, shelterRequired - input.reliefCentreCapacity),
    },
    operationalImpact: {
      estimatedDeliveryDelayHours,
      accessibilityPenaltyFactor,
      volunteerCoveragePct,
      recommendedStrategy,
    },
  };
}

export const DigitalTwinView: React.FC = () => {
  const [simInput, setSimInput] = useState<SimulationInput>(PRESET_SCENARIOS.High);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const baselineResult = computeClientMirror(BASELINE_INPUT);
  const simResult = computeClientMirror(simInput);

  const comparisonChart = [
    {
      resource: 'Water Demand',
      ScenarioA: baselineResult.demand.waterRequired,
      ScenarioB: simResult.demand.waterRequired,
    },
    {
      resource: 'Water Shortage',
      ScenarioA: baselineResult.shortages.waterShortage,
      ScenarioB: simResult.shortages.waterShortage,
    },
    {
      resource: 'Food Demand',
      ScenarioA: baselineResult.demand.foodRequired,
      ScenarioB: simResult.demand.foodRequired,
    },
    {
      resource: 'Food Shortage',
      ScenarioA: baselineResult.shortages.foodShortage,
      ScenarioB: simResult.shortages.foodShortage,
    },
  ];

  const handleSaveScenario = async () => {
    setSavedNotice(null);
    const res = await apiRequest<{ id: number }>('/api/simulations', {
      method: 'POST',
      body: JSON.stringify(simInput),
    });
    setSavedNotice(`Saved Digital Twin scenario #${res.id} (${simInput.scenarioName}) to audit log.`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5">
        <div>
          <h2 className="font-display text-base font-semibold text-[#1E3043]">
            Digital Twin Disaster Response Operational Simulator
          </h2>
          <p className="mt-1 text-xs text-[#697780]">
            Explore hypothetical Chennai flood impact scenarios and compare shortages & transit delays before dispatching supplies.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['Low', 'Medium', 'High'] as const).map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setSimInput(PRESET_SCENARIOS[preset])}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium border ${
                simInput.severity === preset
                  ? 'bg-[#1E3043] text-white border-[#1E3043]'
                  : 'bg-white text-[#697780] border-slate-200 hover:text-[#1E3043]'
              }`}
            >
              {preset} Impact
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setSimInput(BASELINE_INPUT);
              setSavedNotice(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-[#1E3043] hover:bg-slate-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Simulation
          </button>
        </div>
      </div>

      {savedNotice && (
        <div className="rounded-xl border border-[#39856D]/30 bg-[#39856D]/10 p-3 text-xs text-[#39856D]">
          {savedNotice}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Controls */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#1E3043]">
            <Sliders className="h-4 w-4 text-[#268A87]" />
            Scenario B Parameters
          </div>

          <div>
            <div className="flex justify-between text-xs">
              <label className="font-medium text-[#1E3043]">Affected Families</label>
              <span className="font-mono-tabular font-semibold">{simInput.affectedFamilies} families</span>
            </div>
            <input
              type="range"
              min={100}
              max={2500}
              step={50}
              value={simInput.affectedFamilies}
              onChange={(e) =>
                setSimInput({
                  ...simInput,
                  severity: 'Custom',
                  affectedFamilies: Number(e.target.value),
                  affectedPopulation: Number(e.target.value) * 4,
                })
              }
              className="mt-1.5 w-full accent-[#268A87]"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs">
              <label className="font-medium text-[#1E3043]">Road Accessibility</label>
              <span className="font-mono-tabular font-semibold">{simInput.roadAccessibilityPct}%</span>
            </div>
            <input
              type="range"
              min={15}
              max={100}
              step={5}
              value={simInput.roadAccessibilityPct}
              onChange={(e) => setSimInput({ ...simInput, severity: 'Custom', roadAccessibilityPct: Number(e.target.value) })}
              className="mt-1.5 w-full accent-[#268A87]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-medium text-[#1E3043]">Available Water (L)</label>
              <input
                type="number"
                value={simInput.availableWater}
                onChange={(e) => setSimInput({ ...simInput, severity: 'Custom', availableWater: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 font-mono-tabular"
              />
            </div>
            <div>
              <label className="block font-medium text-[#1E3043]">Available Food (pkts)</label>
              <input
                type="number"
                value={simInput.availableFood}
                onChange={(e) => setSimInput({ ...simInput, severity: 'Custom', availableFood: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 font-mono-tabular"
              />
            </div>
            <div>
              <label className="block font-medium text-[#1E3043]">Volunteers</label>
              <input
                type="number"
                value={simInput.volunteerCount}
                onChange={(e) => setSimInput({ ...simInput, severity: 'Custom', volunteerCount: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 font-mono-tabular"
              />
            </div>
            <div>
              <label className="block font-medium text-[#1E3043]">Shelter Capacity</label>
              <input
                type="number"
                value={simInput.reliefCentreCapacity}
                onChange={(e) =>
                  setSimInput({ ...simInput, severity: 'Custom', reliefCentreCapacity: Number(e.target.value) })
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 font-mono-tabular"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleSaveScenario}
            className="w-full rounded-lg bg-[#1E3043] py-2.5 text-xs font-semibold text-white hover:bg-[#162433]"
          >
            Save Scenario Snapshot to Server
          </button>
        </div>

        {/* Comparison Charts & Operational Outputs */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-7 space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
            <div className="rounded-lg bg-[#F5F7F7] p-3">
              <p className="text-[#697780]">Est. Transit Delay</p>
              <p className="mt-1 font-display text-lg font-bold text-[#D9534F] tabular-nums">
                {simResult.operationalImpact.estimatedDeliveryDelayHours} hrs
              </p>
              <p className="text-[11px] text-[#697780] tabular-nums">
                vs {baselineResult.operationalImpact.estimatedDeliveryDelayHours}h baseline
              </p>
            </div>
            <div className="rounded-lg bg-[#F5F7F7] p-3">
              <p className="text-[#697780]">Water Shortage</p>
              <p className="mt-1 font-display text-lg font-bold text-[#1E3043] tabular-nums">
                {simResult.shortages.waterShortage.toLocaleString()} L
              </p>
            </div>
            <div className="rounded-lg bg-[#F5F7F7] p-3">
              <p className="text-[#697780]">Food Shortage</p>
              <p className="mt-1 font-display text-lg font-bold text-[#1E3043] tabular-nums">
                {simResult.shortages.foodShortage.toLocaleString()} pkts
              </p>
            </div>
            <div className="rounded-lg bg-[#F5F7F7] p-3">
              <p className="text-[#697780]">Volunteer Coverage</p>
              <p className="mt-1 font-display text-lg font-bold text-[#268A87] tabular-nums">
                {simResult.operationalImpact.volunteerCoveragePct}%
              </p>
            </div>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonChart} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="resource" tick={{ fontSize: 11, fill: '#697780' }} />
                <YAxis tick={{ fontSize: 11, fill: '#697780' }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="ScenarioA" name="Scenario A (500 fam · 80% road)" fill="#94A3B8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="ScenarioB" name="Scenario B (Simulated)" fill="#268A87" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-lg bg-[#F5F7F7] p-4 text-xs space-y-1.5">
            <p className="font-semibold text-[#1E3043]">Recommended Operational Countermeasures</p>
            {simResult.operationalImpact.recommendedStrategy.map((line) => (
              <p key={line} className="text-[#697780]">
                • {line}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
