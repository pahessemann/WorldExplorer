import type { SyncOperation } from "./types";

const DB_NAME = "worldexplorer";
const DB_VERSION = 2;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of ["circles", "trips", "proposals", "collections", "outbox", "meta"]) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readAll<T>(store: string): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, "readonly").objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

export async function putRecord<T>(store: string, value: T) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const request = db.transaction(store, "readwrite").objectStore(store).put(value);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteRecord(store: string, id: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const request = db.transaction(store, "readwrite").objectStore(store).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export function getDeviceId() {
  const existing = window.localStorage.getItem("worldexplorer-device");
  if (existing) return existing;
  const created = crypto.randomUUID?.() ?? `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem("worldexplorer-device", created);
  return created;
}

export async function queueOperation(kind: SyncOperation["kind"], payload: unknown) {
  const operation: SyncOperation = {
    id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    kind,
    payload,
    createdAt: Date.now(),
    attempts: 0,
  };
  await putRecord("outbox", operation);
}

export function mergeById<T extends { id: string }>(local: T[], remote: T[]) {
  const merged = new Map(local.map((item) => [item.id, item]));
  remote.forEach((item) => merged.set(item.id, item));
  return [...merged.values()];
}
