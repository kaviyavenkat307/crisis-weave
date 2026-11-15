import { openDB, type IDBPDatabase } from 'idb';
import type { OfflineReportDraft } from '../types';

const DB_NAME = 'crisisweave-offline-db';
const STORE_NAME = 'offline_reports';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'clientReportId' });
        }
      },
    });
  }
  return dbPromise;
}

export async function saveOfflineReportDraft(draft: OfflineReportDraft): Promise<void> {
  const db = await getDb();
  await db.put(STORE_NAME, draft);
}

export async function getAllOfflineDrafts(): Promise<OfflineReportDraft[]> {
  const db = await getDb();
  const all = (await db.getAll(STORE_NAME)) as OfflineReportDraft[];
  return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function updateOfflineDraftStatus(
  clientReportId: string,
  patch: Partial<OfflineReportDraft>
): Promise<void> {
  const db = await getDb();
  const existing = (await db.get(STORE_NAME, clientReportId)) as OfflineReportDraft | undefined;
  if (!existing) return;
  await db.put(STORE_NAME, { ...existing, ...patch });
}

export async function deleteOfflineDraft(clientReportId: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, clientReportId);
}
