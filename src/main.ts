import { backend } from "./backend";
import { byId, errorMessage } from "./dom";
import {
  loadRememberedActiveProfile,
  rememberActiveProfile,
} from "./domain/active-profile";
import {
  clampPercentage,
  constrainCurve,
  curvesEqual,
  curveYBounds,
} from "./domain/curve";
import {
  KEYMAP_DEFAULT_ENTRY,
  KEYMAP_VISIBLE_SOURCES,
} from "./domain/keymap";
import { deviceUuidsEqual, parseProfileBytes, profileBytesEqual } from "./domain/profile";
import { createKeymapEditor } from "./features/keymap-editor";
import { createMacroEditor } from "./features/macro-editor";
import type {
  ActiveProfileState,
  ControllerSettings,
  ControllerSettingsInput,
  CurveSettings,
  DeviceSession,
  DeviceSettings,
  ProfileDocument,
  ProfileListEntry,
  ProfileSummary,
  StepAccuracySettings,
  Stick,
  VibrationMode,
  VibrationSettings,
} from "./models";
import { setupWindowControls } from "./window-controls";

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

let busy = false;
let deviceSession: DeviceSession | null = null;
let profileList: ProfileListEntry[] = [];
const savedProfileBytesCache = new Map<string, number[] | null>();
let editingProfile: ProfileDocument | null = null;
let activeProfileState: ActiveProfileState = "unknown";
let activeDeviceProfile: number[] | null = null;
let settingsDirty = false;
let vibrationDirty = false;
let deviceSettingsDirty = false;
let currentDeviceSettings: DeviceSettings | null = null;
let selectedStick: Stick = "leftStick";
let curveDrafts: Record<Stick, CurveSettings> = {
  leftStick: { center: 0, point1X: 0, point1Y: 0, point2X: 0, point2Y: 0, edge: 0, stabilization: 0 },
  rightStick: { center: 0, point1X: 0, point1Y: 0, point2X: 0, point2Y: 0, edge: 0, stabilization: 0 },
};

function setMessage(message: string) {
  byId("message").textContent = message;
}

function setBusy(value: boolean, message?: string) {
  busy = value;
  if (message !== undefined) {
    setMessage(message);
  }
  syncActions();
}

function syncActions() {
  for (const id of ["home-view", "settings-view"] as const) {
    const view = byId(id);
    view.inert = busy;
    view.setAttribute("aria-busy", String(busy));
  }
  byId<HTMLButtonElement>("refresh-device").disabled = busy;
  byId<HTMLButtonElement>("import-profile").disabled = busy;
  byId<HTMLButtonElement>("new-profile").disabled = busy;
  byId<HTMLButtonElement>("read-device-profile").disabled = busy || !deviceSession;
  byId<HTMLButtonElement>("save-profile").disabled = busy || !editingProfile
    || (editingProfile.saved && !settingsDirty && !vibrationDirty && !deviceSettingsDirty);
  macroEditor.syncActions();
}

const macroEditor = createMacroEditor({
  getDevicePath: () => deviceSession?.device.path ?? null,
  isBusy: () => busy,
  setBusy,
  setMessage,
  syncHostActions: syncActions,
});

const keymapEditor = createKeymapEditor({ markDirty: markSettingsDirty });

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
  if (!applyCurveConstraintsForControl(id)) {
    input.value = String(value);
    updateRangeOutput(id);
  }
  markSettingsDirty();
}

