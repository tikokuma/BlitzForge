import { describe, expect, it } from "vitest";
import { createLatestRequestGuard } from "./latest-request";

describe("latest request guard", () => {
  it("invalidates older requests when a newer request starts", () => {
    const guard = createLatestRequestGuard();
    const first = guard.start(1);
    const second = guard.start(1);

    expect(guard.isCurrent(first, 1)).toBe(false);
    expect(guard.isCurrent(second, 1)).toBe(true);
  });

  it("invalidates a request when its context changes", () => {
    const guard = createLatestRequestGuard();
    const request = guard.start(1);

    expect(guard.isCurrent(request, 2)).toBe(false);
  });
});
