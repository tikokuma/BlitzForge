import { byId } from "../dom";
import {
  simulateStickInput,
  type DiagnosticSample,
  type StickPoint,
} from "../domain/input-diagnostics";
import type { CurveSettings, PollingMeasurement } from "../models";

type DiagnosticTab = "viewer" | "polling";

type InputDiagnosticsOptions = {
  getDeviceIdentifiers: () => readonly string[];
  getStickSettings: () => {
    leftStick: { curve: CurveSettings; circularAlgorithm: boolean };
    rightStick: { curve: CurveSettings; circularAlgorithm: boolean };
  };
  measurePollingRate: () => Promise<PollingMeasurement>;
};

const TAB_IDS: Record<DiagnosticTab, string> = {
  viewer: "diagnostics-tab-viewer",
  polling: "diagnostics-tab-polling",
};
const SECTION_IDS: Record<DiagnosticTab, string> = {
  viewer: "diagnostics-viewer-section",
  polling: "diagnostics-polling-section",
};
const BUTTON_LABELS = [
  "A", "B", "X", "Y", "LB", "RB", "LT", "RT", "View", "Menu", "LS", "RS",
  "D-pad ↑", "D-pad ↓", "D-pad ←", "D-pad →", "Home", "Extra",
];

const formatNumber = (value: number, digits = 2): string => Number.isFinite(value) ? value.toFixed(digits) : "—";
const formatHz = (value: number): string => value > 0 ? `${formatNumber(value, 1)} Hz` : "—";
const formatMs = (value: number): string => value > 0 ? `${formatNumber(value, 2)} ms` : "—";
const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));

const GRID_RINGS = [0.5, 1] as const;
const POLLING_DISPLAY_SAMPLE_COUNT = 5;

function addPollingDisplaySample(samples: number[], value: number): number {
  samples.push(value);
  if (samples.length > POLLING_DISPLAY_SAMPLE_COUNT) samples.shift();
  return samples.reduce((total, sample) => total + sample, 0) / samples.length;
}

function readAxis(gamepad: Gamepad, index: number): number {
  return clamp(gamepad.axes[index] ?? 0, -1, 1);
}

function readButtonValue(gamepad: Gamepad, index: number): number {
  return clamp(gamepad.buttons[index]?.value ?? 0, 0, 1);
}

function readButtonState(gamepad: Gamepad): boolean[] {
  return BUTTON_LABELS.map((_, index) => gamepad.buttons[index]?.pressed || readButtonValue(gamepad, index) >= 0.5);
}

type GamepadNavigator = { getGamepads?: () => ArrayLike<Gamepad | null> };

function readGamepads(): ArrayLike<Gamepad | null> | null {
  const getGamepads = (navigator as unknown as GamepadNavigator).getGamepads;
  return typeof getGamepads === "function" ? getGamepads.call(navigator) : null;
}

function normalizeGamepadName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function gamepadMatchesIdentifier(gamepad: Gamepad, identifier: string): boolean {
  const normalizedId = normalizeGamepadName(gamepad.id);
  const normalizedIdentifier = normalizeGamepadName(identifier);
  if (normalizedId.length === 0 || normalizedIdentifier.length < 3) return false;

  const hexadecimalParts = identifier.match(/[0-9a-f]{4}/gi) ?? [];
  if (hexadecimalParts.length >= 2) {
    return hexadecimalParts.every((part) => normalizedId.includes(part.toLowerCase()));
  }
  return normalizedId.includes(normalizedIdentifier);
}

function gamepadHasInput(gamepad: Gamepad): boolean {
  return gamepad.axes.some((axis) => Math.abs(axis) > 0.02)
    || gamepad.buttons.some((button) => button.pressed || button.value > 0.02);
}

function pointFromGamepad(gamepad: Gamepad, xAxis: number, yAxis: number): StickPoint {
  return { x: readAxis(gamepad, xAxis), y: readAxis(gamepad, yAxis) };
}

function setText(id: string, value: string): void {
  byId(id).textContent = value;
}

function canvasContext(canvas: HTMLCanvasElement): { context: CanvasRenderingContext2D; width: number; height: number } | null {
  const width = Math.max(180, canvas.getBoundingClientRect().width || 300);
  const height = Math.max(140, canvas.getBoundingClientRect().height || width);
  const scale = window.devicePixelRatio || 1;
  const pixelWidth = Math.round(width * scale);
  const pixelHeight = Math.round(height * scale);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.clearRect(0, 0, width, height);
  return { context, width, height };
}