function commitCurveDirectInput(id: string) {
  const input = byId<HTMLInputElement>(`${id}-value`);
  const parsed = Number(input.value);
  const value = Number.isFinite(parsed) ? clampRangeValue(id, parsed) : readRangeValue(id);
  byId<HTMLInputElement>(id).value = String(value);
  if (!applyCurveConstraintsForControl(id)) {
    input.value = String(value);
    updateRangeOutput(id);
  }
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

function cloneDeviceSettings(settings: DeviceSettings): DeviceSettings {
  return {
    pollingRate: settings.pollingRate,
    stepAccuracy: { ...settings.stepAccuracy },
  };
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

function curveConstraintChange(id: string): "center" | "edge" | null {
  if (id === "curve-center") return "center";
  if (id === "curve-edge") return "edge";
  return null;
}

function isCurveY(id: string): boolean {
  return id === "curve-p1-y" || id === "curve-p2-y";
}

function applyCurveConstraintsForControl(id: string): boolean {
  const changed = curveConstraintChange(id);
  if (changed === null && !isCurveY(id)) return false;
  constrainActiveCurve(changed ?? undefined);
  return true;
}

function constrainActiveCurve(changed?: "center" | "edge") {
  setActiveCurve(readActiveCurve(), changed);
}

function syncActiveCurveDraft() {
  curveDrafts[selectedStick] = constrainCurve(readActiveCurve());
}

function setActiveCurve(curve: CurveSettings, changed?: "center" | "edge") {
  const safeCurve = constrainCurve(curve, changed);
  setRangeControl("curve-center", safeCurve.center);
  setRangeControl("curve-p1-x", safeCurve.point1X);
  setRangeControl("curve-p1-y", safeCurve.point1Y);
  setRangeControl("curve-p2-x", safeCurve.point2X);
  setRangeControl("curve-p2-y", safeCurve.point2Y);
  setRangeControl("curve-edge", safeCurve.edge);
  setRangeControl("curve-stabilization", safeCurve.stabilization);
  updateCurvePreview();
}

function selectStick(stick: Stick) {
  if (stick !== selectedStick) {
    syncActiveCurveDraft();
  }
  selectedStick = stick;
  setActiveCurve(curveDrafts[stick]);
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
  curveDrafts.leftStick = constrainCurve(curveDrafts.leftStick);
  curveDrafts.rightStick = constrainCurve(curveDrafts.rightStick);
  return {
    rectangleAlgorithm: byId<HTMLInputElement>("rectangle-algorithm").checked,
    leftStick: { ...curveDrafts.leftStick },
    rightStick: { ...curveDrafts.rightStick },
    ...keymapEditor.readSettings(),
  };
}

function settingsEqual(settings: ControllerSettings, input: ControllerSettingsInput): boolean {
  return settings.rectangleAlgorithm === input.rectangleAlgorithm
    && curvesEqual(settings.leftStick, input.leftStick)
    && curvesEqual(settings.rightStick, input.rightStick)
    && settings.rapidFire.keys.length === input.rapidFire.keys.length
    && settings.rapidFire.keys.every((value, index) => value === input.rapidFire.keys[index])
    && settings.rapidFireSpeedIndex === input.rapidFire.speedIndex
    && settings.keyBindings.length === input.keyBindings.length
    && settings.keyBindings.every((value, index) => {
      const candidate = input.keyBindings[index];
      return value.toUpperCase() === candidate?.toUpperCase();
    });
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
  const svgPoint = (x: number, y: number) => [20 + x * 2, 220 - y * 2] as const;
  const formatSvgPoint = (point: readonly [number, number]) => point.join(" ");
  const yBounds = curveYBounds(curve);
  const point1 = svgPoint(curve.point1X, curve.point1Y);
  const point2 = svgPoint(curve.point2X, curve.point2Y);
  byId<SVGPathElement>("curve-line").setAttribute(
    "d",
    `M ${formatSvgPoint(svgPoint(0, yBounds.min))} L ${formatSvgPoint(point1)} L ${formatSvgPoint(point2)} L ${formatSvgPoint(svgPoint(100, yBounds.max))}`,
  );
  for (const [id, point] of [["curve-point1", point1], ["curve-point2", point2]] as const) {
    byId<SVGCircleElement>(id).setAttribute("cx", String(point[0]));
    byId<SVGCircleElement>(id).setAttribute("cy", String(point[1]));
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
  constrainActiveCurve();
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
    leftStick: constrainCurve(settings.leftStick),
    rightStick: constrainCurve(settings.rightStick),
  };
  const rapidFire = {
    ...settings.rapidFire,
    speedIndex: settings.rapidFireSpeedIndex,
    timing: settings.rapidFireTiming,
  };
  keymapEditor.render(settings.keyBindings, rapidFire);
  selectedStick = "leftStick";
  byId<HTMLInputElement>("rectangle-algorithm").checked = settings.rectangleAlgorithm;
  setActiveCurve(curveDrafts.leftStick);
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

function profileMatchesDevice(
  profile: { deviceUuid: string },
  session: DeviceSession | null = deviceSession,
): boolean {
  return deviceUuidsEqual(profile.deviceUuid, session?.uuid ?? "");
}

function savedProfileBytes(entry: ProfileListEntry): number[] | null {
  const cacheKey = entry.snapshot.configJson;
  if (savedProfileBytesCache.has(cacheKey)) {
    return savedProfileBytesCache.get(cacheKey) ?? null;
  }

  const bytes = parseProfileBytes(entry.snapshot.configJson);
  savedProfileBytesCache.set(cacheKey, bytes);
  return bytes;
}

function profileIsActive(entry: ProfileListEntry): boolean {
  if ((activeProfileState !== "known" && activeProfileState !== "remembered")
    || activeDeviceProfile === null
    || !profileMatchesDevice(entry)) {
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
  if (activeProfileState === "unknown" || activeDeviceProfile === null) {
    status.textContent = "現在使用中: 記録なし（適用すると次回から表示）";
    return;
  }
  const activeProfiles = profileList.filter(profileIsActive);
  const qualifier = activeProfileState === "remembered" ? "（前回適用）" : "";
  status.textContent = activeProfiles.length > 0
    ? `現在使用中: ${activeProfiles.map((profile) => profile.name || `Profile ${profile.id}`).join(" / ")}${qualifier}`
    : `現在使用中: ライブラリに未登録${qualifier}`;
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
      state.textContent = activeProfileState === "remembered" ? "前回適用" : "使用中";
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
  profileList = await backend.listProfiles();
  savedProfileBytesCache.clear();
  renderProfileLibrary();
}

async function openSavedProfile(id: number) {
  setBusy(true, "プロファイルを読み込んでいます…");
  try {
    setEditingProfile(await backend.loadSavedProfile(id));
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
    const source = await backend.loadSavedProfile(entry.id);
    const saved = await backend.saveProfile({
      id: null,
      name,
      rawProfile: source.rawProfile,
      deviceUuid: source.deviceUuid,
      deviceName: source.deviceName,
      firmwareVersion: source.firmwareVersion,
      zkmVersion: source.zkmVersion,
      snapshot: null,
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
    const source = await backend.loadSavedProfile(entry.id);
    const saved = await backend.saveProfile({
      id: source.id,
      name,
      rawProfile: source.rawProfile,
      deviceUuid: source.deviceUuid,
      deviceName: source.deviceName,
      firmwareVersion: source.firmwareVersion,
      zkmVersion: source.zkmVersion,
      snapshot: source.snapshot,
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
    await backend.deleteProfile(entry.id, entry.snapshot);
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

function restoreRememberedActiveProfile(session: DeviceSession) {
  try {
    activeDeviceProfile = loadRememberedActiveProfile(window.localStorage, session.uuid);
  } catch (error) {
    console.warn("Could not restore the remembered active profile", error);
    activeDeviceProfile = null;
  }
  activeProfileState = activeDeviceProfile === null ? "unknown" : "remembered";
}

function setKnownActiveProfile(rawProfile: readonly number[], session: DeviceSession) {
  activeDeviceProfile = [...rawProfile];
  activeProfileState = "known";
  try {
    rememberActiveProfile(window.localStorage, session.uuid, rawProfile);
  } catch (error) {
    console.warn("Could not remember the active profile", error);
  }
}

async function scan() {
  let deviceSettingsError: unknown = null;
  let profilesPromise: Promise<void>;
  setBusy(true, "コントローラーと共有プロファイルを確認しています…");
  try {
    setConnection(await backend.scanDevice());
    clearProfile();
    activeDeviceProfile = null;
    activeProfileState = deviceSession ? "unknown" : "known";
    profilesPromise = refreshProfiles();
    if (deviceSession) {
      restoreRememberedActiveProfile(deviceSession);
      try {
        applyDeviceSettings(await fetchDeviceSettings(deviceSession.device.path));
      } catch (error) {
        deviceSettingsError = error;
        currentDeviceSettings = null;
        deviceSettingsDirty = false;
        byId("device-dirty").hidden = true;
      }
    }
  } catch (error) {
    setConnection(null);
    clearProfile();
    activeDeviceProfile = null;
    activeProfileState = "known";
    showView("home");
    setMessage(errorMessage(error));
    setBusy(false);
    return;
  }
  try {
    await profilesPromise;
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
    const profile = await backend.readProfile(session.device.path);
    setKnownActiveProfile(profile.rawProfile, session);
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
    setEditingProfile(await backend.importShareProfile(shareCode, deviceSession?.uuid ?? ""));
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
    setEditingProfile(await backend.newProfile());
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
    const shareCode = await backend.createShareCode({
      name: profile.name || "BIGBIGWON Profile",
      profile: profile.rawProfile,
      deviceUuid: profile.deviceUuid || session?.uuid || "",
      deviceName: profile.deviceName || session?.device.product || "",
      firmwareVersion: profile.firmwareVersion,
      zkmVersion: profile.zkmVersion || (session?.zkmVersion ? String(session.zkmVersion) : ""),
    });
    let copied = false;
    const clipboard = Reflect.get(navigator, "clipboard") as Clipboard | undefined;
    if (clipboard !== undefined) {
      try {
        await clipboard.writeText(shareCode);
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
    const profile = await backend.loadSavedProfile(id);
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
    const profile = await backend.loadSavedProfile(id);
    if (!profile.saved || !profile.supported || !profileMatchesDevice(profile, session)) {
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
  if (!profile.saved || profile.id === null || !profile.supported || !profileMatchesDevice(profile, session)) {
    throw new Error("このプロファイルは接続中コントローラーに適用できません。");
  }
  const result = await backend.applyProfile(profile.rawProfile, session.device.path);
  setKnownActiveProfile(result.profile.rawProfile, session);
}

function applyDeviceSettings(settings: DeviceSettings) {
  currentDeviceSettings = cloneDeviceSettings(settings);
  setDeviceSettingsControls(currentDeviceSettings);
  deviceSettingsDirty = false;
  byId("device-dirty").hidden = true;
  syncActions();
}

async function fetchDeviceSettings(devicePath: string): Promise<DeviceSettings> {
  return backend.readDeviceSettings(devicePath);
}

async function saveDeviceSettingsToDevice(session: DeviceSession) {
  const result = await backend.setDeviceSettings(session.device.path, readDeviceSettings());
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
      const updated = await backend.updateControllerSettings(pendingRawProfile, readSettingsInput());
      pendingRawProfile = updated.rawProfile;
    }
    if (vibrationDirty) {
      const updated = await backend.updateVibration(pendingRawProfile, readVibrationSettings());
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
    const saved = await backend.saveProfile(input);
    setEditingProfile(saved);
    const matchesSession = session !== null && profileMatchesDevice(saved, session);
    if (matchesSession) {
      await applySavedProfileToDevice(saved, session);
    }
    if (session && deviceSettingsDirty) {
      await saveDeviceSettingsToDevice(session);
    }
    await refreshProfiles();
    setMessage(matchesSession
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
            const saved = await backend.saveProfile({
              id: null,
              name: copyName,
              rawProfile: pendingRawProfile,
              deviceUuid: profile.deviceUuid || session?.uuid || "",
              deviceName: profile.deviceName || session?.device.product || "",
              firmwareVersion: profile.firmwareVersion,
              zkmVersion: profile.zkmVersion || (session?.zkmVersion ? String(session.zkmVersion) : ""),
              snapshot: null,
            });
            setEditingProfile(saved);
            if (session && profileMatchesDevice(saved, session)) {
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
  setupWindowControls(setMessage);
  byId("refresh-device").addEventListener("click", () => void scan());
  byId("new-profile").addEventListener("click", () => void createNewProfile());
  byId("read-device-profile").addEventListener("click", () => void readProfileFromDevice());
  byId("import-profile").addEventListener("click", () => void importShareProfile());
  byId("back-home").addEventListener("click", () => {
    showView("home");
    void refreshProfiles().catch((error: unknown) => setMessage(errorMessage(error)));
  });
  byId("save-profile").addEventListener("click", () => void saveProfileDocument());
  macroEditor.setup();
  byId("tab-stick").addEventListener("click", () => selectSettingsTab("stick"));
  byId("tab-keymap").addEventListener("click", () => selectSettingsTab("keymap"));
  byId("tab-device").addEventListener("click", () => selectSettingsTab("device"));
  byId("tab-vibration").addEventListener("click", () => selectSettingsTab("vibration"));
  byId("tab-macro").addEventListener("click", () => selectSettingsTab("macro"));
  keymapEditor.setup();
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
      if (!applyCurveConstraintsForControl(id)) {
        updateRangeOutput(id);
      }
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
  if (!busy) {
    void refreshProfiles().catch((error: unknown) => setMessage(errorMessage(error)));
  }
});
