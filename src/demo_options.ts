import {
  AUTOMATION_DEMO_LANGUAGE_PARAM,
  AUTOMATION_DEMO_PARAM,
  AUTOMATION_DEMO_PORT_PARAM,
} from "./constants.js";
import { logger } from "./logger.js";

export type DemoOptions = { demo: number; port: number; language?: string };

function parsePositiveInteger(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/** Reads and validates the tool's demo parameters from a page query string. */
export function readDemoOptions(search: string): DemoOptions | null {
  const params = new URLSearchParams(search);
  if (!params.has(AUTOMATION_DEMO_PARAM)) return null;

  const demo = parsePositiveInteger(params.get(AUTOMATION_DEMO_PARAM));
  const port = parsePositiveInteger(params.get(AUTOMATION_DEMO_PORT_PARAM));
  if (demo === null || port === null || port > 65_535) {
    logger.warning("Ignoring invalid automation demo query parameters.");
    return null;
  }

  const language = params.get(AUTOMATION_DEMO_LANGUAGE_PARAM);
  return language === null ? { demo, port } : { demo, port, language };
}
