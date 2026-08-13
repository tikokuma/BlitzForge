import { byId } from "../dom";
import type { VibrationMode, VibrationSettings } from "../models";

export type VibrationEditor = {
  setup: () => void;
  render: (settings: VibrationSettings) => void;
  reset: () => void;
  readSettings: () => VibrationSettings;
  isDirty: () => boolean;
};

type VibrationEditorOptions = {
  onDirtyChanged: () => void;
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

const VIBRATION_MIN_WIDTH = 20;

export function createVibrationEditor(options: VibrationEditorOptions): VibrationEditor {
  let initialized = false;
  let baseline: VibrationSettings | null = null;
  let dirty = false;

  function readRangeValue(id: string): number {
    return Number(byId<HTMLInputElement>(id).value);
  }

  function setRangeControl(id: string, value: number): void {
    byId<HTMLInputElement>(id).value = String(value);
    updateRangeOutput(id);
  }

  function clampRangeValue(id: string, value: number): number {
    const input = byId<HTMLInputElement>(id);
    const min = Number(input.min);
    const max = Number(input.max);
    return Math.min(max, Math.max(min, Math.round(value)));
  }

  function updateRangeOutput(id: string): void {
    const value = byId<HTMLInputElement>(id).value;
    const target = byId(`${id}-value`);
    if (target instanceof HTMLInputElement) target.value = value;
    else target.textContent = value;
  }

  function vibrationEqual(left: VibrationSettings, right: VibrationSettings): boolean {
    return left.left.min === right.left.min
      && left.left.max === right.left.max
      && left.right.min === right.right.min
      && left.right.max === right.right.max;
  }

  function vibrationMode(settings: VibrationSettings): VibrationMode {
    for (const mode of ["off", "strong", "standard", "weak"] as const) {
      if (vibrationEqual(settings, VIBRATION_PRESETS[mode])) return mode;
    }
    return "custom";
  }

  function readSettings(): VibrationSettings {
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

  function enforceVibrationWidth(grip: "left" | "right", changed: "min" | "max"): void {
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

  function updateEditorState(): void {
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

  function setControls(settings: VibrationSettings): void {
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
    updateEditorState();
  }

  function applyMode(mode: VibrationMode): void {
    if (mode !== "custom") {
      setControls(VIBRATION_PRESETS[mode]);
      return;
    }
    const current = readSettings();
    const hasEditableWidth = [current.left, current.right]
      .every((grip) => grip.max >= grip.min && grip.max - grip.min >= VIBRATION_MIN_WIDTH);
    if (!hasEditableWidth) {
      setControls({
        left: { min: 0, max: 255 },
        right: { min: 0, max: 255 },
      });
    } else {
      updateEditorState();
    }
  }

  function markDirty(): void {
    dirty = baseline !== null && !vibrationEqual(readSettings(), baseline);
    options.onDirtyChanged();
  }

  function setup(): void {
    if (initialized) return;
    initialized = true;
    byId<HTMLSelectElement>("vibration-mode").addEventListener("change", () => {
      applyMode(byId<HTMLSelectElement>("vibration-mode").value as VibrationMode);
      markDirty();
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
        byId<HTMLSelectElement>("vibration-mode").value = vibrationMode(readSettings());
        updateEditorState();
        markDirty();
      });
    }
  }

  function render(settings: VibrationSettings): void {
    baseline = settings;
    setControls(settings);
    dirty = false;
  }

  function reset(): void {
    baseline = null;
    dirty = false;
  }

  return { setup, render, reset, readSettings, isDirty: () => dirty };
}
