import type { MacroStep } from "../models";

export const MACRO_HEADER_LENGTH = 10;
export const MACRO_STEP_LENGTH = 10;
export const MACRO_MAX_STEPS = 64;

export const MACRO_INPUT_OPTIONS = [
  ["左スティック ↑", 0x01000000], ["左スティック ↗", 0x09000000], ["左スティック →", 0x08000000], ["左スティック ↘", 0x0a000000],
  ["左スティック ↓", 0x02000000], ["左スティック ↙", 0x06000000], ["左スティック ←", 0x04000000], ["左スティック ↖", 0x05000000],
  ["右スティック ↑", 0x10000000], ["右スティック ↗", 0x90000000], ["右スティック →", 0x80000000], ["右スティック ↘", 0xa0000000],
  ["右スティック ↓", 0x20000000], ["右スティック ↙", 0x60000000], ["右スティック ←", 0x40000000], ["右スティック ↖", 0x50000000],
  ["START", 0x00000800], ["SELECT", 0x00000400], ["予約1", 0x00040000], ["▲", 0x00010000],
  ["▼", 0x00020000], ["予約2", 0x00080000], ["特殊", 0x00000001], ["A", 0x00000002],
  ["B", 0x00000008], ["X", 0x00000010], ["Y", 0x00000040], ["LB", 0x00000100],
  ["LT", 0x00000080], ["RB", 0x00000200], ["RT", 0x00002000], ["L3 / R3", 0x00004000],
] as const;

const MACRO_DIRECTION_GROUP_MASKS = [0x0f000000, 0xf0000000] as const;
const EDITABLE_HEADER_FLAGS = 0x03;

export type MacroHeader = {
  mKey: number;
  runKey: number;
  repeat: number;
  runAfterRelease: boolean;
  loop: boolean;
};

type MacroRecord = readonly [
  number, number, number, number, number,
  number, number, number, number, number,
  ...number[],
];

type MacroStepBytes = [
  number, number, number, number, number,
  number, number, number, number, number,
];

function assertByteRecord(record: readonly number[]): asserts record is MacroRecord {
  if (record.length < MACRO_HEADER_LENGTH || (record.length - MACRO_HEADER_LENGTH) % MACRO_STEP_LENGTH !== 0) {
    throw new RangeError("A macro record must contain a 10-byte header and complete 10-byte steps");
  }
  if (record.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 0xff)) {
    throw new RangeError("A macro record may only contain bytes");
  }
}

function macroStepBytes(record: readonly number[], index: number): MacroStepBytes {
  const offset = MACRO_HEADER_LENGTH + index * MACRO_STEP_LENGTH;
  const bytes = record.slice(offset, offset + MACRO_STEP_LENGTH);
  if (bytes.length !== MACRO_STEP_LENGTH) {
    throw new RangeError(`Macro step index ${index} is out of range`);
  }
  return bytes as MacroStepBytes;
}

export function isMacroRecord(record: readonly number[]): boolean {
  try {
    assertByteRecord(record);
    return (record.length - MACRO_HEADER_LENGTH) / MACRO_STEP_LENGTH <= MACRO_MAX_STEPS;
  } catch {
    return false;
  }
}

function assertStepIndex(record: readonly number[], index: number): void {
  assertByteRecord(record);
  const stepCount = (record.length - MACRO_HEADER_LENGTH) / MACRO_STEP_LENGTH;
  if (!Number.isInteger(index) || index < 0 || index >= stepCount) {
    throw new RangeError(`Macro step index ${index} is out of range`);
  }
}

function signedByte(value: number): number {
  return value > 0x7f ? value - 0x100 : value;
}

function unsignedByte(value: number): number {
  return Math.max(-0x80, Math.min(0x7f, Math.round(value))) & 0xff;
}

export function macroStepCount(record: readonly number[]): number {
  assertByteRecord(record);
  return (record.length - MACRO_HEADER_LENGTH) / MACRO_STEP_LENGTH;
}

export function readMacroHeader(record: readonly number[]): MacroHeader {
  assertByteRecord(record);
  return {
    mKey: record[5],
    runKey: record[6],
    repeat: (record[8] << 8) | record[9],
    runAfterRelease: (record[7] & 1) !== 0,
    loop: (record[7] & 2) !== 0,
  };
}

