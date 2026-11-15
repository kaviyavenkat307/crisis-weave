import { db } from '../db.ts';
import { haversineDistanceKm } from './aiService.ts';
import type { OptimisationComparison, PriorityLevel } from '../../types.ts';

const PRIORITY_WEIGHT: Record<PriorityLevel, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

interface RawRequest {
  id: number;
  incident_id: number | null;
  incident_name: string | null;
  location_name: string | null;
  req_lat: number | null;
  req_lng: number | null;
  resource_id: number;
  resource_name: string;
  unit: string;
  quantity_required: number;
  quantity_fulfilled: number;
  priority: PriorityLevel;
  created_at: string;
}

interface RawInventory {
  id: number;
  organisation_id: number;
  organisation_name: string;
  latitude: number;
  longitude: number;
  resource_id: number;
  quantity_available: number;
}

export function computeOptimisedAllocation(persistRecommendations = false): OptimisationComparison {
  const requests = db
    .prepare(`
      SELECT
        rr.id,
        rr.incident_id,
        COALESCE(i.incident_name, o_req.organisation_name, 'Medical Facility Request') as incident_name,
        COALESCE(i.location_name, o_req.address, 'Chennai') as location_name,
        COALESCE(i.latitude, o_req.latitude, 13.0827) as req_lat,
        COALESCE(i.longitude, o_req.longitude, 80.2707) as req_lng,
        rr.resource_id,
        res.resource_name,
        res.unit,
        rr.quantity_required,
        rr.quantity_fulfilled,
        rr.priority,
        rr.created_at
      FROM resource_requests rr
      JOIN resources res ON res.id = rr.resource_id
      LEFT JOIN incidents i ON i.id = rr.incident_id
      LEFT JOIN organisations o_req ON o_req.id = rr.organisation_id
      WHERE rr.status IN ('Open', 'Partially Fulfilled')
        AND rr.quantity_required > rr.quantity_fulfilled
    `)
    .all() as RawRequest[];

  // Subtract already Recommended/Approved allocations from active requests so we don't double-allocate
  const existingAllocs = db
    .prepare(`
      SELECT request_id, SUM(allocated_quantity) as qty
      FROM allocations
      WHERE status IN ('Recommended', 'Approved')
      GROUP BY request_id
    `)
    .all() as Array<{ request_id: number; qty: number }>;
  const pendingByReq = new Map(existingAllocs.map((a) => [a.request_id, a.qty]));

  const inventories = db
    .prepare(`
      SELECT inv.id, inv.organisation_id, o.organisation_name, o.latitude, o.longitude, inv.resource_id, inv.quantity_available
      FROM inventory inv
      JOIN organisations o ON o.id = inv.organisation_id
      WHERE inv.quantity_available > 0 AND o.verification_status = 'Verified'
    `)
    .all() as RawInventory[];

  // Clone stock maps for Optimiser vs FCFS Baseline
  const optStock = new Map<string, number>();
  const fcfsStock = new Map<string, number>();
  for (const inv of inventories) {
    const key = `${inv.organisation_id}:${inv.resource_id}`;
    optStock.set(key, inv.quantity_available);
    fcfsStock.set(key, inv.quantity_available);
  }

  // 1. CrisisWeave Multi-Criteria Optimiser:
  // Sort by Priority DESC, then remaining unmet need DESC
  const optSortedRequests = [...requests].sort((a, b) => {
    const pDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    if (pDiff !== 0) return pDiff;
    return b.quantity_required - b.quantity_fulfilled - (a.quantity_required - a.quantity_fulfilled);
  });

  const recommendations: OptimisationComparison['recommendations'] = [];
  let optTotalCriticalReq = 0;
  let optTotalCriticalAlloc = 0;
  let optTotalReq = 0;
  let optTotalAlloc = 0;
  let optWeightedDist = 0;

  if (persistRecommendations) {
    db.prepare(`DELETE FROM allocations WHERE status = 'Recommended'`).run();
  }

  for (const req of optSortedRequests) {
    const alreadyPending = pendingByReq.get(req.id) || 0;
    const remainingNeed = Math.max(0, req.quantity_required - req.quantity_fulfilled - alreadyPending);
    if (remainingNeed === 0) continue;

    optTotalReq += remainingNeed;
    if (req.priority === 'Critical') optTotalCriticalReq += remainingNeed;

    const matchingSuppliers = inventories
      .filter((inv) => inv.resource_id === req.resource_id)
      .map((inv) => {
        const dist = haversineDistanceKm(req.req_lat || 13.0827, req.req_lng || 80.2707, inv.latitude, inv.longitude);
        return { ...inv, distanceKm: Number(dist.toFixed(2)) };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const totalAvailableForResource = matchingSuppliers.reduce(
      (sum, sup) => sum + (optStock.get(`${sup.organisation_id}:${sup.resource_id}`) || 0),
      0
    );

    let needLeft = remainingNeed;
    const recommendedAllocations: OptimisationComparison['recommendations'][number]['recommendedAllocations'] = [];

    for (const sup of matchingSuppliers) {
      if (needLeft <= 0) break;
      const key = `${sup.organisation_id}:${sup.resource_id}`;
      const avail = optStock.get(key) || 0;
      if (avail <= 0) continue;

      const allocQty = Math.min(avail, needLeft);
      const nextStock = avail - allocQty;
      optStock.set(key, nextStock);
      needLeft -= allocQty;

      optTotalAlloc += allocQty;
      optWeightedDist += sup.distanceKm * allocQty;
      if (req.priority === 'Critical') optTotalCriticalAlloc += allocQty;

      recommendedAllocations.push({
        organisationId: sup.organisation_id,
        organisationName: sup.organisation_name,
        quantity: allocQty,
        distanceKm: sup.distanceKm,
        remainingStock: nextStock,
      });

      if (persistRecommendations) {
        const score = Number((PRIORITY_WEIGHT[req.priority] * 25 - sup.distanceKm * 1.5).toFixed(1));
        db.prepare(`
          INSERT INTO allocations (request_id, organisation_id, resource_id, allocated_quantity, distance_km, optimization_score, status)
          VALUES (?, ?, ?, ?, ?, ?, 'Recommended')
        `).run(req.id, sup.organisation_id, req.resource_id, allocQty, sup.distanceKm, score);
      }
    }

    const totalRecommended = remainingNeed - needLeft;
    recommendations.push({
      requestId: req.id,
      incidentName: req.incident_name || 'Incident',
      resourceId: req.resource_id,
      resourceName: req.resource_name,
      unit: req.unit,
      priority: req.priority,
      requestedQuantity: remainingNeed,
      availableQuantity: totalAvailableForResource,
      recommendedAllocations,
      totalRecommended,
      unmetDemand: needLeft,
    });
  }

  // 2. FCFS Baseline:
  // Processes requests strictly in chronological order (created_at ASC), picking NGOs in ID order without distance or priority weighting
  const fcfsRequests = [...requests].sort((a, b) => a.id - b.id);
  let fcfsTotalCriticalReq = 0;
  let fcfsTotalCriticalAlloc = 0;
  let fcfsTotalReq = 0;
  let fcfsTotalAlloc = 0;
  let fcfsWeightedDist = 0;

  for (const req of fcfsRequests) {
    const alreadyPending = pendingByReq.get(req.id) || 0;
    const remainingNeed = Math.max(0, req.quantity_required - req.quantity_fulfilled - alreadyPending);
    if (remainingNeed === 0) continue;

    fcfsTotalReq += remainingNeed;
    if (req.priority === 'Critical') fcfsTotalCriticalReq += remainingNeed;

    const suppliers = inventories
      .filter((inv) => inv.resource_id === req.resource_id)
      .sort((a, b) => a.organisation_id - b.organisation_id); // naive ID order

    let needLeft = remainingNeed;
    for (const sup of suppliers) {
      if (needLeft <= 0) break;
      const key = `${sup.organisation_id}:${sup.resource_id}`;
      const avail = fcfsStock.get(key) || 0;
      if (avail <= 0) continue;
      const allocQty = Math.min(avail, needLeft);
      fcfsStock.set(key, avail - allocQty);
      needLeft -= allocQty;
      const dist = haversineDistanceKm(req.req_lat || 13.0827, req.req_lng || 80.2707, sup.latitude, sup.longitude);
      fcfsTotalAlloc += allocQty;
      fcfsWeightedDist += dist * allocQty;
      if (req.priority === 'Critical') fcfsTotalCriticalAlloc += allocQty;
    }
  }

  const optCritPct = optTotalCriticalReq > 0 ? Math.round((optTotalCriticalAlloc / optTotalCriticalReq) * 100) : 100;
  const fcfsCritPct = fcfsTotalCriticalReq > 0 ? Math.round((fcfsTotalCriticalAlloc / fcfsTotalCriticalReq) * 100) : 100;

  const optAvgDist = optTotalAlloc > 0 ? Number((optWeightedDist / optTotalAlloc).toFixed(2)) : 0;
  const fcfsAvgDist = fcfsTotalAlloc > 0 ? Number((fcfsWeightedDist / fcfsTotalAlloc).toFixed(2)) : 0;

  return {
    recommendations,
    metrics: {
      optimiser: {
        criticalFulfillmentPct: optCritPct,
        overallFulfillmentPct: optTotalReq > 0 ? Math.round((optTotalAlloc / optTotalReq) * 100) : 100,
        avgDistanceKm: optAvgDist,
        unmetCriticalUnits: Math.max(0, optTotalCriticalReq - optTotalCriticalAlloc),
        totalAllocatedUnits: optTotalAlloc,
      },
      fcfsBaseline: {
        criticalFulfillmentPct: fcfsCritPct,
        overallFulfillmentPct: fcfsTotalReq > 0 ? Math.round((fcfsTotalAlloc / fcfsTotalReq) * 100) : 100,
        avgDistanceKm: fcfsAvgDist,
        unmetCriticalUnits: Math.max(0, fcfsTotalCriticalReq - fcfsTotalCriticalAlloc),
        totalAllocatedUnits: fcfsTotalAlloc,
      },
      efficiencyGainPct: Math.max(0, optCritPct - fcfsCritPct),
      distanceSavedKm: Number(Math.max(0, fcfsAvgDist - optAvgDist).toFixed(2)),
    },
  };
}
