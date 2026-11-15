import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dataDir = path.resolve(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'crisisweave.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scenarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      region TEXT NOT NULL,
      disaster_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Active',
      is_simulated INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('citizen','ngo','volunteer','hospital','admin')),
      is_active INTEGER NOT NULL DEFAULT 1,
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS organisations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      organisation_name TEXT NOT NULL,
      organisation_type TEXT NOT NULL CHECK(organisation_type IN ('NGO','Hospital','Relief Centre')),
      address TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      contact_number TEXT NOT NULL,
      verification_status TEXT NOT NULL DEFAULT 'Verified',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS hospital_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organisation_id INTEGER NOT NULL UNIQUE,
      total_beds INTEGER NOT NULL DEFAULT 120,
      available_beds INTEGER NOT NULL DEFAULT 34,
      icu_beds_available INTEGER NOT NULL DEFAULT 6,
      emergency_ward_status TEXT NOT NULL DEFAULT 'Operational - Surge Level 2',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS volunteers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      skills TEXT NOT NULL,
      availability TEXT NOT NULL DEFAULT 'Available',
      current_location TEXT NOT NULL,
      latitude REAL NOT NULL DEFAULT 13.0827,
      longitude REAL NOT NULL DEFAULT 80.2707,
      experience TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scenario_id INTEGER NOT NULL DEFAULT 1,
      incident_name TEXT NOT NULL,
      disaster_type TEXT NOT NULL,
      location_name TEXT NOT NULL,
      description TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      affected_people INTEGER NOT NULL DEFAULT 0,
      severity TEXT NOT NULL CHECK(severity IN ('Critical','High','Medium','Low')),
      status TEXT NOT NULL DEFAULT 'Active',
      is_simulated INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (scenario_id) REFERENCES scenarios(id)
    );

    CREATE TABLE IF NOT EXISTS emergency_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      disaster_type TEXT NOT NULL,
      location_name TEXT NOT NULL,
      description TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      affected_people INTEGER NOT NULL DEFAULT 1,
      vulnerable_present INTEGER NOT NULL DEFAULT 0,
      urgency TEXT NOT NULL,
      requested_resources TEXT NOT NULL DEFAULT '[]',
      ai_category TEXT NOT NULL,
      ai_priority TEXT NOT NULL CHECK(ai_priority IN ('Critical','High','Medium','Low')),
      ai_score INTEGER NOT NULL DEFAULT 50,
      ai_explanation TEXT NOT NULL,
      ai_extracted_json TEXT NOT NULL DEFAULT '{}',
      duplicate_score REAL NOT NULL DEFAULT 0,
      matched_incident_id INTEGER,
      linked_incident_id INTEGER,
      verification_status TEXT NOT NULL DEFAULT 'Pending',
      security_flag TEXT NOT NULL DEFAULT 'Normal',
      idempotency_key TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (matched_incident_id) REFERENCES incidents(id),
      FOREIGN KEY (linked_incident_id) REFERENCES incidents(id)
    );

    CREATE TABLE IF NOT EXISTS incident_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id INTEGER NOT NULL,
      report_id INTEGER NOT NULL,
      similarity_score REAL NOT NULL DEFAULT 1.0,
      FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
      FOREIGN KEY (report_id) REFERENCES emergency_reports(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS report_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_hash TEXT NOT NULL,
      perceptual_hash TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      data_url TEXT,
      is_duplicate_hash INTEGER NOT NULL DEFAULT 0,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (report_id) REFERENCES emergency_reports(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS verification_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL,
      reviewer_id INTEGER NOT NULL,
      decision TEXT NOT NULL,
      reason TEXT NOT NULL,
      reviewed_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (report_id) REFERENCES emergency_reports(id) ON DELETE CASCADE,
      FOREIGN KEY (reviewer_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS anomaly_flags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      flag_type TEXT NOT NULL,
      risk_level TEXT NOT NULL CHECK(risk_level IN ('Normal','Needs Review','Suspicious')),
      description TEXT NOT NULL,
      review_status TEXT NOT NULL DEFAULT 'Open',
      reviewed_by INTEGER,
      review_notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (report_id) REFERENCES emergency_reports(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      unit TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organisation_id INTEGER NOT NULL,
      resource_id INTEGER NOT NULL,
      quantity_available INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(organisation_id, resource_id),
      FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS resource_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id INTEGER,
      organisation_id INTEGER,
      resource_id INTEGER NOT NULL,
      quantity_required INTEGER NOT NULL,
      quantity_fulfilled INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL CHECK(priority IN ('Critical','High','Medium','Low')),
      status TEXT NOT NULL DEFAULT 'Open',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
      FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE SET NULL,
      FOREIGN KEY (resource_id) REFERENCES resources(id)
    );

    CREATE TABLE IF NOT EXISTS allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      organisation_id INTEGER NOT NULL,
      resource_id INTEGER NOT NULL,
      allocated_quantity INTEGER NOT NULL,
      distance_km REAL NOT NULL DEFAULT 0,
      optimization_score REAL NOT NULL DEFAULT 0,
      approved_by INTEGER,
      status TEXT NOT NULL DEFAULT 'Recommended',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (request_id) REFERENCES resource_requests(id) ON DELETE CASCADE,
      FOREIGN KEY (organisation_id) REFERENCES organisations(id),
      FOREIGN KEY (resource_id) REFERENCES resources(id),
      FOREIGN KEY (approved_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS shipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      allocation_id INTEGER NOT NULL UNIQUE,
      shipment_code TEXT NOT NULL UNIQUE,
      volunteer_id INTEGER,
      dispatched_at TEXT,
      delivered_at TEXT,
      status TEXT NOT NULL DEFAULT 'Preparing',
      received_quantity INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (allocation_id) REFERENCES allocations(id) ON DELETE CASCADE,
      FOREIGN KEY (volunteer_id) REFERENCES volunteers(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      volunteer_id INTEGER,
      incident_id INTEGER NOT NULL,
      shipment_id INTEGER,
      task_description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Available',
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (volunteer_id) REFERENCES volunteers(id) ON DELETE SET NULL,
      FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
      FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id INTEGER,
      resource_id INTEGER NOT NULL,
      prediction_period TEXT NOT NULL,
      current_demand INTEGER NOT NULL,
      estimated_additional INTEGER NOT NULL,
      predicted_quantity INTEGER NOT NULL,
      available_inventory INTEGER NOT NULL,
      expected_shortage INTEGER NOT NULL,
      confidence REAL NOT NULL,
      uncertainty_margin TEXT NOT NULL,
      assumptions TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (resource_id) REFERENCES resources(id)
    );

    CREATE TABLE IF NOT EXISTS simulations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scenario_name TEXT NOT NULL,
      input_parameters TEXT NOT NULL,
      result_data TEXT NOT NULL,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER,
      actor_name TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      previous_value TEXT,
      new_value TEXT,
      decision_info TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      role_target TEXT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'info',
      is_read INTEGER NOT NULL DEFAULT 0,
      entity_type TEXT,
      entity_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_reports_user ON emergency_reports(user_id);
    CREATE INDEX IF NOT EXISTS idx_reports_status ON emergency_reports(verification_status);
    CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
    CREATE INDEX IF NOT EXISTS idx_inventory_org ON inventory(organisation_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_evidence_hash ON report_evidence(file_hash);
  `);
}
