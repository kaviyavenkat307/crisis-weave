export type UserRole = 'citizen' | 'ngo' | 'volunteer' | 'hospital' | 'admin';

export type PriorityLevel = 'Critical' | 'High' | 'Medium' | 'Low';

export type VerificationStatus = 'Pending' | 'Verified' | 'Rejected' | 'Duplicate Linked';

export type SecurityRiskLevel = 'Normal' | 'Needs Review' | 'Suspicious';

export type ShipmentStatus =
  | 'Pending'
  | 'Approved'
  | 'Preparing'
  | 'Dispatched'
  | 'In Transit'
  | 'Delivered'
  | 'Partially Delivered'
  | 'Cancelled';

export interface User {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  role: UserRole;
  is_active: number;
  created_at: string;
  organisation?: Organisation | null;
  volunteer?: VolunteerProfile | null;
}

export interface Organisation {
  id: number;
  user_id: number;
  organisation_name: string;
  organisation_type: 'NGO' | 'Hospital' | 'Relief Centre';
  address: string;
  latitude: number;
  longitude: number;
  contact_number: string;
  verification_status: 'Verified' | 'Pending' | 'Suspended';
  hospital_profile?: HospitalProfile | null;
}

export interface HospitalProfile {
  id: number;
  organisation_id: number;
  total_beds: number;
  available_beds: number;
  icu_beds_available: number;
  emergency_ward_status: string;
  updated_at: string;
}

export interface VolunteerProfile {
  id: number;
  user_id: number;
  skills: string;
  availability: 'Available' | 'On Mission' | 'Offline';
  current_location: string;
  latitude: number;
  longitude: number;
  experience: string;
}

export interface AIExtraction {
  locationName: string;
  category: string;
  requestedResources: Array<{ resourceName: string; quantity: number; unit: string }>;
  affectedPeople: number;
  urgencyIndicators: string[];
  keywords: string[];
  priority: PriorityLevel;
  priorityScore: number;
  explanation: string;
  modelUsed: string;
}

export interface DuplicateCandidate {
  reportId: number;
  incidentId: number | null;
  similarityScore: number;
  distanceKm: number;
  hoursApart: number;
  reason: string;
  descriptionSnippet: string;
}

export interface EmergencyReport {
  id: number;
  user_id: number;
  reporter_name?: string;
  disaster_type: string;
  location_name: string;
  description: string;
  latitude: number;
  longitude: number;
  affected_people: number;
  vulnerable_present: number;
  urgency: string;
  requested_resources: string; // JSON string
  ai_category: string;
  ai_priority: PriorityLevel;
  ai_score: number;
  ai_explanation: string;
  ai_extracted_json: string;
  duplicate_score: number;
  matched_incident_id: number | null;
  linked_incident_id: number | null;
  verification_status: VerificationStatus;
  security_flag: SecurityRiskLevel;
  idempotency_key?: string | null;
  created_at: string;
  evidence?: ReportEvidence[];
  anomalies?: AnomalyFlag[];
}

export interface ReportEvidence {
  id: number;
  report_id: number;
  file_name: string;
  file_hash: string;
  perceptual_hash: string;
  file_type: string;
  file_size: number;
  data_url?: string;
  is_duplicate_hash: number;
  uploaded_at: string;
}

export interface Incident {
  id: number;
  scenario_id: number;
  incident_name: string;
  disaster_type: string;
  location_name: string;
  description: string;
  latitude: number;
  longitude: number;
  affected_people: number;
  severity: PriorityLevel;
  status: 'Active' | 'Monitoring' | 'Resolved';
  is_simulated: number;
  created_at: string;
  report_count?: number;
  requests?: ResourceRequest[];
}

export interface AnomalyFlag {
  id: number;
  report_id: number | null;
  entity_type: string;
  entity_id: number;
  flag_type: string;
  risk_level: SecurityRiskLevel;
  description: string;
  review_status: 'Open' | 'Cleared' | 'Escalated';
  reviewed_by: number | null;
  review_notes: string | null;
  created_at: string;
}

export interface Resource {
  id: number;
  resource_name: string;
  category: string;
  unit: string;
}

export interface InventoryItem {
  id: number;
  organisation_id: number;
  organisation_name?: string;
  organisation_type?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  resource_id: number;
  resource_name?: string;
  category?: string;
  unit?: string;
  quantity_available: number;
  updated_at: string;
}

export interface ResourceRequest {
  id: number;
  incident_id: number | null;
  incident_name?: string;
  location_name?: string;
  latitude?: number;
  longitude?: number;
  organisation_id: number | null;
  organisation_name?: string;
  resource_id: number;
  resource_name?: string;
  unit?: string;
  quantity_required: number;
  quantity_fulfilled: number;
  priority: PriorityLevel;
  status: 'Open' | 'Allocated' | 'Partially Fulfilled' | 'Fulfilled';
  created_at: string;
}

