import { describe, expect, it } from "vitest";
import { createBusyState } from "./busy-state";

describe("busy state", () => {
  it("keeps the app busy until every nested operation completes", () => {
    const state = createBusyState();

    state.enter();
    state.enter();
    expect(state.isBusy()).toBe(true);

    state.leave();
    expect(state.isBusy()).toBe(true);

    state.leave();
    expect(state.isBusy()).toBe(false);
  });
});
