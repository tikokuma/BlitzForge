import { describe, expect, it } from "vitest";

import { deviceUuidsEqual, parseProfileBytes, profileBytesEqual } from "./profile";

describe("profile byte parsing", () => {
  it("accepts byte arrays and rejects ambiguous or corrupt values", () => {
    expect(parseProfileBytes("[0,1,254,255]")).toEqual([0, 1, 254, 255]);
    expect(parseProfileBytes("not json")).toBeNull();
    expect(parseProfileBytes("{}")).toBeNull();
    expect(parseProfileBytes("[1.5]")).toBeNull();
    expect(parseProfileBytes("[-1]")).toBeNull();
    expect(parseProfileBytes("[256]")).toBeNull();
  });

  it("compares every byte and the full profile length", () => {
    expect(profileBytesEqual([1, 2], [1, 2])).toBe(true);
    expect(profileBytesEqual([1, 2], [1, 3])).toBe(false);
    expect(profileBytesEqual([1, 2], [1, 2, 0])).toBe(false);
  });
});

describe("device UUID matching", () => {
  it("matches the eight-byte UUID independent of formatting and case", () => {
    expect(deviceUuidsEqual("55E8224A7A680000", "55:e8:22:4a:7a:68:00:00")).toBe(true);
  });

  it("rejects empty, truncated, and contaminated identifiers", () => {
    expect(deviceUuidsEqual("", "")).toBe(false);
    expect(deviceUuidsEqual("55E8224A", "55E8224A")).toBe(false);
    expect(deviceUuidsEqual("corrupt55E8224A7A680000", "55E8224A7A680000")).toBe(false);
  });
});
