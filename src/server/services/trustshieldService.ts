import crypto from 'crypto';
import { db } from '../db.ts';
import type { SecurityRiskLevel, UserRole } from '../../types.ts';

const SESSION_SECRET = process.env.SESSION_SECRET || 'crisisweave-hackathon-dev-secret-2026';

export interface SessionPayload {
  userId: number;
  email: string;
  role: UserRole;
  fullName: string;
  exp: number;
}

export function signSessionToken(payload: Omit<SessionPayload, 'exp'>): string {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token || !token.includes('.')) return null;
  const [encoded, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (decoded.exp < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}

// Simple in-memory login rate limiter per IP/email
const loginAttempts = new Map<string, { count: number; windowStart: number }>();

export function checkLoginRateLimit(key: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const windowMs = 5 * 60 * 1000; // 5 minutes
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    loginAttempts.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }
  if (entry.count >= 12) {
    const retryAfterSec = Math.ceil((windowMs - (now - entry.windowStart)) / 1000);
    return { allowed: false, retryAfterSec };
  }
  entry.count += 1;
  return { allowed: true };
}

export function clearLoginRateLimit(key: string): void {
  loginAttempts.delete(key);
}

export function logAudit(params: {
  actorId: number | null;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId?: number | null;
  previousValue?: unknown;
  newValue?: unknown;
  decisionInfo?: string | null;
}): void {
  db.prepare(`
    INSERT INTO audit_logs (actor_id, actor_name, actor_role, action, entity_type, entity_id, previous_value, new_value, decision_info)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.actorId,
    params.actorName,
    params.actorRole,
    params.action,
    params.entityType,
    params.entityId ?? null,
    params.previousValue !== undefined ? JSON.stringify(params.previousValue) : null,
    params.newValue !== undefined ? JSON.stringify(params.newValue) : null,
    params.decisionInfo ?? null
  );
}

export function createNotification(params: {
  userId?: number | null;
  roleTarget?: string | null;
  title: string;
  message: string;
  type?: 'info' | 'warning' | 'critical' | 'success';
  entityType?: string | null;
  entityId?: number | null;
}): number {
  const info = db.prepare(`
    INSERT INTO notifications (user_id, role_target, title, message, type, entity_type, entity_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.userId ?? null,
    params.roleTarget ?? null,
    params.title,
    params.message,
    params.type ?? 'info',
    params.entityType ?? null,
    params.entityId ?? null
  );
  return Number(info.lastInsertRowid);
}

const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf']);
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB

export function validateAndHashEvidence(params: {
  fileName: string;
  fileType: string;
  dataUrl: string;
}): {
  valid: boolean;
  error?: string;
  fileHash?: string;
  perceptualHash?: string;
  fileSize?: number;
  isDuplicateHash?: boolean;
  matchedReportId?: number | null;
} {
  const ext = params.fileName.split('.').pop()?.toLowerCase() || '';
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { valid: false, error: `Unsupported file extension ".${ext}". Allowed: jpg, jpeg, png, webp, pdf.` };
  }
  if (!ALLOWED_MIME_TYPES.has(params.fileType)) {
    return { valid: false, error: `Unsupported MIME type "${params.fileType}".` };
  }
  const base64Part = params.dataUrl.includes(',') ? params.dataUrl.split(',')[1] : params.dataUrl;
  const buffer = Buffer.from(base64Part, 'base64');
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return { valid: false, error: 'Evidence file exceeds maximum allowed size of 5 MB.' };
  }
  if (buffer.length === 0) {
    return { valid: false, error: 'Uploaded evidence file is empty.' };
  }

  const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
  // Lightweight perceptual fingerprint based on sampled byte distribution buckets (16 hex chars)
  const buckets = new Array(16).fill(0);
  const step = Math.max(1, Math.floor(buffer.length / 256));
  for (let i = 0; i < buffer.length; i += step) {
    buckets[buffer[i] >> 4] += 1;
  }
  const avg = buckets.reduce((a, b) => a + b, 0) / 16;
  const perceptualHash = buckets.map((v) => (v >= avg ? '1' : '0')).join('');

  const existing = db
    .prepare('SELECT report_id FROM report_evidence WHERE file_hash = ? LIMIT 1')
    .get(fileHash) as { report_id: number } | undefined;

  return {
    valid: true,
    fileHash,
    perceptualHash,
    fileSize: buffer.length,
    isDuplicateHash: Boolean(existing),
    matchedReportId: existing ? existing.report_id : null,
  };
}

