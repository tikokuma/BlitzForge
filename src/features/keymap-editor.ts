import { byId } from "../dom";
import {
  KEYBOARD_KEYS,
  KEYBOARD_MODIFIERS,
  KEYMAP_CONTROLLER_CHOICES,
  KEYMAP_DEFAULT_ENTRY,
  KEYMAP_SLOT_COUNT,
  KEYMAP_SLOT_LABELS,
  KEYMAP_VISIBLE_SOURCES,
  encodeKeymapChoice,
  keymapChoiceForEntry,
  keymapChoiceKey,
  keymapDisplay,
  normalizeKeymapEntry,
} from "../domain/keymap";
import type { ControllerSettingsInput, KeymapChoice, RapidFireSettings } from "../models";

type KeymapEditorHost = {
  markDirty: () => void;
};

export type KeymapEditor = {
  readSettings: () => Pick<ControllerSettingsInput, "keyBindings" | "rapidFire">;
  render: (keyBindings: readonly string[], rapidFire: RapidFireSettings) => void;
  setup: () => void;
};

export function createKeymapEditor(host: KeymapEditorHost): KeymapEditor {
  let rapidFireDraft: RapidFireSettings = {
    keys: Array.from({ length: KEYMAP_SLOT_COUNT }, () => null),
    speedIndex: null,
  };
  let keymapDraft: string[] = Array.from({ length: KEYMAP_SLOT_COUNT }, () => KEYMAP_DEFAULT_ENTRY);
  let activeSlot: number | null = null;
  let pendingChoice: KeymapChoice | null = null;

  function rapidFireForSlot(slot: number): boolean | null {
    return rapidFireDraft.keys[slot] ?? null;
  }

  function renderRapidFireControls(): void {
    const speed = byId<HTMLSelectElement>("rapid-speed");
    speed.querySelector("option[data-generated]")?.remove();
    const speedIndex = rapidFireDraft.speedIndex;
    if (speedIndex !== null && ![0, 1, 2].includes(speedIndex)) {
      const option = document.createElement("option");
      option.dataset.generated = "true";
      option.value = String(speedIndex);
      option.textContent = "現在の設定";
      speed.append(option);
    }
    speed.value = speedIndex === null ? "unknown" : String(speedIndex);
    byId("rapid-timing").textContent = speedIndex === null
      ? "不明"
      : rapidFireDraft.timing
        ? `${rapidFireDraft.timing.hz}回/秒`
        : "現在の設定";
  }

  function toggleRapidFire(slot: number): void {
    const state = rapidFireForSlot(slot);
    if (state === null) return;
    rapidFireDraft.keys[slot] = !state;
    renderRows();
    renderRapidFireControls();
    host.markDirty();
  }

  function resetSlot(slot: number): void {
    if (keymapDraft[slot] === KEYMAP_DEFAULT_ENTRY) return;
    keymapDraft[slot] = KEYMAP_DEFAULT_ENTRY;
    renderRows();
    renderSummary();
    host.markDirty();
  }

  function renderRows(): void {
    byId("keymap-grid").replaceChildren(
      ...KEYMAP_VISIBLE_SOURCES.map(({ slot, label }) => {
        const row = document.createElement("div");
        row.className = "keymap-row";

        const sourceCell = document.createElement("div");
        sourceCell.className = "keymap-source-cell";
        const source = document.createElement("span");
        source.className = "keymap-source";
        source.textContent = label;
        const sourceHint = document.createElement("small");
        sourceHint.className = "keymap-hint";
        sourceHint.textContent = `スロット ${String(slot + 1).padStart(2, "0")}`;
        sourceCell.append(source, sourceHint);

        const mapping = keymapDisplay(keymapDraft[slot] ?? KEYMAP_DEFAULT_ENTRY, slot);
        const mappingButton = document.createElement("button");
        mappingButton.className = "keymap-mapping";
        if (mapping.choice && mapping.choice.kind !== "identity") {
          mappingButton.classList.add("keymap-mapping-configured");
        }
        mappingButton.type = "button";
        mappingButton.textContent = mapping.label;
        mappingButton.dataset.keymapSlot = String(slot);
        mappingButton.setAttribute("aria-label", `${label} のマッピング: ${mapping.label}`);
        mappingButton.addEventListener("click", () => openDialog(slot));

        const mappingCell = document.createElement("div");
        mappingCell.className = "keymap-mapping-cell";
        mappingCell.append(mappingButton);
        const mappingHint = document.createElement("small");
        mappingHint.className = "keymap-hint keymap-mapping-hint";
        mappingHint.textContent = mapping.detail;
        mappingCell.append(mappingHint);
        if (keymapDraft[slot] !== KEYMAP_DEFAULT_ENTRY) {
          const resetButton = document.createElement("button");
          resetButton.type = "button";
          resetButton.className = "keymap-reset";
          resetButton.textContent = "デフォルトに戻す";
          resetButton.setAttribute("aria-label", `${label} のバインドをデフォルトに戻す`);
          resetButton.addEventListener("click", () => resetSlot(slot));
          mappingCell.append(resetButton);
        }

        const rapidState = rapidFireForSlot(slot);
        const rapid = document.createElement(rapidState === null ? "span" : "button");
        rapid.className = rapidState === null ? "keymap-rapid" : "keymap-rapid keymap-rapid-toggle";
        if (rapid instanceof HTMLButtonElement) {
          rapid.type = "button";
          rapid.setAttribute("aria-pressed", String(rapidState === true));
          rapid.addEventListener("click", () => toggleRapidFire(slot));
          rapid.title = "連射を切り替えます";
        } else {
          rapid.title = "この連射状態は判定できません";
        }
        const rapidDot = document.createElement("span");
        rapidDot.className = "keymap-rapid-dot";
        if (rapidState === true) rapidDot.classList.add("enabled");
        if (rapidState === null) rapidDot.classList.add("unknown");
        rapid.append("連射", rapidDot);

        row.append(sourceCell, mappingCell, rapid);
        return row;
      }),
    );
  }

  function renderSummary(): void {
    const configured = keymapDraft.filter((entry) => entry !== KEYMAP_DEFAULT_ENTRY).length;
    byId("keymap-summary").textContent = configured === 0 ? "標準マッピング" : `${configured}スロット変更済み`;
  }

  function updateDialogSelection(): void {
    const selected = keymapChoiceKey(pendingChoice);
    byId<HTMLDialogElement>("keymap-dialog")
      .querySelectorAll<HTMLButtonElement>("[data-keymap-choice]")
      .forEach((button) => {
        button.classList.toggle("selected", button.dataset.keymapChoice === selected);
      });
    byId<HTMLButtonElement>("keymap-dialog-confirm").disabled = pendingChoice === null;
  }

  function renderChoiceButtons(): void {
    byId("keymap-controller-grid").replaceChildren(
      ...KEYMAP_CONTROLLER_CHOICES.map((choice) => {
        const button = document.createElement("button");
        button.className = `key-choice${choice.kind === "none" ? " key-choice-null" : ""}`;
        button.type = "button";
        button.textContent = choice.label;
        button.dataset.keymapChoice = keymapChoiceKey(choice);
        button.addEventListener("click", () => {
          pendingChoice = choice;
          updateDialogSelection();
        });
        return button;
      }),
    );

    const modifierSelect = byId<HTMLSelectElement>("keymap-keyboard-modifier");
    modifierSelect.replaceChildren(
      ...KEYBOARD_MODIFIERS.map(([label, value]) => {
        const option = document.createElement("option");
        option.value = String(value);
        option.textContent = label === "None" ? "なし" : label;
        return option;
      }),
    );
    const secondSelect = byId<HTMLSelectElement>("keymap-keyboard-second");
    const noneOption = document.createElement("option");
    noneOption.value = "0";
    noneOption.textContent = "None";
    secondSelect.replaceChildren(
      noneOption,
      ...KEYBOARD_KEYS.map(([label, usage]) => {
        const option = document.createElement("option");
        option.value = String(usage);
        option.textContent = label;
        return option;
      }),
    );
    if (pendingChoice?.kind === "keyboard") {
      modifierSelect.value = String(pendingChoice.modifier);
      secondSelect.value = String(pendingChoice.secondUsage);
    } else {
      modifierSelect.value = "0";
      secondSelect.value = "0";
    }

    const keyboardChoiceWithControls = (usage: number, label: string): KeymapChoice => {
      const modifier = Number(modifierSelect.value);
      const secondUsage = Number(secondSelect.value);
      const modifierName = KEYBOARD_MODIFIERS.find(([, value]) => value === modifier)?.[0];
      const secondLabel = KEYBOARD_KEYS.find(([, candidate]) => candidate === secondUsage)?.[0];
      return {
        kind: "keyboard",
        modifier,
        usage,
        secondUsage,
        label: `${modifierName && modifierName !== "None" ? `${modifierName} + ` : ""}${label}${secondLabel ? ` + ${secondLabel}` : ""}`,
      };
    };
    const updateKeyboardChoice = () => {
      const currentChoice = pendingChoice;
      if (currentChoice?.kind !== "keyboard") return;
      const key = KEYBOARD_KEYS.find(([, usage]) => usage === currentChoice.usage) ?? KEYBOARD_KEYS[0];
      pendingChoice = keyboardChoiceWithControls(key[1], key[0]);
      updateDialogSelection();
    };
    modifierSelect.onchange = updateKeyboardChoice;
    secondSelect.onchange = updateKeyboardChoice;

    byId("keymap-keyboard-grid").replaceChildren(
      ...KEYBOARD_KEYS.map(([label, usage]) => {
        const button = document.createElement("button");
        button.className = "key-choice";
        button.type = "button";
        button.textContent = label;
        button.dataset.keymapChoice = `keyboard:${usage}`;
        button.addEventListener("click", () => {
          pendingChoice = keyboardChoiceWithControls(usage, label);
          updateDialogSelection();
        });
        return button;
      }),
    );
  }

  function setDialogMode(mode: "controller" | "keyboard"): void {
    const controller = mode === "controller";
    byId("keymap-controller-panel").hidden = !controller;
    byId("keymap-keyboard-panel").hidden = controller;
    byId("keymap-controller-tab").classList.toggle("active", controller);
    byId("keymap-keyboard-tab").classList.toggle("active", !controller);
    byId("keymap-controller-tab").setAttribute("aria-selected", String(controller));
    byId("keymap-keyboard-tab").setAttribute("aria-selected", String(!controller));
    updateDialogSelection();
  }

  function openDialog(slot: number): void {
    activeSlot = slot;
    pendingChoice = keymapChoiceForEntry(keymapDraft[slot] ?? KEYMAP_DEFAULT_ENTRY, slot);
    const source = KEYMAP_SLOT_LABELS[slot] ?? `slot ${slot + 1}`;
    byId("keymap-dialog-subtitle").textContent = `${source} のマッピングを選択してください。`;
    renderChoiceButtons();
    setDialogMode(pendingChoice?.kind === "keyboard" ? "keyboard" : "controller");
    byId<HTMLDialogElement>("keymap-dialog").showModal();
  }

  function resetDialog(): void {
    activeSlot = null;
    pendingChoice = null;
  }

  function closeDialog(): void {
    const dialog = byId<HTMLDialogElement>("keymap-dialog");
    if (dialog.open) dialog.close();
    resetDialog();
  }

  function confirmDialog(): void {
    if (activeSlot === null || pendingChoice === null) return;
    keymapDraft[activeSlot] = encodeKeymapChoice(pendingChoice);
    renderRows();
    renderSummary();
    closeDialog();
    host.markDirty();
  }

  function render(keyBindings: readonly string[], rapidFire: RapidFireSettings): void {
    rapidFireDraft = {
      ...rapidFire,
      keys: Array.from({ length: KEYMAP_SLOT_COUNT }, (_, index) => rapidFire.keys[index] ?? null),
    };
    keymapDraft = Array.from(
      { length: KEYMAP_SLOT_COUNT },
      (_, index) => normalizeKeymapEntry(keyBindings[index] ?? KEYMAP_DEFAULT_ENTRY),
    );
    renderRows();
    renderSummary();
    renderRapidFireControls();
  }

  function readSettings(): Pick<ControllerSettingsInput, "keyBindings" | "rapidFire"> {
    return {
      rapidFire: {
        keys: [...rapidFireDraft.keys],
        speedIndex: rapidFireDraft.speedIndex,
      },
      keyBindings: [...keymapDraft],
    };
  }

  function setup(): void {
    byId<HTMLSelectElement>("rapid-speed").addEventListener("change", (event) => {
      const value = (event.target as HTMLSelectElement).value;
      rapidFireDraft.speedIndex = value === "unknown" ? null : Number(value);
      renderRapidFireControls();
      host.markDirty();
    });
    byId("keymap-controller-tab").addEventListener("click", () => setDialogMode("controller"));
    byId("keymap-keyboard-tab").addEventListener("click", () => setDialogMode("keyboard"));
    byId("keymap-dialog-close").addEventListener("click", closeDialog);
    byId("keymap-dialog-cancel").addEventListener("click", closeDialog);
    byId("keymap-dialog-confirm").addEventListener("click", confirmDialog);
    byId<HTMLDialogElement>("keymap-dialog").addEventListener("cancel", resetDialog);
  }

  return { readSettings, render, setup };
}
