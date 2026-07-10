import type { JsonObject } from "./types";

export function readStoredJson<T>(storage: Storage, key: string, fallback: T): T {
  const raw = storage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function readStoredObject(storage: Storage, key: string): JsonObject {
  const value = readStoredJson<unknown>(storage, key, {});
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}
