import { invoke } from "@tauri-apps/api/core";

type DeviceSummary = {
  vendorProduct: string;
  usage: string;
  product: string;
  path: string;
};

type ProfileSummary = {
  device: DeviceSummary;
  length: number;
  storedCrc: string;
  computedCrc: string;
  protocolVersion: string;
  head: string;
  leftVibration: number;
  rightVibration: number;
};

type VibrationWriteResult = {
  left: number;
  right: number;
  crc: string;
  ack: string;
  ackValue: number;
};

const byId = <T extends HTMLElement>(id: string) =>
  document.querySelector<T>(`#${id}`)!;

function setBusy(busy: boolean, message: string) {
  document.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    button.disabled = busy;
  });
  byId("message").textContent = message;
}

function showDetails(target: HTMLElement, rows: [string, string][]) {
  target.replaceChildren(
    ...rows.flatMap(([label, value]) => {
      const term = document.createElement("dt");
      const detail = document.createElement("dd");
      term.textContent = label;
      detail.textContent = value;
      return [term, detail];
    }),
  );
}

function setVibrationControls(left: number, right: number) {
  const leftInput = byId<HTMLInputElement>("vibration-left");
  const rightInput = byId<HTMLInputElement>("vibration-right");
  leftInput.value = String(left);
  rightInput.value = String(right);
  byId("vibration-left-value").textContent = String(left);
  byId("vibration-right-value").textContent = String(right);
  byId("vibration-editor").hidden = false;
}

async function scan() {
  setBusy(true, "コントローラーを検索しています…");
  try {
    const device = await invoke<DeviceSummary | null>("scan_device");
    const connection = byId("connection");
    if (!device) {
      connection.textContent = "未接続";
      connection.className = "badge offline";
      byId("device-name").textContent = "BIGBIG WON設定インターフェースが見つかりません";
      byId("device-details").replaceChildren();
      byId("vibration-editor").hidden = true;
      byId("message").textContent = "コントローラーを接続して再検索してください。";
      return;
    }

    connection.textContent = "接続済み";
    connection.className = "badge online";
    byId("device-name").textContent = device.product;
    showDetails(byId("device-details"), [
      ["Device", device.vendorProduct],
      ["Usage", device.usage],
      ["Path", device.path],
    ]);
    byId("message").textContent = "読み取り可能です。";
  } catch (error) {
    byId("message").textContent = String(error);
  } finally {
    setBusy(false, byId("message").textContent ?? "");
  }
}

async function readProfile() {
  setBusy(true, "プロファイルを読み取っています…");
  try {
    const profile = await invoke<ProfileSummary>("read_profile");
    showDetails(byId("profile-details"), [
      ["Protocol", `v${profile.protocolVersion}`],
      ["Length", `${profile.length} bytes`],
      ["Stored CRC", profile.storedCrc],
      ["Computed CRC", profile.computedCrc],
    ]);
    const head = byId<HTMLPreElement>("profile-head");
    head.textContent = profile.head;
    head.hidden = false;
    setVibrationControls(profile.leftVibration, profile.rightVibration);
    byId("message").textContent = profile.storedCrc === profile.computedCrc
      ? "CRC検証に成功しました。"
      : "CRCが一致しません。書き込みは行わないでください。";
  } catch (error) {
    byId("message").textContent = String(error);
  } finally {
    setBusy(false, byId("message").textContent ?? "");
  }
}

async function saveVibration() {
  const left = Number(byId<HTMLInputElement>("vibration-left").value);
  const right = Number(byId<HTMLInputElement>("vibration-right").value);
  if (!confirm(`左振動 ${left} / 右振動 ${right} をコントローラーへ保存します。`)) {
    return;
  }
  setBusy(true, "振動設定を保存しています…");
  try {
    const result = await invoke<VibrationWriteResult>("set_vibration", { left, right });
    byId("message").textContent =
      `保存成功: 左 ${result.left} / 右 ${result.right} / CRC ${result.crc} / ACK ${result.ack}`;
  } catch (error) {
    byId("message").textContent = String(error);
  } finally {
    setBusy(false, byId("message").textContent ?? "");
  }
}

window.addEventListener("DOMContentLoaded", () => {
  byId("scan").addEventListener("click", scan);
  byId("read").addEventListener("click", readProfile);
  byId("save-vibration").addEventListener("click", saveVibration);
  for (const side of ["left", "right"] as const) {
    byId<HTMLInputElement>(`vibration-${side}`).addEventListener("input", (event) => {
      byId(`vibration-${side}-value`).textContent = (event.target as HTMLInputElement).value;
    });
  }
  scan();
});
