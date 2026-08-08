import { invoke } from "@tauri-apps/api/core";

type DeviceSummary = {
  vendorProduct: string;
  usage: string;
  product: string;
  path: string;
};

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
  m1: boolean | null;
  m2: boolean | null;
  m3: boolean | null;
  m4: boolean | null;
};

type ControllerSettings = {
  rectangleAlgorithm: boolean;
  leftStick: CurveSettings;
  rightStick: CurveSettings;
  rapidFire: RapidFireSettings;
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
  device: DeviceSummary;
  length: number;
  storedCrc: string;
  computedCrc: string;
  protocolVersion: string;
  head: string;
  vibration: VibrationSettings;
  settings: ControllerSettings;
  rawProfile: number[];
};

type ControllerSettingsInput = {
  rectangleAlgorithm: boolean;
  leftStick: CurveSettings;
  rightStick: CurveSettings;
  rapidFire: { m2: boolean | null };
  keyBindings: string[];
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

type VibrationWriteResult = {
  device: DeviceSummary;
  vibration: VibrationSettings;
  crc: string;
  ack: string;
  ackValue: number;
  rawProfile: number[];
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

type ControllerSettingsWriteResult = {
  device: DeviceSummary;
  settings: ControllerSettings;
  head: string;
  crc: string;
  ack: string;
  ackValue: number;
  rawProfile: number[];
};

const curveRangeIds = [
  "curve-center",
  "curve-p1-x",
  "curve-p1-y",
  "curve-p2-x",
  "curve-p2-y",
  "curve-edge",
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
  | { kind: "keyboard"; usage: number; label: string }
  | { kind: "none"; label: "Null" };

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
  { kind: "controller", slot: 0, label: "A" },
  { kind: "controller", slot: 1, label: "B" },
  { kind: "controller", slot: 3, label: "X" },
  { kind: "controller", slot: 4, label: "Y" },
  { kind: "controller", slot: 16, label: "Up" },
  { kind: "controller", slot: 17, label: "Down" },
  { kind: "controller", slot: 18, label: "Left" },
  { kind: "controller", slot: 19, label: "Right" },
  { kind: "controller", slot: 8, label: "LT" },
  { kind: "controller", slot: 6, label: "LB" },
  { kind: "controller", slot: 9, label: "RT" },
  { kind: "controller", slot: 7, label: "RB" },
  { kind: "controller", slot: 13, label: "L3" },
  { kind: "controller", slot: 14, label: "R3" },
  { kind: "controller", slot: 10, label: "View" },
  { kind: "controller", slot: 11, label: "Menu" },
  { kind: "controller", slot: 23, label: "M1" },
  { kind: "controller", slot: 24, label: "M2" },
  { kind: "controller", slot: 25, label: "M3" },
  { kind: "controller", slot: 26, label: "M4" },
  { kind: "controller", slot: 15, label: "Share" },
  { kind: "none", label: "Null" },
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

const byId = <T extends Element = HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing UI element #${id}`);
  }
  return element as unknown as T;
};

let busy = false;
let deviceConnected = false;
let currentProfile: ProfileSummary | null = null;
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
let rapidFireDraft: RapidFireSettings = { m1: null, m2: null, m3: null, m4: null };
let keymapDraft: string[] = Array.from({ length: 32 }, () => KEYMAP_DEFAULT_ENTRY);
let activeKeymapSlot: number | null = null;
let pendingKeymapChoice: KeymapChoice | null = null;
let deviceSettingsDraft: DeviceSettings = {
  pollingRate: 0,
  stepAccuracy: { mode: 0, value: 0, extension: 0 },
};

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
  byId<HTMLButtonElement>("scan").disabled = busy;
  byId<HTMLButtonElement>("read").disabled = busy || !deviceConnected;
  byId<HTMLButtonElement>("open-settings").disabled = busy || !deviceConnected;
  byId<HTMLButtonElement>("save-settings").disabled = busy || !currentProfile || !settingsDirty;
  byId<HTMLButtonElement>("save-vibration").disabled = busy || !currentProfile || !vibrationDirty;
  byId<HTMLButtonElement>("refresh-device-settings").disabled = busy || !currentProfile;
  byId<HTMLButtonElement>("save-device-settings").disabled = busy || !currentProfile || !deviceSettingsDirty;
  byId<HTMLButtonElement>("import-profile").disabled = busy || !deviceConnected || settingsDirty || vibrationDirty;
  byId<HTMLButtonElement>("export-profile").disabled = busy || !currentProfile || settingsDirty || vibrationDirty;
  byId<HTMLButtonElement>("apply-profile").disabled = busy || !currentProfile || settingsDirty || vibrationDirty;
}

