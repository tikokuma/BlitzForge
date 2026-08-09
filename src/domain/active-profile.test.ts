import { describe, expect, it } from "vitest";

import {
  type ActiveProfileStorage,
  loadRememberedActiveProfile,
  rememberActiveProfile,
} from "./active-profile";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const storage: ActiveProfileStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  return { storage, values };
}

describe("remembered active profiles", () => {
  it("stores and restores a profile under a normalized device UUID", () => {
    const { storage } = memoryStorage();
    rememberActiveProfile(storage, "55e8-224a-7a68-0000", [0x12, 0x34, 0x56]);

    expect(loadRememberedActiveProfile(storage, "55E8224A7A680000")).toEqual([0x12, 0x34, 0x56]);
  });

  it("ignores invalid device UUIDs", () => {
    const { storage, values } = memoryStorage();
    rememberActiveProfile(storage, "unknown", [1, 2, 3]);

    expect(values.size).toBe(0);
    expect(loadRememberedActiveProfile(storage, "unknown")).toBeNull();
  });

  it("rejects corrupted stored profile data", () => {
    const { storage } = memoryStorage({
      "bigbigwon.active-profile.v1.55E8224A7A680000": "[1, 999]",
    });

    expect(loadRememberedActiveProfile(storage, "55E8224A7A680000")).toBeNull();
  });
});
