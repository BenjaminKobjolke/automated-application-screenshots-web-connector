import { SCREENSHOT_NAME_PATTERN } from "./constants.js";

/** Wire-format demo steps and validation for server-provided scripts. */

export type ClickStep = { type: "click"; selector: string; navigates?: boolean };
export type TypeTextStep = {
  type: "type_text";
  text: string;
  selector?: string;
  char_delay_ms?: number;
};
export type ScrollStep =
  | { type: "scroll"; selector: string }
  | { type: "scroll"; x?: number; y?: number };
export type WaitForStep = { type: "wait_for"; selector: string; timeout_ms?: number };
export type PauseStep = { type: "pause"; seconds: number };
export type ScreenshotStep = { type: "screenshot"; name: string };
export type CustomStep = { type: "custom"; name: string };

export type DemoStep =
  | ClickStep
  | TypeTextStep
  | ScrollStep
  | WaitForStep
  | PauseStep
  | ScreenshotStep
  | CustomStep;

export type DemoScript = { id: number; name: string; steps: DemoStep[] };

export class DemoFormatError extends Error {
  constructor(
    message: string,
    readonly stepIndex: number,
    readonly field: string,
  ) {
    super(`Invalid demo step ${stepIndex} field "${field}": ${message}`);
    this.name = "DemoFormatError";
  }
}

function fail(stepIndex: number, field: string, message: string): never {
  throw new DemoFormatError(message, stepIndex, field);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(
  step: Record<string, unknown>,
  field: string,
  index: number,
  allowEmpty = false,
): string {
  const value = step[field];
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
    return fail(index, field, "expected a string");
  }
  return value;
}

function optionalString(step: Record<string, unknown>, field: string, index: number): string | undefined {
  if (!(field in step)) return undefined;
  return requireString(step, field, index);
}

function requireNumber(
  step: Record<string, unknown>,
  field: string,
  index: number,
  minimum: number,
): number {
  const value = step[field];
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    return fail(index, field, `expected a number greater than or equal to ${minimum}`);
  }
  return value;
}

function optionalNumber(
  step: Record<string, unknown>,
  field: string,
  index: number,
  minimum: number,
): number | undefined {
  if (!(field in step)) return undefined;
  return requireNumber(step, field, index, minimum);
}

/** Parses untrusted JSON steps and reports the index and field of the first problem. */
export function parseSteps(raw: unknown): DemoStep[] {
  if (!Array.isArray(raw)) throw new DemoFormatError("expected an array", -1, "steps");

  return raw.map((value: unknown, index: number): DemoStep => {
    if (!isRecord(value)) return fail(index, "step", "expected an object");
    const type = requireString(value, "type", index);

    switch (type) {
      case "click": {
        const selector = requireString(value, "selector", index);
        const navigates = value["navigates"];
        if (navigates !== undefined && typeof navigates !== "boolean") {
          return fail(index, "navigates", "expected a boolean");
        }
        return navigates === undefined ? { type, selector } : { type, selector, navigates };
      }
      case "type_text": {
        const text = requireString(value, "text", index, true);
        const selector = optionalString(value, "selector", index);
        const char_delay_ms = optionalNumber(value, "char_delay_ms", index, 0);
        return {
          type,
          text,
          ...(selector === undefined ? {} : { selector }),
          ...(char_delay_ms === undefined ? {} : { char_delay_ms }),
        };
      }
      case "scroll": {
        const selector = optionalString(value, "selector", index);
        const x = optionalNumber(value, "x", index, 0);
        const y = optionalNumber(value, "y", index, 0);
        if (selector !== undefined) return { type, selector };
        if (x !== undefined || y !== undefined) {
          return { type, ...(x === undefined ? {} : { x }), ...(y === undefined ? {} : { y }) };
        }
        return fail(index, "selector", "expected a selector or scroll coordinates");
      }
      case "wait_for": {
        const selector = requireString(value, "selector", index);
        const timeout_ms = optionalNumber(value, "timeout_ms", index, 1);
        return timeout_ms === undefined ? { type, selector } : { type, selector, timeout_ms };
      }
      case "pause":
        return { type, seconds: requireNumber(value, "seconds", index, 0) };
      case "screenshot":
        return { type, name: validateScreenshotName(requireString(value, "name", index)) };
      case "custom":
        return { type, name: requireString(value, "name", index) };
      default:
        return fail(index, "type", `unsupported step type "${type}"`);
    }
  });
}

/** Enforces the screenshot naming contract shared with the screenshot tool. */
export function validateScreenshotName(name: string): string {
  if (!SCREENSHOT_NAME_PATTERN.test(name)) {
    throw new Error(`Invalid screenshot name "${name}"; use 1–128 letters, digits, underscores or hyphens, starting with a letter or digit.`);
  }
  return name;
}

/** Replaces {key} placeholders in type_text steps using server-provided texts. */
export function localizeSteps(steps: readonly DemoStep[], texts: Readonly<Record<string, string>>): DemoStep[] {
  return steps.map((step) => {
    if (step.type !== "type_text") return step;
    const text = step.text.replace(/\{([^{}]+)\}/g, (placeholder, key: string): string => {
      const localized = texts[key];
      if (typeof localized !== "string") throw new Error(`Missing text for placeholder "${key}".`);
      return localized;
    });
    return { ...step, text };
  });
}
