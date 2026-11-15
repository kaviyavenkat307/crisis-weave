import express, { type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import type { Server as SocketIOServer } from 'socket.io';
import { db } from './db.ts';
import {
  analyzeEmergencyReport,
  detectDuplicateReports,
  haversineDistanceKm,
} from './services/aiService.ts';
import {
  checkLoginRateLimit,
  clearLoginRateLimit,
  createNotification,
  evaluateInventoryAnomaly,
  evaluateReportAnomalies,
  logAudit,
  signSessionToken,
  validateAndHashEvidence,
  verifySessionToken,
  type SessionPayload,
} from './services/trustshieldService.ts';
import { computeOptimisedAllocation } from './services/optimisationService.ts';
import { generateDemandPredictions } from './services/predictionService.ts';
import { runDigitalTwinSimulation } from './services/simulationService.ts';
import type { PriorityLevel, ShipmentStatus, SimulationInput, UserRole } from '../types.ts';

interface AuthedRequest extends Request {
  sessionUser?: SessionPayload;
}

function getAuthToken(req: Request): string | undefined {
  const cookieToken = req.cookies?.cw_session as string | undefined;
  if (cookieToken) return cookieToken;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  return undefined;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = getAuthToken(req);
  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  req.sessionUser = payload;
  next();
}

function requireRole(...roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.sessionUser) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!roles.includes(req.sessionUser.role)) {
      res.status(403).json({ error: `Access denied for role "${req.sessionUser.role}"` });
      return;
    }
    next();
  };
}

function hydrateUser(userId: number) {
  const user = db
    .prepare('SELECT id, full_name, email, phone, role, is_active, created_at FROM users WHERE id = ?')
    .get(userId) as Record<string, unknown> | undefined;
  if (!user) return null;

  const org = db.prepare('SELECT * FROM organisations WHERE user_id = ? LIMIT 1').get(userId) as
    | Record<string, unknown>
    | undefined;
  let hospitalProfile = null;
  if (org && org.organisation_type === 'Hospital') {
    hospitalProfile = db.prepare('SELECT * FROM hospital_profiles WHERE organisation_id = ?').get(org.id) || null;
  }
  const volunteer = db.prepare('SELECT * FROM volunteers WHERE user_id = ? LIMIT 1').get(userId) || null;

  return {
    ...user,
    organisation: org ? { ...org, hospital_profile: hospitalProfile } : null,
    volunteer,
  };
}

