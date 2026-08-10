import { describe, expect, it } from "vitest";

import type { CurveSettings } from "../models";
import { constrainCurve, curvesEqual, curveYBounds } from "./curve";

const curve = (overrides: Partial<CurveSettings> = {}): CurveSettings => ({
  center: 0,
  point1X: 20,
  point1Y: 20,
  point2X: 80,
  point2Y: 80,
  edge: 0,
  stabilization: 0,
  ...overrides,
});

describe("constrainCurve", () => {
  it("normalizes every wire-bound field without mutating the input", () => {
    const input = curve({
      center: -101.2,
      point1X: -1,
      point1Y: 101,
      point2X: 100.6,
      point2Y: -2,
      edge: 101,
      stabilization: -11,
    });

    const result = constrainCurve(input);

    expect(result).toEqual(curve({
      center: -100,
      point1X: 0,
      point1Y: 100,
      point2X: 100,
      point2Y: 100,
      edge: 100,
      stabilization: -10,
    }));
    expect(input.center).toBe(-101.2);
  });

  it("replaces non-finite values instead of leaking NaN into controls", () => {
    expect(constrainCurve(curve({ center: Number.NaN, point1X: Number.POSITIVE_INFINITY })))
      .toMatchObject({ center: 0, point1X: 0 });
  });

  it("preserves the compensation control that was not changed", () => {
    const overcommitted = curve({ center: -80, edge: -40 });

    expect(constrainCurve(overcommitted, "center")).toMatchObject({ center: -60, edge: -40 });
    expect(constrainCurve(overcommitted, "edge")).toMatchObject({ center: -80, edge: -20 });
  });

  it("constrains Y points to the effective compensated output range", () => {
    const result = constrainCurve(curve({ center: -20, point1Y: 10, point2Y: 90, edge: -30 }));

    expect(curveYBounds(result)).toEqual({ min: 20, max: 70 });
    expect(result).toMatchObject({ point1Y: 20, point2Y: 70 });
  });

  it("keeps point one at or below point two on both axes", () => {
    expect(constrainCurve(curve({ point1X: 90, point1Y: 90, point2X: 40, point2Y: 40 }), "point1"))
      .toMatchObject({ point1X: 40, point1Y: 40, point2X: 40, point2Y: 40 });
    expect(constrainCurve(curve({ point1X: 40, point1Y: 40, point2X: 10, point2Y: 10 }), "point2"))
      .toMatchObject({ point1X: 40, point1Y: 40, point2X: 40, point2Y: 40 });
  });
});

describe("curvesEqual", () => {
  it("compares every serialized curve field", () => {
    const original = curve();
    expect(curvesEqual(original, { ...original })).toBe(true);
    expect(curvesEqual(original, { ...original, stabilization: 1 })).toBe(false);
  });
});
