import { backend } from "./backend";
import { byId, errorMessage } from "./dom";
import {
  loadRememberedActiveProfile,
  rememberActiveProfile,
} from "./domain/active-profile";
import { createBusyState } from "./domain/busy-state";
import { deviceUuidsEqual } from "./domain/profile";
import { createLatestRequestGuard } from "./domain/latest-request";
import type { InputDiagnostics } from "./features/input-diagnostics";
import type { MacroEditor } from "./features/macro-editor";
import type {
  ActiveProfileState,
  CommitProfileInput,
  CommitPreview,
  CommitResult,
  DeviceSession,
  DeviceSettings,
  ProfileDocument,
  ProfileListEntry,
} from "./models";
import { createSettingsEditor, type SettingsEditor } from "./features/settings-editor";
import { createProfileLibrary, type ProfileLibrary } from "./profile-library";
import { setupWindowControls } from "./window-controls";

let busy = false;
const busyState = createBusyState();
let deviceSession: DeviceSession | null = null;
let profileList: ProfileListEntry[] = [];
let editingProfile: ProfileDocument | null = null;
let activeProfileState: ActiveProfileState = "unknown";
let activeDeviceProfile: number[] | null = null;
type SaveMode = "save" | "apply";
type NotificationKind = "error" | "success";
type AppView = "home" | "settings" | "diagnostics";
let notificationTimer: number | null = null;
let shareImportDialogResolve: ((shareCode: string | null) => void) | null = null;
let currentView: AppView = "home";
let macroEditor: MacroEditor | null = null;
let macroEditorPromise: Promise<MacroEditor> | null = null;
let inputDiagnostics: InputDiagnostics | null = null;
let inputDiagnosticsPromise: Promise<InputDiagnostics> | null = null;
let renderedProfileLibraryKey: string | null = null;
let profileDataVersion: number | null = null;
let profileContextRevision = 0;
let listedProfileContextRevision = -1;
let focusRefreshTimer: number | null = null;
const profileRefreshGuard = createLatestRequestGuard();

function clearNotification() {
  if (notificationTimer !== null) {
    window.clearTimeout(notificationTimer);
    notificationTimer = null;
  }
  const target = byId("notification-overlay");
  target.textContent = "";
  target.hidden = true;
  target.removeAttribute("data-kind");
  target.setAttribute("role", "status");
  target.setAttribute("aria-live", "polite");
}

function showNotification(message: string, kind: NotificationKind) {
  clearNotification();
  if (message.length === 0) return;
  const target = byId("notification-overlay");
  target.textContent = message;
  target.dataset.kind = kind;
  target.hidden = false;
  target.setAttribute("role", kind === "error" ? "alert" : "status");
  target.setAttribute("aria-live", kind === "error" ? "assertive" : "polite");
  notificationTimer = window.setTimeout(clearNotification, 5000);
}

function showError(message: string) {
  const localizedMessage = message.startsWith("Missing UI element #")
    ? "画面の表示に必要な要素が見つかりません。"
    : message;
  showNotification(localizedMessage, "error");
}

function showSuccess(message: string) {
  showNotification(message, "success");
}

function setBusy(value: boolean) {
  if (value) busyState.enter();
  else busyState.leave();
  const nextBusy = busyState.isBusy();
  if (nextBusy && !busy) clearNotification();
  busy = nextBusy;
  syncActions();
}

function setDisabled(id: string, disabled: boolean) {
  const button = byId(id, HTMLButtonElement);
  if (button.disabled !== disabled) button.disabled = disabled;
}