export function createApiRouter(io: SocketIOServer) {
  const router = express.Router();

  const emitNotification = (params: {
    userId?: number | null;
    roleTarget?: string | null;
    title: string;
    message: string;
    type?: 'info' | 'warning' | 'critical' | 'success';
    entityType?: string | null;
    entityId?: number | null;
  }) => {
    const id = createNotification(params);
    io.emit('notification:new', { id, ...params, created_at: new Date().toISOString(), is_read: 0 });
  };

  // ==================== PUBLIC OVERVIEW ====================
  router.get('/public/overview', (_req, res) => {
    const incidents = db
      .prepare(`
        SELECT id, incident_name, disaster_type, location_name, latitude, longitude, affected_people, severity, status, is_simulated, created_at
        FROM incidents WHERE status = 'Active' ORDER BY created_at DESC LIMIT 10
      `)
      .all();
    const orgs = db
      .prepare(`
        SELECT id, organisation_name, organisation_type, address, latitude, longitude
        FROM organisations WHERE verification_status = 'Verified'
      `)
      .all();
    const totals = {
      activeIncidents: (db.prepare(`SELECT COUNT(*) as c FROM incidents WHERE status = 'Active'`).get() as { c: number }).c,
      criticalIncidents: (db.prepare(`SELECT COUNT(*) as c FROM incidents WHERE status = 'Active' AND severity = 'Critical'`).get() as { c: number }).c,
      totalStockUnits: (db.prepare(`SELECT COALESCE(SUM(quantity_available),0) as s FROM inventory`).get() as { s: number }).s,
      activeShipments: (db.prepare(`SELECT COUNT(*) as c FROM shipments WHERE status IN ('Preparing','Dispatched','In Transit')`).get() as { c: number }).c,
      verifiedOrgs: orgs.length,
    };
    res.json({ incidents, organisations: orgs, totals, simulatedLabel: 'Simulated Demonstration Data — Chennai Flood Scenario' });
  });

  router.post('/public/contact', (req, res) => {
    const { name, email, organisation, message } = req.body as {
      name?: string;
      email?: string;
      organisation?: string;
      message?: string;
    };
    if (!name || !email || !message) {
      res.status(400).json({ error: 'Name, email, and message are required.' });
      return;
    }
    logAudit({
      actorId: null,
      actorName: name,
      actorRole: 'public',
      action: 'PUBLIC_CONTACT_INQUIRY',
      entityType: 'contact',
      newValue: { email, organisation, messageLength: message.length },
    });
    res.json({ ok: true, message: 'Thank you. Your inquiry has been logged for the CrisisWeave coordination team.' });
  });

  // ==================== AUTHENTICATION ====================
  router.post('/auth/register', (req, res) => {
    const {
      full_name,
      email,
      phone,
      password,
      role,
      organisation_name,
      address,
      latitude,
      longitude,
      skills,
      experience,
    } = req.body as Record<string, unknown>;

    if (!full_name || !email || !phone || !password || !role) {
      res.status(400).json({ error: 'Full name, email, phone, password, and role are required.' });
      return;
    }
    const normalizedRole = String(role).toLowerCase() as UserRole;
    if (normalizedRole === 'admin') {
      res.status(403).json({ error: 'Self-registration as Administrator is prohibited. Coordinator accounts require controlled provisioning.' });
      return;
    }
    if (!['citizen', 'ngo', 'volunteer', 'hospital'].includes(normalizedRole)) {
      res.status(400).json({ error: 'Invalid role selected.' });
      return;
    }
    const cleanEmail = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ error: 'Invalid email address format.' });
      return;
    }
    if (String(password).length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const passwordHash = bcrypt.hashSync(String(password), 10);
    const tx = db.transaction(() => {
      const info = db
        .prepare('INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)')
        .run(String(full_name).trim(), cleanEmail, String(phone).trim(), passwordHash, normalizedRole);
      const userId = Number(info.lastInsertRowid);

      const lat = typeof latitude === 'number' ? latitude : 13.0604;
      const lng = typeof longitude === 'number' ? longitude : 80.2496;

      if (normalizedRole === 'ngo' || normalizedRole === 'hospital') {
        const orgType = normalizedRole === 'ngo' ? 'NGO' : 'Hospital';
        const orgInfo = db
          .prepare(`
            INSERT INTO organisations (user_id, organisation_name, organisation_type, address, latitude, longitude, contact_number, verification_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Verified')
          `)
          .run(
            userId,
            String(organisation_name || `${full_name} ${orgType}`).trim(),
            orgType,
            String(address || 'Chennai Relief Zone (Simulated)').trim(),
            lat,
            lng,
            String(phone).trim()
          );
        if (orgType === 'Hospital') {
          db.prepare('INSERT INTO hospital_profiles (organisation_id, total_beds, available_beds, icu_beds_available) VALUES (?, 100, 30, 6)')
            .run(Number(orgInfo.lastInsertRowid));
        }
      }

      if (normalizedRole === 'volunteer') {
        db.prepare(`
          INSERT INTO volunteers (user_id, skills, availability, current_location, latitude, longitude, experience)
          VALUES (?, ?, 'Available', ?, ?, ?, ?)
        `).run(
          userId,
          String(skills || 'First Aid, Relief Distribution').trim(),
          String(address || 'Chennai Central').trim(),
          lat,
          lng,
          String(experience || 'Registered Community Volunteer').trim()
        );
      }

      logAudit({
        actorId: userId,
        actorName: String(full_name).trim(),
        actorRole: normalizedRole,
        action: 'USER_REGISTERED',
        entityType: 'user',
        entityId: userId,
        newValue: { email: cleanEmail, role: normalizedRole },
      });

      return userId;
    });

    const userId = tx();
    const token = signSessionToken({
      userId,
      email: cleanEmail,
      role: normalizedRole,
      fullName: String(full_name).trim(),
    });

    res.cookie('cw_session', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 });
    res.status(201).json({ user: hydrateUser(userId), token });
  });

  router.post('/auth/login', (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    const rateKey = `${req.ip}:${cleanEmail}`;
    const limit = checkLoginRateLimit(rateKey);
    if (!limit.allowed) {
      db.prepare(`
        INSERT INTO anomaly_flags (entity_type, entity_id, flag_type, risk_level, description, review_status)
        VALUES ('auth', 0, 'Repeated Failed Login Attempts', 'Suspicious', ?, 'Open')
      `).run(`Rate limit triggered for login attempts on ${cleanEmail} from IP ${req.ip}.`);
      res.status(429).json({ error: `Too many login attempts. Retry in ${limit.retryAfterSec}s.` });
      return;
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail) as
      | { id: number; full_name: string; email: string; password_hash: string; role: UserRole; is_active: number }
      | undefined;

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      if (user) {
        db.prepare('UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = ?').run(user.id);
      }
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }
    if (!user.is_active) {
      res.status(403).json({ error: 'Account is deactivated. Contact Emergency Coordinator.' });
      return;
    }

    clearLoginRateLimit(rateKey);
    db.prepare('UPDATE users SET failed_login_attempts = 0 WHERE id = ?').run(user.id);

    const token = signSessionToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      fullName: user.full_name,
    });

    logAudit({
      actorId: user.id,
      actorName: user.full_name,
      actorRole: user.role,
      action: 'USER_LOGIN',
      entityType: 'user',
      entityId: user.id,
    });

    res.cookie('cw_session', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 });
    res.json({ user: hydrateUser(user.id), token });
  });

  // Demo quick-login endpoint for hackathon evaluation (strictly uses seeded demo accounts)
  router.post('/auth/demo-login', (req, res) => {
    const { role } = req.body as { role?: UserRole };
    const demoEmails: Record<UserRole, string> = {
      admin: 'coordinator@crisisweave.org',
      citizen: 'ananya.citizen@example.org',
      ngo: 'chennai.relief@ngo.org',
      volunteer: 'vikram.vol@example.org',
      hospital: 'apollo.med@hospital.org',
    };
    const email = role ? demoEmails[role] : undefined;
    if (!email) {
      res.status(400).json({ error: 'Invalid demo role requested.' });
      return;
    }
    const user = db.prepare('SELECT id, full_name, email, role FROM users WHERE email = ?').get(email) as
      | { id: number; full_name: string; email: string; role: UserRole }
      | undefined;
    if (!user) {
      res.status(404).json({ error: 'Demo user not found.' });
      return;
    }
    const token = signSessionToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      fullName: user.full_name,
    });
    logAudit({
      actorId: user.id,
      actorName: user.full_name,
      actorRole: user.role,
      action: 'DEMO_ROLE_LOGIN',
      entityType: 'user',
      entityId: user.id,
    });
    res.cookie('cw_session', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 });
    res.json({ user: hydrateUser(user.id), token });
  });

  router.post('/auth/logout', (req: AuthedRequest, res) => {
    res.clearCookie('cw_session');
    res.json({ ok: true });
  });

  router.post('/auth/forgot-password', (req, res) => {
    const { email } = req.body as { email?: string };
    if (!email) {
      res.status(400).json({ error: 'Email is required.' });
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail) as { id: number } | undefined;
    // Always return non-enumerating success message + demo reset token for hackathon testing
    res.json({
      ok: true,
      message: 'If an account matches that email, a password reset code has been generated.',
      demoResetCode: user ? 'CW-RESET-2026' : undefined,
    });
  });

  router.post('/auth/reset-password', (req, res) => {
    const { email, resetCode, newPassword } = req.body as {
      email?: string;
      resetCode?: string;
      newPassword?: string;
    };
    if (!email || !resetCode || !newPassword || newPassword.length < 6) {
      res.status(400).json({ error: 'Valid email, reset code, and new password (min 6 chars) are required.' });
      return;
    }
    if (resetCode !== 'CW-RESET-2026') {
      res.status(400).json({ error: 'Invalid or expired reset code.' });
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    const user = db.prepare('SELECT id, full_name, role FROM users WHERE email = ?').get(cleanEmail) as
      | { id: number; full_name: string; role: string }
      | undefined;
    if (!user) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), user.id);
    logAudit({
      actorId: user.id,
      actorName: user.full_name,
      actorRole: user.role,
      action: 'PASSWORD_RESET',
      entityType: 'user',
      entityId: user.id,
    });
    res.json({ ok: true, message: 'Password updated successfully. You may now log in.' });
  });

  router.get('/auth/me', requireAuth, (req: AuthedRequest, res) => {
    const user = hydrateUser(req.sessionUser!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    res.json({ user });
  });

  // ==================== AI SERVICES ====================
  router.post('/ai/classify', requireAuth, async (req: AuthedRequest, res) => {
    const { description, disasterType, locationName, affectedPeople, vulnerablePresent, urgency } = req.body as {
      description?: string;
      disasterType?: string;
      locationName?: string;
      affectedPeople?: number;
      vulnerablePresent?: boolean;
      urgency?: string;
    };
    if (!description || description.trim().length < 5) {
      res.status(400).json({ error: 'Please provide an emergency description (at least 5 characters).' });
      return;
    }
    const analysis = await analyzeEmergencyReport({
      description,
      disasterType,
      locationName,
      affectedPeople,
      vulnerablePresent,
      urgency,
    });
    res.json(analysis);
  });

  router.post('/ai/duplicate-check', requireAuth, (req: AuthedRequest, res) => {
    const { description, locationName, latitude, longitude } = req.body as {
      description?: string;
      locationName?: string;
      latitude?: number;
      longitude?: number;
    };
    const result = detectDuplicateReports({
      description: description || '',
      locationName: locationName || '',
      latitude: typeof latitude === 'number' ? latitude : 13.0827,
      longitude: typeof longitude === 'number' ? longitude : 80.2707,
    });
    res.json(result);
  });

  router.post('/ai/priority-score', requireAuth, async (req: AuthedRequest, res) => {
    const analysis = await analyzeEmergencyReport(req.body || {});
    res.json({
      priority: analysis.priority,
      score: analysis.priorityScore,
      explanation: analysis.explanation,
      urgencyIndicators: analysis.urgencyIndicators,
    });
  });

  // ==================== EMERGENCY REPORTS ====================
  router.post('/reports', requireAuth, async (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    const {
      disasterType,
      locationName,
      description,
      latitude,
      longitude,
      affectedPeople,
      vulnerablePresent,
      urgency,
      requestedResources,
      idempotencyKey,
      evidence,
    } = req.body as {
      disasterType?: string;
      locationName?: string;
      description?: string;
      latitude?: number;
      longitude?: number;
      affectedPeople?: number;
      vulnerablePresent?: boolean;
      urgency?: string;
      requestedResources?: Array<{ resourceName: string; quantity: number }>;
      idempotencyKey?: string;
      evidence?: { fileName: string; fileType: string; dataUrl: string } | null;
    };

    if (!description || !locationName) {
      res.status(400).json({ error: 'Location and emergency description are required.' });
      return;
    }

    // Idempotency check for offline sync deduplication
    if (idempotencyKey) {
      const existing = db.prepare('SELECT * FROM emergency_reports WHERE idempotency_key = ?').get(idempotencyKey);
      if (existing) {
        res.status(200).json({ report: existing, deduplicated: true });
        return;
      }
    }

    // Validate evidence before creating report if present
    let evidenceResult: ReturnType<typeof validateAndHashEvidence> | null = null;
    if (evidence && evidence.dataUrl) {
      evidenceResult = validateAndHashEvidence(evidence);
      if (!evidenceResult.valid) {
        res.status(400).json({ error: evidenceResult.error });
        return;
      }
    }

    const lat = typeof latitude === 'number' ? latitude : 12.9784;
    const lng = typeof longitude === 'number' ? longitude : 80.2212;
    const peopleCount = Math.max(1, Number(affectedPeople) || 1);

    const aiResult = await analyzeEmergencyReport({
      description,
      disasterType,
      locationName,
      affectedPeople: peopleCount,
      vulnerablePresent: Boolean(vulnerablePresent),
      urgency,
    });

    const dupResult = detectDuplicateReports({
      description,
      locationName,
      latitude: lat,
      longitude: lng,
    });

    const finalResources =
      requestedResources && requestedResources.length > 0 ? requestedResources : aiResult.requestedResources;

    const matchedIncidentId =
      dupResult.candidates.length > 0 ? dupResult.candidates[0].incidentId : null;

    const info = db
      .prepare(`
        INSERT INTO emergency_reports (
          user_id, disaster_type, location_name, description, latitude, longitude,
          affected_people, vulnerable_present, urgency, requested_resources,
          ai_category, ai_priority, ai_score, ai_explanation, ai_extracted_json,
          duplicate_score, matched_incident_id, verification_status, security_flag, idempotency_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 'Normal', ?)
      `)
      .run(
        user.userId,
        disasterType || aiResult.category,
        locationName.trim(),
        description.trim(),
        lat,
        lng,
        peopleCount,
        vulnerablePresent ? 1 : 0,
        urgency || 'High',
        JSON.stringify(finalResources),
        aiResult.category,
        aiResult.priority,
        aiResult.priorityScore,
        aiResult.explanation,
        JSON.stringify({
          keywords: aiResult.keywords,
          indicators: aiResult.urgencyIndicators,
          modelUsed: aiResult.modelUsed,
          duplicateCandidates: dupResult.candidates,
        }),
        dupResult.maxSimilarity,
        matchedIncidentId,
        idempotencyKey || null
      );

    const reportId = Number(info.lastInsertRowid);

    if (evidence && evidenceResult?.valid) {
      db.prepare(`
        INSERT INTO report_evidence (report_id, file_name, file_hash, perceptual_hash, file_type, file_size, data_url, is_duplicate_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        reportId,
        evidence.fileName,
        evidenceResult.fileHash,
        evidenceResult.perceptualHash,
        evidence.fileType,
        evidenceResult.fileSize,
        evidence.dataUrl,
        evidenceResult.isDuplicateHash ? 1 : 0
      );
    }

    const anomalyCheck = evaluateReportAnomalies({
      reportId,
      userId: user.userId,
      latitude: lat,
      longitude: lng,
      affectedPeople: peopleCount,
      isDuplicateHash: evidenceResult?.isDuplicateHash,
      matchedEvidenceReportId: evidenceResult?.matchedReportId,
    });

    if (dupResult.maxSimilarity >= 65) {
      db.prepare(`
        INSERT INTO anomaly_flags (report_id, entity_type, entity_id, flag_type, risk_level, description, review_status)
        VALUES (?, 'emergency_report', ?, 'Potential Duplicate Submission', 'Needs Review', ?, 'Open')
      `).run(
        reportId,
        reportId,
        `${dupResult.maxSimilarity}% similarity with existing report #${dupResult.candidates[0]?.reportId}. Suggested for incident merge.`
      );
    }

    logAudit({
      actorId: user.userId,
      actorName: user.fullName,
      actorRole: user.role,
      action: 'SUBMITTED_EMERGENCY_REPORT',
      entityType: 'emergency_report',
      entityId: reportId,
      newValue: {
        locationName,
        aiPriority: aiResult.priority,
        securityFlag: anomalyCheck.riskLevel,
      },
    });

    emitNotification({
      roleTarget: 'admin',
      title: `New ${aiResult.priority} Emergency Report`,
      message: `${locationName}: ${aiResult.category} affecting ~${peopleCount} people.${anomalyCheck.riskLevel !== 'Normal' ? ` TrustShield flagged: ${anomalyCheck.riskLevel}.` : ''}`,
      type: aiResult.priority === 'Critical' ? 'critical' : 'warning',
      entityType: 'emergency_report',
      entityId: reportId,
    });

    const created = db.prepare('SELECT * FROM emergency_reports WHERE id = ?').get(reportId);
    io.emit('report:created', created);

    res.status(201).json({
      report: created,
      aiAnalysis: aiResult,
      duplicates: dupResult,
      trustshield: anomalyCheck,
    });
  });

  router.get('/reports', requireAuth, (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    let rows: Record<string, unknown>[];
    if (user.role === 'admin') {
      rows = db
        .prepare(`
          SELECT er.*, u.full_name as reporter_name
          FROM emergency_reports er
          JOIN users u ON u.id = er.user_id
          ORDER BY er.created_at DESC
        `)
        .all() as Record<string, unknown>[];
    } else if (user.role === 'citizen') {
      rows = db
        .prepare(`
          SELECT er.*, u.full_name as reporter_name
          FROM emergency_reports er
          JOIN users u ON u.id = er.user_id
          WHERE er.user_id = ?
          ORDER BY er.created_at DESC
        `)
        .all(user.userId) as Record<string, unknown>[];
    } else {
      // NGOs, volunteers, hospitals see verified/public summaries without private reporter PII
      rows = db
        .prepare(`
          SELECT er.id, er.disaster_type, er.location_name, er.description, er.latitude, er.longitude,
                 er.affected_people, er.ai_category, er.ai_priority, er.ai_score, er.ai_explanation,
                 er.requested_resources, er.verification_status, er.linked_incident_id, er.created_at
          FROM emergency_reports er
          WHERE er.verification_status IN ('Verified', 'Duplicate Linked')
          ORDER BY er.created_at DESC
        `)
        .all() as Record<string, unknown>[];
    }

    const hydrated = rows.map((r) => ({
      ...r,
      evidence: db.prepare('SELECT id, report_id, file_name, file_hash, perceptual_hash, file_type, file_size, data_url, is_duplicate_hash, uploaded_at FROM report_evidence WHERE report_id = ?').all(r.id),
      anomalies: user.role === 'admin' ? db.prepare('SELECT * FROM anomaly_flags WHERE report_id = ?').all(r.id) : [],
    }));

    res.json({ reports: hydrated });
  });

  router.get('/reports/:id', requireAuth, (req: AuthedRequest, res) => {
    const report = db.prepare('SELECT * FROM emergency_reports WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!report) {
      res.status(404).json({ error: 'Report not found.' });
      return;
    }
    if (req.sessionUser!.role === 'citizen' && report.user_id !== req.sessionUser!.userId) {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }
    const evidence = db.prepare('SELECT * FROM report_evidence WHERE report_id = ?').all(report.id);
    const anomalies = db.prepare('SELECT * FROM anomaly_flags WHERE report_id = ?').all(report.id);
    res.json({ report: { ...report, evidence, anomalies } });
  });

  router.post('/reports/:id/verify', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
    const reportId = Number(req.params.id);
    const { decision, reason, overridePriority, linkToIncidentId } = req.body as {
      decision: 'Verified' | 'Rejected' | 'Duplicate Linked';
      reason?: string;
      overridePriority?: PriorityLevel;
      linkToIncidentId?: number | null;
    };

    const report = db.prepare('SELECT * FROM emergency_reports WHERE id = ?').get(reportId) as
      | Record<string, unknown>
      | undefined;
    if (!report) {
      res.status(404).json({ error: 'Report not found.' });
      return;
    }
    if (!['Verified', 'Rejected', 'Duplicate Linked'].includes(decision)) {
      res.status(400).json({ error: 'Invalid verification decision.' });
      return;
    }

    const finalReason = (reason || '').trim() || `Coordinator marked report as ${decision}.`;
    const finalPriority: PriorityLevel = overridePriority || (report.ai_priority as PriorityLevel);

    const tx = db.transaction(() => {
      let incidentId = linkToIncidentId || (report.linked_incident_id as number | null);

      if (decision === 'Verified' && !incidentId) {
        const incInfo = db
          .prepare(`
            INSERT INTO incidents (scenario_id, incident_name, disaster_type, location_name, description, latitude, longitude, affected_people, severity, status, is_simulated)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', 1)
          `)
          .run(
            `${report.location_name} (${report.ai_category})`,
            report.ai_category,
            report.location_name,
            report.description,
            report.latitude,
            report.longitude,
            report.affected_people,
            finalPriority
          );
        incidentId = Number(incInfo.lastInsertRowid);

        // Automatically create Resource Requests from extracted/requested resources
        let reqResources: Array<{ resourceName: string; quantity: number }> = [];
        try {
          reqResources = JSON.parse(String(report.requested_resources || '[]'));
        } catch {
          reqResources = [];
        }
        const allRes = db.prepare('SELECT id, resource_name FROM resources').all() as Array<{
          id: number;
          resource_name: string;
        }>;
        for (const item of reqResources) {
          const matchedRes = allRes.find(
            (r) =>
              r.resource_name.toLowerCase() === item.resourceName.toLowerCase() ||
              r.resource_name.toLowerCase().includes(item.resourceName.toLowerCase())
          );
          if (matchedRes && item.quantity > 0) {
            db.prepare(`
              INSERT INTO resource_requests (incident_id, resource_id, quantity_required, priority, status)
              VALUES (?, ?, ?, ?, 'Open')
            `).run(incidentId, matchedRes.id, Math.round(item.quantity), finalPriority);
          }
        }
      }

      if (incidentId) {
        db.prepare('INSERT INTO incident_reports (incident_id, report_id, similarity_score) VALUES (?, ?, ?)').run(
          incidentId,
          reportId,
          decision === 'Duplicate Linked' ? Number(report.duplicate_score || 80) / 100 : 1.0
        );
      }

      db.prepare(`
        UPDATE emergency_reports
        SET verification_status = ?, linked_incident_id = ?, ai_priority = ?
        WHERE id = ?
      `).run(decision, incidentId ?? null, finalPriority, reportId);

      db.prepare(`
        INSERT INTO verification_records (report_id, reviewer_id, decision, reason)
        VALUES (?, ?, ?, ?)
      `).run(reportId, req.sessionUser!.userId, decision, finalReason);

      logAudit({
        actorId: req.sessionUser!.userId,
        actorName: req.sessionUser!.fullName,
        actorRole: req.sessionUser!.role,
        action: `REPORT_${decision.toUpperCase().replace(/\s+/g, '_')}`,
        entityType: 'emergency_report',
        entityId: reportId,
        previousValue: { verification_status: report.verification_status },
        newValue: { verification_status: decision, linked_incident_id: incidentId, priority: finalPriority },
        decisionInfo: finalReason,
      });

      return incidentId;
    });

    const incidentId = tx();

    emitNotification({
      userId: Number(report.user_id),
      title: `Report #${reportId} ${decision}`,
      message: `${report.location_name}: ${finalReason}`,
      type: decision === 'Rejected' ? 'warning' : 'success',
      entityType: 'emergency_report',
      entityId: reportId,
    });

    io.emit('report:verified', { reportId, decision, incidentId });
    res.json({ ok: true, reportId, decision, incidentId });
  });

  // ==================== INCIDENTS ====================
  router.get('/incidents', requireAuth, (_req, res) => {
    const incidents = db
      .prepare(`
        SELECT i.*,
          (SELECT COUNT(*) FROM incident_reports ir WHERE ir.incident_id = i.id) as report_count
        FROM incidents i
        ORDER BY CASE i.severity WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END, i.created_at DESC
      `)
      .all() as Array<Record<string, unknown>>;

    const withRequests = incidents.map((inc) => ({
      ...inc,
      requests: db
        .prepare(`
          SELECT rr.*, r.resource_name, r.unit
          FROM resource_requests rr
          JOIN resources r ON r.id = rr.resource_id
          WHERE rr.incident_id = ?
        `)
        .all(inc.id),
    }));
    res.json({ incidents: withRequests });
  });

  router.put('/incidents/:id', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const { status, severity } = req.body as { status?: string; severity?: PriorityLevel };
    const existing = db.prepare('SELECT * FROM incidents WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Incident not found.' });
      return;
    }
    db.prepare('UPDATE incidents SET status = COALESCE(?, status), severity = COALESCE(?, severity) WHERE id = ?').run(
      status || null,
      severity || null,
      id
    );
    logAudit({
      actorId: req.sessionUser!.userId,
      actorName: req.sessionUser!.fullName,
      actorRole: req.sessionUser!.role,
      action: 'UPDATED_INCIDENT',
      entityType: 'incident',
      entityId: id,
      previousValue: { status: existing.status, severity: existing.severity },
      newValue: { status: status || existing.status, severity: severity || existing.severity },
    });
    res.json({ ok: true });
  });

  // ==================== TRUSTSHIELD SECURITY CENTRE ====================
  router.get('/trustshield/overview', requireAuth, requireRole('admin'), (_req, res) => {
    const anomalies = db.prepare('SELECT * FROM anomaly_flags ORDER BY created_at DESC').all();
    const evidence = db
      .prepare(`
        SELECT re.id, re.report_id, re.file_name, re.file_hash, re.perceptual_hash, re.file_type, re.file_size, re.is_duplicate_hash, re.uploaded_at,
               er.location_name, er.security_flag
        FROM report_evidence re
        JOIN emergency_reports er ON er.id = re.report_id
        ORDER BY re.uploaded_at DESC
      `)
      .all();
    res.json({ anomalies, evidence });
  });

  router.post('/trustshield/anomalies/:id/review', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const { reviewStatus, reviewNotes } = req.body as { reviewStatus: 'Cleared' | 'Escalated'; reviewNotes?: string };
    const existing = db.prepare('SELECT * FROM anomaly_flags WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Anomaly flag not found.' });
      return;
    }
    db.prepare('UPDATE anomaly_flags SET review_status = ?, reviewed_by = ?, review_notes = ? WHERE id = ?').run(
      reviewStatus,
      req.sessionUser!.userId,
      reviewNotes || '',
      id
    );
    if (reviewStatus === 'Cleared' && existing.report_id) {
      db.prepare(`UPDATE emergency_reports SET security_flag = 'Normal' WHERE id = ?`).run(existing.report_id);
    }
    logAudit({
      actorId: req.sessionUser!.userId,
      actorName: req.sessionUser!.fullName,
      actorRole: req.sessionUser!.role,
      action: `TRUSTSHIELD_${reviewStatus.toUpperCase()}`,
      entityType: 'anomaly_flag',
      entityId: id,
      previousValue: { review_status: existing.review_status },
      newValue: { review_status: reviewStatus },
      decisionInfo: reviewNotes || null,
    });
    res.json({ ok: true });
  });

  // ==================== RESOURCES & INVENTORY ====================
  router.get('/resources', (_req, res) => {
    const resources = db.prepare('SELECT * FROM resources ORDER BY id ASC').all();
    res.json({ resources });
  });

  router.get('/inventory', requireAuth, (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    let query = `
      SELECT inv.*, o.organisation_name, o.organisation_type, o.address, o.latitude, o.longitude,
             r.resource_name, r.category, r.unit
      FROM inventory inv
      JOIN organisations o ON o.id = inv.organisation_id
      JOIN resources r ON r.id = inv.resource_id
    `;
    const params: unknown[] = [];
    if (user.role === 'ngo') {
      const org = db.prepare('SELECT id FROM organisations WHERE user_id = ?').get(user.userId) as
        | { id: number }
        | undefined;
      if (org) {
        query += ' WHERE inv.organisation_id = ?';
        params.push(org.id);
      }
    }
    query += ' ORDER BY o.organisation_name, r.resource_name';
    const items = db.prepare(query).all(...params);
    res.json({ inventory: items });
  });

  router.post('/inventory', requireAuth, requireRole('ngo', 'admin'), (req: AuthedRequest, res) => {
    const { resourceId, quantityAvailable, organisationId } = req.body as {
      resourceId: number;
      quantityAvailable: number;
      organisationId?: number;
    };
    const user = req.sessionUser!;
    let targetOrgId = organisationId;
    if (user.role === 'ngo') {
      const org = db.prepare('SELECT id, organisation_name FROM organisations WHERE user_id = ?').get(user.userId) as
        | { id: number; organisation_name: string }
        | undefined;
      if (!org) {
        res.status(404).json({ error: 'NGO organisation profile not found.' });
        return;
      }
      targetOrgId = org.id;
    }
    if (!targetOrgId || !resourceId || quantityAvailable < 0) {
      res.status(400).json({ error: 'Valid organisation, resource, and non-negative quantity required.' });
      return;
    }

    const orgRow = db.prepare('SELECT organisation_name FROM organisations WHERE id = ?').get(targetOrgId) as {
      organisation_name: string;
    };
    const resRow = db.prepare('SELECT resource_name FROM resources WHERE id = ?').get(resourceId) as {
      resource_name: string;
    };

    const existing = db
      .prepare('SELECT id, quantity_available FROM inventory WHERE organisation_id = ? AND resource_id = ?')
      .get(targetOrgId, resourceId) as { id: number; quantity_available: number } | undefined;

    let invId: number;
    const prevQty = existing ? existing.quantity_available : 0;

    if (existing) {
      db.prepare(`UPDATE inventory SET quantity_available = ?, updated_at = datetime('now') WHERE id = ?`).run(
        Math.round(quantityAvailable),
        existing.id
      );
      invId = existing.id;
    } else {
      const info = db
        .prepare('INSERT INTO inventory (organisation_id, resource_id, quantity_available) VALUES (?, ?, ?)')
        .run(targetOrgId, resourceId, Math.round(quantityAvailable));
      invId = Number(info.lastInsertRowid);
    }

    const anomaly = evaluateInventoryAnomaly({
      inventoryId: invId,
      organisationName: orgRow?.organisation_name || 'NGO',
      resourceName: resRow?.resource_name || 'Resource',
      previousQty: prevQty,
      newQty: Math.round(quantityAvailable),
    });

    logAudit({
      actorId: user.userId,
      actorName: user.fullName,
      actorRole: user.role,
      action: 'UPDATED_INVENTORY',
      entityType: 'inventory',
      entityId: invId,
      previousValue: { quantity_available: prevQty },
      newValue: { quantity_available: Math.round(quantityAvailable), resource: resRow?.resource_name },
    });

    io.emit('inventory:updated', { organisationId: targetOrgId, resourceId });
    res.json({ ok: true, inventoryId: invId, anomaly });
  });

  // ==================== RESOURCE REQUESTS & HOSPITAL ====================
  router.get('/resource-requests', requireAuth, (_req, res) => {
    const rows = db
      .prepare(`
        SELECT rr.*, r.resource_name, r.unit,
               i.incident_name, COALESCE(i.location_name, o.address) as location_name,
               COALESCE(i.latitude, o.latitude) as latitude,
               COALESCE(i.longitude, o.longitude) as longitude,
               o.organisation_name
        FROM resource_requests rr
        JOIN resources r ON r.id = rr.resource_id
        LEFT JOIN incidents i ON i.id = rr.incident_id
        LEFT JOIN organisations o ON o.id = rr.organisation_id
        ORDER BY CASE rr.priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END, rr.created_at DESC
      `)
      .all();
    res.json({ requests: rows });
  });

  router.post('/resource-requests', requireAuth, requireRole('hospital', 'admin'), (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    const { incidentId, resourceId, quantityRequired, priority } = req.body as {
      incidentId?: number | null;
      resourceId: number;
      quantityRequired: number;
      priority: PriorityLevel;
    };
    if (!resourceId || !quantityRequired || quantityRequired <= 0) {
      res.status(400).json({ error: 'Resource and positive quantity are required.' });
      return;
    }

    let orgId: number | null = null;
    if (user.role === 'hospital') {
      const org = db.prepare('SELECT id FROM organisations WHERE user_id = ?').get(user.userId) as
        | { id: number }
        | undefined;
      orgId = org ? org.id : null;
    }

    const info = db
      .prepare(`
        INSERT INTO resource_requests (incident_id, organisation_id, resource_id, quantity_required, priority, status)
        VALUES (?, ?, ?, ?, ?, 'Open')
      `)
      .run(incidentId ?? null, orgId, resourceId, Math.round(quantityRequired), priority || 'High');

    const reqId = Number(info.lastInsertRowid);
    logAudit({
      actorId: user.userId,
      actorName: user.fullName,
      actorRole: user.role,
      action: 'CREATED_RESOURCE_REQUEST',
      entityType: 'resource_request',
      entityId: reqId,
      newValue: { resourceId, quantityRequired, priority },
    });
    emitNotification({
      roleTarget: 'admin',
      title: `New ${priority || 'High'} Resource Request`,
      message: `${user.fullName} requested ${quantityRequired} units.`,
      type: priority === 'Critical' ? 'critical' : 'warning',
      entityType: 'resource_request',
      entityId: reqId,
    });
    res.status(201).json({ id: reqId });
  });

  router.get('/hospital/profile', requireAuth, requireRole('hospital', 'admin'), (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    const org =
      user.role === 'hospital'
        ? db.prepare('SELECT * FROM organisations WHERE user_id = ?').get(user.userId)
        : db.prepare(`SELECT * FROM organisations WHERE organisation_type = 'Hospital' LIMIT 1`).get();
    if (!org) {
      res.status(404).json({ error: 'Hospital organisation not found.' });
      return;
    }
    const profile = db.prepare('SELECT * FROM hospital_profiles WHERE organisation_id = ?').get((org as { id: number }).id);
    res.json({ organisation: org, hospitalProfile: profile });
  });

  router.put('/hospital/beds', requireAuth, requireRole('hospital'), (req: AuthedRequest, res) => {
    const { totalBeds, availableBeds, icuBedsAvailable, emergencyWardStatus } = req.body as {
      totalBeds: number;
      availableBeds: number;
      icuBedsAvailable: number;
      emergencyWardStatus: string;
    };
    const org = db.prepare('SELECT id, organisation_name FROM organisations WHERE user_id = ?').get(req.sessionUser!.userId) as
      | { id: number; organisation_name: string }
      | undefined;
    if (!org) {
      res.status(404).json({ error: 'Hospital profile not found.' });
      return;
    }
    db.prepare(`
      UPDATE hospital_profiles
      SET total_beds = ?, available_beds = ?, icu_beds_available = ?, emergency_ward_status = ?, updated_at = datetime('now')
      WHERE organisation_id = ?
    `).run(totalBeds, availableBeds, icuBedsAvailable, emergencyWardStatus, org.id);
    logAudit({
      actorId: req.sessionUser!.userId,
      actorName: req.sessionUser!.fullName,
      actorRole: 'hospital',
      action: 'UPDATED_HOSPITAL_BEDS',
      entityType: 'hospital_profile',
      entityId: org.id,
      newValue: { totalBeds, availableBeds, icuBedsAvailable, emergencyWardStatus },
    });
    io.emit('hospital:updated', { organisationId: org.id });
    res.json({ ok: true });
  });

  // ==================== OPTIMISATION & ALLOCATIONS ====================
  router.post('/optimisation/recommend', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
    const persist = Boolean((req.body as { persist?: boolean })?.persist ?? true);
    const result = computeOptimisedAllocation(persist);
    if (persist) {
      logAudit({
        actorId: req.sessionUser!.userId,
        actorName: req.sessionUser!.fullName,
        actorRole: 'admin',
        action: 'RAN_RESOURCE_OPTIMISATION',
        entityType: 'allocation',
        newValue: {
          recommendationsCount: result.recommendations.length,
          criticalFulfillmentPct: result.metrics.optimiser.criticalFulfillmentPct,
          efficiencyGainPct: result.metrics.efficiencyGainPct,
        },
      });
    }
    res.json(result);
  });

  router.get('/optimisation/preview', requireAuth, (_req, res) => {
    const result = computeOptimisedAllocation(false);
    res.json(result);
  });

  router.get('/allocations', requireAuth, (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    let query = `
      SELECT a.*, o.organisation_name, r.resource_name, r.unit,
             COALESCE(i.incident_name, o_req.organisation_name, 'Medical Request') as incident_name,
             COALESCE(i.location_name, o_req.address, 'Chennai') as location_name,
             rr.priority
      FROM allocations a
      JOIN organisations o ON o.id = a.organisation_id
      JOIN resources r ON r.id = a.resource_id
      JOIN resource_requests rr ON rr.id = a.request_id
      LEFT JOIN incidents i ON i.id = rr.incident_id
      LEFT JOIN organisations o_req ON o_req.id = rr.organisation_id
    `;
    const params: unknown[] = [];
    if (user.role === 'ngo') {
      const org = db.prepare('SELECT id FROM organisations WHERE user_id = ?').get(user.userId) as
        | { id: number }
        | undefined;
      if (org) {
        query += ' WHERE a.organisation_id = ?';
        params.push(org.id);
      }
    }
    query += ' ORDER BY a.created_at DESC';
    const allocations = db.prepare(query).all(...params);
    res.json({ allocations });
  });

  router.post('/allocations/:id/approve', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
    const allocId = Number(req.params.id);
    const { decision } = (req.body as { decision?: 'Approved' | 'Rejected' }) || {};
    const finalDecision = decision === 'Rejected' ? 'Rejected' : 'Approved';

    const alloc = db.prepare('SELECT * FROM allocations WHERE id = ?').get(allocId) as
      | {
          id: number;
          request_id: number;
          organisation_id: number;
          resource_id: number;
          allocated_quantity: number;
          status: string;
        }
      | undefined;

    if (!alloc) {
      res.status(404).json({ error: 'Allocation not found.' });
      return;
    }
    if (alloc.status !== 'Recommended') {
      res.status(400).json({ error: `Allocation is already "${alloc.status}".` });
      return;
    }

    const tx = db.transaction(() => {
      if (finalDecision === 'Rejected') {
        db.prepare(`UPDATE allocations SET status = 'Rejected', approved_by = ? WHERE id = ?`).run(
          req.sessionUser!.userId,
          allocId
        );
        return { shipmentId: null, shipmentCode: null };
      }

      const inv = db
        .prepare('SELECT id, quantity_available FROM inventory WHERE organisation_id = ? AND resource_id = ?')
        .get(alloc.organisation_id, alloc.resource_id) as { id: number; quantity_available: number } | undefined;

      if (!inv || inv.quantity_available < alloc.allocated_quantity) {
        throw new Error('Insufficient NGO stock remaining for this allocation.');
      }

      // Reserve / deduct stock atomically
      db.prepare(`UPDATE inventory SET quantity_available = quantity_available - ?, updated_at = datetime('now') WHERE id = ?`).run(
        alloc.allocated_quantity,
        inv.id
      );

      db.prepare(`UPDATE allocations SET status = 'Approved', approved_by = ? WHERE id = ?`).run(
        req.sessionUser!.userId,
        allocId
      );

      db.prepare(`UPDATE resource_requests SET status = 'Allocated' WHERE id = ?`).run(alloc.request_id);

      const shipmentCode = `CW-CHN-2026-${String(1000 + allocId)}`;
      const firstAvailVol = db
        .prepare(`SELECT id FROM volunteers WHERE availability = 'Available' LIMIT 1`)
        .get() as { id: number } | undefined;

      const shipInfo = db
        .prepare(`
          INSERT INTO shipments (allocation_id, shipment_code, volunteer_id, status, notes)
          VALUES (?, ?, ?, 'Preparing', 'Approved by Emergency Coordinator. Ready for NGO dispatch.')
        `)
        .run(allocId, shipmentCode, firstAvailVol?.id ?? null);

      const shipmentId = Number(shipInfo.lastInsertRowid);

      const reqRow = db.prepare('SELECT incident_id FROM resource_requests WHERE id = ?').get(alloc.request_id) as {
        incident_id: number | null;
      };
      if (reqRow?.incident_id) {
        db.prepare(`
          INSERT INTO assignments (volunteer_id, incident_id, shipment_id, task_description, status)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          firstAvailVol?.id ?? null,
          reqRow.incident_id,
          shipmentId,
          `Deliver shipment ${shipmentCode} (${alloc.allocated_quantity} units) and confirm handover.`,
          firstAvailVol ? 'Assigned' : 'Available'
        );
      }

      logAudit({
        actorId: req.sessionUser!.userId,
        actorName: req.sessionUser!.fullName,
        actorRole: 'admin',
        action: 'APPROVED_ALLOCATION',
        entityType: 'allocation',
        entityId: allocId,
        previousValue: { status: 'Recommended', stock: inv.quantity_available },
        newValue: { status: 'Approved', shipmentCode, remainingStock: inv.quantity_available - alloc.allocated_quantity },
      });

      return { shipmentId, shipmentCode };
    });

    try {
      const result = tx();
      const orgRow = db.prepare('SELECT user_id, organisation_name FROM organisations WHERE id = ?').get(alloc.organisation_id) as {
        user_id: number;
        organisation_name: string;
      };
      if (orgRow) {
        emitNotification({
          userId: orgRow.user_id,
          title: finalDecision === 'Approved' ? `Allocation #${allocId} Approved` : `Allocation #${allocId} Rejected`,
          message:
            finalDecision === 'Approved'
              ? `Shipment ${result.shipmentCode} created for ${alloc.allocated_quantity} units. Please prepare dispatch.`
              : `Proposed allocation #${allocId} was declined by Coordinator.`,
          type: finalDecision === 'Approved' ? 'success' : 'warning',
          entityType: 'allocation',
          entityId: allocId,
        });
      }
      io.emit('allocation:approved', { allocId, decision: finalDecision, ...result });
      res.json({ ok: true, decision: finalDecision, ...result });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Approval failed.' });
    }
  });

  // ==================== SHIPMENTS & DELIVERY TRACKING ====================
  router.get('/shipments', requireAuth, (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    let query = `
      SELECT s.*, a.allocated_quantity, a.organisation_id, a.request_id,
             o.organisation_name, r.resource_name, r.unit,
             COALESCE(i.incident_name, o_req.organisation_name, 'Medical Facility') as incident_name,
             COALESCE(i.location_name, o_req.address, 'Chennai') as location_name,
             u_vol.full_name as volunteer_name
      FROM shipments s
      JOIN allocations a ON a.id = s.allocation_id
      JOIN organisations o ON o.id = a.organisation_id
      JOIN resources r ON r.id = a.resource_id
      JOIN resource_requests rr ON rr.id = a.request_id
      LEFT JOIN incidents i ON i.id = rr.incident_id
      LEFT JOIN organisations o_req ON o_req.id = rr.organisation_id
      LEFT JOIN volunteers v ON v.id = s.volunteer_id
      LEFT JOIN users u_vol ON u_vol.id = v.user_id
    `;
    const params: unknown[] = [];
    if (user.role === 'ngo') {
      const org = db.prepare('SELECT id FROM organisations WHERE user_id = ?').get(user.userId) as
        | { id: number }
        | undefined;
      if (org) {
        query += ' WHERE a.organisation_id = ?';
        params.push(org.id);
      }
    } else if (user.role === 'hospital') {
      const org = db.prepare('SELECT id FROM organisations WHERE user_id = ?').get(user.userId) as
        | { id: number }
        | undefined;
      if (org) {
        query += ' WHERE rr.organisation_id = ?';
        params.push(org.id);
      }
    }
    query += ' ORDER BY s.created_at DESC';
    const shipments = db.prepare(query).all(...params);
    res.json({ shipments });
  });

  router.put('/shipments/:id/status', requireAuth, requireRole('ngo', 'volunteer', 'admin'), (req: AuthedRequest, res) => {
    const shipId = Number(req.params.id);
    const { status, notes } = req.body as { status: ShipmentStatus; notes?: string };
    const existing = db.prepare('SELECT * FROM shipments WHERE id = ?').get(shipId) as
      | { id: number; allocation_id: number; shipment_code: string; status: string }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Shipment not found.' });
      return;
    }

    const dispatchedUpdate = status === 'Dispatched' || status === 'In Transit' ? `, dispatched_at = COALESCE(dispatched_at, datetime('now'))` : '';
    db.prepare(`UPDATE shipments SET status = ?, notes = COALESCE(?, notes) ${dispatchedUpdate} WHERE id = ?`).run(
      status,
      notes || null,
      shipId
    );
    if (status === 'Dispatched' || status === 'In Transit') {
      db.prepare(`UPDATE allocations SET status = 'Dispatched' WHERE id = ?`).run(existing.allocation_id);
    }

    logAudit({
      actorId: req.sessionUser!.userId,
      actorName: req.sessionUser!.fullName,
      actorRole: req.sessionUser!.role,
      action: 'UPDATED_SHIPMENT_STATUS',
      entityType: 'shipment',
      entityId: shipId,
      previousValue: { status: existing.status },
      newValue: { status, notes },
    });

    io.emit('shipment:updated', { shipmentId: shipId, status });
    res.json({ ok: true });
  });

  router.post('/shipments/:id/confirm-delivery', requireAuth, requireRole('volunteer', 'admin', 'ngo'), (req: AuthedRequest, res) => {
    const shipId = Number(req.params.id);
    const { receivedQuantity, notes } = req.body as { receivedQuantity?: number; notes?: string };

    const ship = db
      .prepare(`
        SELECT s.*, a.allocated_quantity, a.request_id, a.organisation_id, a.resource_id
        FROM shipments s
        JOIN allocations a ON a.id = s.allocation_id
        WHERE s.id = ?
      `)
      .get(shipId) as
      | {
          id: number;
          allocation_id: number;
          shipment_code: string;
          allocated_quantity: number;
          request_id: number;
          organisation_id: number;
          resource_id: number;
          status: string;
        }
      | undefined;

    if (!ship) {
      res.status(404).json({ error: 'Shipment not found.' });
      return;
    }

    const received = Math.max(0, Math.min(ship.allocated_quantity, Number(receivedQuantity ?? ship.allocated_quantity)));
    const finalStatus: ShipmentStatus = received >= ship.allocated_quantity ? 'Delivered' : 'Partially Delivered';

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE shipments
        SET status = ?, received_quantity = ?, delivered_at = datetime('now'), notes = COALESCE(?, notes)
        WHERE id = ?
      `).run(finalStatus, received, notes || 'Delivery confirmed with digital handover.', shipId);

      db.prepare(`UPDATE allocations SET status = 'Completed' WHERE id = ?`).run(ship.allocation_id);

      // Update resource request fulfillment
      db.prepare(`UPDATE resource_requests SET quantity_fulfilled = quantity_fulfilled + ? WHERE id = ?`).run(
        received,
        ship.request_id
      );
      const reqRow = db.prepare('SELECT quantity_required, quantity_fulfilled FROM resource_requests WHERE id = ?').get(ship.request_id) as {
        quantity_required: number;
        quantity_fulfilled: number;
      };
      const reqStatus = reqRow.quantity_fulfilled >= reqRow.quantity_required ? 'Fulfilled' : 'Partially Fulfilled';
      db.prepare('UPDATE resource_requests SET status = ? WHERE id = ?').run(reqStatus, ship.request_id);

      // If partially delivered, return undelivered remainder back to NGO inventory
      const remainder = ship.allocated_quantity - received;
      if (remainder > 0) {
        db.prepare(`UPDATE inventory SET quantity_available = quantity_available + ? WHERE organisation_id = ? AND resource_id = ?`).run(
          remainder,
          ship.organisation_id,
          ship.resource_id
        );
      }

      db.prepare(`UPDATE assignments SET status = 'Completed', completed_at = datetime('now') WHERE shipment_id = ?`).run(shipId);

      logAudit({
        actorId: req.sessionUser!.userId,
        actorName: req.sessionUser!.fullName,
        actorRole: req.sessionUser!.role,
        action: 'CONFIRMED_DELIVERY',
        entityType: 'shipment',
        entityId: shipId,
        previousValue: { status: ship.status },
        newValue: { status: finalStatus, receivedQuantity: received, requestStatus: reqStatus },
      });
    });

    tx();

    emitNotification({
      roleTarget: 'admin',
      title: `Shipment ${ship.shipment_code} ${finalStatus}`,
      message: `${received} / ${ship.allocated_quantity} units confirmed delivered by ${req.sessionUser!.fullName}.`,
      type: 'success',
      entityType: 'shipment',
      entityId: shipId,
    });

    io.emit('shipment:updated', { shipmentId: shipId, status: finalStatus });
    res.json({ ok: true, status: finalStatus, receivedQuantity: received });
  });

  // ==================== VOLUNTEER TASKS & PROFILE ====================
  router.get('/volunteer/tasks', requireAuth, (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    const vol = db.prepare('SELECT * FROM volunteers WHERE user_id = ?').get(user.userId) as { id: number } | undefined;

    const tasks = db
      .prepare(`
        SELECT a.*, i.incident_name, i.location_name, i.severity,
               s.shipment_code, s.status as shipment_status,
               u.full_name as volunteer_name
        FROM assignments a
        JOIN incidents i ON i.id = a.incident_id
        LEFT JOIN shipments s ON s.id = a.shipment_id
        LEFT JOIN volunteers v ON v.id = a.volunteer_id
        LEFT JOIN users u ON u.id = v.user_id
        ORDER BY a.assigned_at DESC
      `)
      .all();

    res.json({ tasks, volunteerProfile: vol || null });
  });

  router.post('/volunteer/tasks/:id/respond', requireAuth, requireRole('volunteer', 'admin'), (req: AuthedRequest, res) => {
    const taskId = Number(req.params.id);
    const { action } = req.body as { action: 'accept' | 'decline' | 'start' | 'complete' };
    const vol = db.prepare('SELECT id FROM volunteers WHERE user_id = ?').get(req.sessionUser!.userId) as
      | { id: number }
      | undefined;
    if (!vol && req.sessionUser!.role === 'volunteer') {
      res.status(404).json({ error: 'Volunteer profile not found.' });
      return;
    }

    if (action === 'accept') {
      db.prepare(`UPDATE assignments SET volunteer_id = COALESCE(volunteer_id, ?), status = 'Assigned' WHERE id = ?`).run(
        vol?.id ?? null,
        taskId
      );
    } else if (action === 'start') {
      db.prepare(`UPDATE assignments SET status = 'In Progress' WHERE id = ?`).run(taskId);
    } else if (action === 'complete') {
      db.prepare(`UPDATE assignments SET status = 'Completed', completed_at = datetime('now') WHERE id = ?`).run(taskId);
    } else if (action === 'decline') {
      db.prepare(`UPDATE assignments SET volunteer_id = NULL, status = 'Available' WHERE id = ?`).run(taskId);
    }
    res.json({ ok: true });
  });

  router.put('/volunteer/availability', requireAuth, requireRole('volunteer'), (req: AuthedRequest, res) => {
    const { availability, skills, currentLocation } = req.body as {
      availability: 'Available' | 'On Mission' | 'Offline';
      skills?: string;
      currentLocation?: string;
    };
    db.prepare(`
      UPDATE volunteers
      SET availability = ?, skills = COALESCE(?, skills), current_location = COALESCE(?, current_location)
      WHERE user_id = ?
    `).run(availability, skills || null, currentLocation || null, req.sessionUser!.userId);
    res.json({ ok: true });
  });

  // ==================== GIS DISASTER MAP ====================
  router.get('/map/incidents', requireAuth, (_req, res) => {
    const incidents = db
      .prepare(`
        SELECT i.*,
          (SELECT COUNT(*) FROM incident_reports ir WHERE ir.incident_id = i.id) as report_count
        FROM incidents i
      `)
      .all();
    const pendingReports = db
      .prepare(`
        SELECT id, disaster_type, location_name, description, latitude, longitude, affected_people, ai_priority, verification_status, requested_resources, created_at
        FROM emergency_reports
        WHERE verification_status = 'Pending'
      `)
      .all();
    res.json({ incidents, pendingReports });
  });

  router.get('/map/organisations', requireAuth, (_req, res) => {
    const organisations = db
      .prepare(`
        SELECT o.*, hp.available_beds, hp.total_beds, hp.icu_beds_available,
          (SELECT COALESCE(SUM(inv.quantity_available), 0) FROM inventory inv WHERE inv.organisation_id = o.id) as total_stock
        FROM organisations o
        LEFT JOIN hospital_profiles hp ON hp.organisation_id = o.id
      `)
      .all();
    res.json({ organisations });
  });

  router.get('/map/volunteers', requireAuth, requireRole('admin'), (_req, res) => {
    const volunteers = db
      .prepare(`
        SELECT v.id, u.full_name, v.skills, v.availability, v.current_location, v.latitude, v.longitude
        FROM volunteers v
        JOIN users u ON u.id = v.user_id
      `)
      .all();
    res.json({ volunteers });
  });

  // ==================== PREDICTIONS & DIGITAL TWIN ====================
  router.get('/predictions', requireAuth, (req, res) => {
    const horizon = (req.query.horizon as '6h' | '12h' | '24h') || '12h';
    const predictions = generateDemandPredictions(horizon);
    res.json({ predictions, horizon });
  });

  router.post('/predictions/generate', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
    const horizon = ((req.body as { horizon?: string })?.horizon as '6h' | '12h' | '24h') || '12h';
    const predictions = generateDemandPredictions(horizon);
    logAudit({
      actorId: req.sessionUser!.userId,
      actorName: req.sessionUser!.fullName,
      actorRole: 'admin',
      action: 'GENERATED_DEMAND_FORECAST',
      entityType: 'prediction',
      newValue: { horizon, count: predictions.length },
    });
    res.json({ predictions, horizon });
  });

  router.post('/simulations', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
    const input = req.body as SimulationInput;
    if (!input || typeof input.affectedFamilies !== 'number') {
      res.status(400).json({ error: 'Valid simulation parameters are required.' });
      return;
    }
    const result = runDigitalTwinSimulation(input);
    const info = db
      .prepare('INSERT INTO simulations (scenario_name, input_parameters, result_data, created_by) VALUES (?, ?, ?, ?)')
      .run(input.scenarioName || 'Custom Chennai Scenario', JSON.stringify(input), JSON.stringify(result), req.sessionUser!.userId);

    logAudit({
      actorId: req.sessionUser!.userId,
      actorName: req.sessionUser!.fullName,
      actorRole: 'admin',
      action: 'RAN_DIGITAL_TWIN_SIMULATION',
      entityType: 'simulation',
      entityId: Number(info.lastInsertRowid),
      newValue: { scenarioName: input.scenarioName, families: input.affectedFamilies, roadAccess: input.roadAccessibilityPct },
    });

    res.status(201).json({ id: Number(info.lastInsertRowid), result });
  });

  router.get('/simulations', requireAuth, requireRole('admin'), (_req, res) => {
    const rows = db.prepare('SELECT * FROM simulations ORDER BY created_at DESC LIMIT 12').all() as Array<{
      id: number;
      scenario_name: string;
      input_parameters: string;
      result_data: string;
      created_at: string;
    }>;
    res.json({
      simulations: rows.map((r) => ({
        id: r.id,
        scenario_name: r.scenario_name,
        input: JSON.parse(r.input_parameters),
        result: JSON.parse(r.result_data),
        created_at: r.created_at,
      })),
    });
  });

  // ==================== ADMIN DIRECTORY, AUDIT & NOTIFICATIONS ====================
  router.get('/admin/directory', requireAuth, requireRole('admin'), (_req, res) => {
    const users = db
      .prepare('SELECT id, full_name, email, phone, role, is_active, created_at FROM users ORDER BY created_at DESC')
      .all();
    const organisations = db
      .prepare(`
        SELECT o.*, hp.total_beds, hp.available_beds, hp.icu_beds_available,
          (SELECT COALESCE(SUM(inv.quantity_available), 0) FROM inventory inv WHERE inv.organisation_id = o.id) as total_stock
        FROM organisations o
        LEFT JOIN hospital_profiles hp ON hp.organisation_id = o.id
      `)
      .all();
    const volunteers = db
      .prepare(`
        SELECT v.*, u.full_name, u.email, u.phone
        FROM volunteers v
        JOIN users u ON u.id = v.user_id
      `)
      .all();
    const scenarios = db.prepare('SELECT * FROM scenarios').all();
    res.json({ users, organisations, volunteers, scenarios });
  });

  router.put('/admin/users/:id/toggle-active', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    if (id === req.sessionUser!.userId) {
      res.status(400).json({ error: 'Cannot deactivate your own active coordinator account.' });
      return;
    }
    const u = db.prepare('SELECT is_active, full_name FROM users WHERE id = ?').get(id) as
      | { is_active: number; full_name: string }
      | undefined;
    if (!u) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    const nextState = u.is_active ? 0 : 1;
    db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(nextState, id);
    logAudit({
      actorId: req.sessionUser!.userId,
      actorName: req.sessionUser!.fullName,
      actorRole: 'admin',
      action: nextState ? 'ACTIVATED_USER' : 'DEACTIVATED_USER',
      entityType: 'user',
      entityId: id,
      previousValue: { is_active: u.is_active },
      newValue: { is_active: nextState },
    });
    res.json({ ok: true, is_active: nextState });
  });

  router.get('/audit-logs', requireAuth, requireRole('admin'), (_req, res) => {
    const logs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200').all();
    res.json({ logs });
  });

  router.get('/notifications', requireAuth, (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    const rows = db
      .prepare(`
        SELECT * FROM notifications
        WHERE user_id = ? OR role_target = ?
        ORDER BY created_at DESC
        LIMIT 30
      `)
      .all(user.userId, user.role);
    res.json({ notifications: rows });
  });

  router.post('/notifications/mark-read', requireAuth, (req: AuthedRequest, res) => {
    const user = req.sessionUser!;
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? OR role_target = ?').run(user.userId, user.role);
    res.json({ ok: true });
  });

  // Helper endpoint to calculate distance if needed
  router.get('/utils/distance', requireAuth, (req, res) => {
    const lat1 = Number(req.query.lat1);
    const lon1 = Number(req.query.lon1);
    const lat2 = Number(req.query.lat2);
    const lon2 = Number(req.query.lon2);
    res.json({ distanceKm: Number(haversineDistanceKm(lat1, lon1, lat2, lon2).toFixed(2)) });
  });

  return router;
}
