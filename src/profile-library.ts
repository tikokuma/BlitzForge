import { byId } from "./dom";
import type { ActiveProfileState, DeviceSession, ProfileListEntry } from "./models";

type ProfileAction = "open" | "apply" | "share" | "duplicate" | "rename" | "delete";

type ProfileLibraryOptions = {
  getEntries: () => readonly ProfileListEntry[];
  isBusy: () => boolean;
  getDeviceSession: () => DeviceSession | null;
  getActiveProfileState: () => ActiveProfileState;
  getActiveDeviceProfile: () => readonly number[] | null;
  profileMatchesDevice: (entry: ProfileListEntry) => boolean;
  onOpen: (id: number) => void;
  onApply: (id: number) => void;
  onShare: (id: number, button: HTMLButtonElement) => void;
  onDuplicate: (entry: ProfileListEntry) => void;
  onRename: (entry: ProfileListEntry) => void;
  onDelete: (entry: ProfileListEntry) => void;
};

export type ProfileLibrary = {
  render: () => void;
  handleClick: (event: Event) => void;
  syncActions: () => void;
};

function createActionButton(
  entryId: number,
  action: ProfileAction,
  label: string,
  disabled = false,
  className = "",
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.profileAction = action;
  button.dataset.profileId = String(entryId);
  button.dataset.profileDisabled = String(disabled);
  button.textContent = label;
  button.disabled = disabled;
  button.className = className;
  return button;
}

export function createProfileLibrary(options: ProfileLibraryOptions): ProfileLibrary {
  function syncActions(): void {
    const container = byId("profile-library");
    for (const button of container.querySelectorAll<HTMLButtonElement>("button[data-profile-action]")) {
      button.disabled = options.isBusy() || button.dataset.profileDisabled === "true";
    }
  }

  function isActive(entry: ProfileListEntry): boolean {
    const state = options.getActiveProfileState();
    return (state === "known" || state === "remembered") && entry.active;
  }

  function renderActiveStatus(entries: readonly ProfileListEntry[]): void {
    const status = byId("active-profile-status");
    const session = options.getDeviceSession();
    const state = options.getActiveProfileState();
    const activeProfile = options.getActiveDeviceProfile();
    if (!session) {
      status.textContent = "現在使用中: 未接続";
      return;
    }
    if (state === "unknown" || activeProfile === null) {
      status.textContent = "現在使用中: 記録なし（適用すると次回から表示）";
      return;
    }
    const activeProfiles = entries.filter(isActive);
    const qualifier = state === "remembered" ? "（前回適用）" : "";
    status.textContent = activeProfiles.length > 0
      ? `現在使用中: ${activeProfiles.map((profile) => profile.name || `Profile ${profile.id}`).join(" / ")}${qualifier}`
      : `現在使用中: ライブラリに未登録${qualifier}`;
  }

  function render(): void {
    const entries = options.getEntries();
    const container = byId("profile-library");
    container.replaceChildren();
    renderActiveStatus(entries);
    if (entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-hint";
      empty.textContent = "共有プロフィールはまだありません。Shareコードから追加するか、コントローラーから読み込んでください。";
      container.append(empty);
      syncActions();
      return;
    }

    const sorted = entries
      .map((entry) => ({
        entry,
        matchesDevice: options.profileMatchesDevice(entry),
        active: isActive(entry),
      }))
      .sort((left, right) => {
        if (left.matchesDevice !== right.matchesDevice) {
          return (right.matchesDevice ? 1 : 0) - (left.matchesDevice ? 1 : 0);
        }
        return right.entry.id - left.entry.id;
      });
    const cards = document.createDocumentFragment();
    for (const { entry, matchesDevice, active } of sorted) {
      const card = document.createElement("article");
      card.className = "profile-card";
      card.classList.toggle("profile-card-matched", matchesDevice);
      card.classList.toggle("profile-card-active", active);

      const heading = document.createElement("div");
      heading.className = "profile-card-heading";
      const title = document.createElement("h3");
      title.textContent = entry.name || `Profile ${entry.id}`;
      const states = document.createElement("div");
      states.className = "profile-card-states";
      heading.append(title, states);
      if (active) {
        const state = document.createElement("span");
        state.className = "status-pill profile-active";
        state.textContent = options.getActiveProfileState() === "remembered" ? "前回適用" : "使用中";
        states.append(state);
      }
      const details = document.createElement("p");
      details.className = "profile-card-details";
      details.textContent = [
        entry.deviceUuid ? `UUID ${entry.deviceUuid}` : "UUIDなし",
        entry.profileVersion ?? "バージョン不明",
        entry.createdAt || "日時不明",
      ].join(" · ");

      const actions = document.createElement("div");
      actions.className = "button-row profile-card-actions";
      const open = createActionButton(entry.id, "open", "開く");
      const apply = createActionButton(
        entry.id,
        "apply",
        "適用",
        !options.getDeviceSession() || !matchesDevice,
        "primary",
      );
      const share = createActionButton(entry.id, "share", "Shareコードを発行");
      const duplicate = createActionButton(entry.id, "duplicate", "複製");
      const rename = createActionButton(entry.id, "rename", "名前変更");
      const remove = createActionButton(entry.id, "delete", "削除", false, "danger-button");
      actions.append(open, apply, share, duplicate, rename, remove);
      card.append(heading, details, actions);
      cards.append(card);
    }
    container.append(cards);
    syncActions();
  }

  function handleClick(event: Event): void {
    if (options.isBusy()) return;
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>("button[data-profile-action][data-profile-id]");
    if (!button || button.disabled) return;
    const entry = options.getEntries().find(({ id }) => id === Number(button.dataset.profileId));
    if (!entry) return;

    switch (button.dataset.profileAction as ProfileAction) {
      case "open":
        options.onOpen(entry.id);
        break;
      case "apply":
        options.onApply(entry.id);
        break;
      case "share":
        options.onShare(entry.id, button);
        break;
      case "duplicate":
        options.onDuplicate(entry);
        break;
      case "rename":
        options.onRename(entry);
        break;
      case "delete":
        options.onDelete(entry);
        break;
    }
  }

  return { render, handleClick, syncActions };
}
