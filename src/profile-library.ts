import { byId } from "./dom";
import type { ActiveProfileState, DeviceSession, ProfileListEntry } from "./models";

type ProfileAction = "apply" | "share" | "duplicate" | "delete";

type ProfileLibraryOptions = {
  getEntries: () => readonly ProfileListEntry[];
  isBusy: () => boolean;
  getDeviceSession: () => DeviceSession | null;
  getActiveProfileState: () => ActiveProfileState;
  getActiveDeviceProfile: () => readonly number[] | null;
  profileTargetsDevice: (entry: ProfileListEntry) => boolean;
  onOpen: (id: number) => void;
  onApply: (id: number) => void;
  onShare: (id: number, button: HTMLButtonElement) => void;
  onDuplicate: (entry: ProfileListEntry) => void;
  onRename: (entry: ProfileListEntry, name: string, input: HTMLInputElement) => void;
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
    const busy = options.isBusy();
    for (const button of container.querySelectorAll<HTMLButtonElement>("button[data-profile-action]")) {
      button.disabled = busy || button.dataset.profileDisabled === "true";
    }
    for (const input of container.querySelectorAll<HTMLInputElement>("input[data-profile-name]")) {
      input.disabled = busy;
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
        matchesDevice: options.profileTargetsDevice(entry),
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
      card.dataset.profileId = String(entry.id);
      card.title = "クリックで開く";
      card.classList.toggle("profile-card-matched", matchesDevice);
      card.classList.toggle("profile-card-active", active);

      const heading = document.createElement("div");
      heading.className = "profile-card-heading";
      const title = document.createElement("input");
      title.type = "text";
      title.className = "profile-card-name";
      title.dataset.profileName = String(entry.id);
      title.value = entry.name || `Profile ${entry.id}`;
      title.setAttribute("aria-label", "プロファイル名");
      const defaultName = title.value;
      title.addEventListener("change", () => {
        const name = title.value.trim();
        if (name.length === 0 || name === defaultName) {
          title.value = defaultName;
          return;
        }
        title.value = name;
        options.onRename(entry, name, title);
      });
      title.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          title.blur();
        } else if (event.key === "Escape") {
          event.preventDefault();
          title.value = defaultName;
          title.blur();
        }
      });
      const states = document.createElement("div");
      states.className = "profile-card-states";
      if (active) {
        const state = document.createElement("span");
        state.className = "status-pill profile-active";
        state.textContent = options.getActiveProfileState() === "remembered" ? "前回適用" : "使用中";
        states.append(state);
      }
      const createdAt = document.createElement("time");
      createdAt.className = "profile-card-created-at";
      createdAt.textContent = (entry.createdAt || "日時不明").replace(/:\d{2}$/, "");

      const menu = document.createElement("details");
      menu.className = "profile-card-menu";
      const menuToggle = document.createElement("summary");
      menuToggle.className = "profile-card-menu-toggle";
      menuToggle.textContent = "⋯";
      menuToggle.setAttribute("aria-label", "その他の操作");
      const menuItems = document.createElement("div");
      menuItems.className = "profile-card-menu-items";
      const share = createActionButton(entry.id, "share", "共有", false, "profile-card-menu-action");
      const duplicate = createActionButton(entry.id, "duplicate", "複製", false, "profile-card-menu-action");
      const remove = createActionButton(
        entry.id,
        "delete",
        "削除",
        false,
        "profile-card-menu-action danger-button",
      );
      menuItems.append(share, duplicate, remove);
      menu.append(menuToggle, menuItems);
      heading.append(title, states, menu);

      const actions = document.createElement("div");
      actions.className = "button-row profile-card-actions";
      const apply = createActionButton(
        entry.id,
        "apply",
        "適用",
        !options.getDeviceSession() || !matchesDevice,
        "primary",
      );
      actions.append(apply);
      card.append(heading, createdAt, actions);
      cards.append(card);
    }
    container.append(cards);
    syncActions();
  }

  function handleClick(event: Event): void {
    if (options.isBusy()) return;
    if (!(event.target instanceof Element)) return;
    const clickedMenu = event.target.closest(".profile-card-menu");
    const button = event.target.closest<HTMLButtonElement>("button[data-profile-action][data-profile-id]");
    if (!button && !clickedMenu) {
      const openMenus = byId("profile-library").querySelectorAll<HTMLDetailsElement>("details.profile-card-menu[open]");
      if (openMenus.length > 0) {
        for (const menu of openMenus) menu.removeAttribute("open");
        return;
      }
    }
    if (button) {
      if (button.disabled) return;
      const entry = options.getEntries().find(({ id }) => id === Number(button.dataset.profileId));
      if (!entry) return;
      button.closest("details")?.removeAttribute("open");

      switch (button.dataset.profileAction as ProfileAction) {
        case "apply":
          options.onApply(entry.id);
          break;
        case "share":
          options.onShare(entry.id, button);
          break;
        case "duplicate":
          options.onDuplicate(entry);
          break;
        case "delete":
          options.onDelete(entry);
          break;
      }
      return;
    }

    if (clickedMenu || event.target.closest("input")) return;
    const card = event.target.closest<HTMLElement>(".profile-card[data-profile-id]");
    if (!card) return;
    const entry = options.getEntries().find(({ id }) => id === Number(card.dataset.profileId));
    if (entry) options.onOpen(entry.id);
  }

  return { render, handleClick, syncActions };
}
