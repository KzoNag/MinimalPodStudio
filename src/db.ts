// IndexedDB による録音チャンクの逐次保存。
// ブラウザクラッシュやタブ誤閉じでも収録データを復元できるようにする。

const DB_NAME = 'podcast-recorder';
const DB_VERSION = 1;

export interface SessionMeta {
  id: string;
  startedAt: number;
  status: 'recording' | 'recorded';
  markers: number[];
  duration: number;
  mimeType: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('chunks')) {
        const store = db.createObjectStore('chunks', { autoIncrement: true });
        store.createIndex('bySession', 'sessionId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function putSession(meta: SessionMeta): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('sessions', 'readwrite');
  tx.objectStore('sessions').put(meta);
  await txDone(tx);
}

export async function appendChunk(sessionId: string, track: string, seq: number, blob: Blob): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('chunks', 'readwrite');
  tx.objectStore('chunks').add({ sessionId, track, seq, blob });
  await txDone(tx);
}

export async function listSessions(): Promise<SessionMeta[]> {
  const db = await openDb();
  const tx = db.transaction('sessions', 'readonly');
  const req = tx.objectStore('sessions').getAll();
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as SessionMeta[]);
    req.onerror = () => reject(req.error);
  });
}

export async function getRecoverableSession(): Promise<SessionMeta | null> {
  const sessions = await listSessions();
  if (sessions.length === 0) return null;
  sessions.sort((a, b) => b.startedAt - a.startedAt);
  return sessions[0];
}

interface ChunkRow {
  sessionId: string;
  track: string;
  seq: number;
  blob: Blob;
}

export async function loadSessionBlobs(
  sessionId: string,
  mimeType: string,
): Promise<{ mic: Blob | null; sys: Blob | null }> {
  const db = await openDb();
  const tx = db.transaction('chunks', 'readonly');
  const idx = tx.objectStore('chunks').index('bySession');
  const req = idx.getAll(IDBKeyRange.only(sessionId));
  const rows: ChunkRow[] = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as ChunkRow[]);
    req.onerror = () => reject(req.error);
  });
  const byTrack = new Map<string, ChunkRow[]>();
  for (const row of rows) {
    const list = byTrack.get(row.track) ?? [];
    list.push(row);
    byTrack.set(row.track, list);
  }
  const assemble = (track: string): Blob | null => {
    const list = byTrack.get(track);
    if (!list || list.length === 0) return null;
    list.sort((a, b) => a.seq - b.seq);
    return new Blob(list.map((r) => r.blob), { type: mimeType });
  };
  return { mic: assemble('mic'), sys: assemble('sys') };
}

export async function deleteSession(sessionId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(['sessions', 'chunks'], 'readwrite');
  tx.objectStore('sessions').delete(sessionId);
  const idx = tx.objectStore('chunks').index('bySession');
  const cursorReq = idx.openCursor(IDBKeyRange.only(sessionId));
  cursorReq.onsuccess = () => {
    const cursor = cursorReq.result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };
  await txDone(tx);
}

export async function deleteAllSessionsExcept(keepId: string | null): Promise<void> {
  const sessions = await listSessions();
  for (const s of sessions) {
    if (s.id !== keepId) await deleteSession(s.id);
  }
}
