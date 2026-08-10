import type { CurveSettings } from "../models";

export type CurveChange = "center" | "edge" | "point1" | "point2";

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

function constrainOrderedPair(
  point1: number,
  point2: number,
  changed?: CurveChange,
): [number, number] {
  if (changed === "point1") {
    return [Math.min(point1, point2), point2];
  }
  return [point1, Math.max(point1, point2)];
}

export function constrainCurve(curve: CurveSettings, changed?: CurveChange): CurveSettings {
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
  [next.point1X, next.point2X] = constrainOrderedPair(next.point1X, next.point2X, changed);
  [next.point1Y, next.point2Y] = constrainOrderedPair(next.point1Y, next.point2Y, changed);
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
