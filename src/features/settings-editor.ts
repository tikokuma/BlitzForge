import { byId } from "../dom";
import type { KeymapEditor } from "./keymap-editor";
import {
  createCurveEditor,
  type CurveEditor,
  type DiagnosticStickSettings,
} from "./curve-editor";
import { createDeviceSettingsEditor, type DeviceSettingsEditor } from "./device-settings";
import { createVibrationEditor, type VibrationEditor } from "./vibration-settings";
import type {
  ControllerSettings,
  ControllerSettingsInput,
  DeviceSettings,
  ProfileSummary,
  VibrationSettings,
} from "../models";

export type SettingsEditor = {
  setup: () => void;
  render: (profile: ProfileSummary) => Promise<void>;
  reset: () => void;
  selectTab: (tab: "stick" | "keymap" | "device" | "vibration" | "macro") => void;
  readControllerSettings: () => ControllerSettingsInput;
  readVibrationSettings: () => VibrationSettings;
  readDeviceSettings: () => DeviceSettings;
  setDeviceSettings: (settings: DeviceSettings | null) => void;
  getDeviceSettingsBaseline: () => DeviceSettings | null;
  getStickSettings: () => DiagnosticStickSettings;
  isDirty: () => boolean;
};

type SettingsEditorOptions = {
  onDirtyChanged: () => void;
  onMacroTabSelected: () => void;
};

export function createSettingsEditor(options: SettingsEditorOptions): SettingsEditor {
  let initialized = false;
  let keymapEditor: KeymapEditor | null = null;
  let keymapEditorPromise: Promise<KeymapEditor> | null = null;
  let baselineControllerSettings: ControllerSettings | null = null;
  let keymapDirty = false;

  const curveEditor: CurveEditor = createCurveEditor({
    onDirtyChanged: options.onDirtyChanged,
  });
  const vibrationEditor: VibrationEditor = createVibrationEditor({
    onDirtyChanged: options.onDirtyChanged,
  });
  const deviceSettingsEditor: DeviceSettingsEditor = createDeviceSettingsEditor({
    onDirtyChanged: options.onDirtyChanged,
  });

  function activeKeymapEditor(): KeymapEditor {
    if (!keymapEditor) throw new Error("キーマップ編集画面が初期化されていません");
    return keymapEditor;
  }

  function markKeymapSettingsDirty(): void {
    const settings = baselineControllerSettings;
    if (settings) {
        const input = activeKeymapEditor().readSettings();
        keymapDirty = settings.rapidFire.keys.length !== input.rapidFire.keys.length
          || !settings.rapidFire.keys.every((value, index) => value === input.rapidFire.keys[index])
          || settings.rapidFire.speedIndex !== input.rapidFire.speedIndex
        || settings.keyBindings.length !== input.keyBindings.length
        || !settings.keyBindings.every((value, index) => {
          const candidate = input.keyBindings[index];
          return value.toUpperCase() === candidate?.toUpperCase();
        });
    } else {
      keymapDirty = false;
    }
    options.onDirtyChanged();
  }

  function loadKeymapEditor(): Promise<KeymapEditor> {
    if (keymapEditor) return Promise.resolve(keymapEditor);
    keymapEditorPromise ??= import("./keymap-editor")
      .then(({ createKeymapEditor }) => {
        const editor = createKeymapEditor({ markDirty: markKeymapSettingsDirty });
        editor.setup();
        keymapEditor = editor;
        return editor;
      });
    return keymapEditorPromise;
  }

  function selectTab(tab: "stick" | "keymap" | "device" | "vibration" | "macro"): void {
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
    if (tab === "macro") options.onMacroTabSelected();
  }

  function readControllerSettings(): ControllerSettingsInput {
    return {
      ...curveEditor.readSettings(),
      ...activeKeymapEditor().readSettings(),
    };
  }

  function renderControllerSettings(settings: ControllerSettings): void {
    curveEditor.render(settings);
    activeKeymapEditor().render(settings.keyBindings, settings.rapidFire);
    keymapDirty = false;
  }

  async function render(profile: ProfileSummary): Promise<void> {
    await loadKeymapEditor();
    baselineControllerSettings = profile.settings;
    renderControllerSettings(profile.settings);
    vibrationEditor.render(profile.vibration);
    options.onDirtyChanged();
  }

  function setDeviceSettings(settings: DeviceSettings | null): void {
    deviceSettingsEditor.setSettings(settings);
    options.onDirtyChanged();
  }

  function getDeviceSettingsBaseline(): DeviceSettings | null {
    return deviceSettingsEditor.getBaseline();
  }

  function setup(): void {
    if (initialized) return;
    initialized = true;
    byId("tab-stick").addEventListener("click", () => selectTab("stick"));
    byId("tab-keymap").addEventListener("click", () => selectTab("keymap"));
    byId("tab-device").addEventListener("click", () => selectTab("device"));
    byId("tab-vibration").addEventListener("click", () => selectTab("vibration"));
    byId("tab-macro").addEventListener("click", () => selectTab("macro"));
    curveEditor.setup();
    vibrationEditor.setup();
    deviceSettingsEditor.setup();
    selectTab("stick");
  }

  function reset(): void {
    baselineControllerSettings = null;
    keymapDirty = false;
    curveEditor.reset();
    vibrationEditor.reset();
    deviceSettingsEditor.reset();
    options.onDirtyChanged();
  }

  return {
    setup,
    render,
    reset,
    selectTab,
    readControllerSettings,
    readVibrationSettings: vibrationEditor.readSettings,
    readDeviceSettings: deviceSettingsEditor.readSettings,
    setDeviceSettings,
    getDeviceSettingsBaseline,
    getStickSettings: curveEditor.getStickSettings,
    isDirty: () => curveEditor.isDirty()
      || keymapDirty
      || vibrationEditor.isDirty()
      || deviceSettingsEditor.isDirty(),
  };
}
