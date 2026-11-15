import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { db } from '../db.ts';
import type { AIExtraction, DuplicateCandidate, PriorityLevel } from '../../types.ts';

const CATEGORIES = [
  'Flood',
  'Cyclone',
  'Landslide',
  'Medical emergency',
  'Food shortage',
  'Drinking water shortage',
  'Shelter requirement',
  'Rescue requirement',
  'Other emergency',
] as const;

let cachedAiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim().length < 10) {
    return null;
  }
  if (!cachedAiClient) {
    cachedAiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedAiClient;
}

export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function deterministicAnalyze(input: {
  description: string;
  disasterType?: string;
  locationName?: string;
  affectedPeople?: number;
  vulnerablePresent?: boolean;
  urgency?: string;
}): AIExtraction {
  const text = `${input.description} ${input.disasterType || ''} ${input.locationName || ''}`.toLowerCase();

  let category: string = input.disasterType || 'Flood';
  if (/(trapped|boat|rescue|stranded|rooftop|submerged)/.test(text)) {
    category = 'Rescue requirement';
  } else if (/(insulin|dialysis|injured|hospital|bleeding|medical|pregnant|fever|ambulance|doctor)/.test(text)) {
    category = 'Medical emergency';
  } else if (/(drinking water|potable|thirsty|water tanker|dehydration|clean water)/.test(text)) {
    category = 'Drinking water shortage';
  } else if (/(food|rations|hungry|biscuit|rice|meal|milk)/.test(text)) {
    category = 'Food shortage';
  } else if (/(shelter|roof|tent|blanket|camp|homeless|evacuated)/.test(text)) {
    category = 'Shelter requirement';
  } else if (/(cyclone|gale|wind|storm surge)/.test(text)) {
    category = 'Cyclone';
  } else if (/(landslide|mudslide|collapse)/.test(text)) {
    category = 'Landslide';
  } else if (/(flood|waterlog|rain|overflow|inundated)/.test(text)) {
    category = 'Flood';
  }

  const familyMatch = text.match(/(\d+)\s*(?:families|family|households)/);
  const peopleMatch = text.match(/(\d+)\s*(?:people|persons|residents|citizens|children|elderly)/);
  const extractedPeople =
    input.affectedPeople && input.affectedPeople > 0
      ? input.affectedPeople
      : familyMatch
      ? parseInt(familyMatch[1], 10) * 4
      : peopleMatch
      ? parseInt(peopleMatch[1], 10)
      : 16;

  const requestedResources: Array<{ resourceName: string; quantity: number; unit: string }> = [];
  if (/(water|drink|thirst|dehydrat)/.test(text)) {
    requestedResources.push({ resourceName: 'Drinking Water', quantity: Math.max(40, extractedPeople * 5), unit: 'litres' });
  }
  if (/(food|meal|hungry|ration|bread|milk)/.test(text)) {
    requestedResources.push({ resourceName: 'Food Packets', quantity: Math.max(20, extractedPeople * 2), unit: 'packets' });
  }
  if (/(medic|insulin|first aid|injured|sick|fever|ors|doctor)/.test(text)) {
    requestedResources.push({ resourceName: 'Medical Kits', quantity: Math.max(5, Math.ceil(extractedPeople / 5)), unit: 'kits' });
  }
  if (/(blanket|cold|wet|shelter|tent|tarpaulin)/.test(text)) {
    requestedResources.push({ resourceName: 'Blankets', quantity: Math.max(10, extractedPeople), unit: 'units' });
  }
  if (/(boat|rescue|trapped|rope|life jacket)/.test(text)) {
    requestedResources.push({ resourceName: 'Rescue Equipment', quantity: Math.max(2, Math.ceil(extractedPeople / 15)), unit: 'sets' });
  }
  if (requestedResources.length === 0) {
    requestedResources.push({ resourceName: 'Drinking Water', quantity: extractedPeople * 4, unit: 'litres' });
    requestedResources.push({ resourceName: 'Food Packets', quantity: extractedPeople * 2, unit: 'packets' });
  }

  const urgencyIndicators: string[] = [];
  let score = 35;

  if (/(trapped|rising water|chest deep|rooftop|collapsed|drowning|critical|urgent|immediately)/.test(text)) {
    urgencyIndicators.push('Life-threatening entrapment / rising water');
    score += 30;
  }
  if (/(medical|pregnant|insulin|elderly|infant|baby|disabled|dialysis|oxygen)/.test(text) || input.vulnerablePresent) {
    urgencyIndicators.push('Vulnerable residents or acute medical need');
    score += 22;
  }
  if (extractedPeople >= 50) {
    urgencyIndicators.push('Large affected group (50+ people)');
    score += 18;
  } else if (extractedPeople >= 15) {
    urgencyIndicators.push('Multiple families affected');
    score += 10;
  }
  if (/(cut off|blocked|inaccessible|no power|no network)/.test(text)) {
    urgencyIndicators.push('Access constraint / isolation');
    score += 10;
  }
  if (input.urgency === 'Immediate' || input.urgency === 'Critical') {
    score += 10;
  }

  score = Math.min(99, Math.max(15, score));

  let priority: PriorityLevel = 'Medium';
  if (score >= 80) priority = 'Critical';
  else if (score >= 60) priority = 'High';
  else if (score >= 38) priority = 'Medium';
  else priority = 'Low';

  const keywords = Array.from(
    new Set(
      text
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 4 && !['there', 'their', 'about', 'would', 'please', 'which', 'where'].includes(w))
    )
  ).slice(0, 7);

  const reasons: string[] = [];
  if (urgencyIndicators.length > 0) {
    reasons.push(urgencyIndicators.join(', ').toLowerCase());
  }
  reasons.push(`estimated ${extractedPeople} affected residents`);
  if (requestedResources.length > 0) {
    reasons.push(`immediate demand for ${requestedResources.map((r) => r.resourceName.toLowerCase()).join(' & ')}`);
  }

  const explanation = `${priority} priority suggested because the report indicates ${reasons.join('; ')}.`;

  return {
    locationName: input.locationName || 'Chennai Affected Zone',
    category,
    requestedResources,
    affectedPeople: extractedPeople,
    urgencyIndicators: urgencyIndicators.length ? urgencyIndicators : ['Standard flood relief demand'],
    keywords,
    priority,
    priorityScore: score,
    explanation,
    modelUsed: 'CrisisWeave NLP Heuristic Engine',
  };
}

