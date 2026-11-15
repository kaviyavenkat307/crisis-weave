import type { SimulationInput, SimulationResult } from '../../types.ts';

export function runDigitalTwinSimulation(input: SimulationInput): SimulationResult {
  const severityFactor =
    input.severity === 'High' ? 1.35 : input.severity === 'Medium' ? 1.1 : input.severity === 'Low' ? 0.85 : 1.15;

  // Operational consumption norms per family / resident over a 24h emergency window
  const effectivePop = Math.max(input.affectedPopulation, input.affectedFamilies * 4);
  const waterRequired = Math.round(effectivePop * 4 * severityFactor); // 4L per person/day scaled
  const foodRequired = Math.round(input.affectedFamilies * 6 * severityFactor); // 6 packets per family/day
  const medicalRequired = Math.round((effectivePop / 12) * severityFactor);
  const shelterRequired = Math.round(effectivePop * 0.45 * severityFactor);

  const waterShortage = Math.max(0, waterRequired - input.availableWater);
  const foodShortage = Math.max(0, foodRequired - input.availableFood);
  const medicalShortage = Math.max(0, medicalRequired - input.availableMedical);
  const shelterOverflow = Math.max(0, shelterRequired - input.reliefCentreCapacity);

  // Road accessibility delay modeling (100% road access = 0.8h baseline, 40% = ~3.5h delay)
  const accessRatio = Math.max(10, Math.min(100, input.roadAccessibilityPct)) / 100;
  const accessibilityPenaltyFactor = Number((1 / accessRatio).toFixed(2));
  const estimatedDeliveryDelayHours = Number((0.75 * accessibilityPenaltyFactor * severityFactor).toFixed(1));

  // Volunteer coverage: 1 volunteer coordinates ~25 families in flood conditions
  const requiredVolunteers = Math.max(1, Math.ceil(input.affectedFamilies / 25));
  const volunteerCoveragePct = Math.min(100, Math.round((input.volunteerCount / requiredVolunteers) * 100));

  const recommendedStrategy: string[] = [];
  if (waterShortage > 0) {
    recommendedStrategy.push(`Procure ${waterShortage.toLocaleString()} additional litres of drinking water via regional tanker mutual aid.`);
  }
  if (foodShortage > 0) {
    recommendedStrategy.push(`Dispatch ${foodShortage.toLocaleString()} emergency food packets from nearest unaffected district warehouses.`);
  }
  if (medicalShortage > 0) {
    recommendedStrategy.push(`Escalate ${medicalShortage.toLocaleString()} medical kits and deploy mobile triage teams.`);
  }
  if (input.roadAccessibilityPct < 55) {
    recommendedStrategy.push(`Road accessibility at ${input.roadAccessibilityPct}% triggers boat/amphibious rerouting and staging hubs near Velachery/Adyar.`);
  }
  if (shelterOverflow > 0) {
    recommendedStrategy.push(`Open overflow school shelters for ${shelterOverflow.toLocaleString()} displaced residents.`);
  }
  if (volunteerCoveragePct < 75) {
    recommendedStrategy.push(`Volunteer coverage at ${volunteerCoveragePct}%: mobilize ${requiredVolunteers - input.volunteerCount} additional field volunteers.`);
  }
  if (recommendedStrategy.length === 0) {
    recommendedStrategy.push('Current resources and field access sustain projected 24-hour operational demand within nominal buffer.');
  }

  return {
    input,
    demand: {
      waterRequired,
      foodRequired,
      medicalRequired,
      shelterRequired,
    },
    shortages: {
      waterShortage,
      foodShortage,
      medicalShortage,
      shelterOverflow,
    },
    operationalImpact: {
      estimatedDeliveryDelayHours,
      accessibilityPenaltyFactor,
      volunteerCoveragePct,
      recommendedStrategy,
    },
  };
}