function showDetails(target: HTMLElement, rows: Array<[string, string]>) {
  target.replaceChildren(
    ...rows.flatMap(([label, value]) => {
      const term = document.createElement("dt");
      const detail = document.createElement("dd");
      term.textContent = label;
      detail.textContent = value;
      return [term, detail];
    }),
  );
}

function setConnection(device: DeviceSummary | null) {
  const connection = byId("connection");
  const deviceName = byId("device-name");
  deviceConnected = device !== null;

  if (!device) {
    connection.textContent = "未接続";
    connection.className = "badge offline";
    deviceName.textContent = "BIGBIG WON設定インターフェースが見つかりません";
    byId("device-details").replaceChildren();
    return;
  }

  connection.textContent = "接続済み";
  connection.className = "badge online";
  deviceName.textContent = device.product;
  showDetails(byId("device-details"), [
    ["Device", device.vendorProduct],
    ["Usage", device.usage],
    ["Path", device.path],
  ]);
}

function clearProfile() {
  currentProfile = null;
  settingsDirty = false;
  vibrationDirty = false;
  deviceSettingsDirty = false;
  currentDeviceSettings = null;
  byId("profile-details").replaceChildren();
  byId<HTMLPreElement>("profile-head").hidden = true;
  byId("profile-hint").textContent = deviceConnected
    ? "接続済みです。読み取ると設定画面を開けます。"
    : "まだプロファイルを読み込んでいません。";
  byId("curve-dirty").hidden = true;
  byId("settings-dirty").hidden = true;
  byId("device-dirty").hidden = true;
  syncActions();
}

function renderProfile(profile: ProfileSummary) {
  const crcState = profile.storedCrc === profile.computedCrc ? "一致" : "不一致";
  showDetails(byId("profile-details"), [
    ["プロトコル", `v${profile.protocolVersion}`],
    ["サイズ", `${profile.length} bytes`],
    ["CRC", `${profile.storedCrc} / ${profile.computedCrc} (${crcState})`],
    ["振動", `左 ${profile.vibration.left.min}–${profile.vibration.left.max} / 右 ${profile.vibration.right.min}–${profile.vibration.right.max}`],
    ["矩形アルゴリズム", profile.settings.rectangleAlgorithm ? "有効" : "無効"],
    ["連射", profile.settings.rapidFire.m2 === null
      ? "M2: 不明"
      : `M2: ${profile.settings.rapidFire.m2 ? "有効" : "無効"}`],
  ]);
  const head = byId<HTMLPreElement>("profile-head");
  head.textContent = profile.head;
  head.hidden = false;
  byId("profile-hint").hidden = true;
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
  markSettingsDirty();
}

