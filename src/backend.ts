import { invoke } from "@tauri-apps/api/core";

import type {
  ApplyProfileResult,
  ControllerSettingsInput,
  DeviceSession,
  DeviceSettings,
  DeviceSettingsWriteResult,
  MacroSummary,
  MacroWriteResult,
  ProfileDocument,
  ProfileListEntry,
  ProfileSnapshot,
  ProfileSummary,
  SaveProfileInput,
  VibrationSettings,
} from "./models";

type ShareProfileInput = {
  name: string;
  profile: number[];
  deviceUuid: string;
  deviceName: string;
  firmwareVersion: string;
  zkmVersion: string;
};

export const backend = {
  scanDevice: (): Promise<DeviceSession | null> => invoke("scan_device"),
  listProfiles: (): Promise<ProfileListEntry[]> => invoke("list_profiles"),
  loadSavedProfile: (id: number): Promise<ProfileDocument> => invoke("load_saved_profile", { id }),
  saveProfile: (input: SaveProfileInput): Promise<ProfileDocument> => invoke("save_profile", { input }),
  deleteProfile: (id: number, snapshot: ProfileSnapshot): Promise<void> =>
    invoke("delete_profile", { input: { id, snapshot } }),
  readProfile: (devicePath: string): Promise<ProfileDocument> => invoke("read_profile", { devicePath }),
  importShareProfile: (shareCode: string, deviceUuid: string): Promise<ProfileDocument> =>
    invoke("import_share_profile", { shareCode, deviceUuid }),
  createShareCode: (input: ShareProfileInput): Promise<string> => invoke("create_share_code", input),
  newProfile: (): Promise<ProfileDocument> => invoke("new_profile"),
  updateVibration: (profile: number[], settings: VibrationSettings): Promise<ProfileSummary> =>
    invoke("update_vibration", { profile, settings }),
  updateControllerSettings: (profile: number[], settings: ControllerSettingsInput): Promise<ProfileSummary> =>
    invoke("update_controller_settings", { profile, settings }),
  applyProfile: (profile: number[], devicePath: string): Promise<ApplyProfileResult> =>
    invoke("apply_profile", { profile, devicePath }),
  readDeviceSettings: (devicePath: string): Promise<DeviceSettings> =>
    invoke("read_device_settings", { devicePath }),
  setDeviceSettings: (devicePath: string, settings: DeviceSettings): Promise<DeviceSettingsWriteResult> =>
    invoke("set_device_settings", { devicePath, settings }),
  readMacros: (devicePath: string): Promise<MacroSummary> => invoke("read_macros", { devicePath }),
  writeMacro: (devicePath: string, slot: number, rawRecord: number[]): Promise<MacroWriteResult> =>
    invoke("write_macro", { devicePath, slot, rawRecord }),
};
