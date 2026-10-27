import { afterEach, describe, expect, it, vi } from "vitest";
import { SCREENSHOT_ACK_TIMEOUT_MS } from "../../src/constants.js";
import { DemoClient } from "../../src/client.js";

class FakeWebSocket extends EventTarget {
  static latest: FakeWebSocket;
  readonly sent: string[] = [];
  readyState = 0;
  constructor(readonly url: string) {
    super();
    FakeWebSocket.latest = this;
  }
  send(data: string): void { this.sent.push(data); }
  close(): void {
    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  }
  open(): void {
    this.readyState = 1;
    this.dispatchEvent(new Event("open"));
  }
  fail(): void { this.dispatchEvent(new Event("error")); }
  receive(data: unknown): void {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(data) }));
  }
}

const socketConstructor = FakeWebSocket as unknown as typeof WebSocket;

async function connect(): Promise<DemoClient> {
  const client = new DemoClient(socketConstructor);
  const connected = client.connect(8765);
  expect(FakeWebSocket.latest.url).toBe("ws://127.0.0.1:8765/");
  FakeWebSocket.latest.open();
  await connected;
  return client;
}

afterEach(() => vi.useRealTimers());

describe("DemoClient", () => {
  it("connects to the loopback tool and rejects an early connection error", async () => {
    const client = new DemoClient(socketConstructor);
    const connected = client.connect(9000);
    FakeWebSocket.latest.fail();
    await expect(connected).rejects.toThrow(/connect/i);
  });

  it("rejects a socket close before it opens", async () => {
    const client = new DemoClient(socketConstructor);
    const connected = client.connect(9001);
    FakeWebSocket.latest.close();
    await expect(connected).rejects.toThrow(/closed/i);
  });

  it("validates the server start command and its required fields", async () => {
    const client = await connect();
    const start = client.waitForStart();
    FakeWebSocket.latest.receive({
      command: "start",
      demo: 2,
      language: "de",
      settings: {},
      texts: { greeting: "Hallo" },
      steps: [],
    });
    await expect(start).resolves.toEqual({
      command: "start",
      demo: 2,
      language: "de",
      settings: {},
      texts: { greeting: "Hallo" },
      steps: [],
    });

    const invalidStart = client.waitForStart();
    FakeWebSocket.latest.receive({ command: "start", demo: "2" });
    await expect(invalidStart).rejects.toThrow(/invalid start/i);
  });

  it("rejects when the socket closes or errors before the start message", async () => {
    const closeClient = await connect();
    const closedStart = closeClient.waitForStart();
    FakeWebSocket.latest.close();
    await expect(closedStart).rejects.toThrow(/closed.*start/i);

    const errorClient = await connect();
    const failedStart = errorClient.waitForStart();
    FakeWebSocket.latest.fail();
    await expect(failedStart).rejects.toThrow(/websocket.*start/i);
  });

  it("sends the documented demo event shapes", async () => {
    const client = await connect();
    client.sendStarted(4);
    client.sendEnded(4);
    client.sendError("missing button");
    expect(FakeWebSocket.latest.sent.map((message) => JSON.parse(message))).toEqual([
      { event: "demo_started", demo: 4 },
      { event: "demo_ended", demo: 4 },
      { event: "error", message: "missing button" },
    ]);
  });

  it("requests a screenshot and resolves only on its matching acknowledgement", async () => {
    const client = await connect();
    const screenshot = client.requestScreenshot("welcome");
    expect(JSON.parse(FakeWebSocket.latest.sent[0] ?? "null")).toEqual({ event: "screenshot", name: "welcome" });
    FakeWebSocket.latest.receive({ command: "screenshot_done", name: "other" });
    FakeWebSocket.latest.receive({ command: "screenshot_done", name: "welcome" });
    await expect(screenshot).resolves.toBeUndefined();
  });

  it("rejects screenshot requests on timeout or socket close", async () => {
    vi.useFakeTimers();
    const client = await connect();
    const timedOut = client.requestScreenshot("slow");
    const timedOutExpectation = expect(timedOut).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(SCREENSHOT_ACK_TIMEOUT_MS);
    await timedOutExpectation;

    const closed = client.requestScreenshot("closed");
    client.close();
    await expect(closed).rejects.toThrow(/closed/i);
    expect(FakeWebSocket.latest.readyState).toBe(3);
  });
});
