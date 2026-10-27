/** Central logging switch and level filter for the browser connector. */

export type LogLevel = "debug" | "info" | "warning" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warning: 30,
  error: 40,
};

export const logger = {
  enabled: true,
  level: "info" as LogLevel,

  debug(message: string, context?: unknown): void {
    this.write("debug", message, context);
  },

  info(message: string, context?: unknown): void {
    this.write("info", message, context);
  },

  warning(message: string, context?: unknown): void {
    this.write("warning", message, context);
  },

  error(message: string, context?: unknown): void {
    this.write("error", message, context);
  },

  write(level: LogLevel, message: string, context?: unknown): void {
    if (!this.enabled || LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.level]) return;
    const output = level === "warning" ? console.warn : console[level];
    if (context === undefined) output(`[web-connector] ${message}`);
    else output(`[web-connector] ${message}`, context);
  },
};