export interface Allocation {
  id: number;
  request_id: number;
  organisation_id: number;
  organisation_name?: string;
  resource_id: number;
  resource_name?: string;
  unit?: string;
  incident_name?: string;
  location_name?: string;
  allocated_quantity: number;
  distance_km: number;
  optimization_score: number;
  approved_by: number | null;
  status: 'Recommended' | 'Approved' | 'Rejected' | 'Dispatched' | 'Completed';
  created_at: string;
}

export interface OptimisationComparison {
  recommendations: Array<{
    requestId: number;
    incidentName: string;
    resourceId: number;
    resourceName: string;
    unit: string;
    priority: PriorityLevel;
    requestedQuantity: number;
    availableQuantity: number;
    recommendedAllocations: Array<{
      organisationId: number;
      organisationName: string;
      quantity: number;
      distanceKm: number;
      remainingStock: number;
    }>;
    totalRecommended: number;
    unmetDemand: number;
  }>;
  metrics: {
    optimiser: {
      criticalFulfillmentPct: number;
      overallFulfillmentPct: number;
      avgDistanceKm: number;
      unmetCriticalUnits: number;
      totalAllocatedUnits: number;
    };
    fcfsBaseline: {
      criticalFulfillmentPct: number;
      overallFulfillmentPct: number;
      avgDistanceKm: number;
      unmetCriticalUnits: number;
      totalAllocatedUnits: number;
    };
    efficiencyGainPct: number;
    distanceSavedKm: number;
  };
}

export interface Shipment {
  id: number;
  allocation_id: number;
  shipment_code: string;
  volunteer_id: number | null;
  volunteer_name?: string;
  organisation_name?: string;
  resource_name?: string;
  unit?: string;
  allocated_quantity?: number;
  incident_name?: string;
  location_name?: string;
  dispatched_at: string | null;
  delivered_at: string | null;
  status: ShipmentStatus;
  received_quantity: number;
  notes: string | null;
  created_at: string;
}

export interface VolunteerAssignment {
  id: number;
  volunteer_id: number;
  volunteer_name?: string;
  incident_id: number;
  incident_name?: string;
  location_name?: string;
  shipment_id: number | null;
  shipment_code?: string | null;
  task_description: string;
  status: 'Available' | 'Assigned' | 'In Progress' | 'Completed' | 'Declined';
  assigned_at: string;
  completed_at: string | null;
}

export interface DemandPrediction {
  id: number;
  resource_id: number;
  resource_name: string;
  unit: string;
  prediction_period: '6h' | '12h' | '24h';
  current_demand: number;
  estimated_additional: number;
  predicted_quantity: number;
  available_inventory: number;
  expected_shortage: number;
  confidence: number;
  uncertainty_margin: string;
  assumptions: string;
  created_at: string;
}

export interface SimulationInput {
  scenarioName: string;
  severity: 'Low' | 'Medium' | 'High' | 'Custom';
  affectedPopulation: number;
  affectedFamilies: number;
  availableWater: number;
  availableFood: number;
  availableMedical: number;
  roadAccessibilityPct: number;
  volunteerCount: number;
  reliefCentreCapacity: number;
}

export interface SimulationResult {
  input: SimulationInput;
  demand: {
    waterRequired: number;
    foodRequired: number;
    medicalRequired: number;
    shelterRequired: number;
  };
  shortages: {
    waterShortage: number;
    foodShortage: number;
    medicalShortage: number;
    shelterOverflow: number;
  };
  operationalImpact: {
    estimatedDeliveryDelayHours: number;
    accessibilityPenaltyFactor: number;
    volunteerCoveragePct: number;
    recommendedStrategy: string[];
  };
}

export interface AuditLog {
  id: number;
  actor_id: number | null;
  actor_name: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: number | null;
  previous_value: string | null;
  new_value: string | null;
  decision_info: string | null;
  created_at: string;
}

export interface AppNotification {
  id: number;
  user_id: number | null;
  role_target: string | null;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'critical' | 'success';
  is_read: number;
  entity_type: string | null;
  entity_id: number | null;
  created_at: string;
}

export interface OfflineReportDraft {
  clientReportId: string;
  idempotencyKey: string;
  disasterType: string;
  locationName: string;
  description: string;
  latitude: number;
  longitude: number;
  affectedPeople: number;
  vulnerablePresent: boolean;
  urgency: string;
  requestedResources: Array<{ resourceName: string; quantity: number }>;
  evidenceName?: string;
  evidenceType?: string;
  evidenceDataUrl?: string;
  syncStatus: 'Saved Offline' | 'Pending Sync' | 'Syncing' | 'Synced' | 'Sync Failed';
  errorMessage?: string;
  createdAt: string;
  syncedReportId?: number;
}