function syncActions() {
  const macroDirty = macroEditor?.isDirty() ?? false;
  const ariaBusy = String(busy);
  for (const id of ["home-view", "settings-view", "diagnostics-view"] as const) {
    const view = byId(id);
    if (view.inert !== busy) view.inert = busy;
    if (view.getAttribute("aria-busy") !== ariaBusy) view.setAttribute("aria-busy", ariaBusy);
  }
  setDisabled("refresh-device", busy);
  setDisabled("import-profile", busy);
  setDisabled("new-profile", busy);
  setDisabled("read-device-profile", busy || !deviceSession);
  setDisabled("apply-profile", busy || !editingProfileCanApply());
  setDisabled("save-profile", busy || editingProfile === null);
  const dirtyIndicator = byId("settings-dirty");
  const hideDirtyIndicator = !settingsEditor.isDirty() && !macroDirty;
  if (dirtyIndicator.hidden !== hideDirtyIndicator) dirtyIndicator.hidden = hideDirtyIndicator;
  profileLibrary.syncActions();
  macroEditor?.syncActions();
}

function loadMacroEditor(): Promise<MacroEditor> {
  if (macroEditor) return Promise.resolve(macroEditor);
  macroEditorPromise ??= import("./features/macro-editor")
    .then(({ createMacroEditor }) => {
      const editor = createMacroEditor({
        getDevicePath: () => deviceSession?.device.path ?? null,
        isBusy: () => busy,
        setBusy,
        showError,
        syncHostActions: syncActions,
      });
      editor.setup();
      macroEditor = editor;
      editor.syncActions();
      return editor;
    })
    .catch((error: unknown) => {
      macroEditorPromise = null;
      throw error;
    });
  return macroEditorPromise;
}

function loadInputDiagnostics(): Promise<InputDiagnostics> {
  if (inputDiagnostics) return Promise.resolve(inputDiagnostics);
  inputDiagnosticsPromise ??= import("./features/input-diagnostics")
    .then(({ createInputDiagnostics }) => {
      const diagnostics = createInputDiagnostics({
        getDeviceIdentifiers: () => {
          const device = deviceSession?.device;
          return device ? [device.product, device.vendorProduct] : [];
        },
        getStickSettings: () => settingsEditor.getStickSettings(),
        measurePollingRate: async () => {
          const devicePath = deviceSession?.device.path;
          if (!devicePath) throw new Error("コントローラーが接続されていません");
          return backend.measurePollingRate(devicePath);
        },
      });
      diagnostics.setup();
      inputDiagnostics = diagnostics;
      return diagnostics;
    })
    .catch((error: unknown) => {
      inputDiagnosticsPromise = null;
      throw error;
    });
  return inputDiagnosticsPromise;
}

function renderDevice(session: DeviceSession | null) {
  const name = byId("device-name");
  if (!session) {
    name.textContent = "接続を確認しています";
    return;
  }
  name.textContent = session.device.product;
}

function setConnection(session: DeviceSession | null) {
  deviceSession = session;
  profileContextRevision += 1;
  renderDevice(session);
}

function clearProfile() {
  editingProfile = null;
  settingsEditor.reset();
  byId("settings-profile-name").textContent = "";
  macroEditor?.reset();
  syncActions();
}

function renderProfile(profile: ProfileDocument) {
  byId("settings-profile-name").textContent = profile.name;
}

function editingProfileCanApply(): boolean {
  const profile = editingProfile;
  const session = deviceSession;
  if (!profile || !session) return false;
  return profile.deviceUuid.trim().length === 0 || profileMatchesDevice(profile, session);
}

function showView(view: AppView) {
  currentView = view;
  const homeVisible = view === "home";
  const settingsVisible = view === "settings";
  const diagnosticsVisible = view === "diagnostics";
  byId("home-view").hidden = !homeVisible;
  byId("settings-view").hidden = !settingsVisible;
  byId("diagnostics-view").hidden = !diagnosticsVisible;
  byId("main-tabs").hidden = settingsVisible;
  byId("main-tab-home").classList.toggle("active", homeVisible);
  byId("main-tab-diagnostics").classList.toggle("active", diagnosticsVisible);
  byId("main-tab-home").setAttribute("aria-selected", String(homeVisible));
  byId("main-tab-diagnostics").setAttribute("aria-selected", String(diagnosticsVisible));
  clearNotification();
  if (settingsVisible && editingProfile) {
    settingsEditor.selectTab("stick");
  }
  if (diagnosticsVisible) {
    void loadInputDiagnostics()
      .then((diagnostics) => {
        if (currentView === "diagnostics") diagnostics.show();
      })
      .catch((error: unknown) => showError(`診断画面を読み込めませんでした: ${errorMessage(error)}`));
  } else {
    inputDiagnostics?.hide();
  }
}