function drawGrid(context: CanvasRenderingContext2D, width: number, height: number): void {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.4;
  context.strokeStyle = "#2c3949";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(centerX - radius, centerY);
  context.lineTo(centerX + radius, centerY);
  context.moveTo(centerX, centerY - radius);
  context.lineTo(centerX, centerY + radius);
  context.stroke();
  for (const ring of GRID_RINGS) {
    context.beginPath();
    context.arc(centerX, centerY, radius * ring, 0, Math.PI * 2);
    context.strokeStyle = ring === 1 ? "#425267" : "#253140";
    context.stroke();
  }
}

function pointToCanvas(point: StickPoint, width: number, height: number): [number, number] {
  const radius = Math.min(width, height) * 0.4;
  // Stick Y is negative upward; keep that orientation on the canvas.
  return [width / 2 + point.x * radius, height / 2 + point.y * radius];
}

function drawPoint(
  context: CanvasRenderingContext2D,
  point: StickPoint,
  width: number,
  height: number,
  color: string,
  radius = 6,
): void {
  const [x, y] = pointToCanvas(point, width, height);
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
  context.strokeStyle = "#10141a";
  context.lineWidth = 2;
  context.stroke();
}

function drawStickPosition(canvas: HTMLCanvasElement, raw: StickPoint, simulation: StickPoint): void {
  const drawing = canvasContext(canvas);
  if (!drawing) return;
  const { context, width, height } = drawing;
  drawGrid(context, width, height);
  drawPoint(context, raw, width, height, "#f0a45f", 6);
  drawPoint(context, simulation, width, height, "#70a7ff", 5);
}

