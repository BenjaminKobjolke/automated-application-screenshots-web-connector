import { RUN_STATE_KEY } from "./constants.js";
import { parseSteps, type DemoStep } from "./steps.js";

/** Navigation-resumable state for one active demo run. */
export type RunState = {
  port: number;
  demo: number;
  language?: string;
  texts: Record<string, string>;
  configSteps: DemoStep[] | null;
  nextStep: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function parseRunState(value: unknown): RunState | null {
  if (!isRecord(value)) return null;
  if (!isPositiveInteger(value["port"]) || value["port"] > 65_535) return null;
  if (!isPositiveInteger(value["demo"])) return null;
  if (!Number.isSafeInteger(value["nextStep"]) || (value["nextStep"] as number) < 0) return null;
  if (value["language"] !== undefined && typeof value["language"] !== "string") return null;

  const texts = value["texts"];
  if (!isRecord(texts) || Object.values(texts).some((text) => typeof text !== "string")) return null;

  const rawSteps = value["configSteps"];
  let configSteps: DemoStep[] | null;
  if (rawSteps === null) configSteps = null;
  else {
    try {
      configSteps = parseSteps(rawSteps);
    } catch {
      return null;
    }
  }

  return {
    port: value["port"],
    demo: value["demo"],
    ...(value["language"] === undefined ? {} : { language: value["language"] as string }),
    texts: texts as Record<string, string>,
    configSteps,
    nextStep: value["nextStep"] as number,
  };
}

/** Loads saved state, removing it when its JSON or shape is invalid. */
export function loadRunState(storage: Storage = sessionStorage): RunState | null {
  const serialized = storage.getItem(RUN_STATE_KEY);
  if (serialized === null) return null;
  try {
    const state = parseRunState(JSON.parse(serialized) as unknown);
    if (state !== null) return state;
  } catch {
    // Invalid stored data should not prevent the page from loading.
  }
  clearRunState(storage);
  return null;
}

/** Saves the active demo run for a possible full-page navigation. */
export function saveRunState(state: RunState, storage: Storage = sessionStorage): void {
  storage.setItem(RUN_STATE_KEY, JSON.stringify(state));
}

/** Removes saved navigation state after a run finishes or fails. */
export function clearRunState(storage: Storage = sessionStorage): void {
  storage.removeItem(RUN_STATE_KEY);
}
