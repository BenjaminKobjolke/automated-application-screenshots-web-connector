// @vitest-environment node
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { chromium, type Browser } from "playwright";
import { WebSocketServer, type WebSocket } from "ws";
import { createExampleServer } from "../../example/serve.mjs";

let browser: Browser | undefined;
let browserUnavailable = "";

beforeAll(async () => {
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
  } catch (error) {
    browserUnavailable = `Microsoft Edge is unavailable: ${String(error)}`;
  }
});

afterAll(async () => {
  await browser?.close();
});

describe("sample browser integration", () => {
  test("runs a demo across navigation and waits for screenshot acknowledgements", async (context) => {
    if (browser === undefined) context.skip(browserUnavailable);
    const harness = await startHarness(1, "form-filled");
    const page = await browser!.newPage({ viewport: { width: 1024, height: 700 } });
    try {
      await page.goto(`${harness.pageUrl}?automation-demo=1&automation-demo-port=${harness.socketPort}`);
      await expect.poll(() => harness.events.some((event) => event === "screenshot:form-filled" || event.startsWith("error:")), { timeout: 5_000 }).toBe(true);
      await expect(harness.events).toContain("screenshot:form-filled");
      await page.waitForTimeout(200);
      expect(harness.events).not.toContain("screenshot:second-page");
      expect(harness.connections).toBe(1);
      harness.ackScreenshot("form-filled");
      await expect.poll(() => harness.events, { timeout: 10_000 }).toContain("screenshot:second-page");
      await expect.poll(() => harness.events, { timeout: 5_000 }).toContain("demo_ended");
      expect(harness.events.filter((event) => event === "demo_started")).toHaveLength(1);
      expect(harness.startMessages).toBe(1);
      expect(harness.connections).toBe(2);
      await expect.poll(() => page.locator("h1").textContent()).toBe("Second sample page");
    } finally {
      await page.close();
      await harness.close();
    }
  }, 90_000); // Browser startup and a full page load make this integration test intentionally slower.

  test("runs the in-page sample demo", async (context) => {
    if (browser === undefined) context.skip(browserUnavailable);
    const harness = await startHarness(2);
    const page = await browser!.newPage();
    try {
      await page.goto(`${harness.pageUrl}?automation-demo=2&automation-demo-port=${harness.socketPort}`);
      await expect.poll(() => harness.events).toContain("screenshot:in-page");
      await expect.poll(() => harness.events, { timeout: 5_000 }).toContain("demo_ended");
      expect(harness.connections).toBe(1);
      await expect.poll(() => page.locator("#greeting").isVisible()).toBe(true);
    } finally {
      await page.close();
      await harness.close();
    }
  }, 90_000); // Browser startup and tool handshake make this integration test intentionally slower.

  test("leaves an ordinary page unchanged without demo options", async (context) => {
    if (browser === undefined) context.skip(browserUnavailable);
    const harness = await startHarness(1);
    const page = await browser!.newPage();
    try {
      await page.goto(harness.pageUrl);
      await expect.poll(() => page.locator("h1").textContent()).toBe("Screenshot connector sample");
      expect(await page.locator("#greeting").isVisible()).toBe(false);
      expect(harness.connections).toBe(0);
    } finally {
      await page.close();
      await harness.close();
    }
  }, 90_000); // Browser startup makes this integration test intentionally slower.
});

type Harness = {
  pageUrl: string;
  socketPort: number;
  events: string[];
  startMessages: number;
  connections: number;
  ackScreenshot: (name: string) => void;
  close: () => Promise<void>;
};

async function startHarness(demoId: number, delayedAckName?: string): Promise<Harness> {
  const httpServer = createExampleServer();
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const httpAddress = httpServer.address();
  if (typeof httpAddress !== "object" || httpAddress === null) throw new Error("Example server did not bind.");

  const socketServer = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((resolve) => socketServer.once("listening", resolve));
  const socketAddress = socketServer.address();
  if (typeof socketAddress === "string" || socketAddress === null) {
    throw new Error("WebSocket server did not bind to a port.");
  }

  const harness: Harness = {
    pageUrl: `http://127.0.0.1:${httpAddress.port}/example/index.html`,
    socketPort: socketAddress.port,
    events: [],
    startMessages: 0,
    connections: 0,
    ackScreenshot: () => { throw new Error("No screenshot is waiting for acknowledgement."); },
    close: async () => {
      await new Promise<void>((resolve) => socketServer.close(() => resolve()));
      await new Promise<void>((resolve, reject) =>
        httpServer.close((error?: Error) => error ? reject(error) : resolve()),
      );
    },
  };

  socketServer.on("connection", (socket: WebSocket, request) => {
    harness.connections += 1;
    if (request.headers.origin !== new URL(harness.pageUrl).origin) {
      socket.close(1008, "Unexpected origin");
      return;
    }
    if (harness.startMessages === 0) {
      harness.startMessages += 1;
      socket.send(JSON.stringify({ command: "start", demo: demoId, settings: {}, texts: {}, steps: [] }));
    }
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString()) as { event: string; name?: string; message?: string };
      harness.events.push(message.event === "screenshot" ? `screenshot:${message.name}` : message.event === "error" ? `error:${message.message}` : message.event);
      if (message.event === "screenshot" && message.name !== undefined) {
        if (message.name === delayedAckName) {
          harness.ackScreenshot = (name) => socket.send(JSON.stringify({ command: "screenshot_done", name }));
        } else {
          socket.send(JSON.stringify({ command: "screenshot_done", name: message.name }));
        }
      }
    });
  });
  return harness;
}
