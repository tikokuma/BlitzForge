export type DeviceSummary = {
  vendorProduct: string;
  usage: string;
  product: string;
  path: string;
};

export type DeviceSession = {
  device: DeviceSummary;
  uuid: string;
  zkmVersion: number;
};

export type ProfileSnapshot = {
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

export type ProfileListEntry = {
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
  timing?: { periodMs: number; halfPeriodMs: number; hz: number } | null;
};

export type ControllerSettings = {
  rectangleAlgorithm: boolean;
  leftStick: CurveSettings;
  rightStick: CurveSettings;
  rapidFire: RapidFireSettings;
  rapidFireSpeedIndex: number | null;
  rapidFireTiming: { periodMs: number; halfPeriodMs: number; hz: number } | null;
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
  device: DeviceSummary | null;
  storedCrc: string;
  computedCrc: string;
  vibration: VibrationSettings;
  settings: ControllerSettings;
  rawProfile: number[];
};

export type ProfileDocument = ProfileSummary & {
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

export type SaveProfileInput = {
  id: number | null;
  name: string;
  rawProfile: number[];
  deviceUuid: string;
  deviceName: string;
  firmwareVersion: string;
  zkmVersion: string;
  snapshot: ProfileSnapshot | null;
};

export type ApplyProfileResult = {
  profile: ProfileSummary;
  ack: string;
  ackValue: number;
};

export type ControllerSettingsInput = {
  rectangleAlgorithm: boolean;
  leftStick: CurveSettings;
  rightStick: CurveSettings;
  rapidFire: {
    keys: Array<boolean | null>;
    speedIndex: number | null;
  };
  keyBindings: string[];
};

export type MacroSlotSummary = {
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

export type MacroSummary = {
  device: DeviceSummary;
  listResponse: string;
  slots: MacroSlotSummary[];
};

export type MacroWriteResult = {
  device: DeviceSummary;
  slot: MacroSlotSummary;
  ack: string;
  ackValue: number;
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

export type DeviceSettingsWriteResult = {
  device: DeviceSummary;
  settings: DeviceSettings;
  pollingCommand: string;
  stepAccuracyCommand: string;
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
