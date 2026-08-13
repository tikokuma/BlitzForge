import { byId } from "../dom";
import {
  clampPercentage,
  constrainCurve,
  curvesEqual,
  curveYBounds,
} from "../domain/curve";
import type { CurveChange } from "../domain/curve";
import type {
  ControllerSettings,
  CurveSettings,
  RectangleAlgorithmSettings,
  Stick,
} from "../models";

export type DiagnosticStickSettings = {
  leftStick: { curve: CurveSettings; circularAlgorithm: boolean };
  rightStick: { curve: CurveSettings; circularAlgorithm: boolean };
};

export type CurveEditorSettings = {
  rectangleAlgorithm: RectangleAlgorithmSettings;
  leftStick: CurveSettings;
  rightStick: CurveSettings;
};

export type CurveEditor = {
  setup: () => void;
  render: (settings: ControllerSettings) => void;
  reset: () => void;
  readSettings: () => CurveEditorSettings;
  getStickSettings: () => DiagnosticStickSettings;
  isDirty: () => boolean;
};

type CurveEditorOptions = {
  onDirtyChanged: () => void;
};

const curveRangeIds = [
  "curve-center",
  "curve-p1-x",
  "curve-p1-y",
  "curve-p2-x",
  "curve-p2-y",
  "curve-edge",
  "curve-stabilization",
] as const;

const curvePointAxes = {
  point1: ["curve-p1-x", "curve-p1-y"],
  point2: ["curve-p2-x", "curve-p2-y"],
} as const;

type CurvePoint = keyof typeof curvePointAxes;

