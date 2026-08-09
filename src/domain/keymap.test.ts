import { describe, expect, it } from "vitest";

import type { KeymapChoice } from "../models";
import {
  KEYMAP_DEFAULT_ENTRY,
  encodeKeymapChoice,
  keymapChoiceForEntry,
  normalizeKeymapEntry,
} from "./keymap";

describe("keymap codec", () => {
  it("normalizes supported hex representations and rejects malformed entries", () => {
    expect(normalizeKeymapEntry("01-03-ff-ff")).toBe("0103FFFF");
    expect(normalizeKeymapEntry("not a mapping")).toBe(KEYMAP_DEFAULT_ENTRY);
    expect(normalizeKeymapEntry("corrupt0103FFFF")).toBe(KEYMAP_DEFAULT_ENTRY);
  });

  it.each<KeymapChoice>([
    { kind: "none", label: "なし" },
    { kind: "controller", slot: 7, label: "R1" },
    { kind: "keyboard", modifier: 0x02, usage: 0x04, secondUsage: 0x05, label: "L Shift + A + B" },
  ])("round-trips $kind mappings", (choice) => {
    expect(keymapChoiceForEntry(encodeKeymapChoice(choice), 0)).toEqual(choice);
  });

  it("uses the source label for an identity mapping", () => {
    expect(keymapChoiceForEntry(KEYMAP_DEFAULT_ENTRY, 23)).toEqual({ kind: "identity", label: "M1" });
  });

  it("rejects unknown mapping types and out-of-range encoded choices", () => {
    expect(keymapChoiceForEntry("03000000", 0)).toBeNull();
    expect(keymapChoiceForEntry("01FE0000", 0)).toBeNull();
    expect(() => encodeKeymapChoice({ kind: "controller", slot: 256, label: "invalid" })).toThrow(RangeError);
  });
});
