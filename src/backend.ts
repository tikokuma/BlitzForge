import { invoke } from "@tauri-apps/api/core";

import type {
  ApplyProfileResult,
  CommitProfileInput,
  CommitPreview,
  CommitResult,
  DeviceSession,
  DeviceSettings,
  MacroSummary,
  ProfileDocument,
  ProfileListEntry,
  ProfileSnapshot,
  SaveProfileInput,
} from "./models";

type ShareProfileInput = {
  name: string;
  profile: number[];
  deviceUuid: string;
  deviceName: string;
  firmwareVersion: string;
  zkmVersion: string;
};

type ProfileListQuery = {
  deviceUuid: string | null;
  activeProfile: number[] | null;
};

export const backend = {
  scanDevice: (): Promise<DeviceSession | null> => invoke("scan_device"),
  listProfiles: (query: ProfileListQuery): Promise<ProfileListEntry[]> =>
    invoke("list_profiles", { query }),
  loadSavedProfile: (id: number): Promise<ProfileDocument> => invoke("load_saved_profile", { id }),
  saveProfile: (input: SaveProfileInput): Promise<ProfileDocument> => invoke("save_profile", { input }),
  commitProfile: (input: CommitProfileInput): Promise<CommitResult> => invoke("commit_profile", { input }),
  previewProfileCommit: (input: CommitProfileInput): Promise<CommitPreview> =>
    invoke("preview_profile_commit", { input }),
  deleteProfile: (id: number, snapshot: ProfileSnapshot): Promise<void> =>
    invoke("delete_profile", { input: { id, snapshot } }),
  readProfile: (devicePath: string): Promise<ProfileDocument> => invoke("read_profile", { devicePath }),
  importShareProfile: (shareCode: string, deviceUuid: string): Promise<ProfileDocument> =>
    invoke("import_share_profile", { shareCode, deviceUuid }),
  createShareCode: (input: ShareProfileInput): Promise<string> => invoke("create_share_code", input),
  newProfile: (): Promise<ProfileDocument> => invoke("new_profile"),
  applyProfile: (profile: number[], devicePath: string): Promise<ApplyProfileResult> =>
    invoke("apply_profile", { profile, devicePath }),
  readDeviceSettings: (devicePath: string): Promise<DeviceSettings> =>
    invoke("read_device_settings", { devicePath }),
  readMacros: (devicePath: string): Promise<MacroSummary> => invoke("read_macros", { devicePath }),
};
