import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from './db.ts';
import { logAudit, createNotification } from './services/trustshieldService.ts';
import { generateDemandPredictions } from './services/predictionService.ts';

export function seedDatabaseIfEmpty(): void {
  const userCount = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }).cnt;
  if (userCount > 0) return;

  console.log('Seeding CrisisWeave Simulated Chennai Flood Scenario...');

  // 1. Scenario
  db.prepare(`
    INSERT INTO scenarios (id, name, region, disaster_type, status, is_simulated)
    VALUES (1, 'Simulated Chennai Flood Scenario 2026', 'Chennai Metropolitan Area, Tamil Nadu', 'Flood', 'Active', 1)
  `).run();

  // 2. Resources
  const resourcesList = [
    ['Drinking Water', 'Hydration', 'litres'],
    ['Food Packets', 'Nutrition', 'packets'],
    ['Medical Kits', 'Healthcare', 'kits'],
    ['Medicines', 'Healthcare', 'boxes'],
    ['Blankets', 'Shelter', 'units'],
    ['Shelter Materials', 'Shelter', 'kits'],
    ['Clothes', 'Relief', 'sets'],
    ['Rescue Equipment', 'Operations', 'sets'],
  ];
  const insertRes = db.prepare('INSERT INTO resources (resource_name, category, unit) VALUES (?, ?, ?)');
  for (const r of resourcesList) insertRes.run(r[0], r[1], r[2]);

  const resMap = new Map<string, number>();
  for (const row of db.prepare('SELECT id, resource_name FROM resources').all() as Array<{ id: number; resource_name: string }>) {
    resMap.set(row.resource_name, row.id);
  }

  // 3. Users across all 5 roles
  const hash = (pw: string) => bcrypt.hashSync(pw, 10);
  const insertUser = db.prepare(`
    INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)
  `);

  const adminId = Number(insertUser.run('Dr. Kavitha Subramanian', 'coordinator@crisisweave.org', '+91-98400-10001', hash('CrisisAdmin@2026'), 'admin').lastInsertRowid);
  const citizen1Id = Number(insertUser.run('Ananya Krishnan', 'ananya.citizen@example.org', '+91-98401-20011', hash('Citizen@2026'), 'citizen').lastInsertRowid);
  const citizen2Id = Number(insertUser.run('Karthik Sundaram', 'karthik.resident@example.org', '+91-98401-20012', hash('Citizen@2026'), 'citizen').lastInsertRowid);
  const ngo1UserId = Number(insertUser.run('Rajeshwari Iyer (TN Flood Trust)', 'chennai.relief@ngo.org', '+91-98402-30001', hash('Ngo@2026'), 'ngo').lastInsertRowid);
  const ngo2UserId = Number(insertUser.run('Suresh Babu (Adyar Aid)', 'coastal.aid@ngo.org', '+91-98402-30002', hash('Ngo@2026'), 'ngo').lastInsertRowid);
  const ngo3UserId = Number(insertUser.run('Meena Natarajan (Anna Care)', 'anna.care@ngo.org', '+91-98402-30003', hash('Ngo@2026'), 'ngo').lastInsertRowid);
  const vol1UserId = Number(insertUser.run('Vikramaditya R.', 'vikram.vol@example.org', '+91-98403-40001', hash('Volunteer@2026'), 'volunteer').lastInsertRowid);
  const vol2UserId = Number(insertUser.run('Deepika Mohan', 'deepika.vol@example.org', '+91-98403-40002', hash('Volunteer@2026'), 'volunteer').lastInsertRowid);
  const hospUserId = Number(insertUser.run('Dr. Arvind Narayanan (Metro Hospital)', 'apollo.med@hospital.org', '+91-98404-50001', hash('Hospital@2026'), 'hospital').lastInsertRowid);

  // 4. Organisations (NGOs, Hospital, Relief Centres)
  const insertOrg = db.prepare(`
    INSERT INTO organisations (user_id, organisation_name, organisation_type, address, latitude, longitude, contact_number, verification_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'Verified')
  `);
  const ngo1OrgId = Number(insertOrg.run(ngo1UserId, 'Tamil Nadu Flood Relief Trust', 'NGO', 'T. Nagar Depot, Chennai (Simulated)', 13.0418, 80.2341, '+91-98402-30001').lastInsertRowid);
  const ngo2OrgId = Number(insertOrg.run(ngo2UserId, 'Adyar Coastal Aid Foundation', 'NGO', 'Adyar LB Road Hub, Chennai (Simulated)', 13.0012, 80.2565, '+91-98402-30002').lastInsertRowid);
  const ngo3OrgId = Number(insertOrg.run(ngo3UserId, 'Anna Nagar Humanitarian Collective', 'NGO', 'Anna Nagar 2nd Ave, Chennai (Simulated)', 13.0850, 80.2101, '+91-98402-30003').lastInsertRowid);
  const hospOrgId = Number(insertOrg.run(hospUserId, 'Chennai Metro Relief Hospital', 'Hospital', 'Greams Road Medical Zone, Chennai (Simulated)', 13.0604, 80.2535, '+91-98404-50001').lastInsertRowid);
  insertOrg.run(adminId, 'Guindy Central Relief Shelter', 'Relief Centre', 'Guindy Industrial Campus, Chennai (Simulated)', 13.0067, 80.2206, '+91-98400-10099');

  db.prepare(`
    INSERT INTO hospital_profiles (organisation_id, total_beds, available_beds, icu_beds_available, emergency_ward_status)
    VALUES (?, 180, 42, 8, 'Operational - Flood Trauma Triage')
  `).run(hospOrgId);

  // 5. Volunteers
  const vol1Id = Number(
    db.prepare(`
      INSERT INTO volunteers (user_id, skills, availability, current_location, latitude, longitude, experience)
      VALUES (?, 'Swift-water rescue, first aid, boat logistics', 'Available', 'Velachery Sector 2, Chennai', 12.9815, 80.2180, '4 years NDRF volunteer reserve')
    `).run(vol1UserId).lastInsertRowid
  );
  const vol2Id = Number(
    db.prepare(`
      INSERT INTO volunteers (user_id, skills, availability, current_location, latitude, longitude, experience)
      VALUES (?, 'Medical triage, relief distribution, Tamil/English coordination', 'Available', 'Saidapet Bridge Hub, Chennai', 13.0213, 80.2231, '3 years community health logistics')
    `).run(vol2UserId).lastInsertRowid
  );

  // 6. NGO Inventory (Realistic stock split to showcase Optimiser vs FCFS)
  const insertInv = db.prepare('INSERT INTO inventory (organisation_id, resource_id, quantity_available) VALUES (?, ?, ?)');
  // NGO 1 (T. Nagar): strong on water & medical kits
  insertInv.run(ngo1OrgId, resMap.get('Drinking Water'), 350);
  insertInv.run(ngo1OrgId, resMap.get('Food Packets'), 160);
  insertInv.run(ngo1OrgId, resMap.get('Medical Kits'), 45);
  insertInv.run(ngo1OrgId, resMap.get('Blankets'), 120);
  // NGO 2 (Adyar - closest to Velachery): strong on water & rescue equipment
  insertInv.run(ngo2OrgId, resMap.get('Drinking Water'), 300);
  insertInv.run(ngo2OrgId, resMap.get('Food Packets'), 220);
  insertInv.run(ngo2OrgId, resMap.get('Rescue Equipment'), 14);
  insertInv.run(ngo2OrgId, resMap.get('Shelter Materials'), 35);
  // NGO 3 (Anna Nagar - farther north): large food & medicine stocks
  insertInv.run(ngo3OrgId, resMap.get('Drinking Water'), 450);
  insertInv.run(ngo3OrgId, resMap.get('Food Packets'), 400);
  insertInv.run(ngo3OrgId, resMap.get('Medicines'), 80);
  insertInv.run(ngo3OrgId, resMap.get('Medical Kits'), 30);
  insertInv.run(ngo3OrgId, resMap.get('Clothes'), 200);

  // 7. Verified & Active Incidents (Simulated Chennai Flood Locations)
  const insertIncident = db.prepare(`
    INSERT INTO incidents (scenario_id, incident_name, disaster_type, location_name, description, latitude, longitude, affected_people, severity, status, is_simulated)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', 1)
  `);
  const inc1Id = Number(insertIncident.run(
    'Velachery Ward 172 Waterlogging (Simulated)',
    'Flood',
    'Velachery 100 Feet Road, Chennai',
    'Waist-deep floodwater cutting off 20+ ground-floor families; elderly residents require drinking water, food packets, and evacuation support.',
    12.9784,
    80.2212,
    84,
    'Critical'
  ).lastInsertRowid);

  const inc2Id = Number(insertIncident.run(
    'Mudichur Low-Lying Medical Cluster (Simulated)',
    'Medical emergency',
    'Mudichur Main Road, Tambaram West',
    'Submerged residential lane with diabetic & pregnant patients needing insulin, medical kits, and potable water.',
    12.9125,
    80.0725,
    65,
    'Critical'
  ).lastInsertRowid);

  const inc3Id = Number(insertIncident.run(
    'Saidapet Adyar Riverbank Overflow (Simulated)',
    'Shelter requirement',
    'Saidapet Causeway Zone, Chennai',
    'Riverbank overflow displaced 45 residents to community hall; blankets and food rations requested.',
    13.0213,
    80.2231,
    45,
    'High'
  ).lastInsertRowid);

  const inc4Id = Number(insertIncident.run(
    'Kotturpuram Submersible Bridge Access (Simulated)',
    'Rescue requirement',
    'Kotturpuram Canal Road, Chennai',
    '30 commuters and shopkeepers stranded on upper floors due to rapid canal surge.',
    13.0169,
    80.2421,
    30,
    'Medium'
  ).lastInsertRowid);

  // 8. Emergency Reports (including Pending AI-analyzed report + Potential Duplicate + TrustShield flagged report)
  const insertReport = db.prepare(`
    INSERT INTO emergency_reports (
      user_id, disaster_type, location_name, description, latitude, longitude,
      affected_people, vulnerable_present, urgency, requested_resources,
      ai_category, ai_priority, ai_score, ai_explanation, ai_extracted_json,
      duplicate_score, matched_incident_id, linked_incident_id, verification_status, security_flag
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const rep1Id = Number(insertReport.run(
    citizen1Id,
    'Flood',
    'Velachery 100 Feet Road, Chennai',
    '20 families trapped in ground floor apartments near Velachery bypass with rising water. Need drinking water and food packets urgently, elderly patients inside.',
    12.9784,
    80.2212,
    84,
    1,
    'Immediate',
    JSON.stringify([{ resourceName: 'Drinking Water', quantity: 500 }, { resourceName: 'Food Packets', quantity: 200 }]),
    'Rescue requirement',
    'Critical',
    92,
    'Critical priority suggested because the report mentions trapped families, elderly residents, rising floodwater, and urgent drinking water & food requirements.',
    JSON.stringify({ keywords: ['trapped', 'velachery', 'elderly', 'drinking water', 'food'], indicators: ['Life-threatening entrapment', 'Vulnerable residents'] }),
    0,
    null,
    inc1Id,
    'Verified',
    'Normal'
  ).lastInsertRowid);

  db.prepare('INSERT INTO incident_reports (incident_id, report_id, similarity_score) VALUES (?, ?, 1.0)').run(inc1Id, rep1Id);

  // Potential Duplicate report submitted by another citizen near Velachery (Pending Coordinator Review)
  const rep2Id = Number(insertReport.run(
    citizen2Id,
    'Flood',
    'Velachery Vijayanagar Junction, Chennai',
    'Floodwater rising around Vijayanagar Velachery flats; about 18 families stranded without clean drinking water or food since morning.',
    12.9792,
    80.2205,
    72,
    1,
    'Immediate',
    JSON.stringify([{ resourceName: 'Drinking Water', quantity: 350 }, { resourceName: 'Food Packets', quantity: 150 }]),
    'Drinking water shortage',
    'Critical',
    86,
    'Critical priority suggested because multiple stranded families lack potable water in an active flood zone.',
    JSON.stringify({ keywords: ['velachery', 'stranded', 'drinking water', 'floodwater'], indicators: ['Multiple families affected', 'Active flood zone'] }),
    84,
    inc1Id,
    null,
    'Pending',
    'Normal'
  ).lastInsertRowid);

  // New pending medical/flood report from Pallikaranai
  const rep3Id = Number(insertReport.run(
    citizen1Id,
    'Medical emergency',
    'Pallikaranai Marsh Edge, Chennai',
    '12 elderly residents at Pallikaranai care home cut off by flooded approach road; running out of insulin, medical kits, and clean water.',
    12.9420,
    80.2088,
    24,
    1,
    'Immediate',
    JSON.stringify([{ resourceName: 'Medical Kits', quantity: 15 }, { resourceName: 'Drinking Water', quantity: 150 }]),
    'Medical emergency',
    'Critical',
    91,
    'Critical priority suggested because vulnerable elderly residents are isolated with acute insulin and medical kit shortages.',
    JSON.stringify({ keywords: ['elderly', 'pallikaranai', 'insulin', 'medical kits'], indicators: ['Vulnerable residents', 'Access constraint'] }),
    0,
    null,
    null,
    'Pending',
    'Normal'
  ).lastInsertRowid);

  // TrustShield Flagged Report (Repeated evidence hash simulation)
  const sampleEvidenceHash = crypto.createHash('sha256').update('simulated-chennai-flood-evidence-01').digest('hex');
  const rep4Id = Number(insertReport.run(
    citizen2Id,
    'Food shortage',
    'Tondiarpet Harbour Lane, Chennai',
    'Requesting 800 food packets and 1000 water bottles for local shelter.',
    13.1260,
    80.2890,
    180,
    0,
    'High',
    JSON.stringify([{ resourceName: 'Food Packets', quantity: 800 }, { resourceName: 'Drinking Water', quantity: 1000 }]),
    'Food shortage',
    'High',
    71,
    'High priority suggested based on large reported group size; flagged by TrustShield due to repeated evidence signature.',
    JSON.stringify({ keywords: ['tondiarpet', 'shelter', 'food packets'], indicators: ['Large reported group'] }),
    0,
    null,
    null,
    'Pending',
    'Suspicious'
  ).lastInsertRowid);

  db.prepare(`
    INSERT INTO report_evidence (report_id, file_name, file_hash, perceptual_hash, file_type, file_size, is_duplicate_hash)
    VALUES (?, 'velachery_waterlogging_01.jpg', ?, '1100101011001010', 'image/jpeg', 248320, 0)
  `).run(rep1Id, sampleEvidenceHash);

  db.prepare(`
    INSERT INTO report_evidence (report_id, file_name, file_hash, perceptual_hash, file_type, file_size, is_duplicate_hash)
    VALUES (?, 'harbour_shelter_photo.jpg', ?, '1100101011001010', 'image/jpeg', 248320, 1)
  `).run(rep4Id, sampleEvidenceHash);

  db.prepare(`
    INSERT INTO anomaly_flags (report_id, entity_type, entity_id, flag_type, risk_level, description, review_status)
    VALUES (?, 'emergency_report', ?, 'Repeated Evidence Hash', 'Suspicious', 'Uploaded image SHA-256 hash matches Report #1 evidence file (velachery_waterlogging_01.jpg). Flagged for manual coordinator review.', 'Open')
  `).run(rep4Id, rep4Id);

  db.prepare(`
    INSERT INTO anomaly_flags (report_id, entity_type, entity_id, flag_type, risk_level, description, review_status)
    VALUES (?, 'emergency_report', ?, 'High Similarity Proximity Match', 'Needs Review', '84% textual and spatial similarity (0.12 km) to Verified Incident #1 (Velachery Ward 172). Suggested duplicate link.', 'Open')
  `).run(rep2Id, rep2Id);

  // 9. Resource Requests (including the classic 500 water / 200 food example!)
  const insertReq = db.prepare(`
    INSERT INTO resource_requests (incident_id, organisation_id, resource_id, quantity_required, quantity_fulfilled, priority, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const req1Id = Number(insertReq.run(inc1Id, null, resMap.get('Drinking Water'), 500, 0, 'Critical', 'Open').lastInsertRowid);
  insertReq.run(inc1Id, null, resMap.get('Food Packets'), 200, 0, 'Critical', 'Open');
  insertReq.run(inc2Id, null, resMap.get('Medical Kits'), 30, 0, 'Critical', 'Open');
  insertReq.run(inc2Id, null, resMap.get('Drinking Water'), 250, 0, 'Critical', 'Open');
  const req5Id = Number(insertReq.run(inc3Id, null, resMap.get('Blankets'), 90, 90, 'High', 'Fulfilled').lastInsertRowid);
  insertReq.run(inc4Id, null, resMap.get('Rescue Equipment'), 6, 0, 'Medium', 'Open');
  // Hospital medical supply request
  insertReq.run(null, hospOrgId, resMap.get('Medicines'), 40, 0, 'High', 'Open');

  // 10. Pre-seeded Completed Allocation & Active Shipment for Delivery Tracking Demo
  const allocCompletedId = Number(
    db.prepare(`
      INSERT INTO allocations (request_id, organisation_id, resource_id, allocated_quantity, distance_km, optimization_score, approved_by, status)
      VALUES (?, ?, ?, 90, 2.35, 71.5, ?, 'Completed')
    `).run(req5Id, ngo1OrgId, resMap.get('Blankets'), adminId).lastInsertRowid
  );

  const ship1Id = Number(
    db.prepare(`
      INSERT INTO shipments (allocation_id, shipment_code, volunteer_id, dispatched_at, delivered_at, status, received_quantity, notes)
      VALUES (?, 'CW-CHN-2026-0041', ?, datetime('now', '-3 hours'), datetime('now', '-1 hours'), 'Delivered', 90, 'Delivered to Saidapet Community Hall relief coordinator.')
    `).run(allocCompletedId, vol2Id).lastInsertRowid
  );

  // Active In-Transit Allocation + Shipment
  const reqTransitId = Number(insertReq.run(inc1Id, null, resMap.get('Rescue Equipment'), 4, 0, 'Critical', 'Allocated').lastInsertRowid);
  const allocTransitId = Number(
    db.prepare(`
      INSERT INTO allocations (request_id, organisation_id, resource_id, allocated_quantity, distance_km, optimization_score, approved_by, status)
      VALUES (?, ?, ?, 4, 4.58, 93.1, ?, 'Dispatched')
    `).run(reqTransitId, ngo2OrgId, resMap.get('Rescue Equipment'), adminId).lastInsertRowid
  );
  const ship2Id = Number(
    db.prepare(`
      INSERT INTO shipments (allocation_id, shipment_code, volunteer_id, dispatched_at, status, received_quantity, notes)
      VALUES (?, 'CW-CHN-2026-0042', ?, datetime('now', '-25 minutes'), 'In Transit', 0, 'Inflatable rescue boat and life jackets en route via Adyar bridge.')
    `).run(allocTransitId, vol1Id).lastInsertRowid
  );

  // 11. Volunteer Assignments
  db.prepare(`
    INSERT INTO assignments (volunteer_id, incident_id, shipment_id, task_description, status)
    VALUES (?, ?, ?, 'Deliver 4 Rescue Equipment sets from Adyar Coastal Aid Hub to Velachery Ward 172 and confirm handover.', 'In Progress')
  `).run(vol1Id, inc1Id, ship2Id);

  db.prepare(`
    INSERT INTO assignments (volunteer_id, incident_id, shipment_id, task_description, status, completed_at)
    VALUES (?, ?, ?, 'Delivered 90 blankets to Saidapet Community Shelter.', 'Completed', datetime('now', '-1 hours'))
  `).run(vol2Id, inc3Id, ship1Id);

  db.prepare(`
    INSERT INTO assignments (volunteer_id, incident_id, shipment_id, task_description, status)
    VALUES (NULL, ?, NULL, 'Assist medical triage team at Mudichur Low-Lying Settlement with rapid water & ORS distribution.', 'Available')
  `).run(inc2Id);

  // 12. Initial Predictions (12h)
  generateDemandPredictions('12h');

  // 13. Audit Logs & Notifications
  logAudit({
    actorId: adminId,
    actorName: 'Dr. Kavitha Subramanian',
    actorRole: 'admin',
    action: 'VERIFIED_INCIDENT',
    entityType: 'incident',
    entityId: inc1Id,
    previousValue: { status: 'Pending' },
    newValue: { status: 'Verified', severity: 'Critical' },
    decisionInfo: 'Verified Velachery Ward 172 flood entrapment from Report #1.',
  });
  logAudit({
    actorId: adminId,
    actorName: 'Dr. Kavitha Subramanian',
    actorRole: 'admin',
    action: 'APPROVED_ALLOCATION',
    entityType: 'allocation',
    entityId: allocTransitId,
    previousValue: { status: 'Recommended' },
    newValue: { status: 'Dispatched', quantity: 4 },
    decisionInfo: 'Approved rescue equipment dispatch from Adyar Coastal Aid Foundation.',
  });

  createNotification({
    roleTarget: 'admin',
    title: 'TrustShield Security Alert',
    message: `Report #${rep4Id} flagged for repeated SHA-256 evidence hash. Manual review requested.`,
    type: 'warning',
    entityType: 'emergency_report',
    entityId: rep4Id,
  });
  createNotification({
    userId: citizen1Id,
    title: 'Report Verified & Rescue Dispatched',
    message: 'Your Velachery report was verified as Critical. Rescue shipment CW-CHN-2026-0042 is In Transit.',
    type: 'success',
    entityType: 'shipment',
    entityId: ship2Id,
  });
  createNotification({
    userId: vol1UserId,
    title: 'Active Shipment Assignment',
    message: 'Shipment CW-CHN-2026-0042 is assigned to you for Velachery Ward 172 delivery confirmation.',
    type: 'info',
    entityType: 'shipment',
    entityId: ship2Id,
  });
}
