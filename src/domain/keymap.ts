import type { KeymapChoice } from "../models";

export const KEYMAP_SLOT_COUNT = 32;
export const KEYMAP_DEFAULT_ENTRY = "00000000";

export const KEYMAP_TARGET_LABELS = [
  "A", "B", "C", "X", "Y", "Z", "L1", "R1",
  "L2", "R2", "SELECT / View", "START / Menu", "HOME", "L3", "R3", "CAPTURE / Share",
  "Up", "Down", "Left", "Right", "Back", "Mode", "Menu", "M1",
  "M2", "M3", "M4", "M5", "M6", "M7", "M8", "POWER",
] as const;

export const KEYMAP_SLOT_LABELS = [
  "A",
  "B",
  "予約/未割当",
  "X",
  "Y",
  "予約/未割当",
  "LB",
  "RB",
  "LT",
  "RT",
  "View",
  "Menu",
  "予約/未割当",
  "L3",
  "R3",
  "Share",
  "Up",
  "Down",
  "Left",
  "Right",
  "動的/未割当",
  "動的/未割当",
  "動的/未割当",
  "M1",
  "M2",
  "M3",
  "M4",
  "動的/未割当",
  "動的/未割当",
  "動的/未割当",
  "動的/未割当",
  "動的/未割当",
] as const;

export const KEYMAP_VISIBLE_SOURCES = [
  { slot: 23, label: "M1" },
  { slot: 24, label: "M2" },
  { slot: 25, label: "M3" },
  { slot: 26, label: "M4" },
  { slot: 0, label: "A" },
  { slot: 1, label: "B" },
  { slot: 3, label: "X" },
  { slot: 4, label: "Y" },
  { slot: 16, label: "Up" },
  { slot: 17, label: "Down" },
  { slot: 18, label: "Left" },
  { slot: 19, label: "Right" },
  { slot: 8, label: "LT" },
  { slot: 6, label: "LB" },
  { slot: 9, label: "RT" },
  { slot: 7, label: "RB" },
  { slot: 13, label: "L3" },
  { slot: 14, label: "R3" },
  { slot: 10, label: "View" },
  { slot: 11, label: "Menu" },
  { slot: 15, label: "Share" },
] as const;

export const KEYBOARD_KEYS = [
  ["1", 0x1e], ["2", 0x1f], ["3", 0x20], ["4", 0x21], ["5", 0x22], ["6", 0x23], ["7", 0x24], ["8", 0x25], ["9", 0x26], ["0", 0x27], ["Num1", 0x59],
  ["Num2", 0x5a], ["Num3", 0x5b], ["Num4", 0x5c], ["Num5", 0x5d], ["Num6", 0x5e], ["Num7", 0x5f], ["Num8", 0x60], ["Num9", 0x61], ["Num0", 0x62], ["A", 0x04], ["B", 0x05],
  ["C", 0x06], ["D", 0x07], ["E", 0x08], ["F", 0x09], ["G", 0x0a], ["H", 0x0b], ["I", 0x0c], ["J", 0x0d], ["K", 0x0e], ["L", 0x0f], ["M", 0x10],
  ["N", 0x11], ["O", 0x12], ["P", 0x13], ["Q", 0x14], ["R", 0x15], ["S", 0x16], ["T", 0x17], ["U", 0x18], ["V", 0x19], ["W", 0x1a], ["X", 0x1b],
  ["Y", 0x1c], ["Z", 0x1d], ["F1", 0x3a], ["F2", 0x3b], ["F3", 0x3c], ["F4", 0x3d], ["F5", 0x3e], ["F6", 0x3f], ["F7", 0x40], ["F8", 0x41], ["F9", 0x42],
  ["F10", 0x43], ["F11", 0x44], ["F12", 0x45], ["~", 0x35], ["Esc", 0x29], ["Tab", 0x2b], ["Space", 0x2c], ["Caps Lock", 0x39], ["Enter", 0x28], ["Left", 0x50], ["Right", 0x4f],
  ["Up", 0x52], ["Down", 0x51], ["Print Screen", 0x46], ["L Ctrl", 0xe0], ["L Shift", 0xe1], ["L Alt", 0xe2], ["L Win", 0xe3], ["R Ctrl", 0xe4], ["R Shift", 0xe5], ["R Alt", 0xe6], ["R Win", 0xe7],
  ["Insert", 0x49], ["Delete", 0x4c], ["Home", 0x4a], ["End", 0x4d], ["Page Up", 0x4b], ["Page Down", 0x4e], ["-", 0x2d], ["+", 0x2e], ["Backspace", 0x2a], ["[", 0x2f], ["]", 0x30],
  ["\\", 0x31], [";", 0x33], ["'", 0x34], [",", 0x36], [".", 0x37], ["/", 0x38],
] as const;