export function updateMacroHeader(record: readonly number[], header: MacroHeader): number[] {
  assertByteRecord(record);
  if (![header.mKey, header.runKey].every((value) => Number.isInteger(value) && value >= 0 && value <= 0xff)) {
    throw new RangeError("Macro header keys must be bytes");
  }
  if (!Number.isInteger(header.repeat) || header.repeat < 0 || header.repeat > 0xffff) {
    throw new RangeError("Macro repeat must be an unsigned 16-bit integer");
  }

  const updated = record.slice();
  const flags = (header.runAfterRelease ? 1 : 0) | (header.loop ? 2 : 0);
  updated[5] = header.mKey;
  updated[6] = header.runKey;
  updated[7] = (record[7] & ~EDITABLE_HEADER_FLAGS) | flags;
  updated[8] = header.repeat >> 8;
  updated[9] = header.repeat & 0xff;
  return updated;
}

function decodeMacroStep(record: readonly number[], index: number): MacroStep {
  const bytes = macroStepBytes(record, index);
  const units = ((bytes[0] >> 4) | (bytes[1] << 4)) & 0xfff;
  return {
    durationMs: units * 8,
    marker: (bytes[0] & 1) !== 0,
    inputMask: (((bytes[2] << 24) | (bytes[3] << 16) | (bytes[4] << 8) | bytes[5]) >>> 0),
    analog: [signedByte(bytes[6]), signedByte(bytes[7]), signedByte(bytes[8]), signedByte(bytes[9])],
  };
}

export function readMacroStep(record: readonly number[], index: number): MacroStep {
  assertStepIndex(record, index);
  return decodeMacroStep(record, index);
}

export function updateMacroStep(
  record: readonly number[],
  index: number,
  changes: Partial<MacroStep>,
): number[] {
  assertStepIndex(record, index);
  const nextRecord = record.slice();
  const offset = MACRO_HEADER_LENGTH + index * MACRO_STEP_LENGTH;
  const previous = decodeMacroStep(record, index);
  const next = { ...previous, ...changes };
  if (!Number.isFinite(next.durationMs)
    || !Number.isInteger(next.inputMask)
    || !next.analog.every(Number.isFinite)) {
    throw new RangeError("Macro step values must be finite numbers");
  }
  const step = macroStepBytes(nextRecord, index);
  const units = Math.max(0, Math.min(0xfff, Math.round(next.durationMs / 8)));
  step[0] = (step[0] & 0x0e) | ((units & 0x0f) << 4) | (next.marker ? 1 : 0);
  step[1] = (units >> 4) & 0xff;
  const mask = next.inputMask >>> 0;
  step[2] = (mask >>> 24) & 0xff;
  step[3] = (mask >>> 16) & 0xff;
  step[4] = (mask >>> 8) & 0xff;
  step[5] = mask & 0xff;
  next.analog.forEach((value, analogIndex) => {
    step[6 + analogIndex] = unsignedByte(value);
  });
  nextRecord.splice(offset, MACRO_STEP_LENGTH, ...step);
  return nextRecord;
}

export function appendMacroStep(record: readonly number[]): number[] {
  if (macroStepCount(record) >= MACRO_MAX_STEPS) {
    throw new RangeError(`A macro may contain at most ${MACRO_MAX_STEPS} steps`);
  }
  return [...record, 0x10, 0, 0, 0, 0, 0, 0, 0, 0, 0];
}

export function removeMacroStep(record: readonly number[], index: number): number[] {
  assertStepIndex(record, index);
  const next = record.slice();
  next.splice(MACRO_HEADER_LENGTH + index * MACRO_STEP_LENGTH, MACRO_STEP_LENGTH);
  return next;
}

function macroDirectionGroup(optionMask: number): number | null {
  const normalized = optionMask >>> 0;
  return MACRO_DIRECTION_GROUP_MASKS.find((candidate) =>
    (((normalized & candidate) >>> 0) === normalized)) ?? null;
}

export function macroInputOptionActive(inputMask: number, optionMask: number): boolean {
  const normalized = inputMask >>> 0;
  const group = macroDirectionGroup(optionMask);
  return group === null
    ? (((normalized & optionMask) >>> 0) === optionMask)
    : (((normalized & group) >>> 0) === (optionMask >>> 0));
}

export function toggleMacroInput(inputMask: number, optionMask: number): number {
  const normalized = inputMask >>> 0;
  const group = macroDirectionGroup(optionMask);
  if (group === null) {
    return (macroInputOptionActive(normalized, optionMask)
      ? normalized & (~optionMask >>> 0)
      : normalized | optionMask) >>> 0;
  }
  return (macroInputOptionActive(normalized, optionMask)
    ? normalized & (~group >>> 0)
    : (normalized & (~group >>> 0)) | optionMask) >>> 0;
}

export function macroInputLabels(mask: number): string[] {
  return MACRO_INPUT_OPTIONS
    .filter(([, optionMask]) => macroInputOptionActive(mask, optionMask))
    .map(([label]) => label);
}

export function macroRunKeyLabel(value: number): string {
  return value >= 0x17 && value <= 0x1a ? `M${value - 0x16}` : "未設定";
}