export async function analyzeEmergencyReport(input: {
  description: string;
  disasterType?: string;
  locationName?: string;
  affectedPeople?: number;
  vulnerablePresent?: boolean;
  urgency?: string;
}): Promise<AIExtraction> {
  const fallback = deterministicAnalyze(input);
  const ai = getGeminiClient();
  if (!ai) {
    return fallback;
  }

  try {
    const geminiPromise = ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Analyze this emergency disaster report for coordinator triage.
Location provided: ${input.locationName || 'Unknown'}
Disaster Type selected: ${input.disasterType || 'Unspecified'}
Reported Affected People: ${input.affectedPeople || 'Unknown'}
Vulnerable Groups Present: ${input.vulnerablePresent ? 'Yes' : 'Unknown'}
Urgency Reported: ${input.urgency || 'Unspecified'}
Description: "${input.description}"

Classify into one of: ${CATEGORIES.join(', ')}.
Extract requested resources using these standard resource names when applicable: Drinking Water (litres), Food Packets (packets), Medical Kits (kits), Medicines (boxes), Blankets (units), Shelter Materials (kits), Clothes (sets), Rescue Equipment (sets).
Provide a priority (Critical, High, Medium, or Low), numeric score (1-100), and a concise 1-sentence explainable AI justification starting with "<Priority> priority suggested because...".`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            locationName: { type: Type.STRING },
            category: { type: Type.STRING },
            affectedPeople: { type: Type.INTEGER },
            priority: { type: Type.STRING },
            priorityScore: { type: Type.INTEGER },
            explanation: { type: Type.STRING },
            urgencyIndicators: { type: Type.ARRAY, items: { type: Type.STRING } },
            keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
            requestedResources: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  resourceName: { type: Type.STRING },
                  quantity: { type: Type.INTEGER },
                  unit: { type: Type.STRING },
                },
              },
            },
          },
        },
      },
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini request timed out after 4.5s')), 4500)
    );
    const response = await Promise.race([geminiPromise, timeoutPromise]);

    const raw = response.text?.trim();
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<AIExtraction>;
    const validPriority: PriorityLevel =
      parsed.priority === 'Critical' ||
      parsed.priority === 'High' ||
      parsed.priority === 'Medium' ||
      parsed.priority === 'Low'
        ? parsed.priority
        : fallback.priority;

    return {
      locationName: parsed.locationName || fallback.locationName,
      category: parsed.category || fallback.category,
      requestedResources:
        parsed.requestedResources && parsed.requestedResources.length > 0
          ? parsed.requestedResources
          : fallback.requestedResources,
      affectedPeople: parsed.affectedPeople && parsed.affectedPeople > 0 ? parsed.affectedPeople : fallback.affectedPeople,
      urgencyIndicators:
        parsed.urgencyIndicators && parsed.urgencyIndicators.length > 0
          ? parsed.urgencyIndicators
          : fallback.urgencyIndicators,
      keywords: parsed.keywords && parsed.keywords.length > 0 ? parsed.keywords : fallback.keywords,
      priority: validPriority,
      priorityScore:
        typeof parsed.priorityScore === 'number'
          ? Math.min(100, Math.max(1, parsed.priorityScore))
          : fallback.priorityScore,
      explanation: parsed.explanation || fallback.explanation,
      modelUsed: 'Gemini 4 Hydrogen (Server-Side)',
    };
  } catch (err) {
    console.warn('Gemini AI analysis fallback triggered:', err instanceof Error ? err.message : String(err));
    return fallback;
  }
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'been', 'near', 'need', 'needs',
  'urgent', 'emergency', 'please', 'help', 'water', 'food', 'area', 'road', 'people', 'families',
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOP_WORDS.has(t))
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function detectDuplicateReports(input: {
  description: string;
  locationName: string;
  latitude: number;
  longitude: number;
  excludeReportId?: number;
}): { maxSimilarity: number; candidates: DuplicateCandidate[] } {
  const existing = db
    .prepare(`
      SELECT id, description, location_name, latitude, longitude, linked_incident_id, matched_incident_id, created_at
      FROM emergency_reports
      WHERE verification_status != 'Rejected'
      ORDER BY created_at DESC
      LIMIT 60
    `)
    .all() as Array<{
    id: number;
    description: string;
    location_name: string;
    latitude: number;
    longitude: number;
    linked_incident_id: number | null;
    matched_incident_id: number | null;
    created_at: string;
  }>;

  const targetTokens = tokenize(`${input.description} ${input.locationName}`);
  const nowMs = Date.now();
  const candidates: DuplicateCandidate[] = [];

  for (const row of existing) {
    if (input.excludeReportId && row.id === input.excludeReportId) continue;

    const distKm = haversineDistanceKm(input.latitude, input.longitude, row.latitude, row.longitude);
    const createdMs = new Date(row.created_at.replace(' ', 'T') + 'Z').getTime();
    const hoursApart = Number.isNaN(createdMs) ? 1 : Math.abs(nowMs - createdMs) / 3600000;

    const rowTokens = tokenize(`${row.description} ${row.location_name}`);
    const textSim = jaccardSimilarity(targetTokens, rowTokens);
    const geoScore = distKm <= 0.5 ? 1.0 : distKm <= 1.5 ? 0.8 : distKm <= 3.5 ? 0.5 : 0.1;
    const timeScore = hoursApart <= 6 ? 1.0 : hoursApart <= 24 ? 0.65 : 0.2;

    const combined = Number((textSim * 0.45 + geoScore * 0.4 + timeScore * 0.15).toFixed(2));
    if (combined >= 0.52 && distKm <= 4.0) {
      candidates.push({
        reportId: row.id,
        incidentId: row.linked_incident_id || row.matched_incident_id,
        similarityScore: Math.round(combined * 100),
        distanceKm: Number(distKm.toFixed(2)),
        hoursApart: Number(hoursApart.toFixed(1)),
        reason: `${Math.round(textSim * 100)}% text overlap · ${distKm.toFixed(2)} km apart · ${hoursApart.toFixed(1)}h interval`,
        descriptionSnippet: row.description.slice(0, 110) + (row.description.length > 110 ? '...' : ''),
      });
    }
  }

  candidates.sort((a, b) => b.similarityScore - a.similarityScore);
  const maxSimilarity = candidates.length > 0 ? candidates[0].similarityScore : 0;

  return { maxSimilarity, candidates: candidates.slice(0, 4) };
}
