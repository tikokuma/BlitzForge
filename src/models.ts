export type DeviceSummary = {
  vendorProduct: string;
  product: string;
  profileName: string;
  path: string;
};

export type DeviceSession = {
  device: DeviceSummary;
  uuid: string;
  zkmVersion: number;
};

export type ProfileSnapshot = {
  id: number;
  phoneUuid: string;
  name: string;
  deviceUuid: string;
  deviceName: string;
  firmwareVersion: string;
  zkmVersion: string;
  configJson: string;
  createdAt: string;
  deleted: number;
};

export type ProfileListEntry = {
  id: number;
  revision: number;
  name: string;
  deviceUuid: string;
  createdAt: string;
  profileVersion: string | null;
  active: boolean;
};

export type ActiveProfileState = "known" | "remembered" | "unknown";

export type CurveSettings = {
  center: number;
  point1X: number;
  point1Y: number;
  point2X: number;
  point2Y: number;
  edge: number;
  stabilization: number;
};

export type RapidFireSettings = {
  keys: Array<boolean | null>;
  speedIndex: number | null;
};

export type RectangleAlgorithmSettings = {
  leftStick: boolean;
  rightStick: boolean;
};

export type ControllerSettings = {
  rectangleAlgorithm: RectangleAlgorithmSettings;
  leftStick: CurveSettings;
  rightStick: CurveSettings;
  rapidFire: RapidFireSettings;
  keyBindings: string[];
};

export type VibrationGrip = {
  min: number;
  max: number;
};

export type VibrationSettings = {
  left: VibrationGrip;
  right: VibrationGrip;
};

export type VibrationMode = "off" | "strong" | "standard" | "weak" | "custom";

export type ProfileSummary = {
  vibration: VibrationSettings;
  settings: ControllerSettings;
  rawProfile: number[];
};

export type ProfileDocument = ProfileSummary & {
  id: number | null;
  phoneUuid: string;
  name: string;
  deviceUuid: string;
  deviceName: string;
  firmwareVersion: string;
  zkmVersion: string;
  snapshot: ProfileSnapshot | null;
};

export type SaveProfileInput = {
  id: number | null;
  phoneUuid: string;
  name: string;
  rawProfile: number[];
  deviceUuid: string;
  deviceName: string;
  firmwareVersion: string;
  zkmVersion: string;
  snapshot: ProfileSnapshot | null;
};

export type MacroCommitInput = {
  slot: number;
  rawRecord: number[];
  originalRecord: number[];
};

export type CommitProfileInput = {
  profile: SaveProfileInput;
  controllerSettings: ControllerSettingsInput | null;
  vibration: VibrationSettings | null;
  macro: MacroCommitInput | null;
  devicePath: string | null;
  deviceUuid: string | null;
  deviceSettings: DeviceSettings | null;
  deviceSettingsBaseline: DeviceSettings | null;
};

export type SettingChange = {
  label: string;
  before: string;
  after: string;
};

export type CommitResult = {
  profileSaved: boolean;
  macroRequested: boolean;
  macroSaved: boolean;
  applyRequested: boolean;
  profileApplied: boolean;
  deviceSettingsRequested: boolean;
  deviceSettingsSaved: boolean;
  warnings: string[];
  profile: ProfileDocument | null;
  macro: MacroSlotSummary | null;
  appliedProfile: ProfileSummary | null;
  deviceSettings: DeviceSettings | null;
};

export type ControllerSettingsInput = {
  rectangleAlgorithm: RectangleAlgorithmSettings;
  leftStick: CurveSettings;
  rightStick: CurveSettings;
  rapidFire: RapidFireSettings;
  keyBindings: string[];
};

export type MacroSlotSummary = {
  slot: number;
  stepCount: number;
  runKey: number;
  rawRecord: number[];
  error: string | null;
};

export type StepAccuracySettings = {
  mode: number;
  value: number;
  extension: number;
};

export type DeviceSettings = {
  pollingRate: number;
  stepAccuracy: StepAccuracySettings;
};

export type PollingMeasurement = {
  pollingRate: number;
  averagePollingRate: number;
  reportInterval: number;
  minInterval: number;
  maxInterval: number;
  intervalJitter: number;
  intervals: number[];
};

export type KeymapChoice =
  | { kind: "identity"; label: string }
  | { kind: "controller"; slot: number; label: string }
  | { kind: "keyboard"; modifier: number; usage: number; secondUsage: number; label: string }
  | { kind: "none"; label: "なし" };

export type MacroStep = {
  durationMs: number;
  marker: boolean;
  inputMask: number;
  analog: [number, number, number, number];
};

export type Stick = "leftStick" | "rightStick";
