import { db } from '../db.ts';
import type { DemandPrediction } from '../../types.ts';

export function generateDemandPredictions(horizon: '6h' | '12h' | '24h' = '12h'): DemandPrediction[] {
  const resources = db.prepare('SELECT id, resource_name, unit FROM resources').all() as Array<{
    id: number;
    resource_name: string;
    unit: string;
  }>;

  const activeIncidentsCount = (
    db.prepare(`SELECT COUNT(*) as cnt FROM incidents WHERE status = 'Active'`).get() as { cnt: number }
  ).cnt;

  const criticalCount = (
    db.prepare(`SELECT COUNT(*) as cnt FROM incidents WHERE status = 'Active' AND severity = 'Critical'`).get() as {
      cnt: number;
    }
  ).cnt;

  const totalAffected = (
    db.prepare(`SELECT COALESCE(SUM(affected_people), 0) as total FROM incidents WHERE status = 'Active'`).get() as {
      total: number;
    }
  ).total;

  // Statistical linear growth baseline scaled by horizon and active severity mix
  const horizonMultiplier = horizon === '6h' ? 0.18 : horizon === '12h' ? 0.34 : 0.62;
  const severityBoost = 1 + Math.min(0.45, criticalCount * 0.12);
  const confidence = horizon === '6h' ? 0.88 : horizon === '12h' ? 0.79 : 0.68;
  const uncertaintyMargin = horizon === '6h' ? '±12%' : horizon === '12h' ? '±18%' : '±26%';

  db.prepare('DELETE FROM predictions WHERE prediction_period = ?').run(horizon);

  const results: DemandPrediction[] = [];

  for (const res of resources) {
    const demandRow = db
      .prepare(`
        SELECT COALESCE(SUM(quantity_required - quantity_fulfilled), 0) as open_demand
        FROM resource_requests
        WHERE resource_id = ? AND status IN ('Open', 'Partially Fulfilled')
      `)
      .get(res.id) as { open_demand: number };

    const stockRow = db
      .prepare(`
        SELECT COALESCE(SUM(quantity_available), 0) as avail
        FROM inventory
        WHERE resource_id = ?
      `)
      .get(res.id) as { avail: number };

    const currentDemand = demandRow.open_demand;
    // Per-capita baseline floor when active incidents exist
    const perCapitaRate =
      res.resource_name === 'Drinking Water'
        ? 3.0
        : res.resource_name === 'Food Packets'
        ? 1.5
        : res.resource_name === 'Medical Kits'
        ? 0.25
        : res.resource_name === 'Blankets'
        ? 0.4
        : 0.15;

    const baselineSignal = Math.max(currentDemand, Math.round(totalAffected * perCapitaRate * 0.4));
    const estimatedAdditional = Math.round(baselineSignal * horizonMultiplier * severityBoost);
    const predictedTotal = currentDemand + estimatedAdditional;
    const expectedShortage = Math.max(0, predictedTotal - stockRow.avail);

    const assumptions = `Statistical linear baseline using ${activeIncidentsCount} active simulated incidents (${criticalCount} critical, ${totalAffected} affected residents), horizon growth factor ${horizonMultiplier}, and severity multiplier ${severityBoost.toFixed(2)}x. Not a validated meteorological model.`;

    const info = db
      .prepare(`
        INSERT INTO predictions (
          incident_id, resource_id, prediction_period, current_demand, estimated_additional,
          predicted_quantity, available_inventory, expected_shortage, confidence, uncertainty_margin, assumptions
        ) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        res.id,
        horizon,
        currentDemand,
        estimatedAdditional,
        predictedTotal,
        stockRow.avail,
        expectedShortage,
        confidence,
        uncertaintyMargin,
        assumptions
      );

    results.push({
      id: Number(info.lastInsertRowid),
      resource_id: res.id,
      resource_name: res.resource_name,
      unit: res.unit,
      prediction_period: horizon,
      current_demand: currentDemand,
      estimated_additional: estimatedAdditional,
      predicted_quantity: predictedTotal,
      available_inventory: stockRow.avail,
      expected_shortage: expectedShortage,
      confidence,
      uncertainty_margin: uncertaintyMargin,
      assumptions,
      created_at: new Date().toISOString(),
    });
  }

  return results;
}
