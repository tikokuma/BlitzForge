import { invoke } from "@tauri-apps/api/core";
type DeviceSummary = {
  vendorProduct: string;
  usage: string;
  product: string;
  path: string;
};

type DeviceSession = {
  device: DeviceSummary;
  uuid: string;
  zkmVersion: number;
};

type ProfileSnapshot = {
  id: number;
  name: string;
  deviceUuid: string;
  deviceName: string;
  firmwareVersion: string;
  zkmVersion: string;
  configJson: string;
  createdAt: string;
  deleted: number;
};

type ProfileListEntry = {
  id: number;
  name: string;
  deviceUuid: string;
  deviceName: string;
  firmwareVersion: string;
  zkmVersion: string;
  createdAt: string;
  profileLength: number;
  profileVersion: string | null;
  supported: boolean;
  incompatibilityReason: string | null;
  snapshot: ProfileSnapshot;
};

type ActiveProfileReadState = "pending" | "known" | "unknown";

type CurveSettings = {
  center: number;
  point1X: number;
  point1Y: number;
  point2X: number;
  point2Y: number;
  edge: number;
  stabilization: number;
};

type RapidFireSettings = {
  keys: Array<boolean | null>;
  speedIndex: number | null;
  timing?: { periodMs: number; halfPeriodMs: number; hz: number } | null;
};

type ControllerSettings = {
  rectangleAlgorithm: boolean;
  leftStick: CurveSettings;
  rightStick: CurveSettings;
  rapidFire: RapidFireSettings;
  rapidFireSpeedIndex: number | null;
  rapidFireTiming: { periodMs: number; halfPeriodMs: number; hz: number } | null;
  keyBindings: string[];
};

type VibrationGrip = {
  min: number;
  max: number;
};

type VibrationSettings = {
  left: VibrationGrip;
  right: VibrationGrip;
};

type VibrationMode = "off" | "strong" | "standard" | "weak" | "custom";

type ProfileSummary = {
  device: DeviceSummary | null;
  storedCrc: string;
  computedCrc: string;
  vibration: VibrationSettings;
  settings: ControllerSettings;
  rawProfile: number[];
};

type ProfileDocument = ProfileSummary & {
  id: number | null;
  name: string;
  deviceUuid: string;
  deviceName: string;
  firmwareVersion: string;
  zkmVersion: string;
  createdAt: string;
  saved: boolean;
  supported: boolean;
  incompatibilityReason: string | null;
  snapshot: ProfileSnapshot | null;
};

type ApplyProfileResult = {
  profile: ProfileSummary;
  ack: string;
  ackValue: number;
};

type ControllerSettingsInput = {
  rectangleAlgorithm: boolean;
  leftStick: CurveSettings;
  rightStick: CurveSettings;
  rapidFire: {
    keys: Array<boolean | null>;
    speedIndex: number | null;
  };
  keyBindings: string[];
};

type MacroSlotSummary = {
  slot: number;
  crc: string;
  activeLength: number;
  stepCount: number;
  setting: number;
  mKey: number;
  runKey: number;
  flags: number;
  repeat: number;
  rawRecord: number[];
  error: string | null;
};

type MacroSummary = {
  device: DeviceSummary;
  listResponse: string;
  slots: MacroSlotSummary[];
};

type MacroWriteResult = {
  device: DeviceSummary;
  slot: MacroSlotSummary;
  ack: string;
  ackValue: number;
};

type StepAccuracySettings = {
  mode: number;
  value: number;
  extension: number;
};

type DeviceSettings = {
  pollingRate: number;
  stepAccuracy: StepAccuracySettings;
};

type DeviceSettingsWriteResult = {
  device: DeviceSummary;
  settings: DeviceSettings;
  pollingCommand: string;
  stepAccuracyCommand: string;
};

const VIBRATION_PRESETS: Record<Exclude<VibrationMode, "custom">, VibrationSettings> = {
  off: {
    left: { min: 0, max: 1 },
    right: { min: 0, max: 1 },
  },
  strong: {
    left: { min: 50, max: 200 },
    right: { min: 50, max: 200 },
  },
  standard: {
    left: { min: 50, max: 150 },
    right: { min: 50, max: 150 },
  },
  weak: {
    left: { min: 50, max: 100 },
    right: { min: 50, max: 100 },
  },
};

const curveRangeIds = [
  "curve-center",
  "curve-p1-x",
  "curve-p1-y",
  "curve-p2-x",
  "curve-p2-y",
  "curve-edge",
  "curve-stabilization",
] as const;

const KEYMAP_SLOT_COUNT = 32;

const KEYMAP_TARGET_LABELS = [
  "A", "B", "C", "X", "Y", "Z", "L1", "R1",
  "L2", "R2", "SELECT / View", "START / Menu", "HOME", "L3", "R3", "CAPTURE / Share",
  "Up", "Down", "Left", "Right", "Back", "Mode", "Menu", "M1",
  "M2", "M3", "M4", "M5", "M6", "M7", "M8", "POWER",
] as const;