function profileMatchesDevice(
  profile: { deviceUuid: string },
  session: DeviceSession | null = deviceSession,
): boolean {
  return deviceUuidsEqual(profile.deviceUuid, session?.uuid ?? "");
}

function renderSaveDialog(preview: CommitPreview): void {
  const profile = editingProfile;
  if (!profile) return;
  const list = byId("save-diff-list");
  const empty = byId("save-diff-empty");
  list.replaceChildren();
  byId("save-diff-count").textContent = `${preview.changes.length}件`;
  if (preview.changes.length === 0) {
    empty.hidden = false;
  } else {
    empty.hidden = true;
    list.append(...preview.changes.map((item, index) => {
      const row = document.createElement("article");
      row.className = "save-diff-item";
      row.setAttribute("role", "listitem");

      const heading = document.createElement("div");
      heading.className = "save-diff-item-heading";
      const label = document.createElement("strong");
      label.className = "save-diff-item-label";
      label.textContent = item.label;
      const number = document.createElement("span");
      number.className = "save-diff-item-number";
      number.textContent = String(index + 1).padStart(2, "0");
      heading.append(label, number);

      const values = document.createElement("div");
      values.className = "save-diff-item-values";
      const before = document.createElement("div");
      before.className = "save-diff-side save-diff-before";
      const beforeLabel = document.createElement("span");
      beforeLabel.textContent = "変更前";
      const beforeValue = document.createElement("strong");
      beforeValue.textContent = item.before;
      before.append(beforeLabel, beforeValue);
      const arrow = document.createElement("span");
      arrow.className = "save-diff-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "→";
      const after = document.createElement("div");
      after.className = "save-diff-side save-diff-after";
      const afterLabel = document.createElement("span");
      afterLabel.textContent = "変更後";
      const afterValue = document.createElement("strong");
      afterValue.textContent = item.after;
      after.append(afterLabel, afterValue);
      values.append(before, arrow, after);

      row.append(heading, values);
      return row;
    }));
  }
  byId("save-dialog-profile-name").textContent = profile.name;
  byId("save-dialog-save", HTMLButtonElement).disabled = preview.changes.length === 0;
}

async function openSaveDialog(): Promise<void> {
  if (busy || !editingProfile) return;
  const profile = editingProfile;
  setBusy(true);
  try {
    const preview = await backend.previewProfileCommit(buildCommitProfileInput(profile, profile.name, "save"));
    renderSaveDialog(preview);
    const dialog = byId("save-dialog", HTMLDialogElement);
    if (!dialog.open) dialog.showModal();
  } catch (error) {
    showError(errorMessage(error));
  } finally {
    setBusy(false);
  }
}

function closeSaveDialog(): void {
  const dialog = byId("save-dialog", HTMLDialogElement);
  if (dialog.open) dialog.close();
}

function saveFromDialog(): void {
  closeSaveDialog();
  void saveProfileDocument("save");
}

async function setEditingProfile(profile: ProfileDocument, preserveMacro = false) {
  await settingsEditor.render(profile);
  if (!preserveMacro) macroEditor?.reset();
  editingProfile = profile;
  renderProfile(profile);
  syncActions();
}

