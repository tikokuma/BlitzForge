import { describe, expect, it } from "vitest";

import type { CurveSettings } from "../models";
import { simulateStickInput } from "./input-diagnostics";

const curve: CurveSettings = {
  center: 0,
  point1X: 25,
  point1Y: 25,
  point2X: 75,
  point2Y: 75,
  edge: 0,
  stabilization: 0,
};

describe("stick input simulation", () => {
  it("keeps direction while applying the radial curve", () => {
    const result = simulateStickInput({ x: 0.5, y: 0.5 }, curve, false);
    expect(result.x).toBeCloseTo(result.y);
    expect(Math.hypot(result.x, result.y)).toBeCloseTo(Math.hypot(0.5, 0.5));
  });

  it("limits simulated output to a circle when requested", () => {
    const result = simulateStickInput({ x: 1.03, y: 1.03 }, curve, true);
    expect(Math.hypot(result.x, result.y)).toBeLessThanOrEqual(1);
  });
});
