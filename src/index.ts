export { logger } from "./logger.js";
export { startAutomationDemo } from "./connector.js";
export type { ConnectorConfig, PrepareContext } from "./connector.js";
export { DemoRegistry, UnknownDemoError } from "./registry.js";
export { DemoFormatError, localizeSteps, parseSteps, validateScreenshotName } from "./steps.js";
export type { DemoScript, DemoStep } from "./steps.js";
