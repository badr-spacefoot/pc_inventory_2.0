import { describe, expect, it } from "vitest";

import { createInitialState, storageKeys } from "../../frontend/src/core/state";

function memoryStorage(values: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(values));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => data.delete(key),
    setItem: (key, value) => data.set(key, value),
  };
}

describe("createInitialState", () => {
  it("restores valid persisted preferences", () => {
    const state = createInitialState(
      memoryStorage({
        [storageKeys.language]: "en",
        [storageKeys.themePreference]: "dark",
        [storageKeys.timeFormatPreference]: "12h",
        [storageKeys.temperatureUnit]: "fahrenheit",
      }),
    );

    expect(state).toMatchObject({
      language: "en",
      themePreference: "dark",
      timeFormatPreference: "12h",
      temperatureUnit: "fahrenheit",
    });
  });

  it("falls back safely when persisted JSON is corrupt", () => {
    const state = createInitialState(
      memoryStorage({
        [storageKeys.adminUser]: "not-json",
        [storageKeys.collectionDraft]: "[]",
      }),
    );

    expect(state.currentAdmin).toBeNull();
    expect(state.collectionDraft).toEqual({});
  });
});