export function evaluateReportAnomalies(params: {
  reportId: number;
  userId: number;
  latitude: number;
  longitude: number;
  affectedPeople: number;
  isDuplicateHash?: boolean;
  matchedEvidenceReportId?: number | null;
}): { riskLevel: SecurityRiskLevel; flags: Array<{ flagType: string; riskLevel: SecurityRiskLevel; description: string }> } {
  const flags: Array<{ flagType: string; riskLevel: SecurityRiskLevel; description: string }> = [];

  // 1. Check burst submissions from same user in last 10 minutes
  const recentCountRow = db.prepare(`
    SELECT COUNT(*) as cnt FROM emergency_reports
    WHERE user_id = ? AND created_at >= datetime('now', '-10 minutes')
  `).get(params.userId) as { cnt: number };

  if (recentCountRow.cnt >= 3) {
    flags.push({
      flagType: 'Burst Submission Rate',
      riskLevel: 'Needs Review',
      description: `Account submitted ${recentCountRow.cnt} reports within a 10-minute window. Flagged for coordinator review.`,
    });
  }

  // 2. Duplicate SHA-256 evidence check
  if (params.isDuplicateHash) {
    flags.push({
      flagType: 'Repeated Evidence Hash',
      riskLevel: 'Suspicious',
      description: `Uploaded evidence SHA-256 hash matches previously submitted Report #${params.matchedEvidenceReportId}. Manual authenticity verification advised.`,
    });
  }

  // 3. Outlier affected people count check
  if (params.affectedPeople > 1500) {
    flags.push({
      flagType: 'Scale Outlier',
      riskLevel: 'Needs Review',
      description: `Reported affected population (${params.affectedPeople}) exceeds typical single-point threshold. Coordinator confirmation required before bulk allocation.`,
    });
  }

  let highestRisk: SecurityRiskLevel = 'Normal';
  for (const flag of flags) {
    if (flag.riskLevel === 'Suspicious') highestRisk = 'Suspicious';
    else if (flag.riskLevel === 'Needs Review' && highestRisk === 'Normal') highestRisk = 'Needs Review';

    db.prepare(`
      INSERT INTO anomaly_flags (report_id, entity_type, entity_id, flag_type, risk_level, description, review_status)
      VALUES (?, 'emergency_report', ?, ?, ?, ?, 'Open')
    `).run(params.reportId, params.reportId, flag.flagType, flag.riskLevel, flag.description);
  }

  if (highestRisk !== 'Normal') {
    db.prepare('UPDATE emergency_reports SET security_flag = ? WHERE id = ?').run(highestRisk, params.reportId);
  }

  return { riskLevel: highestRisk, flags };
}

export function evaluateInventoryAnomaly(params: {
  inventoryId: number;
  organisationName: string;
  resourceName: string;
  previousQty: number;
  newQty: number;
}): { flagged: boolean; riskLevel: SecurityRiskLevel; description?: string } {
  const delta = Math.abs(params.newQty - params.previousQty);
  const dropRatio = params.previousQty > 0 ? (params.previousQty - params.newQty) / params.previousQty : 0;

  if (delta >= 5000 || (params.previousQty >= 200 && dropRatio >= 0.85)) {
    const riskLevel: SecurityRiskLevel = delta >= 10000 ? 'Suspicious' : 'Needs Review';
    const description = `Unusual stock adjustment at ${params.organisationName} for ${params.resourceName}: ${params.previousQty} -> ${params.newQty} units.`;
    db.prepare(`
      INSERT INTO anomaly_flags (report_id, entity_type, entity_id, flag_type, risk_level, description, review_status)
      VALUES (NULL, 'inventory', ?, 'Inventory Mutation Anomaly', ?, ?, 'Open')
    `).run(params.inventoryId, riskLevel, description);
    return { flagged: true, riskLevel, description };
  }
  return { flagged: false, riskLevel: 'Normal' };
}
