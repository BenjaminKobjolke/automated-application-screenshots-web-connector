import { describe, expect, it } from "vitest";
import { DemoRegistry, UnknownDemoError } from "../../src/registry.js";
import type { DemoScript } from "../../src/steps.js";

const tour: DemoScript = {
  id: 1,
  name: "sample-tour",
  steps: [
    { type: "click", selector: "#start" },
    { type: "screenshot", name: "started" },
  ],
};

describe("DemoRegistry", () => {
  it("stores scripts and exposes ids and membership", () => {
    const registry = new DemoRegistry();
    registry.add(tour, { id: 2, name: "simple", steps: [] });

    expect(registry.get(1)).toEqual(tour);
    expect(registry.ids()).toEqual([1, 2]);
    expect(registry.has(2)).toBe(true);
    expect(registry.has(3)).toBe(false);
  });

  it("rejects duplicate ids", () => {
    expect(() => new DemoRegistry().add(tour, tour)).toThrow(/duplicate.*1/i);
  });

  it("reports unknown ids together with available ids", () => {
    const registry = new DemoRegistry();
    registry.add(tour);

    expect(() => registry.get(7)).toThrow(UnknownDemoError);
    try {
      registry.get(7);
    } catch (error) {
      expect(error).toMatchObject({ demoId: 7, availableIds: [1] });
    }
  });

  it("validates screenshot names when scripts are registered", () => {
    expect(() => new DemoRegistry().add({
      id: 4,
      name: "bad-screenshot",
      steps: [{ type: "screenshot", name: "invalid/name" }],
    })).toThrow(/screenshot name/i);
  });

  it("provides a shared custom action map", () => {
    const registry = new DemoRegistry();
    const action = (): void => undefined;
    registry.customActions.set("prepare", action);

    expect(registry.customActions.get("prepare")).toBe(action);
  });
});
