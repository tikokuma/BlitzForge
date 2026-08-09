import type { CurveSettings } from "../models";

export type CurveCompensation = "center" | "edge";

const clampInteger = (value: number, min: number, max: number): number => {
  const integer = Number.isFinite(value) ? Math.round(value) : 0;
  return Math.min(max, Math.max(min, integer));
};

export const clampPercentage = (value: number): number => clampInteger(value, 0, 100);

export function compensationAmount(value: number): number {
  return Math.max(0, -value);
}

export function curveYBounds(curve: Pick<CurveSettings, "center" | "edge">): { min: number; max: number } {
  return {
    min: compensationAmount(curve.center),
    max: 100 - compensationAmount(curve.edge),
  };
}

export function constrainCurve(curve: CurveSettings, changed?: CurveCompensation): CurveSettings {
  const next: CurveSettings = {
    center: clampInteger(curve.center, -100, 100),
    point1X: clampPercentage(curve.point1X),
    point1Y: clampPercentage(curve.point1Y),
    point2X: clampPercentage(curve.point2X),
    point2Y: clampPercentage(curve.point2Y),
    edge: clampInteger(curve.edge, -100, 100),
    stabilization: clampInteger(curve.stabilization, -10, 10),
  };

  const centerCompensation = compensationAmount(next.center);
  const edgeCompensation = compensationAmount(next.edge);
  if (centerCompensation + edgeCompensation > 100) {
    if (changed === "center") {
      next.center = -(100 - edgeCompensation);
    } else {
      next.edge = -(100 - centerCompensation);
    }
  }

  const bounds = curveYBounds(next);
  next.point1Y = clampInteger(next.point1Y, bounds.min, bounds.max);
  next.point2Y = clampInteger(next.point2Y, bounds.min, bounds.max);
  return next;
}

export function curvesEqual(left: CurveSettings, right: CurveSettings): boolean {
  return left.center === right.center
    && left.point1X === right.point1X
    && left.point1Y === right.point1Y
    && left.point2X === right.point2X
    && left.point2Y === right.point2Y
    && left.edge === right.edge
    && left.stabilization === right.stabilization;
}
