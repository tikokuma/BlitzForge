import { byId } from "../dom";
import {
  clampPercentage,
  compensationAmount,
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

type CurveEditorSettings = Pick<
  ControllerSettings,
  "rectangleAlgorithm" | "leftStick" | "rightStick"
>;

export type CurveEditor = {
  setup: () => void;
  render: (settings: ControllerSettings, selectedStick?: Stick) => void;
  reset: () => void;
  readSettings: () => CurveEditorSettings;
  getStickSettings: () => DiagnosticStickSettings;
  getSelectedStick: () => Stick;
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
    return Number(byId(id, HTMLInputElement).value);
  }

  function setRangeControl(id: string, value: number): void {
    byId(id, HTMLInputElement).value = String(value);
    updateRangeOutput(id);
  }

  function clampRangeValue(id: string, value: number): number {
    const input = byId(id, HTMLInputElement);
    const min = Number(input.min);
    const max = Number(input.max);
    return Math.min(max, Math.max(min, Math.round(value)));
  }

  function updateRangeOutput(id: string): void {
    const value = byId(id, HTMLInputElement).value;
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
    byId("curve-line", SVGPathElement).setAttribute(
      "d",
      `M ${formatSvgPoint(svgPoint(0, yBounds.min))} L ${formatSvgPoint(point1)} L ${formatSvgPoint(point2)} L ${formatSvgPoint(svgPoint(100, yBounds.max))}`,
    );
    for (const [id, point] of [["curve-point1", point1], ["curve-point2", point2]] as const) {
      byId(id, SVGCircleElement).setAttribute("cx", String(point[0]));
      byId(id, SVGCircleElement).setAttribute("cy", String(point[1]));
    }
    const centerCompensation = byId("curve-center-compensation", SVGRectElement);
    const edgeCompensation = byId("curve-edge-compensation", SVGRectElement);
    const centerCompensationHeight = Math.max(0, -curve.center) * 2;
    const edgeCompensationHeight = Math.max(0, -curve.edge) * 2;
    centerCompensation.setAttribute("y", String(220 - centerCompensationHeight));
    centerCompensation.setAttribute("height", String(centerCompensationHeight));
    edgeCompensation.setAttribute("height", String(edgeCompensationHeight));
    updateStickOutputPreview(curve);
  }

  function updateStickOutputPreview(curve: Pick<CurveSettings, "center" | "edge">): void {
    const baseRadius = 74;
    const centerZone = byId("stick-output-center-zone", SVGCircleElement);
    const edgeZone = byId("stick-output-edge-zone", SVGCircleElement);
    const centerCompensation = compensationAmount(curve.center);
    const centerDeadzone = Math.max(0, curve.center);
    const edgeCompensation = compensationAmount(curve.edge);
    const edgeDeadzone = Math.max(0, curve.edge);

    if (curve.center === 0) {
      centerZone.setAttribute("display", "none");
    } else {
      centerZone.setAttribute("display", "inline");
      centerZone.setAttribute("r", String(baseRadius * Math.max(centerCompensation, centerDeadzone) / 100));
      centerZone.setAttribute("class", [
        "stick-output-zone",
        "stick-output-center-zone",
        curve.center < 0 ? "compensation" : "deadzone",
      ].join(" "));
      centerZone.setAttribute("stroke-width", curve.center < 0 ? "0" : "2.5");
    }

    if (curve.edge === 0) {
      edgeZone.setAttribute("display", "none");
    } else {
      edgeZone.setAttribute("display", "inline");
      edgeZone.setAttribute("class", [
        "stick-output-zone",
        "stick-output-edge-zone",
        curve.edge < 0 ? "compensation" : "deadzone",
      ].join(" "));
      edgeZone.setAttribute(
        "stroke-width",
        String(curve.edge < 0 ? 3 + edgeCompensation * 0.1 : edgeDeadzone * 0.65),
      );
    }

    const centerDescription = curve.center < 0
      ? `センター補償 ${centerCompensation}`
      : curve.center > 0
        ? `センターデッドゾーン ${centerDeadzone}`
        : "センター標準";
    const edgeDescription = curve.edge < 0
      ? `エッジ補償 ${edgeCompensation}`
      : curve.edge > 0
        ? `エッジデッドゾーン ${edgeDeadzone}`
        : "エッジ標準";
    byId("stick-output-preview").setAttribute(
      "aria-label",
      `スティック出力の概略図。${centerDescription}、${edgeDescription}`,
    );
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
    rectangleAlgorithmDraft[selectedStick] = byId("rectangle-algorithm", HTMLInputElement).checked;
  }

  function selectStick(stick: Stick): void {
    if (stick !== selectedStick) {
      syncActiveCurveDraft();
      syncActiveRectangleAlgorithm();
    }
    selectedStick = stick;
    setActiveCurve(curveDrafts[stick]);
    byId("rectangle-algorithm", HTMLInputElement).checked = rectangleAlgorithmDraft[stick];
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
    const input = byId(`${id}-value`, HTMLInputElement);
    const raw = input.value.trim();
    if (raw.length === 0) return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const value = clampRangeValue(id, parsed);
    byId(id, HTMLInputElement).value = String(value);
    if (!applyCurveConstraintsForControl(id)) {
      input.value = String(value);
      updateRangeOutput(id);
    }
    markDirty();
  }

  function commitCurveDirectInput(id: string): void {
    const input = byId(`${id}-value`, HTMLInputElement);
    const parsed = Number(input.value);
    const value = Number.isFinite(parsed) ? clampRangeValue(id, parsed) : readRangeValue(id);
    byId(id, HTMLInputElement).value = String(value);
    if (!applyCurveConstraintsForControl(id)) {
      input.value = String(value);
      updateRangeOutput(id);
    }
    markDirty();
  }

  function setPointFromPointer(point: CurvePoint, event: PointerEvent): void {
    const svg = byId("curve-preview", SVGSVGElement);
    const bounds = svg.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;

    const svgX = (event.clientX - bounds.left) * (240 / bounds.width);
    const svgY = (event.clientY - bounds.top) * (240 / bounds.height);
    const x = clampPercentage((svgX - 20) / 2);
    const y = clampPercentage((220 - svgY) / 2);
    const [xId, yId] = curvePointAxes[point];
    byId(xId, HTMLInputElement).value = String(x);
    byId(yId, HTMLInputElement).value = String(y);
    constrainActiveCurve(point);
    markDirty();
  }

  function setupDraggablePoint(id: string, point: CurvePoint): void {
    const circle = byId(id, SVGCircleElement);
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

  function render(settings: ControllerSettings, preferredStick = selectedStick): void {
    const activeStick = preferredStick;
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
      byId(id, HTMLInputElement).addEventListener("input", () => {
        if (!applyCurveConstraintsForControl(id)) updateRangeOutput(id);
        markDirty();
      });
      byId(`${id}-value`, HTMLInputElement).addEventListener("input", () => updateCurveFromDirectInput(id));
      byId(`${id}-value`, HTMLInputElement).addEventListener("change", () => commitCurveDirectInput(id));
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

  return {
    setup,
    render,
    reset,
    readSettings,
    getStickSettings,
    getSelectedStick: () => selectedStick,
    isDirty: () => dirty,
  };
}
