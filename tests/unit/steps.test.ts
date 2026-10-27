import { describe, expect, it } from "vitest";
import {
  DemoFormatError,
  localizeSteps,
  parseSteps,
  validateScreenshotName,
} from "../../src/steps.js";

describe("parseSteps", () => {
  it("parses every supported wire step", () => {
    const steps = [
      { type: "click", selector: "#save", navigates: true },
      { type: "type_text", text: "hello", selector: "input", char_delay_ms: 5 },
      { type: "scroll", selector: "#footer" },
      { type: "scroll", x: 0, y: 300 },
      { type: "wait_for", selector: "#ready", timeout_ms: 1200 },
      { type: "pause", seconds: 0.5 },
      { type: "screenshot", name: "form-filled" },
      { type: "custom", name: "prepare-form" },
    ];

    expect(parseSteps(steps)).toEqual(steps);
  });

  it("reports the failing step and field for malformed data", () => {
    let caught: unknown;
    try {
      parseSteps([{ type: "click", selector: 3 }]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ stepIndex: 0, field: "selector" });
    expect(() => parseSteps({ type: "pause" })).toThrow(DemoFormatError);
    expect(() => parseSteps([{ type: "unknown" }])).toThrow(/step 0.*type/i);
  });

  it("rejects invalid screenshot names", () => {
    expect(validateScreenshotName("A_1-ok")).toBe("A_1-ok");
    expect(() => validateScreenshotName("-starts-bad")).toThrow(/screenshot name/i);
    expect(() => validateScreenshotName("a".repeat(129))).toThrow(/screenshot name/i);
  });
});

describe("localizeSteps", () => {
  it("replaces placeholders in typed text without changing other steps", () => {
    const steps = parseSteps([
      { type: "type_text", text: "Hello {name}" },
      { type: "pause", seconds: 0.1 },
    ]);

    expect(localizeSteps(steps, { name: "Ada" })).toEqual([
      { type: "type_text", text: "Hello Ada" },
      { type: "pause", seconds: 0.1 },
    ]);
  });

  it("throws when a typed-text placeholder has no supplied text", () => {
    expect(() => localizeSteps(parseSteps([{ type: "type_text", text: "{missing}" }]), {}))
      .toThrow(/missing.*text/i);
  });
});
