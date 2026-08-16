export function parseProfileBytes(json: string): number[] | null {
  try {
    const value: unknown = JSON.parse(json);
    if (!Array.isArray(value)
      || !value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 0xff)) {
      return null;
    }
    return value as number[];
  } catch {
    return null;
  }
}

export function normalizeDeviceUuid(value: string): string | null {
  const compact = value.replace(/[\s:_-]/g, "");
  return /^[0-9a-f]{16}$/i.test(compact) ? compact.toUpperCase() : null;
}

export function deviceUuidsEqual(left: string, right: string): boolean {
  const normalizedLeft = normalizeDeviceUuid(left);
  return normalizedLeft !== null && normalizedLeft === normalizeDeviceUuid(right);
}

export function profileTargetsDevice(profileUuid: string, deviceUuid: string): boolean {
  return profileUuid.trim().length === 0 || deviceUuidsEqual(profileUuid, deviceUuid);
}
