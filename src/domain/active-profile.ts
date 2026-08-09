import { normalizeDeviceUuid, parseProfileBytes } from "./profile";

const STORAGE_PREFIX = "bigbigwon.active-profile.v1.";

export type ActiveProfileStorage = Pick<Storage, "getItem" | "setItem">;

function storageKey(deviceUuid: string): string | null {
  const uuid = normalizeDeviceUuid(deviceUuid);
  return uuid === null ? null : `${STORAGE_PREFIX}${uuid}`;
}

export function loadRememberedActiveProfile(
  storage: ActiveProfileStorage,
  deviceUuid: string,
): number[] | null {
  const key = storageKey(deviceUuid);
  if (key === null) return null;
  const stored = storage.getItem(key);
  return stored === null ? null : parseProfileBytes(stored);
}

export function rememberActiveProfile(
  storage: ActiveProfileStorage,
  deviceUuid: string,
  rawProfile: readonly number[],
): void {
  const key = storageKey(deviceUuid);
  if (key === null) return;
  storage.setItem(key, JSON.stringify(rawProfile));
}
