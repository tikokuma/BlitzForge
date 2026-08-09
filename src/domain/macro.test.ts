import { describe, expect, it } from "vitest";

import {
  MACRO_HEADER_LENGTH,
  MACRO_MAX_STEPS,
  MACRO_STEP_LENGTH,
  appendMacroStep,
  isMacroRecord,
  macroInputOptionActive,
  macroStepCount,
  readMacroHeader,
  readMacroStep,
  removeMacroStep,
  toggleMacroInput,
  updateMacroHeader,
  updateMacroStep,
} from "./macro";

const emptyRecord = (): number[] => Array.from({ length: MACRO_HEADER_LENGTH }, () => 0);

describe("macro record codec", () => {
  it("appends, updates, reads, and removes a step immutably", () => {
    const empty = emptyRecord();
    const appended = appendMacroStep(empty);
    const updated = updateMacroStep(appended, 0, {
      durationMs: 100,
      marker: true,
      inputMask: 0x80000002,
      analog: [-200, -1, 1, 200],
    });

    expect(empty).toHaveLength(MACRO_HEADER_LENGTH);
    expect(appended).not.toBe(updated);
    expect(readMacroStep(updated, 0)).toEqual({
      durationMs: 104,
      marker: true,
      inputMask: 0x80000002,
      analog: [-128, -1, 1, 127],
    });
    expect(removeMacroStep(updated, 0)).toEqual(empty);
  });

  it("rejects malformed records, invalid indexes, and overflow", () => {
    expect(isMacroRecord([])).toBe(false);
    expect(isMacroRecord([...emptyRecord(), 0])).toBe(false);
    expect(() => readMacroStep(emptyRecord(), 0)).toThrow(RangeError);

    const full = Array.from(
      { length: MACRO_HEADER_LENGTH + MACRO_MAX_STEPS * MACRO_STEP_LENGTH },
      () => 0,
    );
    expect(macroStepCount(full)).toBe(MACRO_MAX_STEPS);
    expect(() => appendMacroStep(full)).toThrow(RangeError);
    expect(() => updateMacroStep(appendMacroStep(emptyRecord()), 0, { durationMs: Number.NaN }))
      .toThrow(RangeError);
  });

  it("updates editable header fields without destroying unknown flag bits", () => {
    const record = emptyRecord();
    record[7] = 0xa0;

    const updated = updateMacroHeader(record, {
      mKey: 0x17,
      runKey: 0x18,
      repeat: 0x1234,
      runAfterRelease: true,
      loop: false,
    });

    expect(updated[7]).toBe(0xa1);
    expect(record[7]).toBe(0xa0);
    expect(readMacroHeader(updated)).toEqual({
      mKey: 0x17,
      runKey: 0x18,
      repeat: 0x1234,
      runAfterRelease: true,
      loop: false,
    });
  });
});

describe("macro input masks", () => {
  it("keeps directional choices mutually exclusive within each stick", () => {
    const up = 0x01000000;
    const right = 0x08000000;
    const buttonA = 0x00000002;
    const withUp = toggleMacroInput(buttonA, up);
    const withRight = toggleMacroInput(withUp, right);

    expect(macroInputOptionActive(withRight, up)).toBe(false);
    expect(macroInputOptionActive(withRight, right)).toBe(true);
    expect(macroInputOptionActive(withRight, buttonA)).toBe(true);
    expect(toggleMacroInput(withRight, right)).toBe(buttonA);
  });
});
