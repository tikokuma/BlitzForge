import type { CurveSettings } from "../models";

export type StickPoint = {
  x: number;
  y: number;
};

export type DiagnosticSample = {
  raw: {
    leftStick: StickPoint;
    rightStick: StickPoint;
    buttons: readonly boolean[];
  };
  processed: {
    leftStick: StickPoint;
    rightStick: StickPoint;
    buttons: readonly boolean[];
  };
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));

function interpolate(fromX: number, fromY: number, toX: number, toY: number, x: number): number {
  if (toX <= fromX) return toY;
  const ratio = clamp((x - fromX) / (toX - fromX), 0, 1);
  return fromY + (toY - fromY) * ratio;
}

/**
 * Evaluates the same four-point radial response shape used by the curve preview.
 * The firmware uses the same scalar gain for both axes, so this intentionally
 * does not process X and Y independently.
 */
export function evaluateStickCurve(radius: number, curve: CurveSettings): number {
  const centerCompensation = Math.max(0, -curve.center);
  const edgeCompensation = Math.max(0, -curve.edge);
  const points = [
    { x: 0, y: centerCompensation },
    { x: clamp(curve.point1X, 0, 100), y: clamp(curve.point1Y, centerCompensation, 100 - edgeCompensation) },
    { x: clamp(curve.point2X, 0, 100), y: clamp(curve.point2Y, centerCompensation, 100 - edgeCompensation) },
    { x: 100, y: 100 - edgeCompensation },
  ];
  const input = clamp(radius * 100, 0, 103);
  let previous = points[0] ?? { x: 0, y: centerCompensation };
  for (const next of points.slice(1)) {
    if (input <= next.x) return interpolate(previous.x, previous.y, next.x, next.y, input);
    previous = next;
  }
  return previous.y + (input - previous.x);
}

export function processStickInput(
  raw: StickPoint,
  curve: CurveSettings,
  circularAlgorithm: boolean,
  previous: StickPoint | null = null,
): StickPoint {
  const x = clamp(raw.x, -1.03, 1.03);
  const y = clamp(raw.y, -1.03, 1.03);
  const radius = Math.hypot(x, y);
  if (radius <= 0.00001) return { x: 0, y: 0 };

  const gain = clamp(evaluateStickCurve(radius, curve) / 100, 0, 1.03);
  let output = {
    x: (x / radius) * gain,
    y: (y / radius) * gain,
  };

  if (circularAlgorithm) {
    const outputRadius = Math.hypot(output.x, output.y);
    if (outputRadius > 1) {
      output = { x: output.x / outputRadius, y: output.y / outputRadius };
    }
  }

  if (previous && curve.stabilization !== 0) {
    const strength = clamp(Math.abs(curve.stabilization) / 10, 0, 1);
    const smoothing = curve.stabilization < 0 ? strength * 0.8 : strength * 0.35;
    output = {
      x: previous.x * smoothing + output.x * (1 - smoothing),
      y: previous.y * smoothing + output.y * (1 - smoothing),
    };
  }
  return output;
}
