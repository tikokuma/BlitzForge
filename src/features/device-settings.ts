import { byId } from "../dom";
import type { DeviceSettings, StepAccuracySettings } from "../models";

export type DeviceSettingsEditor = {
  setup: () => void;
  setSettings: (settings: DeviceSettings | null) => void;
  reset: () => void;
  readSettings: () => DeviceSettings;
  getBaseline: () => DeviceSettings | null;
  isDirty: () => boolean;
};

type DeviceSettingsEditorOptions = {
  onDirtyChanged: () => void;
};

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

export function createDeviceSettingsEditor(options: DeviceSettingsEditorOptions): DeviceSettingsEditor {
  let initialized = false;
  let baseline: DeviceSettings | null = null;
  let dirty = false;

  function cloneSettings(settings: DeviceSettings): DeviceSettings {
    return {
      pollingRate: settings.pollingRate,
      stepAccuracy: { ...settings.stepAccuracy },
    };
  }

  function setPollingRateControl(value: number): void {
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

  function setStepAccuracyChoice(settings: StepAccuracySettings): void {
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

  function setControls(settings: DeviceSettings): void {
    setPollingRateControl(settings.pollingRate);
    byId<HTMLInputElement>("step-accuracy-mode").value = String(settings.stepAccuracy.mode);
    byId<HTMLInputElement>("step-accuracy-value").value = String(settings.stepAccuracy.value);
    byId<HTMLInputElement>("step-accuracy-extension").value = String(settings.stepAccuracy.extension);
    setStepAccuracyChoice(settings.stepAccuracy);
  }

  function readSettings(): DeviceSettings {
    return {
      pollingRate: Number(byId<HTMLSelectElement>("polling-rate").value),
      stepAccuracy: {
        mode: Number(byId<HTMLInputElement>("step-accuracy-mode").value),
        value: Number(byId<HTMLInputElement>("step-accuracy-value").value),
        extension: Number(byId<HTMLInputElement>("step-accuracy-extension").value),
      },
    };
  }

  function settingsEqual(left: DeviceSettings, right: DeviceSettings): boolean {
    return left.pollingRate === right.pollingRate
      && left.stepAccuracy.mode === right.stepAccuracy.mode
      && left.stepAccuracy.value === right.stepAccuracy.value
      && left.stepAccuracy.extension === right.stepAccuracy.extension;
  }

  function markDirty(): void {
    dirty = baseline !== null && !settingsEqual(baseline, readSettings());
    byId("device-dirty").hidden = !dirty;
    options.onDirtyChanged();
  }

  function setup(): void {
    if (initialized) return;
    initialized = true;
    byId<HTMLSelectElement>("polling-rate").addEventListener("change", markDirty);
    byId<HTMLSelectElement>("step-accuracy").addEventListener("change", () => {
      const choice = byId<HTMLSelectElement>("step-accuracy").value;
      if (choice !== "unknown") {
        const value = choice === "adaptive" ? null : Number(choice);
        byId<HTMLInputElement>("step-accuracy-mode").value = choice === "adaptive" ? "0" : "1";
        if (value !== null) byId<HTMLInputElement>("step-accuracy-value").value = String(value);
      }
      setStepAccuracyChoice(readSettings().stepAccuracy);
      markDirty();
    });
  }

  function setSettings(settings: DeviceSettings | null): void {
    baseline = settings ? cloneSettings(settings) : null;
    dirty = false;
    if (baseline) setControls(baseline);
    byId("device-dirty").hidden = true;
  }

  function reset(): void {
    baseline = null;
    dirty = false;
    byId("device-dirty").hidden = true;
  }

  function getBaseline(): DeviceSettings | null {
    return baseline ? cloneSettings(baseline) : null;
  }

  return { setup, setSettings, reset, readSettings, getBaseline, isDirty: () => dirty };
}
