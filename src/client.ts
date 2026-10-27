import {
  COMMAND_SCREENSHOT_DONE,
  COMMAND_START,
  EVENT_DEMO_ENDED,
  EVENT_DEMO_STARTED,
  EVENT_ERROR,
  EVENT_SCREENSHOT,
  LOOPBACK_HOST,
  SCREENSHOT_ACK_TIMEOUT_MS,
} from "./constants.js";

export type ServerStartMessage = {
  command: "start";
  demo: number;
  language?: string;
  settings: Record<string, unknown>;
  texts: Record<string, string>;
  steps: unknown[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}

function parseStartMessage(data: unknown): ServerStartMessage {
  if (typeof data !== "string") throw new Error("Invalid start message: expected text JSON.");
  let value: unknown;
  try {
    value = JSON.parse(data) as unknown;
  } catch {
    throw new Error("Invalid start message: malformed JSON.");
  }
  if (!isRecord(value) || value["command"] !== COMMAND_START) {
    throw new Error("Invalid start message: expected the start command.");
  }
  if (!Number.isSafeInteger(value["demo"]) || (value["demo"] as number) <= 0) {
    throw new Error("Invalid start message: demo must be a positive integer.");
  }
  if (value["language"] !== undefined && typeof value["language"] !== "string") {
    throw new Error("Invalid start message: language must be a string.");
  }
  if (!isRecord(value["settings"]) || !isStringRecord(value["texts"]) || !Array.isArray(value["steps"])) {
    throw new Error("Invalid start message: settings, texts or steps have an invalid shape.");
  }
  return value as ServerStartMessage;
}

/** Client for the screenshot tool's loopback WebSocket protocol. */
export class DemoClient {
  private socket: WebSocket | null = null;

  constructor(private readonly WebSocketCtor: typeof WebSocket = WebSocket) {}

  connect(port: number): Promise<void> {
    let socket: WebSocket;
    try {
      socket = new this.WebSocketCtor(`ws://${LOOPBACK_HOST}:${port}/`);
      this.socket = socket;
    } catch (error) {
      return Promise.reject(error);
    }

    return new Promise((resolve, reject) => {
      const cleanup = (): void => {
        socket.removeEventListener("open", onOpen);
        socket.removeEventListener("error", onError);
        socket.removeEventListener("close", onClose);
      };
      const onOpen = (): void => {
        cleanup();
        resolve();
      };
      const onError = (): void => {
        cleanup();
        reject(new Error("WebSocket connection to the screenshot tool failed."));
      };
      const onClose = (): void => {
        cleanup();
        reject(new Error("WebSocket connection closed before it opened."));
      };
      socket.addEventListener("open", onOpen, { once: true });
      socket.addEventListener("error", onError, { once: true });
      socket.addEventListener("close", onClose, { once: true });
    });
  }

  waitForStart(): Promise<ServerStartMessage> {
    const socket = this.requireSocket();
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = (): void => {
        socket.removeEventListener("message", onMessage);
        socket.removeEventListener("close", onClose);
        socket.removeEventListener("error", onError);
      };
      const finish = (error?: Error, start?: ServerStartMessage): void => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error !== undefined) reject(error);
        else if (start !== undefined) resolve(start);
      };
      const onMessage = (event: MessageEvent): void => {
        try {
          finish(undefined, parseStartMessage(event.data as unknown));
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      };
      const onClose = (): void => finish(new Error("WebSocket closed before the start message arrived."));
      const onError = (): void => finish(new Error("WebSocket error before the start message arrived."));
      socket.addEventListener("message", onMessage);
      socket.addEventListener("close", onClose);
      socket.addEventListener("error", onError);
    });
  }

  sendStarted(demo: number): void {
    this.send({ event: EVENT_DEMO_STARTED, demo });
  }

  sendEnded(demo: number): void {
    this.send({ event: EVENT_DEMO_ENDED, demo });
  }

  sendError(message: string): void {
    this.send({ event: EVENT_ERROR, message });
  }

  requestScreenshot(name: string): Promise<void> {
    const socket = this.requireSocket();
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        socket.removeEventListener("message", onMessage);
        socket.removeEventListener("close", onClose);
        if (error === undefined) resolve();
        else reject(error);
      };
      const onMessage = (event: MessageEvent): void => {
        if (typeof event.data !== "string") return;
        try {
          const message: unknown = JSON.parse(event.data) as unknown;
          if (
            isRecord(message) &&
            message["command"] === COMMAND_SCREENSHOT_DONE &&
            message["name"] === name
          ) {
            finish();
          }
        } catch {
          // Ignore unrelated malformed messages while waiting for this screenshot's acknowledgement.
        }
      };
      const onClose = (): void => finish(new Error(`WebSocket closed before screenshot "${name}" was acknowledged.`));
      const timeout = setTimeout(
        () => finish(new Error(`Timed out waiting for screenshot "${name}" acknowledgement.`)),
        SCREENSHOT_ACK_TIMEOUT_MS,
      );
      socket.addEventListener("message", onMessage);
      socket.addEventListener("close", onClose);
      try {
        this.send({ event: EVENT_SCREENSHOT, name });
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
  }

  private requireSocket(): WebSocket {
    if (this.socket === null) throw new Error("WebSocket is not connected.");
    return this.socket;
  }

  private send(message: Record<string, unknown>): void {
    this.requireSocket().send(JSON.stringify(message));
  }
}