export const KEYBOARD_MODIFIERS = [
  ["None", 0x00],
  ["L Ctrl", 0x01],
  ["L Shift", 0x02],
  ["L Alt", 0x04],
  ["R Ctrl", 0x10],
  ["R Shift", 0x20],
  ["R Alt", 0x40],
] as const;

const KEYMAP_CONTROLLER_TYPE = 0x01;
const KEYMAP_KEYBOARD_TYPE = 0x02;
const KEYMAP_NO_TARGET = 0xff;

export const KEYMAP_CONTROLLER_CHOICES: readonly KeymapChoice[] = [
  ...KEYMAP_TARGET_LABELS.map((label, slot) => ({ kind: "controller" as const, slot, label })),
  { kind: "none", label: "なし" },
];

export function normalizeKeymapEntry(raw: string): string {
  const compact = raw.replace(/[\s:_-]/g, "").toUpperCase();
  return /^[0-9A-F]{8}$/.test(compact) ? compact : KEYMAP_DEFAULT_ENTRY;
}

function parseKeymapEntry(raw: string): [number, number, number, number] | null {
  if (!/^[0-9A-F]{8}$/i.test(raw)) return null;
  const bytes = raw.match(/../g)?.map((byte) => Number.parseInt(byte, 16));
  return bytes?.length === 4 ? bytes as [number, number, number, number] : null;
}

function formatKeymapBytes(bytes: readonly number[]): string {
  if (bytes.length !== 4 || bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 0xff)) {
    throw new RangeError("A keymap entry must contain exactly four bytes");
  }
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function keymapChoiceForEntry(raw: string, sourceSlot: number): KeymapChoice | null {
  const bytes = parseKeymapEntry(raw);
  if (!bytes) return null;
  if (bytes.every((byte) => byte === 0)) {
    return { kind: "identity", label: KEYMAP_SLOT_LABELS[sourceSlot] ?? "標準" };
  }
  if (bytes[0] === KEYMAP_CONTROLLER_TYPE) {
    if (bytes[1] === KEYMAP_NO_TARGET) return { kind: "none", label: "なし" };
    const slot = bytes[1];
    const label = KEYMAP_TARGET_LABELS[slot];
    return label === undefined ? null : { kind: "controller", slot, label };
  }
  if (bytes[0] === KEYMAP_KEYBOARD_TYPE) {
    const modifier = KEYBOARD_MODIFIERS.find(([, value]) => value === bytes[1]);
    const keyboard = KEYBOARD_KEYS.find(([, usage]) => usage === bytes[2]);
    const secondKeyboard = bytes[3] === 0
      ? null
      : KEYBOARD_KEYS.find(([, usage]) => usage === bytes[3]);
    if (!modifier || (!keyboard && !secondKeyboard)) return null;
    const keys = [keyboard?.[0], secondKeyboard?.[0]].filter(Boolean).join(" + ");
    const label = modifier[1] === 0 ? keys : `${modifier[0]} + ${keys}`;
    return {
      kind: "keyboard",
      modifier: modifier[1],
      usage: keyboard?.[1] ?? 0,
      secondUsage: secondKeyboard?.[1] ?? 0,
      label,
    };
  }
  return null;
}

export function keymapDisplay(raw: string, sourceSlot: number): { label: string; detail: string; choice: KeymapChoice | null } {
  const choice = keymapChoiceForEntry(raw, sourceSlot);
  if (!choice) {
    return { label: "未設定", detail: "この割り当ては変更できません", choice: null };
  }
  if (choice.kind === "identity") {
    return { label: choice.label, detail: "標準", choice };
  }
  return { label: choice.label, detail: "設定済み", choice };
}

export function encodeKeymapChoice(choice: KeymapChoice): string {
  if (choice.kind === "identity") return KEYMAP_DEFAULT_ENTRY;
  if (choice.kind === "none") {
    return formatKeymapBytes([KEYMAP_CONTROLLER_TYPE, KEYMAP_NO_TARGET, KEYMAP_NO_TARGET, KEYMAP_NO_TARGET]);
  }
  if (choice.kind === "controller") {
    return formatKeymapBytes([KEYMAP_CONTROLLER_TYPE, choice.slot, KEYMAP_NO_TARGET, KEYMAP_NO_TARGET]);
  }
  return formatKeymapBytes([KEYMAP_KEYBOARD_TYPE, choice.modifier, choice.usage, choice.secondUsage]);
}

export function keymapChoiceKey(choice: KeymapChoice | null): string {
  if (!choice) return "";
  if (choice.kind === "controller") return `controller:${choice.slot}`;
  if (choice.kind === "keyboard") return `keyboard:${choice.usage}`;
  return choice.kind;
}