function drawPollingChart(canvas: HTMLCanvasElement, intervals: readonly number[]): void {
  const drawing = canvasContext(canvas);
  if (!drawing) return;
  const { context, width, height } = drawing;
  const values = intervals.slice(-180);
  context.strokeStyle = "#2c3949";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, height - 18);
  context.lineTo(width, height - 18);
  context.stroke();
  if (values.length === 0) {
    context.fillStyle = "#748296";
    context.font = "12px sans-serif";
    context.fillText("HID入力レポートを待っています", 12, height / 2);
    return;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(0.1, max - min);
  context.beginPath();
  values.forEach((value, index) => {
    const x = values.length === 1 ? width / 2 : index / (values.length - 1) * width;
    const y = 10 + (max - value) / range * (height - 34);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.strokeStyle = "#64d6a2";
  context.lineWidth = 2;
  context.stroke();
  context.fillStyle = "#748296";
  context.font = "11px sans-serif";
  context.fillText(`${formatMs(min)} – ${formatMs(max)}`, 10, height - 5);
}

export function createInputDiagnostics(options: InputDiagnosticsOptions) {
  let initialized = false;
  let visible = false;
  let currentTab: DiagnosticTab = "viewer";
  let currentSample: DiagnosticSample | null = null;
  let lastSimulation: { leftStick: StickPoint; rightStick: StickPoint } | null = null;
  let animationFrame: number | null = null;
  let pollingMeasurement: PollingMeasurement | null = null;
  let pollingRateDisplaySamples: number[] = [];
  let averagePollingRateDisplaySamples: number[] = [];
  let displayedPollingRate: number | null = null;
  let displayedAveragePollingRate: number | null = null;
  let smoothedMeasurement: PollingMeasurement | null = null;
  let pollingBusy = false;
  let pollingTimer: number | null = null;
  let pollingRequestId = 0;
  let selectedGamepadIndex: number | null = null;
  let buttonStateElements: HTMLSpanElement[] = [];

  function isPollingViewActive(): boolean {
    return visible && currentTab === "polling";
  }

  function findGamepad(): Gamepad | null {
    const gamepads = readGamepads();
    if (!gamepads) return null;

    if (selectedGamepadIndex !== null) {
      const selected = Array.prototype.find.call(
        gamepads,
        (gamepad: Gamepad | null): boolean => gamepad?.connected === true && gamepad.index === selectedGamepadIndex,
      ) as Gamepad | undefined;
      if (selected) return selected;
      selectedGamepadIndex = null;
    }

    const connected = Array.prototype.filter.call(
      gamepads,
      (gamepad: Gamepad | null): gamepad is Gamepad => gamepad?.connected === true,
    ) as Gamepad[];
    if (connected.length === 0) return null;

    const identifiers = options.getDeviceIdentifiers()
      .map((identifier) => identifier.trim())
      .filter((identifier) => identifier.length > 0);
    const matches = connected.filter((gamepad) =>
      identifiers.some((identifier) => gamepadMatchesIdentifier(gamepad, identifier)),
    );
    const activeMatches = matches.filter(gamepadHasInput);
    const candidates = matches.length > 0 ? matches : connected;
    const activeCandidates = candidates.filter(gamepadHasInput);
    let selected: Gamepad | null = null;
    if (matches.length === 1) selected = matches[0] ?? null;
    else if (activeMatches.length === 1) selected = activeMatches[0] ?? null;
    else if (connected.length === 1) selected = connected[0] ?? null;
    else if (activeCandidates.length === 1) selected = activeCandidates[0] ?? null;
    if (selected) selectedGamepadIndex = selected.index;
    return selected ?? null;
  }

  function readSample(gamepad: Gamepad): DiagnosticSample {
    const rawLeft = pointFromGamepad(gamepad, 0, 1);
    const rawRight = pointFromGamepad(gamepad, 2, 3);
    const settings = options.getStickSettings();
    const sample: DiagnosticSample = {
      raw: {
        leftStick: rawLeft,
        rightStick: rawRight,
        buttons: readButtonState(gamepad),
      },
      simulation: {
        leftStick: simulateStickInput(
          rawLeft,
          settings.leftStick.curve,
          settings.leftStick.circularAlgorithm,
          lastSimulation?.leftStick ?? null,
        ),
        rightStick: simulateStickInput(
          rawRight,
          settings.rightStick.curve,
          settings.rightStick.circularAlgorithm,
          lastSimulation?.rightStick ?? null,
        ),
      },
    };
    lastSimulation = {
      leftStick: sample.simulation.leftStick,
      rightStick: sample.simulation.rightStick,
    };
    return sample;
  }

  function renderPolling(): void {
    if (pollingMeasurement) {
      if (smoothedMeasurement !== pollingMeasurement) {
        smoothedMeasurement = pollingMeasurement;
        displayedPollingRate = addPollingDisplaySample(
          pollingRateDisplaySamples,
          pollingMeasurement.pollingRate,
        );
        displayedAveragePollingRate = addPollingDisplaySample(
          averagePollingRateDisplaySamples,
          pollingMeasurement.averagePollingRate,
        );
      }
      setText("diagnostics-polling-rate", formatHz(displayedPollingRate ?? pollingMeasurement.pollingRate));
      setText(
        "diagnostics-polling-average",
        formatHz(displayedAveragePollingRate ?? pollingMeasurement.averagePollingRate),
      );
      setText("diagnostics-polling-interval", formatMs(pollingMeasurement.reportInterval));
      setText("diagnostics-polling-min", formatMs(pollingMeasurement.minInterval));
      setText("diagnostics-polling-max", formatMs(pollingMeasurement.maxInterval));
      setText("diagnostics-polling-jitter", formatMs(pollingMeasurement.intervalJitter));
      drawPollingChart(byId<HTMLCanvasElement>("diagnostics-polling-chart"), pollingMeasurement.intervals);
    } else {
      for (const id of [
        "diagnostics-polling-rate", "diagnostics-polling-average", "diagnostics-polling-interval",
        "diagnostics-polling-min", "diagnostics-polling-max", "diagnostics-polling-jitter",
      ]) setText(id, "—");
      drawPollingChart(byId<HTMLCanvasElement>("diagnostics-polling-chart"), []);
    }
  }

  function renderButtons(sample: DiagnosticSample | null): void {
    const container = byId("diagnostics-buttons");
    if (buttonStateElements.length !== BUTTON_LABELS.length || container.childElementCount !== BUTTON_LABELS.length) {
      buttonStateElements = BUTTON_LABELS.map((label) => {
        const item = document.createElement("span");
        item.className = "diagnostics-button-state";
        item.textContent = label;
        return item;
      });
      container.replaceChildren(...buttonStateElements);
    }
    for (let index = 0; index < buttonStateElements.length; index += 1) {
      buttonStateElements[index]?.classList.toggle("pressed", sample?.raw.buttons[index] ?? false);
    }
  }

  function renderStickReadout(prefix: string, raw: StickPoint): void {
    setText(`diagnostics-${prefix}-raw-x`, formatNumber(raw.x, 3));
    setText(`diagnostics-${prefix}-raw-y`, formatNumber(raw.y, 3));
  }

  function renderViewer(): void {
    const sample = currentSample;
    const rawLeft = sample?.raw.leftStick ?? { x: 0, y: 0 };
    const simulationLeft = sample?.simulation.leftStick ?? { x: 0, y: 0 };
    const rawRight = sample?.raw.rightStick ?? { x: 0, y: 0 };
    const simulationRight = sample?.simulation.rightStick ?? { x: 0, y: 0 };
    drawStickPosition(byId<HTMLCanvasElement>("diagnostics-left-stick-canvas"), rawLeft, simulationLeft);
    drawStickPosition(byId<HTMLCanvasElement>("diagnostics-right-stick-canvas"), rawRight, simulationRight);
    renderStickReadout("left-stick", rawLeft);
    renderStickReadout("right-stick", rawRight);
    renderButtons(sample);
  }

  function render(): void {
    if (!initialized) return;
    if (currentTab === "viewer") renderViewer();
    else renderPolling();
  }

  function schedulePollingMeasurement(delayMs = 0): void {
    if (!isPollingViewActive() || pollingBusy || pollingTimer !== null) return;
    if (delayMs === 0) {
      void runPollingMeasurement();
      return;
    }
    pollingTimer = window.setTimeout(() => {
      pollingTimer = null;
      void runPollingMeasurement();
    }, delayMs);
  }

  async function runPollingMeasurement(): Promise<void> {
    if (!isPollingViewActive() || pollingBusy) return;
    pollingBusy = true;
    const requestId = ++pollingRequestId;
    renderPolling();
    try {
      const measurement = await options.measurePollingRate();
      if (requestId === pollingRequestId) {
        pollingMeasurement = measurement;
      }
    } catch {
      if (requestId === pollingRequestId) {
        pollingMeasurement = null;
      }
    } finally {
      pollingBusy = false;
      if (requestId === pollingRequestId) {
        renderPolling();
        schedulePollingMeasurement(500);
      } else if (isPollingViewActive()) {
        schedulePollingMeasurement();
      }
    }
  }

  function stopPollingMeasurement(): void {
    pollingRequestId += 1;
    if (pollingTimer !== null) {
      window.clearTimeout(pollingTimer);
      pollingTimer = null;
    }
    pollingMeasurement = null;
    pollingRateDisplaySamples = [];
    averagePollingRateDisplaySamples = [];
    displayedPollingRate = null;
    displayedAveragePollingRate = null;
    smoothedMeasurement = null;
  }

  function setTab(next: DiagnosticTab): void {
    currentTab = next;
    for (const candidate of Object.keys(TAB_IDS) as DiagnosticTab[]) {
      const active = candidate === next;
      byId(TAB_IDS[candidate]).classList.toggle("active", active);
      byId(TAB_IDS[candidate]).setAttribute("aria-selected", String(active));
      byId(SECTION_IDS[candidate]).hidden = !active;
    }
    if (next === "polling") {
      stop();
      schedulePollingMeasurement();
    } else {
      stopPollingMeasurement();
      lastSimulation = null;
      start();
    }
    render();
  }

  function tick(): void {
    animationFrame = null;
    if (!visible || currentTab !== "viewer") return;
    const gamepad = findGamepad();
    if (gamepad) {
      currentSample = readSample(gamepad);
    } else {
      currentSample = null;
      lastSimulation = null;
      selectedGamepadIndex = null;
    }
    render();
    animationFrame = window.requestAnimationFrame(tick);
  }

  function start(): void {
    if (!visible || currentTab !== "viewer") return;
    if (animationFrame === null) animationFrame = window.requestAnimationFrame(tick);
  }

  function stop(): void {
    if (animationFrame !== null) {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
  }

  function setup(): void {
    if (initialized) return;
    initialized = true;
    for (const [id, next] of Object.entries(TAB_IDS) as Array<[DiagnosticTab, string]>) {
      byId(next).addEventListener("click", () => setTab(id));
    }
    setTab("viewer");
  }

  return {
    setup,
    show(): void {
      visible = true;
      if (currentTab === "viewer") start();
      else schedulePollingMeasurement();
      render();
    },
    hide(): void {
      visible = false;
      stop();
      stopPollingMeasurement();
    },
  };
}