function commitCurveDirectInput(id: string) {
  const input = byId<HTMLInputElement>(`${id}-value`);
  const parsed = Number(input.value);
  const value = Number.isFinite(parsed) ? clampRangeValue(id, parsed) : readRangeValue(id);
  byId<HTMLInputElement>(id).value = String(value);
  input.value = String(value);
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

function updateVibrationEditorState() {
  const mode = byId<HTMLSelectElement>("vibration-mode").value as VibrationMode;
  const custom = mode === "custom";
  byId("vibration-mode-raw").textContent = byId<HTMLSelectElement>("vibration-mode").selectedOptions[0]?.textContent ?? mode;
  for (const id of [
    "vibration-left-min",
    "vibration-left-max",
    "vibration-right-min",
    "vibration-right-max",
  ] as const) {
    byId<HTMLInputElement>(id).disabled = !custom;
  }
  byId("vibration-mode-help").textContent = mode === "off"
    ? "オフでは公式アプリと同じく、左右を0–1に固定します。"
    : custom
      ? "カスタムでは最大−最小を20以上にしてください。"
      : "プリセット値です。個別に変更する場合はカスタムを選択してください。";
}

function setVibrationControls(settings: VibrationSettings) {
  setRangeControl("vibration-left-min", settings.left.min);
  setRangeControl("vibration-left-max", settings.left.max);
  setRangeControl("vibration-right-min", settings.right.min);
  setRangeControl("vibration-right-max", settings.right.max);
  byId<HTMLSelectElement>("vibration-mode").value = vibrationMode(settings);
  updateVibrationEditorState();
}

function applyVibrationMode(mode: VibrationMode) {
  if (mode !== "custom") {
    setVibrationControls(cloneVibration(VIBRATION_PRESETS[mode]));
    return;
  }
  const current = readVibrationSettings();
  const hasEditableWidth = [current.left, current.right]
    .every((grip) => grip.max >= grip.min && grip.max - grip.min >= 20);
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

function formatHexByte(value: number): string {
  return `0x${value.toString(16).padStart(2, "0").toUpperCase()}`;
}

function keymapTargetLabel(value: number): string {
  if (value === 0xff) return "未設定";
  return value < KEYMAP_SLOT_LABELS.length ? KEYMAP_SLOT_LABELS[value] : "予約/未割当";
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

function describeKeymapEntry(raw: string): string {
  if (!/^[0-9A-F]{8}$/.test(raw)) {
    return "byte0～3: 8桁の16進数を入力";
  }
  const bytes = raw.match(/../g)?.map((byte) => Number.parseInt(byte, 16)) ?? [];
  const targets = bytes.slice(1).map((value, index) =>
    `byte${index + 1}: ${keymapTargetLabel(value)} (${formatHexByte(value)})`,
  );
  return [`byte0: type ${formatHexByte(bytes[0])}`, ...targets].join(" / ");
}

function keymapChoiceForEntry(raw: string, sourceSlot: number): KeymapChoice | null {
  const bytes = parseKeymapEntry(raw);
  if (!bytes) return null;
  if (bytes.every((byte) => byte === 0)) {
    return { kind: "identity", label: KEYMAP_SLOT_LABELS[sourceSlot] ?? "標準" };
  }
  if (bytes[0] === KEYMAP_CONTROLLER_TYPE) {
    if (bytes[1] === KEYMAP_NO_TARGET) return { kind: "none", label: "Null" };
    const label = KEYMAP_SLOT_LABELS[bytes[1]];
    return label && !label.startsWith("動的") && !label.startsWith("予約")
      ? { kind: "controller", slot: bytes[1], label }
      : null;
  }
  if (bytes[0] === KEYMAP_KEYBOARD_TYPE) {
    const keyboard = KEYBOARD_KEYS.find(([, usage]) => usage === bytes[2])
      ?? KEYBOARD_KEYS.find(([, usage]) => usage === bytes[1]);
    return keyboard ? { kind: "keyboard", usage: keyboard[1], label: keyboard[0] } : null;
  }
  return null;
}

function keymapDisplay(raw: string, sourceSlot: number): { label: string; detail: string; choice: KeymapChoice | null } {
  const choice = keymapChoiceForEntry(raw, sourceSlot);
  if (!choice) {
    return { label: "生バイト", detail: describeKeymapEntry(raw), choice: null };
  }
  if (choice.kind === "identity") {
    return { label: choice.label, detail: "標準マッピング / 00000000", choice };
  }
  return { label: choice.label, detail: `選択済み / ${raw}`, choice };
}

function rapidFireForSlot(slot: number): boolean | null {
  if (slot === 23) return rapidFireDraft.m1;
  if (slot === 24) return rapidFireDraft.m2;
  if (slot === 25) return rapidFireDraft.m3;
  if (slot === 26) return rapidFireDraft.m4;
  return null;
}

function toggleM2RapidFire() {
  if (rapidFireDraft.m2 === null) return;
  rapidFireDraft.m2 = !rapidFireDraft.m2;
  renderKeymapRows();
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
  return formatKeymapBytes([KEYMAP_KEYBOARD_TYPE, 0x00, choice.usage, 0x00]);
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
      sourceHint.textContent = `スロット ${String(slot + 1).padStart(2, "0")} / 0x${(0x164 + slot * 4).toString(16).toUpperCase().padStart(3, "0")}`;
      sourceCell.append(source, sourceHint);

      const mapping = keymapDisplay(keymapDraft[slot] ?? KEYMAP_DEFAULT_ENTRY, slot);
      const mappingButton = document.createElement("button");
      mappingButton.className = "keymap-mapping";
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

      const rapidState = rapidFireForSlot(slot);
      const rapid = document.createElement(slot === 24 ? "button" : "span");
      rapid.className = slot === 24 ? "keymap-rapid keymap-rapid-toggle" : "keymap-rapid";
      if (rapid instanceof HTMLButtonElement) {
        rapid.type = "button";
        rapid.disabled = rapidState === null;
        rapid.setAttribute("aria-pressed", String(rapidState === true));
        rapid.addEventListener("click", toggleM2RapidFire);
        rapid.title = rapidState === null ? "M2連射の保存値を判定できません" : "M2連射を切り替えます";
      } else {
        rapid.title = rapidState === null ? "この連射フラグは未解析です" : "読み取り専用の連射状態";
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

function renderKeymapRaw() {
  const container = byId("keymap-raw-grid");
  container.replaceChildren(
    ...Array.from({ length: 32 }, (_, index) => {
      const row = document.createElement("label");
      row.className = "keymap-raw-row";
      const name = document.createElement("span");
      name.textContent = `${KEYMAP_SLOT_LABELS[index]} / slot ${String(index + 1).padStart(2, "0")}`;
      const input = document.createElement("input");
      input.type = "text";
      input.inputMode = "text";
      input.maxLength = 8;
      input.pattern = "[0-9A-Fa-f]{8}";
      input.value = keymapDraft[index] ?? KEYMAP_DEFAULT_ENTRY;
      input.dataset.keymapEntry = String(index);
      input.setAttribute("aria-label", `${KEYMAP_SLOT_LABELS[index]} キーバインド スロット ${index + 1}`);
      input.addEventListener("input", () => {
        input.value = input.value.replace(/[^0-9a-f]/gi, "").slice(0, 8).toUpperCase();
        keymapDraft[index] = input.value;
        renderKeymapRows();
        updateKeymapSummary();
        markSettingsDirty();
      });
      input.addEventListener("change", () => {
        input.value = normalizeKeymapEntry(input.value);
        keymapDraft[index] = input.value;
        renderKeymapRows();
        updateKeymapSummary();
        markSettingsDirty();
      });
      const hint = document.createElement("small");
      hint.className = "keymap-hint";
      hint.textContent = describeKeymapEntry(input.value);
      row.append(name, input, hint);
      return row;
    }),
  );
}

function updateKeymapSummary() {
  const configured = keymapDraft.filter((entry) => entry !== KEYMAP_DEFAULT_ENTRY).length;
  byId("keymap-summary").textContent = configured === 0 ? "標準マッピング" : `${configured}スロット変更済み`;
}

function renderKeymap(keyBindings: string[], rapidFire: RapidFireSettings) {
  rapidFireDraft = { ...rapidFire };
  keymapDraft = Array.from({ length: 32 }, (_, index) => normalizeKeymapEntry(keyBindings[index] ?? KEYMAP_DEFAULT_ENTRY));
  renderKeymapRows();
  renderKeymapRaw();
  updateKeymapSummary();
}

function readKeymap(): string[] {
  return keymapDraft.map((entry) => entry.trim().toUpperCase());
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

  const keyboardContainer = byId("keymap-keyboard-grid");
  keyboardContainer.replaceChildren(
    ...KEYBOARD_KEYS.map(([label, usage]) => {
      const button = document.createElement("button");
      button.className = "key-choice";
      button.type = "button";
      button.textContent = label;
      const choice: KeymapChoice = { kind: "keyboard", usage, label };
      button.dataset.keymapChoice = keymapChoiceKey(choice);
      button.addEventListener("click", () => {
        pendingKeymapChoice = choice;
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
  renderKeymapRaw();
  updateKeymapSummary();
  closeKeymapDialog();
  markSettingsDirty();
}

function updatePollingRateDisplay(value: number) {
  const option = POLLING_RATE_OPTIONS.find((candidate) => candidate.code === value);
  const label = option ? `${option.hz} Hz` : "不明なコード";
  byId("polling-rate-hex").textContent = `${label} / raw ${formatHexByte(value)}`;
}

function setPollingRateControl(value: number) {
  const select = byId<HTMLSelectElement>("polling-rate");
  select.querySelector("option[data-generated]")?.remove();
  if (!POLLING_RATE_OPTIONS.some((option) => option.code === value)) {
    const option = document.createElement("option");
    option.dataset.generated = "true";
    option.value = String(value);
    option.textContent = `不明なコード (${formatHexByte(value)})`;
    select.append(option);
  }
  select.value = String(value);
  updatePollingRateDisplay(value);
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
    option.textContent = `不明な組み合わせ (mode ${formatHexByte(settings.mode)}, value 0x${settings.value.toString(16).padStart(4, "0").toUpperCase()})`;
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
    stabilization: curveDrafts[selectedStick].stabilization,
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
  byId("curve-stabilization").textContent = `0x${curve.stabilization.toString(16).padStart(2, "0").toUpperCase()}`;
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
  byId("stick-description").textContent = `${left ? "左" : "右"}スティックのDefaultカーブを調整します。数値入力とポイントのドラッグに対応しています。`;
  updateCurvePreview();
}

function readSettingsInput(): ControllerSettingsInput {
  syncActiveCurveDraft();
  return {
    rectangleAlgorithm: byId<HTMLInputElement>("rectangle-algorithm").checked,
    leftStick: cloneCurve(curveDrafts.leftStick),
    rightStick: cloneCurve(curveDrafts.rightStick),
    rapidFire: { m2: rapidFireDraft.m2 },
    keyBindings: readKeymap(),
  };
}

function curvesEqual(left: CurveSettings, right: CurveSettings): boolean {
  return left.center === right.center
    && left.point1X === right.point1X
    && left.point1Y === right.point1Y
    && left.point2X === right.point2X
    && left.point2Y === right.point2Y
    && left.edge === right.edge;
}

function settingsEqual(settings: ControllerSettings, input: ControllerSettingsInput): boolean {
  return settings.rectangleAlgorithm === input.rectangleAlgorithm
    && curvesEqual(settings.leftStick, input.leftStick)
    && curvesEqual(settings.rightStick, input.rightStick)
    && settings.rapidFire.m2 === input.rapidFire.m2
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
  byId("curve-compensation-label").textContent = curve.center < 0 || curve.edge < 0
    ? "オレンジ: 補償領域"
    : "補償なし";
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

function renderSettings(profile: ProfileSummary) {
  const settings = profile.settings;
  curveDrafts = {
    leftStick: cloneCurve(settings.leftStick),
    rightStick: cloneCurve(settings.rightStick),
  };
  renderKeymap(settings.keyBindings, settings.rapidFire);
  selectedStick = "leftStick";
  byId<HTMLInputElement>("rectangle-algorithm").checked = settings.rectangleAlgorithm;
  setActiveCurve(cloneCurve(curveDrafts.leftStick));
  selectStick("leftStick");
  setVibrationControls(profile.vibration);
  settingsDirty = false;
  vibrationDirty = false;
  byId("curve-dirty").hidden = true;
  byId("settings-dirty").hidden = true;
  updateCurvePreview();
  syncActions();
}

function markSettingsDirty() {
  settingsDirty = currentProfile !== null && !settingsEqual(currentProfile.settings, readSettingsInput());
  byId("curve-dirty").hidden = !settingsDirty;
  byId("settings-dirty").hidden = !settingsDirty;
  updateCurvePreview();
  syncActions();
}

function markVibrationDirty() {
  vibrationDirty = currentProfile !== null
    && !vibrationEqual(readVibrationSettings(), currentProfile.vibration);
  syncActions();
}

function showView(view: "home" | "settings") {
  const settingsVisible = view === "settings";
  byId("home-view").hidden = settingsVisible;
  byId("settings-view").hidden = !settingsVisible;
  if (settingsVisible && currentProfile) {
    renderSettings(currentProfile);
    selectSettingsTab("stick");
  }
}

function selectSettingsTab(tab: "stick" | "keymap" | "device" | "vibration") {
  const stickVisible = tab === "stick";
  byId("settings-stick-section").hidden = !stickVisible;
  byId("settings-keymap-section").hidden = tab !== "keymap";
  byId("settings-device-section").hidden = tab !== "device";
  byId("settings-vibration-section").hidden = tab !== "vibration";
  byId("tab-stick").classList.toggle("active", stickVisible);
  byId("tab-keymap").classList.toggle("active", tab === "keymap");
  byId("tab-device").classList.toggle("active", tab === "device");
  byId("tab-vibration").classList.toggle("active", tab === "vibration");
}

async function scan() {
  setBusy(true, "コントローラーを検索しています…");
  try {
    const device = await invoke<DeviceSummary | null>("scan_device");
    setConnection(device);
    clearProfile();
    if (!device) {
      showView("home");
      setMessage("コントローラーを接続して再検索してください。");
    } else {
      setMessage("接続済みです。プロファイルを読み込んでください。");
    }
  } catch (error) {
    setConnection(null);
    clearProfile();
    setMessage(errorMessage(error));
  } finally {
    setBusy(false);
  }
}

async function readProfile(openSettings = false) {
  if (!deviceConnected) return;
  setBusy(true, "プロファイルを読み取っています…");
  try {
    const profile = await invoke<ProfileSummary>("read_profile");
    currentProfile = profile;
    renderProfile(profile);
    renderSettings(profile);
    try {
      await refreshDeviceSettings();
      setMessage(profile.storedCrc === profile.computedCrc
        ? "読み取り成功。コントローラー設定を開けます。"
        : "CRCが一致しません。書き込みは行わないでください。");
    } catch (error) {
      setMessage(`プロファイルは読み取りましたが、F6/F7設定の読み取りに失敗しました: ${errorMessage(error)}`);
    }
    if (openSettings) {
      showView("settings");
    }
  } catch (error) {
    setMessage(errorMessage(error));
  } finally {
    setBusy(false);
  }
}

async function importProfileFile(file: File) {
  if (!deviceConnected) return;
  setBusy(true, "公式v37プロファイルを検証しています…");
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const profile = await invoke<ProfileSummary>("load_profile", { profile: Array.from(bytes) });
    currentProfile = profile;
    renderProfile(profile);
    renderSettings(profile);
    showView("settings");
    setMessage("公式v37プロファイルを読み込みました。実機へ適用する場合は概要の適用ボタンを押してください。");
  } catch (error) {
    setMessage(errorMessage(error));
  } finally {
    byId<HTMLInputElement>("profile-file").value = "";
    setBusy(false);
  }
}

function exportProfile() {
  if (!currentProfile) return;
  const framed = new Uint8Array(4 + currentProfile.rawProfile.length);
  framed.set([0xa4, 0xd7, 0xe4, 0x01]);
  framed.set(currentProfile.rawProfile, 4);
  const blob = new Blob([framed], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "bigbigwon-v37-profile-frame.bin";
  link.click();
  URL.revokeObjectURL(url);
  setMessage("公式形式の488バイトv37プロファイルを書き出しました。");
}

async function applyProfile() {
  if (!currentProfile || settingsDirty || vibrationDirty) return;
  const profile = currentProfile;
  setBusy(true, "プロファイル全体をコントローラーへ適用しています…");
  try {
    const result = await invoke<ProfileSummary>("apply_profile", { profile: profile.rawProfile });
    currentProfile = result;
    renderProfile(result);
    renderSettings(result);
    setMessage("公式v37プロファイルを実機へ適用しました。");
  } catch (error) {
    setMessage(errorMessage(error));
  } finally {
    setBusy(false);
  }
}

async function refreshDeviceSettings() {
  const settings = await invoke<DeviceSettings>("read_device_settings");
  currentDeviceSettings = cloneDeviceSettings(settings);
  deviceSettingsDraft = cloneDeviceSettings(settings);
  setDeviceSettingsControls(deviceSettingsDraft);
  deviceSettingsDirty = false;
  byId("device-dirty").hidden = true;
  syncActions();
}

async function saveSettings() {
  const profile = currentProfile;
  if (!profile || !settingsDirty) return;
  const settings = readSettingsInput();
  setBusy(true, "コントローラー設定を保存しています…");
  try {
    const result = await invoke<ControllerSettingsWriteResult>("set_controller_settings", { settings });
    currentProfile = {
      ...profile,
      device: result.device,
      storedCrc: result.crc,
      computedCrc: result.crc,
      head: result.head,
      settings: result.settings,
      rawProfile: result.rawProfile,
    };
    renderProfile(currentProfile);
    renderSettings(currentProfile);
    setMessage(`保存成功: CRC ${result.crc} / ACK ${result.ack} (${result.ackValue})`);
  } catch (error) {
    setMessage(errorMessage(error));
  } finally {
    setBusy(false);
  }
}

async function saveVibration() {
  const profile = currentProfile;
  if (!profile || !vibrationDirty) return;
  const vibration = readVibrationSettings();
  setBusy(true, "振動設定を保存しています…");
  try {
    const result = await invoke<VibrationWriteResult>("set_vibration", { settings: vibration });
    currentProfile = {
      ...profile,
      device: result.device,
      vibration: result.vibration,
      storedCrc: result.crc,
      computedCrc: result.crc,
      rawProfile: result.rawProfile,
    };
    renderProfile(currentProfile);
    renderSettings(currentProfile);
    setMessage(`保存成功: 左 ${result.vibration.left.min}–${result.vibration.left.max} / 右 ${result.vibration.right.min}–${result.vibration.right.max} / CRC ${result.crc} / ACK ${result.ack}`);
  } catch (error) {
    setMessage(errorMessage(error));
  } finally {
    setBusy(false);
  }
}

async function saveDeviceSettings() {
  const profile = currentProfile;
  if (!profile || !deviceSettingsDirty) return;
  const settings = readDeviceSettings();
  setBusy(true, "ポーリングレートとステップ精度を保存しています…");
  try {
    const result = await invoke<DeviceSettingsWriteResult>("set_device_settings", { settings });
    currentDeviceSettings = cloneDeviceSettings(result.settings);
    deviceSettingsDraft = cloneDeviceSettings(result.settings);
    setDeviceSettingsControls(deviceSettingsDraft);
    deviceSettingsDirty = false;
    byId("device-dirty").hidden = true;
    setMessage(`送信成功: F6 ${result.pollingCommand} / F7 ${result.stepAccuracyCommand}`);
  } catch (error) {
    setMessage(errorMessage(error));
  } finally {
    setBusy(false);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  byId("scan").addEventListener("click", () => void scan());
  byId("read").addEventListener("click", () => void readProfile());
  byId("open-settings").addEventListener("click", () => {
    if (currentProfile) {
      showView("settings");
    } else {
      void readProfile(true);
    }
  });
  byId("import-profile").addEventListener("click", () => byId<HTMLInputElement>("profile-file").click());
  byId<HTMLInputElement>("profile-file").addEventListener("change", (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) void importProfileFile(file);
  });
  byId("export-profile").addEventListener("click", exportProfile);
  byId("apply-profile").addEventListener("click", () => void applyProfile());
  byId("back-home").addEventListener("click", () => showView("home"));
  byId("save-settings").addEventListener("click", () => void saveSettings());
  byId("save-vibration").addEventListener("click", () => void saveVibration());
  byId("save-device-settings").addEventListener("click", () => void saveDeviceSettings());
  byId("refresh-device-settings").addEventListener("click", () => void refreshDeviceSettings());
  byId("tab-stick").addEventListener("click", () => selectSettingsTab("stick"));
  byId("tab-keymap").addEventListener("click", () => selectSettingsTab("keymap"));
  byId("tab-device").addEventListener("click", () => selectSettingsTab("device"));
  byId("tab-vibration").addEventListener("click", () => selectSettingsTab("vibration"));
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
    updatePollingRateDisplay(Number(byId<HTMLSelectElement>("polling-rate").value));
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
  for (const id of ["step-accuracy-mode", "step-accuracy-value", "step-accuracy-extension"] as const) {
    byId<HTMLInputElement>(id).addEventListener("input", () => {
      if (id !== "step-accuracy-extension") {
        setStepAccuracyChoice(readDeviceSettings().stepAccuracy);
      }
      markDeviceSettingsDirty();
    });
  }

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
      updateRangeOutput(id);
      byId<HTMLSelectElement>("vibration-mode").value = vibrationMode(readVibrationSettings());
      updateVibrationEditorState();
      markVibrationDirty();
    });
  }

  selectSettingsTab("stick");
  syncActions();
  void scan();
});