const KEYMAP_SLOT_LABELS = [
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

type KeymapChoice =
  | { kind: "identity"; label: string }
  | { kind: "controller"; slot: number; label: string }
  | { kind: "keyboard"; modifier: number; usage: number; secondUsage: number; label: string }
  | { kind: "none"; label: "なし" };

const KEYMAP_VISIBLE_SOURCES = [
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

const KEYMAP_CONTROLLER_CHOICES: readonly KeymapChoice[] = [
  ...KEYMAP_TARGET_LABELS.map((label, slot) => ({ kind: "controller" as const, slot, label })),
  { kind: "none", label: "なし" },
];

const KEYBOARD_KEYS = [
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

const KEYBOARD_MODIFIERS = [
  ["None", 0x00],
  ["L Ctrl", 0x01],
  ["L Shift", 0x02],
  ["L Alt", 0x04],
  ["R Ctrl", 0x10],
  ["R Shift", 0x20],
  ["R Alt", 0x40],
] as const;

const KEYMAP_DEFAULT_ENTRY = "00000000";
const KEYMAP_CONTROLLER_TYPE = 0x01;
const KEYMAP_KEYBOARD_TYPE = 0x02;
const KEYMAP_NO_TARGET = 0xff;

const POLLING_RATE_OPTIONS = [
  { code: 2, hz: 250 },
  { code: 1, hz: 500 },
  { code: 0, hz: 1000 },
  { code: 3, hz: 2000 },
] as const;

const STEP_ACCURACY_OPTIONS = [
  { value: "adaptive", label: "アダプティブ" },
  { value: "32", label: "32" },
  { value: "64", label: "64" },
  { value: "128", label: "128" },
  { value: "256", label: "256" },
] as const;

const MACRO_INPUT_OPTIONS = [
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
const MACRO_MAX_STEPS = 64;

type MacroStep = {
  durationMs: number;
  marker: boolean;
  inputMask: number;
  analog: [number, number, number, number];
};

const byId = <T extends Element = HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing UI element #${id}`);
  }
  return element as unknown as T;
};

let busy = false;
let deviceSession: DeviceSession | null = null;
let profileList: ProfileListEntry[] = [];
let editingProfile: ProfileDocument | null = null;
let activeProfileReadState: ActiveProfileReadState = "pending";
let activeDeviceProfile: number[] | null = null;
let settingsDirty = false;
let vibrationDirty = false;
let deviceSettingsDirty = false;
let currentDeviceSettings: DeviceSettings | null = null;
type Stick = "leftStick" | "rightStick";
let selectedStick: Stick = "leftStick";
let curveDrafts: Record<Stick, CurveSettings> = {
  leftStick: { center: 0, point1X: 0, point1Y: 0, point2X: 0, point2Y: 0, edge: 0, stabilization: 0 },
  rightStick: { center: 0, point1X: 0, point1Y: 0, point2X: 0, point2Y: 0, edge: 0, stabilization: 0 },
};
let rapidFireDraft: RapidFireSettings = {
  keys: Array.from({ length: KEYMAP_SLOT_COUNT }, () => null),
  speedIndex: null,
};
let keymapDraft: string[] = Array.from({ length: KEYMAP_SLOT_COUNT }, () => KEYMAP_DEFAULT_ENTRY);
let activeKeymapSlot: number | null = null;
let pendingKeymapChoice: KeymapChoice | null = null;
let macroSummary: MacroSummary | null = null;
let macroDraftRecord: number[] | null = null;

function setMessage(message: string) {
  byId("message").textContent = message;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function setBusy(value: boolean, message?: string) {
  busy = value;
  if (message !== undefined) {
    setMessage(message);
  }
  syncActions();
}

function syncActions() {
  byId<HTMLButtonElement>("refresh-device").disabled = busy;
  byId<HTMLButtonElement>("import-profile").disabled = busy;
  byId<HTMLButtonElement>("new-profile").disabled = busy;
  byId<HTMLButtonElement>("read-device-profile").disabled = busy || !deviceSession;
  byId<HTMLButtonElement>("save-profile").disabled = busy || !editingProfile
    || (editingProfile.saved && !settingsDirty && !vibrationDirty && !deviceSettingsDirty);
  byId<HTMLButtonElement>("refresh-macros").disabled = busy || !deviceSession;
  byId<HTMLButtonElement>("add-macro-step").disabled = busy || !macroDraftRecord || (macroDraftRecord.length - 10) / 10 >= MACRO_MAX_STEPS;
  byId<HTMLButtonElement>("write-macro").disabled = busy || !deviceSession || !macroDraftRecord;
}

function renderDetails(id: string, rows: Array<[string, string]>) {
  const details = byId(id);
  details.replaceChildren();
  for (const [label, value] of rows) {
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value;
    details.append(term, description);
  }
}

function renderDevice(session: DeviceSession | null) {
  const name = byId("device-name");
  if (!session) {
    name.textContent = "接続を確認しています";
    renderDetails("device-details", []);
    return;
  }
  name.textContent = session.device.product;
  renderDetails("device-details", [
    ["Device", session.device.vendorProduct],
    ["Usage", session.device.usage],
    ["Path", session.device.path],
    ["UUID", session.uuid || "不明"],
    ["ZKM", session.zkmVersion ? `0x${session.zkmVersion.toString(16).toUpperCase()}` : "不明"],
  ]);
}

function setConnection(session: DeviceSession | null) {
  const connection = byId("connection");
  deviceSession = session;
  renderDevice(session);

  if (!session) {
    connection.textContent = "未接続";
    connection.className = "badge offline";
    return;
  }

  connection.textContent = "接続済み";
  connection.className = "badge online";
}

function clearProfile() {
  editingProfile = null;
  settingsDirty = false;
  vibrationDirty = false;
  deviceSettingsDirty = false;
  currentDeviceSettings = null;
  byId("settings-profile-status").textContent = "";
  byId("settings-profile-name").textContent = "";
  byId<HTMLButtonElement>("save-profile").textContent = "プロファイルを保存";
  renderDetails("profile-details", []);
  byId("curve-dirty").hidden = true;
  byId("settings-dirty").hidden = true;
  byId("device-dirty").hidden = true;
  syncActions();
}

function renderProfile(profile: ProfileDocument) {
  const crcState = profile.storedCrc === profile.computedCrc ? "一致" : "不一致";
  byId("settings-profile-name").textContent = profile.name;
  byId("settings-profile-status").textContent = profile.saved
    ? (crcState === "一致" ? "保存済み" : "CRC不一致")
    : "未保存の編集";
  byId<HTMLButtonElement>("save-profile").textContent = "プロファイルを保存";
  const rapid = profile.settings.rapidFire;
  const rapidButtons = KEYMAP_VISIBLE_SOURCES
    .filter(({ slot }) => rapid.keys[slot] === true)
    .map(({ label }) => label);
  const rapidState = rapidButtons.length === 0 ? "なし" : `${rapidButtons.join(" / ")} 有効`;
  const timing = profile.settings.rapidFireTiming
    ? `${profile.settings.rapidFireTiming.hz}回/秒`
    : profile.settings.rapidFireSpeedIndex === null ? "不明" : "設定済み";
  const changedKeymaps = profile.settings.keyBindings
    .filter((entry) => entry.toUpperCase() !== KEYMAP_DEFAULT_ENTRY)
    .length;
  const curveSummary = (curve: CurveSettings) =>
    `センター ${curve.center} / エッジ ${curve.edge} / 安定化 ${curve.stabilization}`;
  renderDetails("profile-details", [
    ["振動", `左 ${profile.vibration.left.min}–${profile.vibration.left.max} / 右 ${profile.vibration.right.min}–${profile.vibration.right.max}`],
    ["左スティック", curveSummary(profile.settings.leftStick)],
    ["右スティック", curveSummary(profile.settings.rightStick)],
    ["キーバインド", changedKeymaps === 0 ? "標準" : `${changedKeymaps}件変更`],
    ["連射", `${rapidState} / ${timing}`],
  ]);
}

function setRangeControl(id: string, value: number) {
  byId<HTMLInputElement>(id).value = String(value);
  updateRangeOutput(id);
}

function clampPercentage(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function clampRangeValue(id: string, value: number): number {
  const input = byId<HTMLInputElement>(id);
  const min = Number(input.min);
  const max = Number(input.max);
  return Math.min(max, Math.max(min, Math.round(value)));
}

function updateRangeOutput(id: string) {
  const value = byId<HTMLInputElement>(id).value;
  const target = byId(`${id}-value`);
  if (target instanceof HTMLInputElement) {
    target.value = value;
  } else {
    target.textContent = value;
  }
}

function updateCurveFromDirectInput(id: string) {
  const input = byId<HTMLInputElement>(`${id}-value`);
  const raw = input.value.trim();
  if (raw.length === 0) return;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return;
  const value = clampRangeValue(id, parsed);
  byId<HTMLInputElement>(id).value = String(value);
  input.value = String(value);
  updateRangeOutput(id);
  markSettingsDirty();
}

function commitCurveDirectInput(id: string) {
  const input = byId<HTMLInputElement>(`${id}-value`);
  const parsed = Number(input.value);
  const value = Number.isFinite(parsed) ? clampRangeValue(id, parsed) : readRangeValue(id);
  byId<HTMLInputElement>(id).value = String(value);
  input.value = String(value);
  updateRangeOutput(id);
  markSettingsDirty();
}

function cloneVibration(settings: VibrationSettings): VibrationSettings {
  return {
    left: { ...settings.left },
    right: { ...settings.right },
  };
}

function vibrationEqual(left: VibrationSettings, right: VibrationSettings): boolean {
  return left.left.min === right.left.min
    && left.left.max === right.left.max
    && left.right.min === right.right.min
    && left.right.max === right.right.max;
}

function vibrationMode(settings: VibrationSettings): VibrationMode {
  for (const mode of ["off", "strong", "standard", "weak"] as const) {
    if (vibrationEqual(settings, VIBRATION_PRESETS[mode])) {
      return mode;
    }
  }
  return "custom";
}

function readVibrationSettings(): VibrationSettings {
  return {
    left: {
      min: readRangeValue("vibration-left-min"),
      max: readRangeValue("vibration-left-max"),
    },
    right: {
      min: readRangeValue("vibration-right-min"),
      max: readRangeValue("vibration-right-max"),
    },
  };
}

const VIBRATION_MIN_WIDTH = 20;

function enforceVibrationWidth(grip: "left" | "right", changed: "min" | "max") {
  const minId = `vibration-${grip}-min`;
  const maxId = `vibration-${grip}-max`;
  let min = clampRangeValue(minId, readRangeValue(minId));
  let max = clampRangeValue(maxId, readRangeValue(maxId));
  if (changed === "min") {
    min = Math.min(min, 255 - VIBRATION_MIN_WIDTH);
    max = Math.max(max, min + VIBRATION_MIN_WIDTH);
  } else {
    max = Math.max(max, VIBRATION_MIN_WIDTH);
    min = Math.min(min, max - VIBRATION_MIN_WIDTH);
  }
  setRangeControl(minId, min);
  setRangeControl(maxId, max);
}

function updateVibrationEditorState() {
  const mode = byId<HTMLSelectElement>("vibration-mode").value as VibrationMode;
  const custom = mode === "custom";
  for (const id of [
    "vibration-left-min",
    "vibration-left-max",
    "vibration-right-min",
    "vibration-right-max",
  ] as const) {
    byId<HTMLInputElement>(id).disabled = !custom;
  }
}

function setVibrationControls(settings: VibrationSettings) {
  const mode = vibrationMode(settings);
  const values = mode === "custom" && [settings.left, settings.right]
    .some((grip) => grip.max < grip.min || grip.max - grip.min < VIBRATION_MIN_WIDTH)
    ? { left: { min: 0, max: 255 }, right: { min: 0, max: 255 } }
    : settings;
  setRangeControl("vibration-left-min", values.left.min);
  setRangeControl("vibration-left-max", values.left.max);
  setRangeControl("vibration-right-min", values.right.min);
  setRangeControl("vibration-right-max", values.right.max);
  byId<HTMLSelectElement>("vibration-mode").value = mode;
  updateVibrationEditorState();
}

function applyVibrationMode(mode: VibrationMode) {
  if (mode !== "custom") {
    setVibrationControls(cloneVibration(VIBRATION_PRESETS[mode]));
    return;
  }
  const current = readVibrationSettings();
  const hasEditableWidth = [current.left, current.right]
    .every((grip) => grip.max >= grip.min && grip.max - grip.min >= VIBRATION_MIN_WIDTH);
  if (!hasEditableWidth) {
    setVibrationControls({
      left: { min: 0, max: 255 },
      right: { min: 0, max: 255 },
    });
  } else {
    updateVibrationEditorState();
  }
}

function cloneCurve(curve: CurveSettings): CurveSettings {
  return { ...curve };
}

function cloneDeviceSettings(settings: DeviceSettings): DeviceSettings {
  return {
    pollingRate: settings.pollingRate,
    stepAccuracy: { ...settings.stepAccuracy },
  };
}

function normalizeKeymapEntry(raw: string): string {
  const compact = raw.replace(/[^0-9a-f]/gi, "").toUpperCase();
  return /^[0-9A-F]{8}$/.test(compact) ? compact : KEYMAP_DEFAULT_ENTRY;
}

function parseKeymapEntry(raw: string): number[] | null {
  if (!/^[0-9A-F]{8}$/.test(raw)) return null;
  return raw.match(/../g)?.map((byte) => Number.parseInt(byte, 16)) ?? null;
}

function formatKeymapBytes(bytes: number[]): string {
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function keymapChoiceForEntry(raw: string, sourceSlot: number): KeymapChoice | null {
  const bytes = parseKeymapEntry(raw);
  if (!bytes) return null;
  if (bytes.every((byte) => byte === 0)) {
    return { kind: "identity", label: KEYMAP_SLOT_LABELS[sourceSlot] ?? "標準" };
  }
  if (bytes[0] === KEYMAP_CONTROLLER_TYPE) {
    if (bytes[1] === KEYMAP_NO_TARGET) return { kind: "none", label: "なし" };
    const label = KEYMAP_TARGET_LABELS[bytes[1]];
    return label ? { kind: "controller", slot: bytes[1], label } : null;
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

function keymapDisplay(raw: string, sourceSlot: number): { label: string; detail: string; choice: KeymapChoice | null } {
  const choice = keymapChoiceForEntry(raw, sourceSlot);
  if (!choice) {
    return { label: "未設定", detail: "この割り当ては変更できません", choice: null };
  }
  if (choice.kind === "identity") {
    return { label: choice.label, detail: "標準", choice };
  }
  return { label: choice.label, detail: "設定済み", choice };
}

function rapidFireForSlot(slot: number): boolean | null {
  return rapidFireDraft.keys[slot] ?? null;
}

function toggleRapidFire(slot: number) {
  const state = rapidFireForSlot(slot);
  if (state === null) return;
  rapidFireDraft.keys[slot] = !state;
  renderKeymapRows();
  renderRapidFireControls(rapidFireDraft);
  markSettingsDirty();
}

function resetKeymapSlot(slot: number) {
  if (keymapDraft[slot] === KEYMAP_DEFAULT_ENTRY) return;
  keymapDraft[slot] = KEYMAP_DEFAULT_ENTRY;
  renderKeymapRows();
  updateKeymapSummary();
  markSettingsDirty();
}

function encodeKeymapChoice(choice: KeymapChoice): string {
  if (choice.kind === "identity") return KEYMAP_DEFAULT_ENTRY;
  if (choice.kind === "none") {
    return formatKeymapBytes([KEYMAP_CONTROLLER_TYPE, KEYMAP_NO_TARGET, KEYMAP_NO_TARGET, KEYMAP_NO_TARGET]);
  }
  if (choice.kind === "controller") {
    return formatKeymapBytes([KEYMAP_CONTROLLER_TYPE, choice.slot, KEYMAP_NO_TARGET, KEYMAP_NO_TARGET]);
  }
  return formatKeymapBytes([KEYMAP_KEYBOARD_TYPE, choice.modifier, choice.usage, choice.secondUsage]);
}

function keymapChoiceKey(choice: KeymapChoice | null): string {
  if (!choice) return "";
  if (choice.kind === "controller") return `controller:${choice.slot}`;
  if (choice.kind === "keyboard") return `keyboard:${choice.usage}`;
  return choice.kind;
}

function renderKeymapRows() {
  const container = byId("keymap-grid");
  container.replaceChildren(
    ...KEYMAP_VISIBLE_SOURCES.map(({ slot, label }) => {
      const row = document.createElement("div");
      row.className = "keymap-row";

      const sourceCell = document.createElement("div");
      sourceCell.className = "keymap-source-cell";
      const source = document.createElement("span");
      source.className = "keymap-source";
      source.textContent = label;
      const sourceHint = document.createElement("small");
      sourceHint.className = "keymap-hint";
      sourceHint.textContent = `スロット ${String(slot + 1).padStart(2, "0")}`;
      sourceCell.append(source, sourceHint);

      const mapping = keymapDisplay(keymapDraft[slot] ?? KEYMAP_DEFAULT_ENTRY, slot);
      const mappingButton = document.createElement("button");
      mappingButton.className = "keymap-mapping";
      if (mapping.choice && mapping.choice.kind !== "identity") {
        mappingButton.classList.add("keymap-mapping-configured");
      }
      mappingButton.type = "button";
      mappingButton.textContent = mapping.label;
      mappingButton.dataset.keymapSlot = String(slot);
      mappingButton.setAttribute("aria-label", `${label} のマッピング: ${mapping.label}`);
      mappingButton.addEventListener("click", () => openKeymapDialog(slot));

      const mappingCell = document.createElement("div");
      mappingCell.className = "keymap-mapping-cell";
      mappingCell.append(mappingButton);
      const mappingHint = document.createElement("small");
      mappingHint.className = "keymap-hint keymap-mapping-hint";
      mappingHint.textContent = mapping.detail;
      mappingCell.append(mappingHint);
      if (keymapDraft[slot] !== KEYMAP_DEFAULT_ENTRY) {
        const resetButton = document.createElement("button");
        resetButton.type = "button";
        resetButton.className = "keymap-reset";
        resetButton.textContent = "デフォルトに戻す";
        resetButton.setAttribute("aria-label", `${label} のバインドをデフォルトに戻す`);
        resetButton.addEventListener("click", () => resetKeymapSlot(slot));
        mappingCell.append(resetButton);
      }

      const rapidState = rapidFireForSlot(slot);
      const rapid = document.createElement(rapidState === null ? "span" : "button");
      rapid.className = rapidState === null ? "keymap-rapid" : "keymap-rapid keymap-rapid-toggle";
      if (rapid instanceof HTMLButtonElement) {
        rapid.type = "button";
        rapid.disabled = rapidState === null;
        rapid.setAttribute("aria-pressed", String(rapidState === true));
        rapid.addEventListener("click", () => toggleRapidFire(slot));
        rapid.title = rapidState === null ? "この連射状態は判定できません" : "連射を切り替えます";
      } else {
        rapid.title = rapidState === null ? "この連射状態は判定できません" : "読み取り専用の連射状態";
      }
      const rapidDot = document.createElement("span");
      rapidDot.className = "keymap-rapid-dot";
      if (rapidState === true) rapidDot.classList.add("enabled");
      if (rapidState === null) rapidDot.classList.add("unknown");
      rapid.append("連射", rapidDot);

      row.append(sourceCell, mappingCell, rapid);
      return row;
    }),
  );
}

function updateKeymapSummary() {
  const configured = keymapDraft.filter((entry) => entry !== KEYMAP_DEFAULT_ENTRY).length;
  byId("keymap-summary").textContent = configured === 0 ? "標準マッピング" : `${configured}スロット変更済み`;
}

function renderKeymap(keyBindings: string[], rapidFire: RapidFireSettings) {
  rapidFireDraft = {
    ...rapidFire,
    keys: Array.from({ length: KEYMAP_SLOT_COUNT }, (_, index) => rapidFire.keys[index] ?? null),
  };
  keymapDraft = Array.from({ length: KEYMAP_SLOT_COUNT }, (_, index) => normalizeKeymapEntry(keyBindings[index] ?? KEYMAP_DEFAULT_ENTRY));
  renderKeymapRows();
  updateKeymapSummary();
}

function readKeymap(): string[] {
  return keymapDraft.map((entry) => entry.trim().toUpperCase());
}

function renderRapidFireControls(settings: RapidFireSettings) {
  const speed = byId<HTMLSelectElement>("rapid-speed");
  speed.querySelector("option[data-generated]")?.remove();
  if (settings.speedIndex !== null && settings.speedIndex !== undefined
    && ![0, 1, 2].includes(settings.speedIndex)) {
    const option = document.createElement("option");
    option.dataset.generated = "true";
    option.value = String(settings.speedIndex);
    option.textContent = "現在の設定";
    speed.append(option);
  }
  speed.value = settings.speedIndex === null || settings.speedIndex === undefined
    ? "unknown"
    : String(settings.speedIndex);
  const timing = settings.speedIndex === null || settings.speedIndex === undefined
    ? "不明"
    : settings.timing
      ? `${settings.timing.hz}回/秒`
      : "現在の設定";
  byId("rapid-timing").textContent = timing;
}

function signedMacroByte(value: number): number {
  return value > 0x7f ? value - 0x100 : value;
}

function unsignedMacroByte(value: number): number {
  return Math.max(-0x80, Math.min(0x7f, Math.round(value))) & 0xff;
}

function readMacroStep(record: number[], index: number): MacroStep {
  const offset = 10 + index * 10;
  const bytes = record.slice(offset, offset + 10);
  const units = ((bytes[0] >> 4) | (bytes[1] << 4)) & 0xfff;
  return {
    durationMs: units * 8,
    marker: (bytes[0] & 1) !== 0,
    inputMask: (((bytes[2] << 24) | (bytes[3] << 16) | (bytes[4] << 8) | bytes[5]) >>> 0),
    analog: [signedMacroByte(bytes[6]), signedMacroByte(bytes[7]), signedMacroByte(bytes[8]), signedMacroByte(bytes[9])],
  };
}

function updateMacroStep(record: number[], index: number, changes: Partial<MacroStep>) {
  const offset = 10 + index * 10;
  const previous = readMacroStep(record, index);
  const next = { ...previous, ...changes };
  const step = record.slice(offset, offset + 10);
  const units = Math.max(0, Math.min(0xfff, Math.round(next.durationMs / 8)));
  step[0] = (step[0] & 0x0e) | ((units & 0x0f) << 4) | (next.marker ? 1 : 0);
  step[1] = (units >> 4) & 0xff;
  const mask = next.inputMask >>> 0;
  step[2] = (mask >>> 24) & 0xff;
  step[3] = (mask >>> 16) & 0xff;
  step[4] = (mask >>> 8) & 0xff;
  step[5] = mask & 0xff;
  next.analog.forEach((value, analogIndex) => {
    step[6 + analogIndex] = unsignedMacroByte(value);
  });
  record.splice(offset, 10, ...step);
}

function macroDirectionGroup(optionMask: number): { mask: number } | null {
  const normalized = optionMask >>> 0;
  const mask = MACRO_DIRECTION_GROUP_MASKS.find((candidate) =>
    (((normalized & candidate) >>> 0) === normalized));
  return mask === undefined ? null : { mask };
}

function macroInputOptionActive(inputMask: number, optionMask: number): boolean {
  const normalized = inputMask >>> 0;
  const group = macroDirectionGroup(optionMask);
  if (group) {
    return (((normalized & group.mask) >>> 0) === optionMask);
  }
  return (((normalized & optionMask) >>> 0) === optionMask);
}

function toggleMacroInput(inputMask: number, optionMask: number): number {
  const normalized = inputMask >>> 0;
  const group = macroDirectionGroup(optionMask);
  if (!group) {
    return (((normalized & optionMask) >>> 0) === optionMask
      ? normalized & (~optionMask >>> 0)
      : normalized | optionMask) >>> 0;
  }

  const withoutDirection = normalized & (~group.mask >>> 0);
  return (((normalized & group.mask) >>> 0) === optionMask
    ? withoutDirection
    : (withoutDirection | optionMask)) >>> 0;
}

function macroInputLabels(mask: number): string[] {
  return MACRO_INPUT_OPTIONS
    .filter(([, optionMask]) => macroInputOptionActive(mask, optionMask))
    .map(([label]) => label);
}

function macroRunKeyLabel(value: number): string {
  return value >= 0x17 && value <= 0x1a ? `M${value - 0x16}` : "未設定";
}

function macroStepCount(record: number[]): number {
  return Math.max(0, (record.length - 10) / 10);
}

function setMacroSelectValue(id: string, value: number) {
  const select = byId<HTMLSelectElement>(id);
  select.querySelector("option[data-generated]")?.remove();
  const textValue = String(value);
  if (!Array.from(select.options).some((option) => option.value === textValue)) {
    const option = document.createElement("option");
    option.dataset.generated = "true";
    option.value = textValue;
    option.textContent = "現在の設定";
    select.append(option);
  }
  select.value = textValue;
}

function renderMacroHeader(record: number[]) {
  if (record.length < 10) return;
  byId<HTMLInputElement>("macro-repeat").value = String((record[8] << 8) | record[9]);
  setMacroSelectValue("macro-m-key-select", record[5]);
  setMacroSelectValue("macro-run-key-select", record[6]);
  byId<HTMLInputElement>("macro-run-after-release").checked = (record[7] & 1) !== 0;
  byId<HTMLInputElement>("macro-loop").checked = (record[7] & 2) !== 0;
}

function macroNumber(id: string, maximum: number): number {
  const value = Number(byId<HTMLInputElement>(id).value);
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new Error(`${id} must be an integer between 0 and ${maximum}`);
  }
  return value;
}

function syncFriendlyMacroHeader(record: number[]) {
  const mKey = Number(byId<HTMLSelectElement>("macro-m-key-select").value);
  const runKey = Number(byId<HTMLSelectElement>("macro-run-key-select").value);
  if (!Number.isInteger(mKey) || !Number.isInteger(runKey)) {
    throw new Error("マクロの呼び出しキーを選択してください");
  }
  const repeat = macroNumber("macro-repeat", 0xffff);
  const flags = (byId<HTMLInputElement>("macro-run-after-release").checked ? 1 : 0)
    | (byId<HTMLInputElement>("macro-loop").checked ? 2 : 0);
  record[5] = mKey;
  record[6] = runKey;
  record[7] = flags;
  record[8] = repeat >> 8;
  record[9] = repeat & 0xff;
}

function macroSlotDescription(slot: MacroSlotSummary): string {
  const state = slot.error ? "読み取り失敗" : slot.stepCount === 0 ? "空" : `${slot.stepCount}ステップ`;
  return `スロット ${slot.slot + 1} · ${state} · 呼び出し ${macroRunKeyLabel(slot.runKey)}`;
}

function commitMacroStep(index: number, changes: Partial<MacroStep>) {
  if (!macroDraftRecord) return;
  updateMacroStep(macroDraftRecord, index, changes);
  renderMacroSteps(macroDraftRecord);
  syncActions();
}

function renderMacroSteps(record: number[] | null) {
  const container = byId("macro-step-list");
  container.replaceChildren();
  if (!record || record.length < 10) {
    const empty = document.createElement("p");
    empty.className = "empty-hint";
    empty.textContent = "先にコントローラーからマクロを読み込んでください。";
    container.append(empty);
    return;
  }
  const count = macroStepCount(record);
  if (count === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-hint";
    empty.textContent = "この枠は空です。「ステップを追加」から作成できます。";
    container.append(empty);
    return;
  }
  for (let index = 0; index < count; index += 1) {
    const step = readMacroStep(record, index);
    const card = document.createElement("article");
    card.className = "macro-step-card";

    const heading = document.createElement("div");
    heading.className = "macro-step-heading";
    const title = document.createElement("strong");
    title.textContent = `ステップ ${index + 1}`;
    const summary = document.createElement("span");
    const labels = macroInputLabels(step.inputMask);
    summary.textContent = `${step.durationMs} ms · ${labels.length > 0 ? labels.join(" + ") : "入力なし"}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger-button";
    remove.textContent = "削除";
    remove.disabled = busy;
    remove.addEventListener("click", () => {
      if (!macroDraftRecord) return;
      macroDraftRecord.splice(10 + index * 10, 10);
      renderMacroSteps(macroDraftRecord);
      syncActions();
    });
    heading.append(title, summary, remove);
    card.append(heading);

    const basic = document.createElement("div");
    basic.className = "macro-step-basic";
    const durationLabel = document.createElement("label");
    durationLabel.textContent = "時間 (ms)";
    const duration = document.createElement("input");
    duration.type = "number";
    duration.min = "0";
    duration.max = "32760";
    duration.step = "8";
    duration.value = String(step.durationMs);
    duration.addEventListener("change", () => {
      const value = Number(duration.value);
      if (Number.isFinite(value)) commitMacroStep(index, { durationMs: Math.max(0, Math.min(32760, value)) });
    });
    durationLabel.append(duration);
    const markerLabel = document.createElement("label");
    markerLabel.className = "macro-check";
    const marker = document.createElement("input");
    marker.type = "checkbox";
    marker.checked = step.marker;
    marker.addEventListener("change", () => commitMacroStep(index, { marker: marker.checked }));
    markerLabel.append(marker, document.createTextNode("前の入力状態を引き継ぐ"));
    basic.append(durationLabel, markerLabel);
    card.append(basic);

    const inputTitle = document.createElement("p");
    inputTitle.className = "macro-subheading";
    inputTitle.textContent = "コントローラー入力（複数選択可）";
    card.append(inputTitle);
    const keyGrid = document.createElement("div");
    keyGrid.className = "macro-key-grid";
    for (const [label, mask] of MACRO_INPUT_OPTIONS) {
      const key = document.createElement("button");
      key.type = "button";
      key.className = "macro-key-toggle";
      const active = macroInputOptionActive(step.inputMask, mask);
      key.classList.toggle("active", active);
      key.setAttribute("aria-pressed", String(active));
      key.textContent = label;
      key.addEventListener("click", () => {
        const current = readMacroStep(macroDraftRecord ?? record, index);
        const nextMask = toggleMacroInput(current.inputMask, mask);
        commitMacroStep(index, { inputMask: nextMask });
      });
      keyGrid.append(key);
    }
    card.append(keyGrid);

    const analogTitle = document.createElement("p");
    analogTitle.className = "macro-subheading";
    analogTitle.textContent = "スティック（-128〜127）";
    card.append(analogTitle);
    const analogGrid = document.createElement("div");
    analogGrid.className = "macro-analog-grid";
    const analogLabels = ["左 X", "左 Y", "右 X", "右 Y"];
    analogLabels.forEach((label, analogIndex) => {
      const field = document.createElement("label");
      field.textContent = label;
      const input = document.createElement("input");
      input.type = "number";
      input.min = "-128";
      input.max = "127";
      input.value = String(step.analog[analogIndex]);
      input.addEventListener("change", () => {
        const value = Number(input.value);
        if (!Number.isFinite(value)) return;
        const analog = [...readMacroStep(macroDraftRecord ?? record, index).analog] as MacroStep["analog"];
        analog[analogIndex] = Math.max(-128, Math.min(127, Math.round(value)));
        commitMacroStep(index, { analog });
      });
      field.append(input);
      analogGrid.append(field);
    });
    card.append(analogGrid);
    container.append(card);
  }
}

function addMacroStep() {
  if (!macroDraftRecord) return;
  if (macroStepCount(macroDraftRecord) >= MACRO_MAX_STEPS) {
    setMessage("マクロは最大64ステップです。");
    return;
  }
  macroDraftRecord.push(0x10, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  renderMacroSteps(macroDraftRecord);
  syncActions();
}

function selectMacroSlot(slot: number) {
  const selected = macroSummary?.slots.find((entry) => entry.slot === slot);
  if (!selected) return;
  byId<HTMLSelectElement>("macro-slot").value = String(slot);
  byId("macro-editor-title").textContent = `スロット ${slot + 1} の編集`;
  macroDraftRecord = selected.rawRecord.length >= 10 ? selected.rawRecord.slice() : null;
  if (macroDraftRecord) {
    renderMacroHeader(macroDraftRecord);
  }
  renderMacroSteps(macroDraftRecord);
  byId("macro-slot-details").textContent = selected.error
    ? `${macroSlotDescription(selected)}: ${selected.error}`
    : `${macroSlotDescription(selected)}。ここで編集できます。`;
  syncActions();
}

function renderMacroSummary(summary: MacroSummary) {
  macroSummary = summary;
  const container = byId("macro-slots");
  container.replaceChildren(
    ...summary.slots.map((slot) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "macro-slot-card";
      button.textContent = macroSlotDescription(slot);
      button.classList.toggle("selected", slot.slot === Number(byId<HTMLSelectElement>("macro-slot").value));
      button.addEventListener("click", () => selectMacroSlot(slot.slot));
      return button;
    }),
  );
  const current = Number(byId<HTMLSelectElement>("macro-slot").value);
  selectMacroSlot(summary.slots.some((slot) => slot.slot === current) ? current : 0);
  byId("macro-output").textContent = "読み込み完了。編集するスロットを選択してください。";
}

async function refreshMacros() {
  const path = deviceSession?.device.path;
  if (!path) return;
  setBusy(true, "マクロの4枠を読み込んでいます…");
  try {
    renderMacroSummary(await invoke<MacroSummary>("read_macros", { devicePath: path }));
    setMessage("マクロ4枠を読み込みました。");
  } catch (error) {
    byId("macro-output").textContent = errorMessage(error);
    setMessage(errorMessage(error));
  } finally {
    setBusy(false);
  }
}

async function writeMacro() {
  const path = deviceSession?.device.path;
  if (!path) return;
  try {
    const slot = Number(byId<HTMLSelectElement>("macro-slot").value);
    if (!macroDraftRecord) {
      throw new Error("先にコントローラーからマクロを読み込んでください");
    }
    const record = macroDraftRecord.slice();
    syncFriendlyMacroHeader(record);
    macroDraftRecord = record;
    setBusy(true, `マクロ スロット${slot + 1}を保存後、コントローラーから読み返しています…`);
    const result = await invoke<MacroWriteResult>("write_macro", {
      devicePath: path,
      slot,
      rawRecord: record,
    });
    if (macroSummary) {
      macroSummary = {
        ...macroSummary,
        slots: macroSummary.slots.map((entry) => entry.slot === slot ? result.slot : entry),
      };
      renderMacroSummary(macroSummary);
    }
    byId("macro-output").textContent = `${macroSlotDescription(result.slot)}を保存しました。`;
    setMessage(`マクロ スロット${slot + 1}を保存しました。`);
  } catch (error) {
    byId("macro-output").textContent = errorMessage(error);
    setMessage(errorMessage(error));
  } finally {
    setBusy(false);
  }
}

function updateKeymapDialogSelection() {
  const selected = keymapChoiceKey(pendingKeymapChoice);
  document.querySelectorAll<HTMLButtonElement>("[data-keymap-choice]").forEach((button) => {
    button.classList.toggle("selected", button.dataset.keymapChoice === selected);
  });
  byId<HTMLButtonElement>("keymap-dialog-confirm").disabled = pendingKeymapChoice === null;
}

function renderKeymapChoiceButtons() {
  const controllerContainer = byId("keymap-controller-grid");
  controllerContainer.replaceChildren(
    ...KEYMAP_CONTROLLER_CHOICES.map((choice) => {
      const button = document.createElement("button");
      button.className = `key-choice${choice.kind === "none" ? " key-choice-null" : ""}`;
      button.type = "button";
      button.textContent = choice.label;
      button.dataset.keymapChoice = keymapChoiceKey(choice);
      button.addEventListener("click", () => {
        pendingKeymapChoice = choice;
        updateKeymapDialogSelection();
      });
      return button;
    }),
  );

  const modifierSelect = byId<HTMLSelectElement>("keymap-keyboard-modifier");
  modifierSelect.replaceChildren(
    ...KEYBOARD_MODIFIERS.map(([label, value]) => {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = label === "None" ? "なし" : label;
      return option;
    }),
  );
  const secondSelect = byId<HTMLSelectElement>("keymap-keyboard-second");
  secondSelect.replaceChildren(
    (() => {
      const option = document.createElement("option");
      option.value = "0";
      option.textContent = "None";
      return option;
    })(),
    ...KEYBOARD_KEYS.map(([label, usage]) => {
      const option = document.createElement("option");
      option.value = String(usage);
      option.textContent = label;
      return option;
    }),
  );
  if (pendingKeymapChoice?.kind === "keyboard") {
    modifierSelect.value = String(pendingKeymapChoice.modifier);
    secondSelect.value = String(pendingKeymapChoice.secondUsage);
  } else {
    modifierSelect.value = "0";
    secondSelect.value = "0";
  }
  const keyboardChoiceWithControls = (usage: number, label: string): KeymapChoice => {
    const modifier = Number(modifierSelect.value);
    const secondUsage = Number(secondSelect.value);
    const secondLabel = KEYBOARD_KEYS.find(([, candidate]) => candidate === secondUsage)?.[0];
    return {
      kind: "keyboard",
      modifier,
      usage,
      secondUsage,
      label: `${KEYBOARD_MODIFIERS.find(([, value]) => value === modifier)?.[0] === "None" ? "" : `${KEYBOARD_MODIFIERS.find(([, value]) => value === modifier)?.[0]} + `}${label}${secondLabel ? ` + ${secondLabel}` : ""}`,
    };
  };
  modifierSelect.onchange = () => {
    const current = pendingKeymapChoice;
    if (current?.kind === "keyboard") {
      const key = KEYBOARD_KEYS.find(([, usage]) => usage === current.usage) ?? KEYBOARD_KEYS[0];
      pendingKeymapChoice = keyboardChoiceWithControls(key[1], key[0]);
      updateKeymapDialogSelection();
    }
  };
  secondSelect.onchange = () => {
    const current = pendingKeymapChoice;
    if (current?.kind === "keyboard") {
      const key = KEYBOARD_KEYS.find(([, usage]) => usage === current.usage) ?? KEYBOARD_KEYS[0];
      pendingKeymapChoice = keyboardChoiceWithControls(key[1], key[0]);
      updateKeymapDialogSelection();
    }
  };

  const keyboardContainer = byId("keymap-keyboard-grid");
  keyboardContainer.replaceChildren(
    ...KEYBOARD_KEYS.map(([label, usage]) => {
      const button = document.createElement("button");
      button.className = "key-choice";
      button.type = "button";
      button.textContent = label;
      button.dataset.keymapChoice = `keyboard:${usage}`;
      button.addEventListener("click", () => {
        pendingKeymapChoice = keyboardChoiceWithControls(usage, label);
        updateKeymapDialogSelection();
      });
      return button;
    }),
  );
}

function setKeymapDialogMode(mode: "controller" | "keyboard") {
  const controller = mode === "controller";
  byId("keymap-controller-panel").hidden = !controller;
  byId("keymap-keyboard-panel").hidden = controller;
  byId("keymap-controller-tab").classList.toggle("active", controller);
  byId("keymap-keyboard-tab").classList.toggle("active", !controller);
  byId("keymap-controller-tab").setAttribute("aria-selected", String(controller));
  byId("keymap-keyboard-tab").setAttribute("aria-selected", String(!controller));
  updateKeymapDialogSelection();
}

function openKeymapDialog(slot: number) {
  activeKeymapSlot = slot;
  const source = KEYMAP_SLOT_LABELS[slot] ?? `slot ${slot + 1}`;
  pendingKeymapChoice = keymapChoiceForEntry(keymapDraft[slot] ?? KEYMAP_DEFAULT_ENTRY, slot);
  byId("keymap-dialog-subtitle").textContent = `${source} のマッピングを選択してください。`;
  renderKeymapChoiceButtons();
  const current = pendingKeymapChoice?.kind === "keyboard" ? "keyboard" : "controller";
  setKeymapDialogMode(current);
  byId<HTMLDialogElement>("keymap-dialog").showModal();
}

function closeKeymapDialog() {
  const dialog = byId<HTMLDialogElement>("keymap-dialog");
  if (dialog.open) dialog.close();
  activeKeymapSlot = null;
  pendingKeymapChoice = null;
}

function confirmKeymapDialog() {
  if (activeKeymapSlot === null || pendingKeymapChoice === null) return;
  keymapDraft[activeKeymapSlot] = encodeKeymapChoice(pendingKeymapChoice);
  renderKeymapRows();
  updateKeymapSummary();
  closeKeymapDialog();
  markSettingsDirty();
}

function setPollingRateControl(value: number) {
  const select = byId<HTMLSelectElement>("polling-rate");
  select.querySelector("option[data-generated]")?.remove();
  if (!POLLING_RATE_OPTIONS.some((option) => option.code === value)) {
    const option = document.createElement("option");
    option.dataset.generated = "true";
    option.value = String(value);
    option.textContent = "現在の設定";
    select.append(option);
  }
  select.value = String(value);
}

function stepAccuracyChoice(settings: StepAccuracySettings): string | null {
  if (settings.mode === 0) return "adaptive";
  if (settings.mode !== 1) return null;
  return STEP_ACCURACY_OPTIONS.some((option) => option.value === String(settings.value) && option.value !== "adaptive")
    ? String(settings.value)
    : null;
}

function setStepAccuracyChoice(settings: StepAccuracySettings) {
  const select = byId<HTMLSelectElement>("step-accuracy");
  select.querySelector("option[data-generated]")?.remove();
  const choice = stepAccuracyChoice(settings);
  if (choice === null) {
    const option = document.createElement("option");
    option.dataset.generated = "true";
    option.value = "unknown";
    option.textContent = "現在の設定（変更不可）";
    select.append(option);
  }
  select.value = choice ?? "unknown";
}

function setDeviceSettingsControls(settings: DeviceSettings) {
  setPollingRateControl(settings.pollingRate);
  byId<HTMLInputElement>("step-accuracy-mode").value = String(settings.stepAccuracy.mode);
  byId<HTMLInputElement>("step-accuracy-value").value = String(settings.stepAccuracy.value);
  byId<HTMLInputElement>("step-accuracy-extension").value = String(settings.stepAccuracy.extension);
  setStepAccuracyChoice(settings.stepAccuracy);
}

function readDeviceSettings(): DeviceSettings {
  return {
    pollingRate: Number(byId<HTMLSelectElement>("polling-rate").value),
    stepAccuracy: {
      mode: Number(byId<HTMLInputElement>("step-accuracy-mode").value),
      value: Number(byId<HTMLInputElement>("step-accuracy-value").value),
      extension: Number(byId<HTMLInputElement>("step-accuracy-extension").value),
    },
  };
}

function deviceSettingsEqual(left: DeviceSettings, right: DeviceSettings): boolean {
  return left.pollingRate === right.pollingRate
    && left.stepAccuracy.mode === right.stepAccuracy.mode
    && left.stepAccuracy.value === right.stepAccuracy.value
    && left.stepAccuracy.extension === right.stepAccuracy.extension;
}

function markDeviceSettingsDirty() {
  deviceSettingsDirty = currentDeviceSettings !== null
    && !deviceSettingsEqual(currentDeviceSettings, readDeviceSettings());
  byId("device-dirty").hidden = !deviceSettingsDirty;
  syncActions();
}

function readRangeValue(id: string): number {
  return Number(byId<HTMLInputElement>(id).value);
}

function readActiveCurve(): CurveSettings {
  return {
    center: readRangeValue("curve-center"),
    point1X: readRangeValue("curve-p1-x"),
    point1Y: readRangeValue("curve-p1-y"),
    point2X: readRangeValue("curve-p2-x"),
    point2Y: readRangeValue("curve-p2-y"),
    edge: readRangeValue("curve-edge"),
    stabilization: readRangeValue("curve-stabilization"),
  };
}

function syncActiveCurveDraft() {
  curveDrafts[selectedStick] = readActiveCurve();
}

function setActiveCurve(curve: CurveSettings) {
  setRangeControl("curve-center", curve.center);
  setRangeControl("curve-p1-x", curve.point1X);
  setRangeControl("curve-p1-y", curve.point1Y);
  setRangeControl("curve-p2-x", curve.point2X);
  setRangeControl("curve-p2-y", curve.point2Y);
  setRangeControl("curve-edge", curve.edge);
  setRangeControl("curve-stabilization", curve.stabilization);
  updateCurvePreview();
}

function selectStick(stick: Stick) {
  if (stick !== selectedStick) {
    syncActiveCurveDraft();
  }
  selectedStick = stick;
  setActiveCurve(cloneCurve(curveDrafts[stick]));
  const left = stick === "leftStick";
  byId("stick-left-tab").classList.toggle("active", left);
  byId("stick-right-tab").classList.toggle("active", !left);
  byId("stick-left-tab").setAttribute("aria-selected", String(left));
  byId("stick-right-tab").setAttribute("aria-selected", String(!left));
  byId("stick-description").textContent = `${left ? "左" : "右"}スティックの設定`;
  updateCurvePreview();
}

function readSettingsInput(): ControllerSettingsInput {
  syncActiveCurveDraft();
  return {
    rectangleAlgorithm: byId<HTMLInputElement>("rectangle-algorithm").checked,
    leftStick: cloneCurve(curveDrafts.leftStick),
    rightStick: cloneCurve(curveDrafts.rightStick),
    rapidFire: {
      keys: [...rapidFireDraft.keys],
      speedIndex: rapidFireDraft.speedIndex ?? null,
    },
    keyBindings: readKeymap(),
  };
}

function curvesEqual(left: CurveSettings, right: CurveSettings): boolean {
  return left.center === right.center
    && left.point1X === right.point1X
    && left.point1Y === right.point1Y
    && left.point2X === right.point2X
    && left.point2Y === right.point2Y
    && left.edge === right.edge
    && left.stabilization === right.stabilization;
}

function settingsEqual(settings: ControllerSettings, input: ControllerSettingsInput): boolean {
  return settings.rectangleAlgorithm === input.rectangleAlgorithm
    && curvesEqual(settings.leftStick, input.leftStick)
    && curvesEqual(settings.rightStick, input.rightStick)
    && settings.rapidFire.keys.length === input.rapidFire.keys.length
    && settings.rapidFire.keys.every((value, index) => value === input.rapidFire.keys[index])
    && settings.rapidFireSpeedIndex === input.rapidFire.speedIndex
    && settings.keyBindings.length === input.keyBindings.length
    && settings.keyBindings.every((value, index) => value.toUpperCase() === input.keyBindings[index].toUpperCase());
}

function updateCurvePreview() {
  const curve = {
    center: readRangeValue("curve-center"),
    point1X: readRangeValue("curve-p1-x"),
    point1Y: readRangeValue("curve-p1-y"),
    point2X: readRangeValue("curve-p2-x"),
    point2Y: readRangeValue("curve-p2-y"),
    edge: readRangeValue("curve-edge"),
  };
  const svgPoint = (x: number, y: number) => `${20 + x * 2} ${220 - y * 2}`;
  const point1 = svgPoint(curve.point1X, curve.point1Y).split(" ");
  const point2 = svgPoint(curve.point2X, curve.point2Y).split(" ");
  byId<SVGPathElement>("curve-line").setAttribute(
    "d",
    `M ${svgPoint(0, 0)} L ${svgPoint(curve.point1X, curve.point1Y)} L ${svgPoint(curve.point2X, curve.point2Y)} L ${svgPoint(100, 100)}`,
  );
  for (const [id, point] of [["curve-point1", point1], ["curve-point2", point2]] as const) {
    byId<SVGCircleElement>(id).setAttribute("cx", point[0]);
    byId<SVGCircleElement>(id).setAttribute("cy", point[1]);
  }
  const centerCompensation = byId<SVGRectElement>("curve-center-compensation");
  const edgeCompensation = byId<SVGRectElement>("curve-edge-compensation");
  const centerCompensationHeight = Math.max(0, -curve.center) * 2;
  const edgeCompensationHeight = Math.max(0, -curve.edge) * 2;
  centerCompensation.setAttribute("y", String(220 - centerCompensationHeight));
  centerCompensation.setAttribute("height", String(centerCompensationHeight));
  edgeCompensation.setAttribute("height", String(edgeCompensationHeight));
  byId("curve-center-label").textContent = `センター ${curve.center}`;
  byId("curve-edge-label").textContent = `エッジ ${curve.edge}`;
}

type CurvePoint = "point1" | "point2";

const curvePointAxes = {
  point1: ["curve-p1-x", "curve-p1-y"],
  point2: ["curve-p2-x", "curve-p2-y"],
} as const;

let draggingPoint: CurvePoint | null = null;

function setPointFromPointer(point: CurvePoint, event: PointerEvent) {
  const svg = byId<SVGSVGElement>("curve-preview");
  const bounds = svg.getBoundingClientRect();
  if (bounds.width === 0 || bounds.height === 0) return;

  const svgX = (event.clientX - bounds.left) * (240 / bounds.width);
  const svgY = (event.clientY - bounds.top) * (240 / bounds.height);
  const x = clampPercentage((svgX - 20) / 2);
  const y = clampPercentage((220 - svgY) / 2);
  const [xId, yId] = curvePointAxes[point];
  byId<HTMLInputElement>(xId).value = String(x);
  byId<HTMLInputElement>(yId).value = String(y);
  updateRangeOutput(xId);
  updateRangeOutput(yId);
  markSettingsDirty();
}

function setupDraggablePoint(id: string, point: CurvePoint) {
  const circle = byId<SVGCircleElement>(id);
  circle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    draggingPoint = point;
    circle.classList.add("dragging");
    circle.setPointerCapture(event.pointerId);
    setPointFromPointer(point, event);
  });
  circle.addEventListener("pointermove", (event) => {
    if (draggingPoint === point && circle.hasPointerCapture(event.pointerId)) {
      setPointFromPointer(point, event);
    }
  });
  const stopDragging = (event: PointerEvent) => {
    if (draggingPoint !== point) return;
    if (circle.hasPointerCapture(event.pointerId)) {
      circle.releasePointerCapture(event.pointerId);
    }
    circle.classList.remove("dragging");
    draggingPoint = null;
  };
  circle.addEventListener("pointerup", stopDragging);
  circle.addEventListener("pointercancel", stopDragging);
}

function renderControllerSettings(profile: ProfileSummary) {
  const settings = profile.settings;
  curveDrafts = {
    leftStick: cloneCurve(settings.leftStick),
    rightStick: cloneCurve(settings.rightStick),
  };
  const rapidFire = {
    ...settings.rapidFire,
    speedIndex: settings.rapidFireSpeedIndex,
    timing: settings.rapidFireTiming,
  };
  renderKeymap(settings.keyBindings, rapidFire);
  renderRapidFireControls(rapidFire);
  selectedStick = "leftStick";
  byId<HTMLInputElement>("rectangle-algorithm").checked = settings.rectangleAlgorithm;
  setActiveCurve(cloneCurve(curveDrafts.leftStick));
  selectStick("leftStick");
  settingsDirty = false;
  byId("curve-dirty").hidden = true;
  byId("settings-dirty").hidden = true;
  updateCurvePreview();
}

function renderVibrationSettings(profile: ProfileSummary) {
  setVibrationControls(profile.vibration);
  vibrationDirty = false;
}

function renderSettings(profile: ProfileSummary) {
  renderControllerSettings(profile);
  renderVibrationSettings(profile);
  syncActions();
}

function markSettingsDirty() {
  settingsDirty = editingProfile !== null && !settingsEqual(editingProfile.settings, readSettingsInput());
  byId("curve-dirty").hidden = !settingsDirty;
  byId("settings-dirty").hidden = !settingsDirty;
  updateCurvePreview();
  syncActions();
}

function markVibrationDirty() {
  vibrationDirty = editingProfile !== null
    && !vibrationEqual(readVibrationSettings(), editingProfile.vibration);
  byId("settings-dirty").hidden = !settingsDirty && !vibrationDirty;
  syncActions();
}

function showView(view: "home" | "settings") {
  const settingsVisible = view === "settings";
  byId("home-view").hidden = settingsVisible;
  byId("settings-view").hidden = !settingsVisible;
  byId("message").hidden = false;
  if (settingsVisible && editingProfile) {
    selectSettingsTab("stick");
  }
}

function selectSettingsTab(tab: "stick" | "keymap" | "device" | "vibration" | "macro") {
  const stickVisible = tab === "stick";
  byId("settings-stick-section").hidden = !stickVisible;
  byId("settings-keymap-section").hidden = tab !== "keymap";
  byId("settings-device-section").hidden = tab !== "device";
  byId("settings-vibration-section").hidden = tab !== "vibration";
  byId("settings-macro-section").hidden = tab !== "macro";
  byId("tab-stick").classList.toggle("active", stickVisible);
  byId("tab-keymap").classList.toggle("active", tab === "keymap");
  byId("tab-device").classList.toggle("active", tab === "device");
  byId("tab-vibration").classList.toggle("active", tab === "vibration");
  byId("tab-macro").classList.toggle("active", tab === "macro");
}

function normalizedUuid(value: string): string {
  return value.replace(/[^0-9a-f]/gi, "").toUpperCase();
}

function profileMatchesDevice(profile: { deviceUuid: string }): boolean {
  const profileUuid = normalizedUuid(profile.deviceUuid);
  const connectedUuid = normalizedUuid(deviceSession?.uuid ?? "");
  return Boolean(profileUuid && connectedUuid && profileUuid === connectedUuid);
}

function savedProfileBytes(entry: ProfileListEntry): number[] | null {
  try {
    const parsed: unknown = JSON.parse(entry.snapshot.configJson);
    if (!Array.isArray(parsed) || !parsed.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
      return null;
    }
    return parsed as number[];
  } catch {
    return null;
  }
}

function profileBytesEqual(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function profileIsActive(entry: ProfileListEntry): boolean {
  if (activeProfileReadState !== "known" || activeDeviceProfile === null || !profileMatchesDevice(entry)) {
    return false;
  }
  const saved = savedProfileBytes(entry);
  return saved !== null && profileBytesEqual(saved, activeDeviceProfile);
}

function renderActiveProfileStatus() {
  const status = byId("active-profile-status");
  if (!deviceSession) {
    status.textContent = "現在使用中: 未接続";
    return;
  }
  if (activeProfileReadState === "pending") {
    status.textContent = "現在使用中: 確認中";
    return;
  }
  if (activeProfileReadState === "unknown" || activeDeviceProfile === null) {
    status.textContent = "現在使用中: 判定できません";
    return;
  }
  const activeProfiles = profileList.filter(profileIsActive);
  status.textContent = activeProfiles.length > 0
    ? `現在使用中: ${activeProfiles.map((profile) => profile.name || `Profile ${profile.id}`).join(" / ")}`
    : "現在使用中: ライブラリに未登録";
}

function renderProfileLibrary() {
  const container = byId("profile-library");
  container.replaceChildren();
  renderActiveProfileStatus();
  if (profileList.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-hint";
    empty.textContent = "共有プロファイルはまだありません。Shareコードから追加するか、コントローラーから読み込んでください。";
    container.append(empty);
    return;
  }

  const sorted = [...profileList].sort((left, right) => {
    const leftMatch = profileMatchesDevice(left) ? 1 : 0;
    const rightMatch = profileMatchesDevice(right) ? 1 : 0;
    if (leftMatch !== rightMatch) return rightMatch - leftMatch;
    return right.id - left.id;
  });
  for (const entry of sorted) {
    const matchesDevice = profileMatchesDevice(entry);
    const active = profileIsActive(entry);
    const card = document.createElement("article");
    card.className = "profile-card";
    card.classList.toggle("profile-card-matched", matchesDevice);
    card.classList.toggle("profile-card-active", active);
    const heading = document.createElement("div");
    heading.className = "profile-card-heading";
    const title = document.createElement("h3");
    title.textContent = entry.name || `Profile ${entry.id}`;
    const states = document.createElement("div");
    states.className = "profile-card-states";
    heading.append(title, states);
    if (active) {
      const state = document.createElement("span");
      state.className = "status-pill profile-active";
      state.textContent = "使用中";
      states.append(state);
    }
    if (!matchesDevice) {
      const state = document.createElement("span");
      state.className = `status-pill ${entry.supported ? "profile-compatible" : "profile-incompatible"}`;
      state.textContent = entry.supported ? "互換" : "非対応";
      states.append(state);
    }
    const details = document.createElement("p");
    details.className = "profile-card-details";
    details.textContent = [
      entry.deviceName || "機種情報なし",
      entry.deviceUuid ? `UUID ${entry.deviceUuid}` : "UUIDなし",
      entry.profileVersion ?? "バージョン不明",
      `${entry.profileLength} bytes`,
      entry.createdAt || "日時不明",
    ].join(" · ");
    const actions = document.createElement("div");
    actions.className = "button-row profile-card-actions";
    const open = document.createElement("button");
    open.type = "button";
    open.textContent = "開く";
    open.disabled = !entry.supported;
    open.addEventListener("click", () => void openSavedProfile(entry.id));
    const apply = document.createElement("button");
    apply.type = "button";
    apply.className = "primary";
    apply.textContent = "適用";
    apply.disabled = !entry.supported || !deviceSession || !matchesDevice;
    apply.addEventListener("click", () => void applySavedProfileFromCard(entry.id));
    const share = document.createElement("button");
    share.type = "button";
    share.textContent = "Shareコードを発行";
    share.disabled = !entry.supported;
    share.addEventListener("click", () => void shareSavedProfile(entry.id));
    const duplicate = document.createElement("button");
    duplicate.type = "button";
    duplicate.textContent = "複製";
    duplicate.disabled = !entry.supported;
    duplicate.addEventListener("click", () => void duplicateProfile(entry));
    const rename = document.createElement("button");
    rename.type = "button";
    rename.textContent = "名前変更";
    rename.addEventListener("click", () => void renameProfile(entry));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger-button";
    remove.textContent = "削除";
    remove.addEventListener("click", () => void deleteProfile(entry));
    actions.append(open, apply, share, duplicate, rename, remove);
    card.append(heading, details, actions);
    container.append(card);
  }
}

function setEditingProfile(profile: ProfileDocument) {
  editingProfile = profile;
  settingsDirty = false;
  vibrationDirty = false;
  renderProfile(profile);
  renderSettings(profile);
  syncActions();
}

async function refreshProfiles() {
  profileList = await invoke<ProfileListEntry[]>("list_profiles");
  renderProfileLibrary();
}

async function openSavedProfile(id: number) {
  setBusy(true, "プロファイルを読み込んでいます…");
  try {
    setEditingProfile(await invoke<ProfileDocument>("load_saved_profile", { id }));
    showView("settings");
    setMessage("プロファイルを開きました。コントローラー未接続でも編集できます。");
  } catch (error) {
    setMessage(errorMessage(error));
    await refreshProfiles().catch(() => undefined);
  } finally {
    setBusy(false);
  }
}

async function duplicateProfile(entry: ProfileListEntry) {
  const name = window.prompt("複製後のプロファイル名", `${entry.name} コピー`);
  if (name === null) return;
  setBusy(true, "プロファイルを複製しています…");
  try {
    const source = await invoke<ProfileDocument>("load_saved_profile", { id: entry.id });
    const saved = await invoke<ProfileDocument>("save_profile", {
      input: {
        id: null,
        name,
        rawProfile: source.rawProfile,
        deviceUuid: source.deviceUuid,
        deviceName: source.deviceName,
        firmwareVersion: source.firmwareVersion,
        zkmVersion: source.zkmVersion,
        snapshot: null,
      },
    });
    setEditingProfile(saved);
    await refreshProfiles();
    showView("settings");
    setMessage("プロファイルを複製しました。");
  } catch (error) {
    setMessage(errorMessage(error));
  } finally {
    setBusy(false);
  }
}

async function renameProfile(entry: ProfileListEntry) {
  const name = window.prompt("新しいプロファイル名", entry.name);
  if (name === null || name.trim() === entry.name) return;
  setBusy(true, "プロファイル名を変更しています…");
  try {
    const source = await invoke<ProfileDocument>("load_saved_profile", { id: entry.id });
    const saved = await invoke<ProfileDocument>("save_profile", {
      input: {
        id: source.id,
        name,
        rawProfile: source.rawProfile,
        deviceUuid: source.deviceUuid,
        deviceName: source.deviceName,
        firmwareVersion: source.firmwareVersion,
        zkmVersion: source.zkmVersion,
        snapshot: source.snapshot,
      },
    });
    if (editingProfile?.id === saved.id) setEditingProfile(saved);
    await refreshProfiles();
    setMessage("プロファイル名を変更しました。");
  } catch (error) {
    setMessage(errorMessage(error));
  } finally {
    setBusy(false);
  }
}

async function deleteProfile(entry: ProfileListEntry) {
  if (!window.confirm(`「${entry.name}」を削除しますか？`)) return;
  setBusy(true, "プロファイルを削除しています…");
  try {
    await invoke("delete_profile", { input: { id: entry.id, snapshot: entry.snapshot } });
    if (editingProfile?.id === entry.id) {
      clearProfile();
      showView("home");
    }
    await refreshProfiles();
    setMessage("プロファイルを削除しました。");
  } catch (error) {
    const message = errorMessage(error);
    if (message.startsWith("PROFILE_CONFLICT:")) {
      setMessage("公式アプリ側で変更されています。再読込してから削除してください。");
      await refreshProfiles().catch(() => undefined);
    } else {
      setMessage(message);
    }
  } finally {
    setBusy(false);
  }
}

async function refreshActiveDeviceProfile(session: DeviceSession) {
  activeProfileReadState = "pending";
  activeDeviceProfile = null;
  renderProfileLibrary();
  try {
    const profile = await invoke<ProfileDocument>("read_profile", { devicePath: session.device.path });
    if (deviceSession?.device.path !== session.device.path) return;
    activeDeviceProfile = [...profile.rawProfile];
    activeProfileReadState = "known";
  } catch {
    if (deviceSession?.device.path !== session.device.path) return;
    activeProfileReadState = "unknown";
  }
  renderProfileLibrary();
}

async function scan() {
  let deviceSettingsError: unknown = null;
  setBusy(true, "コントローラーと共有プロファイルを確認しています…");
  try {
    setConnection(await invoke<DeviceSession | null>("scan_device"));
    clearProfile();
    activeDeviceProfile = null;
    activeProfileReadState = deviceSession ? "pending" : "known";
    if (deviceSession) {
      try {
        applyDeviceSettings(await fetchDeviceSettings(deviceSession.device.path));
      } catch (error) {
        deviceSettingsError = error;
        currentDeviceSettings = null;
        deviceSettingsDirty = false;
        byId("device-dirty").hidden = true;
      }
      await refreshActiveDeviceProfile(deviceSession);
    }
  } catch (error) {
    setConnection(null);
    clearProfile();
    activeDeviceProfile = null;
    activeProfileReadState = "known";
    showView("home");
    setMessage(errorMessage(error));
    setBusy(false);
    return;
  }
  try {
    await refreshProfiles();
    showView("home");
    setMessage(deviceSession
      ? "接続を確認しました。プロファイルを選択してください。"
      : "コントローラー未接続です。保存済みプロファイルは編集できます。");
    if (deviceSettingsError) {
      setMessage(`デバイス設定を読み込めませんでした: ${errorMessage(deviceSettingsError)}`);
    }
  } catch (error) {
    showView("home");
    setMessage(`プロファイル一覧を読み込めませんでした: ${errorMessage(error)}`);
  } finally {
    setBusy(false);
  }
}

async function readProfileFromDevice() {
  const session = deviceSession;
  if (!session) return;
  setBusy(true, "コントローラーのプロファイルを読み取っています…");
  try {
    const profile = await invoke<ProfileDocument>("read_profile", { devicePath: session.device.path });
    activeDeviceProfile = [...profile.rawProfile];
    activeProfileReadState = "known";
    setEditingProfile({
      ...profile,
      name: "コントローラーから読み込んだプロファイル",
      deviceUuid: session.uuid,
      deviceName: session.device.product,
      zkmVersion: session.zkmVersion ? String(session.zkmVersion) : "",
    });
    showView("settings");
    setMessage("コントローラーから読み込みました。保存するまでConfig.dbもコントローラーも変更していません。");
  } catch (error) {
    setMessage(errorMessage(error));
  } finally {
    setBusy(false);
  }
}

async function importShareProfile() {
  const shareCode = window.prompt("公式Shareコードを入力してください", "")?.trim();
  if (!shareCode) return;
  setBusy(true, "公式Shareコードを確認しています…");
  try {
    setEditingProfile(await invoke<ProfileDocument>("import_share_profile", {
      shareCode,
      deviceUuid: deviceSession?.uuid ?? "",
    }));
    showView("settings");
    setMessage("公式Shareコードからプロファイルを読み込みました。保存するまで共有DBは変更していません。");
  } catch (error) {
    setMessage(errorMessage(error));
  } finally {
    setBusy(false);
  }
}

async function createNewProfile() {
  setBusy(true, "新しいプロファイルを作成しています…");
  try {
    setEditingProfile(await invoke<ProfileDocument>("new_profile"));
    showView("settings");
    setMessage("新しいプロファイルを作成しました。設定後に保存してください。");
  } catch (error) {
    setMessage(errorMessage(error));
  } finally {
    setBusy(false);
  }
}

async function exportShareCode(profile: ProfileDocument) {
  const session = deviceSession;
  setBusy(true, "公式Shareコードを発行しています…");
  try {
    const shareCode = await invoke<string>("create_share_code", {
      name: profile.name || "BIGBIGWON Profile",
      profile: profile.rawProfile,
      deviceUuid: profile.deviceUuid || session?.uuid || "",
      deviceName: profile.deviceName || session?.device.product || "",
      firmwareVersion: profile.firmwareVersion,
      zkmVersion: profile.zkmVersion || (session?.zkmVersion ? String(session.zkmVersion) : ""),
    });
    let copied = false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(shareCode);
        copied = true;
      } catch {
        copied = false;
      }
    }
    setMessage(`公式Shareコードを発行しました${copied ? "。クリップボードにコピー済み" : ""}。\n${shareCode}`);
  } catch (error) {
    setMessage(errorMessage(error));
  } finally {
    setBusy(false);
  }
}

async function shareSavedProfile(id: number) {
  setBusy(true);
  try {
    const profile = await invoke<ProfileDocument>("load_saved_profile", { id });
    await exportShareCode(profile);
  } catch (error) {
    setMessage(errorMessage(error));
  } finally {
    setBusy(false);
  }
}

async function applySavedProfileFromCard(id: number) {
  const session = deviceSession;
  if (busy || !session) return;
  setBusy(true, "保存済みプロファイルをコントローラーへ適用しています…");
  try {
    const profile = await invoke<ProfileDocument>("load_saved_profile", { id });
    if (!profile.saved || !profile.supported || !profileMatchesDevice(profile)) {
      throw new Error("選択したプロファイルは接続中コントローラーに適用できません。");
    }
    await applySavedProfileToDevice(profile, session);
    renderProfileLibrary();
    setMessage("プロファイルをコントローラーへ適用しました。");
  } catch (error) {
    setMessage(errorMessage(error));
  } finally {
    setBusy(false);
  }
}

async function applySavedProfileToDevice(profile: ProfileDocument, session: DeviceSession) {
  if (!profile.saved || profile.id === null || !profile.supported || !profileMatchesDevice(profile)) return;
  const result = await invoke<ApplyProfileResult>("apply_profile", {
    profile: profile.rawProfile,
    devicePath: session.device.path,
  });
  activeDeviceProfile = [...result.profile.rawProfile];
  activeProfileReadState = "known";
}

function applyDeviceSettings(settings: DeviceSettings) {
  currentDeviceSettings = cloneDeviceSettings(settings);
  setDeviceSettingsControls(currentDeviceSettings);
  deviceSettingsDirty = false;
  byId("device-dirty").hidden = true;
  syncActions();
}

async function fetchDeviceSettings(devicePath: string): Promise<DeviceSettings> {
  return invoke<DeviceSettings>("read_device_settings", { devicePath });
}

async function saveDeviceSettingsToDevice(session: DeviceSession) {
  const result = await invoke<DeviceSettingsWriteResult>("set_device_settings", {
    devicePath: session.device.path,
    settings: readDeviceSettings(),
  });
  applyDeviceSettings(result.settings);
}

async function saveProfileDocument() {
  const profile = editingProfile;
  if (!profile) return;
  const session = deviceSession;
  const profileNeedsSave = !profile.saved || settingsDirty || vibrationDirty;
  if (!profileNeedsSave && !deviceSettingsDirty) return;
  if (!profileNeedsSave) {
    if (!session) return;
    setBusy(true, "ポーリングレートとステップ精度を保存しています…");
    try {
      await saveDeviceSettingsToDevice(session);
      setMessage("デバイス設定を保存しました。");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
    return;
  }
  let pendingRawProfile = profile.rawProfile;
  setBusy(true, "プロファイルを共有DBへ保存しています…");
  try {
    if (settingsDirty) {
      const updated = await invoke<ProfileSummary>("update_controller_settings", {
        profile: pendingRawProfile,
        settings: readSettingsInput(),
      });
      pendingRawProfile = updated.rawProfile;
    }
    if (vibrationDirty) {
      const updated = await invoke<ProfileSummary>("update_vibration", {
        profile: pendingRawProfile,
        settings: readVibrationSettings(),
      });
      pendingRawProfile = updated.rawProfile;
    }
    let name = profile.name;
    if (profile.id === null) {
      const prompted = window.prompt("保存するプロファイル名", name);
      if (prompted === null) return;
      name = prompted;
    }
    const input = {
      id: profile.id,
      name,
      rawProfile: pendingRawProfile,
      deviceUuid: profile.deviceUuid || session?.uuid || "",
      deviceName: profile.deviceName || session?.device.product || "",
      firmwareVersion: profile.firmwareVersion,
      zkmVersion: profile.zkmVersion || (session?.zkmVersion ? String(session.zkmVersion) : ""),
      snapshot: profile.snapshot,
    };
    const saved = await invoke<ProfileDocument>("save_profile", { input });
    setEditingProfile(saved);
    if (session && profileMatchesDevice(saved)) {
      await applySavedProfileToDevice(saved, session);
    }
    if (session && deviceSettingsDirty) {
      await saveDeviceSettingsToDevice(session);
    }
    await refreshProfiles();
    setMessage(session && profileMatchesDevice(saved)
      ? "プロファイルを保存し、コントローラーへ自動適用しました。"
      : "プロファイルをConfig.dbへ保存しました。接続中のコントローラーには適用していません。");
  } catch (error) {
    const message = errorMessage(error);
    if (message.startsWith("PROFILE_CONFLICT:") && profile.id !== null) {
      const reload = window.confirm("公式アプリ側で変更されています。OKで再読込、キャンセルで別名保存します。");
      if (reload) {
        await openSavedProfile(profile.id);
      } else {
        const copyName = window.prompt("別名で保存する名前", `${profile.name} コピー`);
        if (copyName) {
          try {
            const saved = await invoke<ProfileDocument>("save_profile", {
              input: {
                id: null,
                name: copyName,
                rawProfile: pendingRawProfile,
                deviceUuid: profile.deviceUuid || session?.uuid || "",
                deviceName: profile.deviceName || session?.device.product || "",
                firmwareVersion: profile.firmwareVersion,
                zkmVersion: profile.zkmVersion || (session?.zkmVersion ? String(session.zkmVersion) : ""),
                snapshot: null,
              },
            });
            setEditingProfile(saved);
            if (session && profileMatchesDevice(saved)) {
              await applySavedProfileToDevice(saved, session);
            }
            if (session && deviceSettingsDirty) {
              await saveDeviceSettingsToDevice(session);
            }
            await refreshProfiles();
            setMessage("外部変更を上書きせず、別名で保存しました。");
          } catch (copyError) {
            setMessage(errorMessage(copyError));
          }
        }
      }
    } else {
      setMessage(message);
    }
  } finally {
    setBusy(false);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  byId("refresh-device").addEventListener("click", () => void scan());
  byId("new-profile").addEventListener("click", () => void createNewProfile());
  byId("read-device-profile").addEventListener("click", () => void readProfileFromDevice());
  byId("import-profile").addEventListener("click", () => void importShareProfile());
  byId("back-home").addEventListener("click", () => {
    showView("home");
    void refreshProfiles().catch((error) => setMessage(errorMessage(error)));
  });
  byId("save-profile").addEventListener("click", () => void saveProfileDocument());
  byId("refresh-macros").addEventListener("click", () => void refreshMacros());
  byId("write-macro").addEventListener("click", () => void writeMacro());
  byId("tab-stick").addEventListener("click", () => selectSettingsTab("stick"));
  byId("tab-keymap").addEventListener("click", () => selectSettingsTab("keymap"));
  byId("tab-device").addEventListener("click", () => selectSettingsTab("device"));
  byId("tab-vibration").addEventListener("click", () => selectSettingsTab("vibration"));
  byId("tab-macro").addEventListener("click", () => selectSettingsTab("macro"));
  byId<HTMLSelectElement>("rapid-speed").addEventListener("change", (event) => {
    const value = (event.target as HTMLSelectElement).value;
    rapidFireDraft.speedIndex = value === "unknown" ? null : Number(value);
    renderRapidFireControls(rapidFireDraft);
    markSettingsDirty();
  });
  byId<HTMLSelectElement>("macro-slot").addEventListener("change", (event) => {
    selectMacroSlot(Number((event.target as HTMLSelectElement).value));
  });
  byId("add-macro-step").addEventListener("click", addMacroStep);
  for (const id of [
    "macro-run-key-select",
    "macro-m-key-select",
    "macro-repeat",
    "macro-run-after-release",
    "macro-loop",
  ] as const) {
    byId(id).addEventListener("change", () => {
      if (!macroDraftRecord) return;
      try {
        syncFriendlyMacroHeader(macroDraftRecord);
        renderMacroHeader(macroDraftRecord);
        byId("macro-slot-details").textContent = `スロット ${Number(byId<HTMLSelectElement>("macro-slot").value) + 1}を編集中です。`;
      } catch (error) {
        setMessage(errorMessage(error));
      }
    });
  }
  byId("keymap-controller-tab").addEventListener("click", () => setKeymapDialogMode("controller"));
  byId("keymap-keyboard-tab").addEventListener("click", () => setKeymapDialogMode("keyboard"));
  byId("keymap-dialog-close").addEventListener("click", closeKeymapDialog);
  byId("keymap-dialog-cancel").addEventListener("click", closeKeymapDialog);
  byId("keymap-dialog-confirm").addEventListener("click", confirmKeymapDialog);
  byId<HTMLDialogElement>("keymap-dialog").addEventListener("cancel", () => {
    activeKeymapSlot = null;
    pendingKeymapChoice = null;
  });
  byId("stick-left-tab").addEventListener("click", () => selectStick("leftStick"));
  byId("stick-right-tab").addEventListener("click", () => selectStick("rightStick"));
  byId("rectangle-algorithm").addEventListener("change", markSettingsDirty);
  byId<HTMLSelectElement>("polling-rate").addEventListener("change", () => {
    markDeviceSettingsDirty();
  });
  byId<HTMLSelectElement>("step-accuracy").addEventListener("change", () => {
    const choice = byId<HTMLSelectElement>("step-accuracy").value;
    if (choice !== "unknown") {
      const value = choice === "adaptive" ? null : Number(choice);
      byId<HTMLInputElement>("step-accuracy-mode").value = choice === "adaptive" ? "0" : "1";
      if (value !== null) {
        byId<HTMLInputElement>("step-accuracy-value").value = String(value);
      }
    }
    setStepAccuracyChoice(readDeviceSettings().stepAccuracy);
    markDeviceSettingsDirty();
  });
  for (const id of curveRangeIds) {
    byId<HTMLInputElement>(id).addEventListener("input", () => {
      updateRangeOutput(id);
      markSettingsDirty();
    });
    byId<HTMLInputElement>(`${id}-value`).addEventListener("input", () => {
      updateCurveFromDirectInput(id);
    });
    byId<HTMLInputElement>(`${id}-value`).addEventListener("change", () => {
      commitCurveDirectInput(id);
    });
  }
  setupDraggablePoint("curve-point1", "point1");
  setupDraggablePoint("curve-point2", "point2");
  byId<HTMLSelectElement>("vibration-mode").addEventListener("change", () => {
    applyVibrationMode(byId<HTMLSelectElement>("vibration-mode").value as VibrationMode);
    markVibrationDirty();
  });
  for (const id of [
    "vibration-left-min",
    "vibration-left-max",
    "vibration-right-min",
    "vibration-right-max",
  ] as const) {
    byId<HTMLInputElement>(id).addEventListener("input", () => {
      const grip = id.includes("left") ? "left" : "right";
      const changed = id.endsWith("-min") ? "min" : "max";
      enforceVibrationWidth(grip, changed);
      byId<HTMLSelectElement>("vibration-mode").value = vibrationMode(readVibrationSettings());
      updateVibrationEditorState();
      markVibrationDirty();
    });
  }

  selectSettingsTab("stick");
  syncActions();
  void scan();
});

window.addEventListener("focus", () => {
  if (!busy) void refreshProfiles().catch((error) => setMessage(errorMessage(error)));
});