export function createCurveEditor(options: CurveEditorOptions): CurveEditor {
  let initialized = false;
  let selectedStick: Stick = "leftStick";
  let curveDrafts: Record<Stick, CurveSettings> = {
    leftStick: { center: 0, point1X: 0, point1Y: 0, point2X: 0, point2Y: 0, edge: 0, stabilization: 0 },
    rightStick: { center: 0, point1X: 0, point1Y: 0, point2X: 0, point2Y: 0, edge: 0, stabilization: 0 },
  };
  let rectangleAlgorithmDraft: RectangleAlgorithmSettings = {
    leftStick: false,
    rightStick: false,
  };
  let baseline: ControllerSettings | null = null;
  let dirty = false;
  let draggingPoint: CurvePoint | null = null;

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

  function readActiveCurve(): CurveSettings {
    return {
      center: readRangeValue("curve-center"),
      point1X: readRangeValue("curve-p1-x"),
      point1Y: readRangeValue("curve-p1-y"),
      point2X: readRangeValue("curve-p2-x"),
      point2Y: readRangeValue("curve-p2-y"),
      edge: readRangeValue("curve-edge"),
      stabilization: readRangeValue("curve-stabilization"),
    };
  }

  function updateCurvePreview(): void {
    const curve = {
      center: readRangeValue("curve-center"),
      point1X: readRangeValue("curve-p1-x"),
      point1Y: readRangeValue("curve-p1-y"),
      point2X: readRangeValue("curve-p2-x"),
      point2Y: readRangeValue("curve-p2-y"),
      edge: readRangeValue("curve-edge"),
    };
    const svgPoint = (x: number, y: number) => [20 + x * 2, 220 - y * 2] as const;
    const formatSvgPoint = (point: readonly [number, number]) => point.join(" ");
    const yBounds = curveYBounds(curve);
    const point1 = svgPoint(curve.point1X, curve.point1Y);
    const point2 = svgPoint(curve.point2X, curve.point2Y);
    byId<SVGPathElement>("curve-line").setAttribute(
      "d",
      `M ${formatSvgPoint(svgPoint(0, yBounds.min))} L ${formatSvgPoint(point1)} L ${formatSvgPoint(point2)} L ${formatSvgPoint(svgPoint(100, yBounds.max))}`,
    );
    for (const [id, point] of [["curve-point1", point1], ["curve-point2", point2]] as const) {
      byId<SVGCircleElement>(id).setAttribute("cx", String(point[0]));
      byId<SVGCircleElement>(id).setAttribute("cy", String(point[1]));
    }
    const centerCompensation = byId<SVGRectElement>("curve-center-compensation");
    const edgeCompensation = byId<SVGRectElement>("curve-edge-compensation");
    const centerCompensationHeight = Math.max(0, -curve.center) * 2;
    const edgeCompensationHeight = Math.max(0, -curve.edge) * 2;
    centerCompensation.setAttribute("y", String(220 - centerCompensationHeight));
    centerCompensation.setAttribute("height", String(centerCompensationHeight));
    edgeCompensation.setAttribute("height", String(edgeCompensationHeight));
    byId("curve-center-label").textContent = `センター ${curve.center}`;
    byId("curve-edge-label").textContent = `エッジ ${curve.edge}`;
  }

  function setActiveCurve(curve: CurveSettings, changed?: CurveChange): void {
    const safeCurve = constrainCurve(curve, changed);
    setRangeControl("curve-center", safeCurve.center);
    setRangeControl("curve-p1-x", safeCurve.point1X);
    setRangeControl("curve-p1-y", safeCurve.point1Y);
    setRangeControl("curve-p2-x", safeCurve.point2X);
    setRangeControl("curve-p2-y", safeCurve.point2Y);
    setRangeControl("curve-edge", safeCurve.edge);
    setRangeControl("curve-stabilization", safeCurve.stabilization);
    updateCurvePreview();
  }

  function syncActiveCurveDraft(): void {
    curveDrafts[selectedStick] = constrainCurve(readActiveCurve());
  }

  function syncActiveRectangleAlgorithm(): void {
    rectangleAlgorithmDraft[selectedStick] = byId<HTMLInputElement>("rectangle-algorithm").checked;
  }

  function selectStick(stick: Stick): void {
    if (stick !== selectedStick) {
      syncActiveCurveDraft();
      syncActiveRectangleAlgorithm();
    }
    selectedStick = stick;
    setActiveCurve(curveDrafts[stick]);
    byId<HTMLInputElement>("rectangle-algorithm").checked = rectangleAlgorithmDraft[stick];
    const left = stick === "leftStick";
    byId("stick-left-tab").classList.toggle("active", left);
    byId("stick-right-tab").classList.toggle("active", !left);
    byId("stick-left-tab").setAttribute("aria-selected", String(left));
    byId("stick-right-tab").setAttribute("aria-selected", String(!left));
  }

  function curveConstraintChange(id: string): CurveChange | null {
    if (id === "curve-center") return "center";
    if (id === "curve-edge") return "edge";
    if (id === "curve-p1-x" || id === "curve-p1-y") return "point1";
    if (id === "curve-p2-x" || id === "curve-p2-y") return "point2";
    return null;
  }

  function constrainActiveCurve(changed?: CurveChange): void {
    setActiveCurve(readActiveCurve(), changed);
  }

  function applyCurveConstraintsForControl(id: string): boolean {
    const changed = curveConstraintChange(id);
    if (changed === null) return false;
    constrainActiveCurve(changed);
    return true;
  }

  function updateCurveFromDirectInput(id: string): void {
    const input = byId<HTMLInputElement>(`${id}-value`);
    const raw = input.value.trim();
    if (raw.length === 0) return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const value = clampRangeValue(id, parsed);
    byId<HTMLInputElement>(id).value = String(value);
    if (!applyCurveConstraintsForControl(id)) {
      input.value = String(value);
      updateRangeOutput(id);
    }
    markDirty();
  }

  function commitCurveDirectInput(id: string): void {
    const input = byId<HTMLInputElement>(`${id}-value`);
    const parsed = Number(input.value);
    const value = Number.isFinite(parsed) ? clampRangeValue(id, parsed) : readRangeValue(id);
    byId<HTMLInputElement>(id).value = String(value);
    if (!applyCurveConstraintsForControl(id)) {
      input.value = String(value);
      updateRangeOutput(id);
    }
    markDirty();
  }

  function setPointFromPointer(point: CurvePoint, event: PointerEvent): void {
    const svg = byId<SVGSVGElement>("curve-preview");
    const bounds = svg.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;

    const svgX = (event.clientX - bounds.left) * (240 / bounds.width);
    const svgY = (event.clientY - bounds.top) * (240 / bounds.height);
    const x = clampPercentage((svgX - 20) / 2);
    const y = clampPercentage((220 - svgY) / 2);
    const [xId, yId] = curvePointAxes[point];
    byId<HTMLInputElement>(xId).value = String(x);
    byId<HTMLInputElement>(yId).value = String(y);
    constrainActiveCurve(point);
    markDirty();
  }

  function setupDraggablePoint(id: string, point: CurvePoint): void {
    const circle = byId<SVGCircleElement>(id);
    circle.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      draggingPoint = point;
      circle.classList.add("dragging");
      circle.setPointerCapture(event.pointerId);
      setPointFromPointer(point, event);
    });
    circle.addEventListener("pointermove", (event) => {
      if (draggingPoint === point && circle.hasPointerCapture(event.pointerId)) {
        setPointFromPointer(point, event);
      }
    });
    const stopDragging = (event: PointerEvent) => {
      if (draggingPoint !== point) return;
      if (circle.hasPointerCapture(event.pointerId)) circle.releasePointerCapture(event.pointerId);
      circle.classList.remove("dragging");
      draggingPoint = null;
    };
    circle.addEventListener("pointerup", stopDragging);
    circle.addEventListener("pointercancel", stopDragging);
  }

  function readSettings(): CurveEditorSettings {
    syncActiveCurveDraft();
    syncActiveRectangleAlgorithm();
    return {
      rectangleAlgorithm: { ...rectangleAlgorithmDraft },
      leftStick: { ...curveDrafts.leftStick },
      rightStick: { ...curveDrafts.rightStick },
    };
  }

  function settingsEqual(settings: ControllerSettings, current: CurveEditorSettings): boolean {
    return settings.rectangleAlgorithm.leftStick === current.rectangleAlgorithm.leftStick
      && settings.rectangleAlgorithm.rightStick === current.rectangleAlgorithm.rightStick
      && curvesEqual(settings.leftStick, current.leftStick)
      && curvesEqual(settings.rightStick, current.rightStick);
  }

  function markDirty(): void {
    dirty = baseline !== null && !settingsEqual(baseline, readSettings());
    byId("curve-dirty").hidden = !dirty;
    options.onDirtyChanged();
  }

  function render(settings: ControllerSettings): void {
    const activeStick = selectedStick;
    baseline = settings;
    curveDrafts = {
      leftStick: constrainCurve(settings.leftStick),
      rightStick: constrainCurve(settings.rightStick),
    };
    rectangleAlgorithmDraft = { ...settings.rectangleAlgorithm };
    selectedStick = activeStick;
    selectStick(activeStick);
    dirty = false;
    byId("curve-dirty").hidden = true;
  }

  function setup(): void {
    if (initialized) return;
    initialized = true;
    byId("stick-left-tab").addEventListener("click", () => selectStick("leftStick"));
    byId("stick-right-tab").addEventListener("click", () => selectStick("rightStick"));
    byId("rectangle-algorithm").addEventListener("change", markDirty);
    for (const id of curveRangeIds) {
      byId<HTMLInputElement>(id).addEventListener("input", () => {
        if (!applyCurveConstraintsForControl(id)) updateRangeOutput(id);
        markDirty();
      });
      byId<HTMLInputElement>(`${id}-value`).addEventListener("input", () => updateCurveFromDirectInput(id));
      byId<HTMLInputElement>(`${id}-value`).addEventListener("change", () => commitCurveDirectInput(id));
    }
    setupDraggablePoint("curve-point1", "point1");
    setupDraggablePoint("curve-point2", "point2");
  }

  function reset(): void {
    baseline = null;
    dirty = false;
    byId("curve-dirty").hidden = true;
  }

  function getStickSettings(): DiagnosticStickSettings {
    const settings = readSettings();
    return {
      leftStick: {
        curve: { ...settings.leftStick },
        circularAlgorithm: settings.rectangleAlgorithm.leftStick,
      },
      rightStick: {
        curve: { ...settings.rightStick },
        circularAlgorithm: settings.rectangleAlgorithm.rightStick,
      },
    };
  }

  return { setup, render, reset, readSettings, getStickSettings, isDirty: () => dirty };
}