async function refreshProfiles() {
  const contextRevision = profileContextRevision;
  const request = profileRefreshGuard.start(contextRevision);
  const result = await backend.listProfiles({
    deviceUuid: deviceSession?.uuid ?? null,
    activeProfile: activeDeviceProfile && deviceSession
      ? [...activeDeviceProfile]
      : null,
    knownDataVersion: profileDataVersion,
    force: listedProfileContextRevision !== contextRevision,
  });
  if (!profileRefreshGuard.isCurrent(request, profileContextRevision)) return;
  profileDataVersion = result.dataVersion;
  listedProfileContextRevision = contextRevision;
  if (result.profiles === null) return;
  const nextProfiles = result.profiles;
  profileList = nextProfiles;
  const renderKey = JSON.stringify([
    deviceSession?.uuid ?? null,
    activeProfileState,
    nextProfiles.map((entry) => [
      entry.id,
      entry.name,
      entry.deviceUuid,
      entry.profileVersion,
      entry.createdAt,
      entry.active,
    ]),
  ]);
  if (renderKey === renderedProfileLibraryKey) return;
  renderedProfileLibraryKey = renderKey;
  profileLibrary.render();
}

async function openSavedProfile(id: number) {
  if (busy) return;
  setBusy(true);
  try {
    await setEditingProfile(await backend.loadSavedProfile(id));
    showView("settings");
  } catch (error) {
    showError(errorMessage(error));
    await refreshProfiles().catch(() => undefined);
  } finally {
    setBusy(false);
  }
}

async function duplicateProfile(entry: ProfileListEntry) {
  if (busy) return;
  const name = window.prompt("複製後のプロファイル名", `${entry.name} コピー`);
  if (name === null) return;
  setBusy(true);
  try {
    const source = await backend.loadSavedProfile(entry.id);
    const saved = await backend.saveProfile({
      id: null,
      phoneUuid: source.phoneUuid,
      name,
      rawProfile: source.rawProfile,
      deviceUuid: source.deviceUuid,
      deviceName: source.deviceName,
      firmwareVersion: source.firmwareVersion,
      zkmVersion: source.zkmVersion,
      snapshot: null,
    });
    await setEditingProfile(saved);
    await refreshProfiles();
    showView("settings");
  } catch (error) {
    showError(errorMessage(error));
  } finally {
    setBusy(false);
  }
}

async function renameProfile(entry: ProfileListEntry) {
  if (busy) return;
  const name = window.prompt("新しいプロファイル名", entry.name);
  if (name === null || name.trim() === entry.name) return;
  setBusy(true);
  try {
    const source = await backend.loadSavedProfile(entry.id);
    const saved = await backend.saveProfile({
      id: source.id,
      phoneUuid: source.phoneUuid,
      name,
      rawProfile: source.rawProfile,
      deviceUuid: source.deviceUuid,
      deviceName: source.deviceName,
      firmwareVersion: source.firmwareVersion,
      zkmVersion: source.zkmVersion,
      snapshot: source.snapshot,
    });
    if (editingProfile?.id === saved.id) await setEditingProfile(saved, true);
    await refreshProfiles();
  } catch (error) {
    showError(errorMessage(error));
  } finally {
    setBusy(false);
  }
}

