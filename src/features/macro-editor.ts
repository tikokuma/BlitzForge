import { backend } from "../backend";
import { byId, errorMessage } from "../dom";
import {
  MACRO_INPUT_OPTIONS,
  MACRO_MAX_STEPS,
  appendMacroStep,
  isMacroRecord,
  macroInputLabels,
  macroInputOptionActive,
  macroRunKeyLabel,
  macroStepCount,
  readMacroHeader,
  readMacroStep,
  removeMacroStep,
  toggleMacroInput,
  updateMacroHeader,
  updateMacroStep,
} from "../domain/macro";
import type {
  MacroCommitInput,
  MacroSlotSummary,
  MacroStep,
  MacroSummary,
  MacroWriteResult,
} from "../models";

type MacroEditorHost = {
  getDevicePath: () => string | null;
  isBusy: () => boolean;
  setBusy: (busy: boolean) => void;
  showError: (message: string) => void;
  syncHostActions: () => void;
};

export type MacroEditor = {
  setup: () => void;
  syncActions: () => void;
  isDirty: () => boolean;
  readDraft: () => MacroCommitInput | null;
  markSaved: (result: MacroWriteResult) => void;
  reset: () => void;
};

export function createMacroEditor(host: MacroEditorHost): MacroEditor {
  let summary: MacroSummary | null = null;
  let draftRecord: number[] | null = null;
  let originalRecord: number[] | null = null;
  let selectedSlot = 0;

  function recordsEqual(left: number[], right: number[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  function headerControlsDiffer(record: readonly number[]): boolean {
    const mKey = Number(byId<HTMLSelectElement>("macro-m-key-select").value);
    const runKey = Number(byId<HTMLSelectElement>("macro-run-key-select").value);
    const repeat = Number(byId<HTMLInputElement>("macro-repeat").value);
    if (!Number.isInteger(mKey) || mKey < 0 || mKey > 0xff
      || !Number.isInteger(runKey) || runKey < 0 || runKey > 0xff
      || !Number.isInteger(repeat) || repeat < 0 || repeat > 0xffff) {
      return true;
    }
    const flags = (byId<HTMLInputElement>("macro-run-after-release").checked ? 1 : 0)
      | (byId<HTMLInputElement>("macro-loop").checked ? 2 : 0);
    return record[5] !== mKey
      || record[6] !== runKey
      || (((record[7] ?? 0) & 0x03) !== flags)
      || record[8] !== (repeat >> 8)
      || record[9] !== (repeat & 0xff);
  }

  function isDirty(): boolean {
    if (draftRecord === null || originalRecord === null) return false;
    return !recordsEqual(draftRecord, originalRecord) || headerControlsDiffer(draftRecord);
  }

  function confirmDiscardChanges(message: string): boolean {
    return !isDirty() || window.confirm(`${message}\n編集中の変更を破棄しますか？`);
  }

  function reset(): void {
    summary = null;
    draftRecord = null;
    originalRecord = null;
    selectedSlot = 0;
    byId("macro-slots").replaceChildren();
    byId("macro-step-list").replaceChildren();
    byId("macro-slot-details").textContent = "コントローラーからマクロを読み込んでください。";
    byId("macro-output").textContent = "";
    host.syncHostActions();
  }

  function syncActions(): void {
    const busy = host.isBusy();
    byId<HTMLButtonElement>("add-macro-step").disabled = busy
      || draftRecord === null
      || macroStepCount(draftRecord) >= MACRO_MAX_STEPS;
  }

  function setSelectValue(id: string, value: number): void {
    const select = byId<HTMLSelectElement>(id);
    select.querySelector("option[data-generated]")?.remove();
    const textValue = String(value);
    if (!Array.from(select.options).some((option) => option.value === textValue)) {
      const option = document.createElement("option");
      option.dataset.generated = "true";
      option.value = textValue;
      option.textContent = "現在の設定";
      select.append(option);
    }
    select.value = textValue;
  }

  function renderHeader(record: readonly number[]): void {
    const header = readMacroHeader(record);
    byId<HTMLInputElement>("macro-repeat").value = String(header.repeat);
    setSelectValue("macro-m-key-select", header.mKey);
    setSelectValue("macro-run-key-select", header.runKey);
    byId<HTMLInputElement>("macro-run-after-release").checked = header.runAfterRelease;
    byId<HTMLInputElement>("macro-loop").checked = header.loop;
  }

  function readInteger(id: string, maximum: number): number {
    const value = Number(byId<HTMLInputElement>(id).value);
    if (!Number.isInteger(value) || value < 0 || value > maximum) {
      throw new Error(`${id} は0〜${maximum}の整数で入力してください`);
    }
    return value;
  }

  function updateHeaderFromControls(record: readonly number[]): number[] {
    const mKey = Number(byId<HTMLSelectElement>("macro-m-key-select").value);
    const runKey = Number(byId<HTMLSelectElement>("macro-run-key-select").value);
    if (!Number.isInteger(mKey) || !Number.isInteger(runKey)) {
      throw new Error("マクロの呼び出しキーを選択してください");
    }
    return updateMacroHeader(record, {
      mKey,
      runKey,
      repeat: readInteger("macro-repeat", 0xffff),
      runAfterRelease: byId<HTMLInputElement>("macro-run-after-release").checked,
      loop: byId<HTMLInputElement>("macro-loop").checked,
    });
  }

  function slotDescription(slot: MacroSlotSummary): string {
    const state = slot.error ? "読み取り失敗" : slot.stepCount === 0 ? "空" : `${slot.stepCount}操作`;
    return `スロット ${slot.slot + 1} · ${state} · 呼び出し ${macroRunKeyLabel(slot.runKey)}`;
  }

  function commitStep(index: number, changes: Partial<MacroStep>): void {
    if (!draftRecord) return;
    draftRecord = updateMacroStep(draftRecord, index, changes);
    renderSteps(draftRecord);
    host.syncHostActions();
  }

  function renderSteps(record: readonly number[] | null): void {
    const container = byId("macro-step-list");
    container.replaceChildren();
    if (!record || !isMacroRecord(record)) {
      const empty = document.createElement("p");
      empty.className = "empty-hint";
      empty.textContent = "先にコントローラーからマクロを読み込んでください。";
      container.append(empty);
      return;
    }

    const count = macroStepCount(record);
    if (count === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-hint";
      empty.textContent = "この枠は空です。「操作を追加」から作成できます。";
      container.append(empty);
      return;
    }

    for (let index = 0; index < count; index += 1) {
      const step = readMacroStep(record, index);
      const card = document.createElement("article");
      card.className = "macro-step-card";

      const heading = document.createElement("div");
      heading.className = "macro-step-heading";
      const title = document.createElement("strong");
      title.textContent = `操作 ${index + 1}`;
      const stepSummary = document.createElement("span");
      const labels = macroInputLabels(step.inputMask);
      stepSummary.textContent = `${step.durationMs} ms · ${labels.length > 0 ? labels.join(" + ") : "入力なし"}`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger-button";
      remove.textContent = "削除";
      remove.disabled = host.isBusy();
      remove.addEventListener("click", () => {
        if (!draftRecord) return;
        draftRecord = removeMacroStep(draftRecord, index);
        renderSteps(draftRecord);
        host.syncHostActions();
      });
      heading.append(title, stepSummary, remove);
      card.append(heading);

      const basic = document.createElement("div");
      basic.className = "macro-step-basic";
      const durationLabel = document.createElement("label");
      durationLabel.textContent = "時間 (ms)";
      const duration = document.createElement("input");
      duration.type = "number";
      duration.min = "0";
      duration.max = "32760";
      duration.step = "8";
      duration.value = String(step.durationMs);
      duration.addEventListener("change", () => {
        const value = Number(duration.value);
        if (Number.isFinite(value)) {
          commitStep(index, { durationMs: Math.max(0, Math.min(32760, value)) });
        }
      });
      durationLabel.append(duration);
      const markerLabel = document.createElement("label");
      markerLabel.className = "macro-check";
      const marker = document.createElement("input");
      marker.type = "checkbox";
      marker.checked = step.marker;
      marker.addEventListener("change", () => commitStep(index, { marker: marker.checked }));
      markerLabel.append(marker, document.createTextNode("前の入力状態を引き継ぐ"));
      basic.append(durationLabel, markerLabel);
      card.append(basic);

      const inputTitle = document.createElement("p");
      inputTitle.className = "macro-subheading";
      inputTitle.textContent = "コントローラー入力（複数選択可）";
      card.append(inputTitle);
      const keyGrid = document.createElement("div");
      keyGrid.className = "macro-key-grid";
      for (const [label, mask] of MACRO_INPUT_OPTIONS) {
        const key = document.createElement("button");
        key.type = "button";
        key.className = "macro-key-toggle";
        const active = macroInputOptionActive(step.inputMask, mask);
        key.classList.toggle("active", active);
        key.setAttribute("aria-pressed", String(active));
        key.textContent = label;
        key.addEventListener("click", () => {
          const current = readMacroStep(draftRecord ?? record, index);
          commitStep(index, { inputMask: toggleMacroInput(current.inputMask, mask) });
        });
        keyGrid.append(key);
      }
      card.append(keyGrid);

      const analogTitle = document.createElement("p");
      analogTitle.className = "macro-subheading";
      analogTitle.textContent = "スティック（-128〜127）";
      card.append(analogTitle);
      const analogGrid = document.createElement("div");
      analogGrid.className = "macro-analog-grid";
      ["左 X", "左 Y", "右 X", "右 Y"].forEach((label, analogIndex) => {
        const field = document.createElement("label");
        field.textContent = label;
        const input = document.createElement("input");
        input.type = "number";
        input.min = "-128";
        input.max = "127";
        input.value = String(step.analog[analogIndex]);
        input.addEventListener("change", () => {
          const value = Number(input.value);
          if (!Number.isFinite(value)) return;
          const analog = [...readMacroStep(draftRecord ?? record, index).analog] as MacroStep["analog"];
          analog[analogIndex] = Math.max(-128, Math.min(127, Math.round(value)));
          commitStep(index, { analog });
        });
        field.append(input);
        analogGrid.append(field);
      });
      card.append(analogGrid);
      container.append(card);
    }
  }

  function addStep(): void {
    if (!draftRecord) return;
    if (macroStepCount(draftRecord) >= MACRO_MAX_STEPS) {
      host.showError("マクロは最大64操作です。");
      return;
    }
    draftRecord = appendMacroStep(draftRecord);
    renderSteps(draftRecord);
    host.syncHostActions();
  }

  function selectSlot(slot: number, confirmDiscard = true): void {
    const selected = summary?.slots.find((entry) => entry.slot === slot);
    if (!selected) return;
    if (slot !== selectedSlot && confirmDiscard && !confirmDiscardChanges(
      "スロットを切り替えると、編集中のマクロ変更が失われます。",
    )) {
      byId<HTMLSelectElement>("macro-slot").value = String(selectedSlot);
      return;
    }
    selectedSlot = slot;
    byId<HTMLSelectElement>("macro-slot").value = String(slot);
    byId("macro-editor-title").textContent = `スロット ${slot + 1} の編集`;
    const validRecord = isMacroRecord(selected.rawRecord);
    originalRecord = validRecord ? selected.rawRecord.slice() : null;
    draftRecord = validRecord ? selected.rawRecord.slice() : null;
    if (draftRecord) renderHeader(draftRecord);
    renderSteps(draftRecord);

    let details = `${slotDescription(selected)}。ここで編集できます。`;
    if (selected.error) {
      details = `${slotDescription(selected)}: ${selected.error}`;
    } else if (!validRecord) {
      details = `${slotDescription(selected)}: マクロレコードの形式が不正です。`;
    }
    byId("macro-slot-details").textContent = details;
    host.syncHostActions();
  }

  function readDraft(): MacroCommitInput | null {
    if (draftRecord === null || originalRecord === null) return null;
    draftRecord = updateHeaderFromControls(draftRecord);
    return {
      slot: selectedSlot,
      rawRecord: draftRecord.slice(),
      originalRecord: originalRecord.slice(),
    };
  }

  function renderSummary(nextSummary: MacroSummary, confirmDiscard = true): void {
    summary = nextSummary;
    const currentSlot = Number(byId<HTMLSelectElement>("macro-slot").value);
    byId("macro-slots").replaceChildren(
      ...nextSummary.slots.map((slot) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "macro-slot-card";
        button.textContent = slotDescription(slot);
        button.classList.toggle("selected", slot.slot === currentSlot);
        button.addEventListener("click", () => selectSlot(slot.slot));
        return button;
      }),
    );
    selectSlot(nextSummary.slots.some((slot) => slot.slot === currentSlot) ? currentSlot : 0, confirmDiscard);
    byId("macro-output").textContent = "読み込み完了。編集するスロットを選択してください。";
  }

  async function refresh(): Promise<void> {
    const path = host.getDevicePath();
    if (!path) return;
    if (!confirmDiscardChanges("再読み込みすると、編集中のマクロ変更が失われます。")) return;
    host.setBusy(true);
    try {
      renderSummary(await backend.readMacros(path), false);
    } catch (error) {
      const message = errorMessage(error);
      byId("macro-output").textContent = message;
      host.showError(message);
    } finally {
      host.setBusy(false);
    }
  }

  function markSaved(result: MacroWriteResult): void {
    const savedRecord = result.slot.rawRecord.slice();
    originalRecord = savedRecord.slice();
    draftRecord = savedRecord.slice();
    if (summary) {
      summary = {
        ...summary,
        slots: summary.slots.map((item) => item.slot === selectedSlot ? result.slot : item),
      };
      renderSummary(summary);
    } else {
      renderHeader(savedRecord);
      renderSteps(savedRecord);
    }
    byId("macro-slot-details").textContent = `${slotDescription(result.slot)}。保存しました。`;
    byId("macro-output").textContent = `${slotDescription(result.slot)}を保存しました。`;
    host.syncHostActions();
  }

  function syncHeaderFromControls(): void {
    if (!draftRecord) return;
    try {
      draftRecord = updateHeaderFromControls(draftRecord);
      renderHeader(draftRecord);
      const slot = Number(byId<HTMLSelectElement>("macro-slot").value) + 1;
      byId("macro-slot-details").textContent = `スロット ${slot}を編集中です。`;
      host.syncHostActions();
    } catch (error) {
      host.showError(errorMessage(error));
    }
  }

  function setup(): void {
    byId("refresh-macros").addEventListener("click", () => void refresh());
    byId<HTMLSelectElement>("macro-slot").addEventListener("change", (event) => {
      selectSlot(Number((event.target as HTMLSelectElement).value));
    });
    byId("add-macro-step").addEventListener("click", addStep);
    for (const id of [
      "macro-run-key-select",
      "macro-m-key-select",
      "macro-repeat",
      "macro-run-after-release",
      "macro-loop",
    ] as const) {
      byId(id).addEventListener("change", syncHeaderFromControls);
    }
  }

  return { setup, syncActions, isDirty, readDraft, markSaved, reset };
}
