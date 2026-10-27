/** Shared query, WebSocket, timing and validation values for the connector. */

export const AUTOMATION_DEMO_PARAM = "automation-demo";
export const AUTOMATION_DEMO_PORT_PARAM = "automation-demo-port";
export const AUTOMATION_DEMO_LANGUAGE_PARAM = "automation-demo-language";

export const LOOPBACK_HOST = "127.0.0.1";
export const RUN_STATE_KEY = "automated-screenshot-web-connector-run";

export const COMMAND_START = "start";
export const COMMAND_SCREENSHOT_DONE = "screenshot_done";
export const EVENT_DEMO_STARTED = "demo_started";
export const EVENT_SCREENSHOT = "screenshot";
export const EVENT_DEMO_ENDED = "demo_ended";
export const EVENT_ERROR = "error";

export const DEFAULT_CHAR_DELAY_MS = 60;
export const SCREENSHOT_SETTLE_MS = 400;
export const START_DELAY_MS = 500;
export const END_HOLD_MS = 1_000;
export const SCROLL_SETTLE_MS = 500;
export const DEFAULT_WAIT_TIMEOUT_MS = 10_000;
export const SCREENSHOT_ACK_TIMEOUT_MS = 60_000;
export const NAVIGATION_TIMEOUT_MS = 10_000;

export const SCREENSHOT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