async function deleteProfile(entry: ProfileListEntry) {
  if (busy) return;
  if (!window.confirm(`「${entry.name}」を削除しますか？`)) return;
  setBusy(true);
  try {
    await backend.deleteProfile(entry.id, entry.revision);
    if (editingProfile?.id === entry.id) {
      clearProfile();
      showView("home");
    }
    await refreshProfiles();
  } catch (error) {
    const message = errorMessage(error);
    if (message.startsWith("PROFILE_CONFLICT:")) {
      showError("公式アプリ側で変更されています。再読込してから削除してください。");
      await refreshProfiles().catch(() => undefined);
    } else {
      showError(message);
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
  profileContextRevision += 1;
}

function setKnownActiveProfile(rawProfile: readonly number[], session: DeviceSession) {
  activeDeviceProfile = [...rawProfile];
  activeProfileState = "known";
  profileContextRevision += 1;
  try {
    rememberActiveProfile(window.localStorage, session.uuid, rawProfile);
  } catch (error) {
    console.warn("Could not remember the active profile", error);
  }
}

async function scan() {
  let deviceSettingsError: unknown = null;
  let profilesPromise: Promise<void>;
  let deviceSettingsPromise: Promise<void> = Promise.resolve();
  setBusy(true);
  try {
    setConnection(await backend.scanDevice());
    clearProfile();
    activeDeviceProfile = null;
    activeProfileState = deviceSession ? "unknown" : "known";
    profileContextRevision += 1;
    if (deviceSession) {
      restoreRememberedActiveProfile(deviceSession);
      deviceSettingsPromise = backend
        .readDeviceSettings(deviceSession.device.path)
        .then(applyDeviceSettings)
        .catch((error: unknown) => {
          deviceSettingsError = error;
          settingsEditor.setDeviceSettings(null);
        });
    }
    profilesPromise = refreshProfiles();
  } catch (error) {
    setConnection(null);
    clearProfile();
    activeDeviceProfile = null;
    activeProfileState = "known";
    profileContextRevision += 1;
    showView("home");
    showError(errorMessage(error));
    setBusy(false);
    return;
  }
  try {
    await Promise.all([profilesPromise, deviceSettingsPromise]);
    showView("home");
    if (deviceSettingsError) {
      showError(`デバイス設定を読み込めませんでした: ${errorMessage(deviceSettingsError)}`);
    }
  } catch (error) {
    showView("home");
    showError(`プロファイル一覧を読み込めませんでした: ${errorMessage(error)}`);
  } finally {
    setBusy(false);
  }
}

async function readProfileFromDevice() {
  const session = deviceSession;
  if (!session) return;
  setBusy(true);
  try {
    const profile = await backend.readProfile(session.device.path);
    setKnownActiveProfile(profile.rawProfile, session);
    await setEditingProfile({
      ...profile,
      name: "コントローラーから読み込んだプロファイル",
      deviceUuid: session.uuid,
      deviceName: session.device.profileName,
      zkmVersion: session.zkmVersion ? String(session.zkmVersion) : "",
    });
    showView("settings");
  } catch (error) {
    showError(errorMessage(error));
  } finally {
    setBusy(false);
  }
}

function closeShareImportDialog(shareCode: string | null): void {
  const dialog = byId("share-import-dialog", HTMLDialogElement);
  const resolve = shareImportDialogResolve;
  shareImportDialogResolve = null;
  if (dialog.open) dialog.close();
  resolve?.(shareCode);
}

function openShareImportDialog(): Promise<string | null> {
  const dialog = byId("share-import-dialog", HTMLDialogElement);
  const input = byId("share-import-code", HTMLInputElement);
  const note = byId("share-import-dialog-note");
  if (dialog.open) return Promise.resolve(null);
  input.value = "";
  input.removeAttribute("aria-invalid");
  note.textContent = "コードを入力して「追加」を押してください。";
  note.removeAttribute("data-kind");
  return new Promise((resolve) => {
    shareImportDialogResolve = resolve;
    dialog.showModal();
    window.setTimeout(() => input.focus(), 0);
  });
}

function confirmShareImportDialog(): void {
  const input = byId("share-import-code", HTMLInputElement);
  const note = byId("share-import-dialog-note");
  const shareCode = input.value.trim();
  if (!shareCode) {
    input.setAttribute("aria-invalid", "true");
    note.textContent = "Shareコードを入力してください。";
    note.dataset.kind = "error";
    input.focus();
    return;
  }
  closeShareImportDialog(shareCode);
}

async function importShareProfile() {
  const shareCode = await openShareImportDialog();
  if (!shareCode) return;
  setBusy(true);
  try {
    await setEditingProfile(await backend.importShareProfile(shareCode, deviceSession?.uuid ?? ""));
    showView("settings");
  } catch (error) {
    showError(errorMessage(error));
  } finally {
    setBusy(false);
  }
}

async function createNewProfile() {
  setBusy(true);
  try {
    await setEditingProfile(await backend.newProfile());
    showView("settings");
  } catch (error) {
    showError(errorMessage(error));
  } finally {
    setBusy(false);
  }
}

async function exportShareCode(profile: ProfileDocument) {
  const session = deviceSession;
  setBusy(true);
  try {
    const shareCode = await backend.createShareCode({
      name: profile.name || "BIGBIGWON Profile",
      profile: profile.rawProfile,
      phoneUuid: profile.phoneUuid,
      deviceUuid: profile.deviceUuid || session?.uuid || "",
      deviceName: profile.deviceName || session?.device.profileName || "",
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
    if (!copied) {
      showError(`公式Shareコードをクリップボードにコピーできませんでした。\n${shareCode}`);
    } else {
      showSuccess(`公式Shareコードを発行しました。\nShareコード: ${shareCode}\nクリップボードにコピーしました。`);
    }
  } catch (error) {
    showError(errorMessage(error));
  } finally {
    setBusy(false);
  }
}

async function shareSavedProfile(id: number, button: HTMLButtonElement) {
  if (busy) return;
  const originalLabel = button.textContent ?? "Shareコードを発行";
  button.disabled = true;
  button.textContent = "発行中…";
  setBusy(true);
  try {
    const profile = await backend.loadSavedProfile(id);
    await exportShareCode(profile);
  } catch (error) {
    showError(errorMessage(error));
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
    setBusy(false);
  }
}

async function applySavedProfileFromCard(id: number) {
  const session = deviceSession;
  if (busy || !session) return;
  setBusy(true);
  try {
    const profile = await backend.loadSavedProfile(id);
    if (profile.id === null || !profileMatchesDevice(profile, session)) {
      throw new Error("選択したプロファイルは接続中コントローラーに適用できません。");
    }
    await applySavedProfileToDevice(profile, session);
    await refreshProfiles();
    showSuccess("プロファイルを適用しました。");
  } catch (error) {
    showError(errorMessage(error));
  } finally {
    setBusy(false);
  }
}

async function applySavedProfileToDevice(profile: ProfileDocument, session: DeviceSession) {
  if (profile.id === null || !profileMatchesDevice(profile, session)) {
    throw new Error("このプロファイルは接続中コントローラーに適用できません。");
  }
  const result = await backend.applyProfile(profile.rawProfile, session.device.path);
  setKnownActiveProfile(result.profile.rawProfile, session);
}

function applyDeviceSettings(settings: DeviceSettings): void {
  settingsEditor.setDeviceSettings(settings);
}

function buildCommitProfileInput(
  profile: ProfileDocument,
  name: string,
  mode: SaveMode,
): CommitProfileInput {
  const deviceSettingsBaseline = settingsEditor.getDeviceSettingsBaseline();
  return {
    profile: {
      id: profile.id,
      phoneUuid: profile.phoneUuid,
      name,
      rawProfile: profile.rawProfile,
      deviceUuid: profile.deviceUuid || deviceSession?.uuid || "",
      deviceName: profile.deviceName || deviceSession?.device.profileName || "",
      firmwareVersion: profile.firmwareVersion,
      zkmVersion: profile.zkmVersion || (deviceSession?.zkmVersion ? String(deviceSession.zkmVersion) : ""),
      snapshot: profile.snapshot,
    },
    controllerSettings: settingsEditor.readControllerSettings(),
    vibration: settingsEditor.readVibrationSettings(),
    macro: macroEditor?.readDraft() ?? null,
    devicePath: deviceSession?.device.path ?? null,
    deviceUuid: deviceSession?.uuid ?? null,
    deviceSettings: deviceSettingsBaseline ? settingsEditor.readDeviceSettings() : null,
    deviceSettingsBaseline,
    mode: mode === "apply" ? "saveAndApply" : "save",
  };
}

async function applyCommitResult(result: CommitResult): Promise<void> {
  if (result.profile) await setEditingProfile(result.profile, true);
  if (result.macro) macroEditor?.markSaved(result.macro);
  if (result.deviceSettings) applyDeviceSettings(result.deviceSettings.settings);
  if (result.appliedProfile && deviceSession) {
    setKnownActiveProfile(result.appliedProfile.rawProfile, deviceSession);
  }
}

function commitResultSummary(result: CommitResult): string {
  const stage = (requested: boolean, succeeded: boolean) => {
    if (!requested) return "未実行";
    return succeeded ? "成功" : "未完了";
  };
  const profileStage = result.profileSaved ? "成功" : "未実行";
  return [
    `プロファイル保存: ${profileStage}`,
    `マクロ保存: ${stage(result.macroRequested, result.macroSaved)}`,
    `適用: ${stage(result.applyRequested, result.profileApplied)}`,
    `デバイス設定保存: ${stage(result.deviceSettingsRequested, result.deviceSettingsSaved)}`,
  ].join(" / ");
}

function commitWarningMessage(result: CommitResult, prefix = ""): string {
  return [
    prefix,
    "保存処理は完了しましたが、一部の工程に失敗または未実行があります。",
    ...result.warnings,
    `保存結果: ${commitResultSummary(result)}`,
  ].filter((line) => line.length > 0).join("\n");
}

function commitSuccessMessage(result: CommitResult, mode: SaveMode): string {
  if (mode === "apply" && result.profileApplied) {
    return "コントローラーへ適用しました。";
  }
  return "保存が完了しました。";
}

async function saveProfileDocument(mode: SaveMode) {
  const profile = editingProfile;
  if (!profile) return;
  let name = profile.name;
  if (profile.id === null) {
    const prompted = window.prompt("保存するプロファイル名", name);
    if (prompted === null) return;
    name = prompted;
  }
  let committedResult: CommitResult | null = null;
  setBusy(true);
  try {
    committedResult = await backend.commitProfile(buildCommitProfileInput(profile, name, mode));
    await applyCommitResult(committedResult);
    if (committedResult.profileSaved || committedResult.profileApplied) await refreshProfiles();
    if (committedResult.warnings.length > 0) {
      showError(commitWarningMessage(committedResult));
    } else {
      showSuccess(commitSuccessMessage(committedResult, mode));
    }
  } catch (error) {
    const message = errorMessage(error);
    if (committedResult === null && message.startsWith("PROFILE_CONFLICT:") && profile.id !== null) {
      const reload = window.confirm("公式アプリ側で変更されています。OKで再読込、キャンセルで別名保存します。");
      if (reload) {
        await openSavedProfile(profile.id);
      } else {
        const copyName = window.prompt("別名で保存する名前", `${profile.name} コピー`);
        if (copyName) {
          let copyResult: CommitResult | null = null;
          try {
            const copyInput = buildCommitProfileInput(profile, copyName, mode);
            copyInput.profile.id = null;
            copyInput.profile.snapshot = null;
            copyResult = await backend.commitProfile(copyInput);
            await applyCommitResult(copyResult);
            if (copyResult.profileSaved || copyResult.profileApplied) await refreshProfiles();
            if (copyResult.warnings.length > 0) {
              showError(commitWarningMessage(copyResult, "外部変更を上書きせず、別名で保存しました。"));
            } else {
              showSuccess("外部変更を上書きせず、別名で保存しました。");
            }
          } catch (copyError) {
            if (copyResult) {
              showError(`${errorMessage(copyError)}\n保存結果: ${commitResultSummary(copyResult)}`);
            } else {
              showError(errorMessage(copyError));
            }
          }
        }
      }
    } else {
      if (committedResult) {
        await refreshProfiles().catch(() => undefined);
        showError(`${message}\n保存結果: ${commitResultSummary(committedResult)}`);
      } else {
        showError(message);
      }
    }
  } finally {
    setBusy(false);
  }
}

const settingsEditor: SettingsEditor = createSettingsEditor({
  onDirtyChanged: syncActions,
  onMacroTabSelected: () => {
    void loadMacroEditor()
      .catch((error: unknown) => showError(`マクロ編集画面を読み込めませんでした: ${errorMessage(error)}`));
  },
});
const profileLibrary: ProfileLibrary = createProfileLibrary({
  getEntries: () => profileList,
  isBusy: () => busy,
  getDeviceSession: () => deviceSession,
  getActiveProfileState: () => activeProfileState,
  getActiveDeviceProfile: () => activeDeviceProfile,
  profileMatchesDevice,
  onOpen: (id) => void openSavedProfile(id),
  onApply: (id) => void applySavedProfileFromCard(id),
  onShare: (id, button) => void shareSavedProfile(id, button),
  onDuplicate: (entry) => void duplicateProfile(entry),
  onRename: (entry) => void renameProfile(entry),
  onDelete: (entry) => void deleteProfile(entry),
});

window.addEventListener("DOMContentLoaded", () => {
  setupWindowControls(showError);
  byId("main-tab-home").addEventListener("click", () => showView("home"));
  byId("main-tab-diagnostics").addEventListener("click", () => showView("diagnostics"));
  byId("diagnostics-back-home").addEventListener("click", () => showView("home"));
  byId("refresh-device").addEventListener("click", () => void scan());
  byId("new-profile").addEventListener("click", () => void createNewProfile());
  byId("read-device-profile").addEventListener("click", () => void readProfileFromDevice());
  byId("import-profile").addEventListener("click", () => void importShareProfile());
  byId("profile-library").addEventListener("click", profileLibrary.handleClick);
  byId("share-import-dialog-close").addEventListener("click", () => closeShareImportDialog(null));
  byId("share-import-dialog-cancel").addEventListener("click", () => closeShareImportDialog(null));
  byId("share-import-dialog-confirm").addEventListener("click", confirmShareImportDialog);
  byId("share-import-code", HTMLInputElement).addEventListener("input", () => {
    const input = byId("share-import-code", HTMLInputElement);
    const note = byId("share-import-dialog-note");
    input.removeAttribute("aria-invalid");
    note.textContent = "コードを入力して「追加」を押してください。";
    note.removeAttribute("data-kind");
  });
  byId("share-import-code", HTMLInputElement).addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      confirmShareImportDialog();
    }
  });
  byId("share-import-dialog", HTMLDialogElement).addEventListener("cancel", (event) => {
    event.preventDefault();
    closeShareImportDialog(null);
  });
  byId("back-home").addEventListener("click", () => {
    showView("home");
    void refreshProfiles().catch((error: unknown) => showError(errorMessage(error)));
  });
  byId("apply-profile").addEventListener("click", () => {
    if (busy || !editingProfileCanApply()) return;
    void saveProfileDocument("apply");
  });
  byId("save-profile").addEventListener("click", () => void openSaveDialog());
  byId("save-dialog-cancel").addEventListener("click", closeSaveDialog);
  byId("save-dialog-save").addEventListener("click", saveFromDialog);
  settingsEditor.setup();
  syncActions();
  void scan();
});

function refreshProfilesAfterFocus() {
  focusRefreshTimer = null;
  if (document.hidden) return;
  if (busy) {
    focusRefreshTimer = window.setTimeout(refreshProfilesAfterFocus, 200);
    return;
  }
  void refreshProfiles().catch((error: unknown) => showError(errorMessage(error)));
}

window.addEventListener("focus", () => {
  if (focusRefreshTimer !== null) window.clearTimeout(focusRefreshTimer);
  focusRefreshTimer = window.setTimeout(refreshProfilesAfterFocus, 200);
});

window.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});
