import type { ProjectState } from '../core/types';
import { serializeProject, deserializeProject } from '../core/project/serializer';

const DB_NAME = 'visual-constructor-db';
const DB_VERSION = 1;
const STORE = 'autosave';
const KEY = 'current-project';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

export async function autosaveProject(state: ProjectState): Promise<void> {
  try {
    const db = await openDb();
    const data = serializeProject(state);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(data, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // fallback localStorage (may fail on large projects)
    try {
      localStorage.setItem(KEY, JSON.stringify(serializeProject(state)));
    } catch {
      /* ignore */
    }
  }
}

export async function loadAutosavedProject(): Promise<ProjectState | null> {
  try {
    const db = await openDb();
    const data = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!data) return null;
    const result = deserializeProject(data);
    return result.ok ? result.state : null;
  } catch {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const result = deserializeProject(JSON.parse(raw));
      return result.ok ? result.state : null;
    } catch {
      return null;
    }
  }
}

export async function clearAutosave(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    localStorage.removeItem(KEY);
  }
}
