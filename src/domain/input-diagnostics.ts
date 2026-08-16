import type { CurveSettings } from "../models";

export type StickPoint = {
  x: number;
  y: number;
};

export type DiagnosticSample = {
  raw: {
    leftStick: StickPoint;
    rightStick: StickPoint;
    buttonMask: number;
  };
  simulation: {
    leftStick: StickPoint;
    rightStick: StickPoint;
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
 * Approximates the four-point radial response shape used by the curve preview.
 * This is a UI simulation, not the processed output reported by controller
 * firmware.
 */
function evaluateStickCurve(radius: number, curve: CurveSettings): number {
  const centerCompensation = Math.max(0, -curve.center);
  const edgeCompensation = Math.max(0, -curve.edge);
  const input = clamp(radius * 100, 0, 103);
  const point1X = clamp(curve.point1X, 0, 100);
  const point1Y = clamp(curve.point1Y, centerCompensation, 100 - edgeCompensation);
  const point2X = clamp(curve.point2X, 0, 100);
  const point2Y = clamp(curve.point2Y, centerCompensation, 100 - edgeCompensation);
  if (input <= point1X) return interpolate(0, centerCompensation, point1X, point1Y, input);
  if (input <= point2X) return interpolate(point1X, point1Y, point2X, point2Y, input);
  if (input <= 100) return interpolate(point2X, point2Y, 100, 100 - edgeCompensation, input);
  return 100 - edgeCompensation + (input - 100);
}

export function simulateStickInput(
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
