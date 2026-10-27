import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { END_HOLD_MS, RUN_STATE_KEY, START_DELAY_MS } from "../../src/constants.js";
import { DemoRegistry } from "../../src/registry.js";
import { startAutomationDemo } from "../../src/connector.js";
import type { RunState } from "../../src/run_state.js";
import { saveRunState } from "../../src/run_state.js";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

class FakeWebSocket extends EventTarget {
  static latest: FakeWebSocket;
  static created = 0;
  readonly sent: string[] = [];
  readyState = 0;
  constructor(readonly url: string) {
    super();
    FakeWebSocket.latest = this;
    FakeWebSocket.created += 1;
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
  receive(message: unknown): void {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) }));
  }
}

const socketConstructor = FakeWebSocket as unknown as typeof WebSocket;

function config(
  search: string,
  storage = new MemoryStorage(),
  registry = new DemoRegistry(),
): { registry: DemoRegistry; location: { search: string }; storage: Storage; webSocket: typeof WebSocket } {
  return { registry, location: { search }, storage, webSocket: socketConstructor };
}

function startMessage(demo: number, steps: unknown[] = [], settings: Record<string, unknown> = {}): object {
  return { command: "start", demo, settings, texts: {}, steps };
}

async function beginFreshRun(
  search: string,
  registry: DemoRegistry,
  storage = new MemoryStorage(),
  message = startMessage(3),
): Promise<{ running: Promise<void>; storage: MemoryStorage; socket: FakeWebSocket }> {
  const runConfig = config(search, storage, registry);
  const running = startAutomationDemo(runConfig as never);
  const socket = FakeWebSocket.latest;
  socket.open();
  await Promise.resolve();
  await Promise.resolve();
  socket.receive(message);
  return { running, storage, socket };
}

beforeEach(() => {
  FakeWebSocket.created = 0;
  vi.useFakeTimers();
  document.body.innerHTML = "";
});

afterEach(() => vi.useRealTimers());

describe("startAutomationDemo", () => {
  it("leaves an ordinary page inactive without opening a socket", async () => {
    const runConfig = config("");
    await startAutomationDemo(runConfig as never);
    expect(FakeWebSocket.created).toBe(0);
  });

  it("prepares and runs a fresh demo using server steps, then reports completion", async () => {
    const registry = new DemoRegistry();
    registry.add({ id: 3, name: "registered", steps: [{ type: "pause", seconds: 0 }] });
    const action = vi.fn();
    registry.customActions.set("server-action", action);
    const prepare = vi.fn();
    const storage = new MemoryStorage();
    const runConfig = {
      ...config("?automation-demo=3&automation-demo-port=8765", storage, registry),
      onPrepare: prepare,
    };
    const running = startAutomationDemo(runConfig as never);
    const socket = FakeWebSocket.latest;
    socket.open();
    await Promise.resolve();
    await Promise.resolve();
    socket.receive(startMessage(3, [{ type: "custom", name: "server-action" }], { mode: "guided" }));
    await vi.advanceTimersByTimeAsync(START_DELAY_MS + END_HOLD_MS);
    await running;

    expect(prepare).toHaveBeenCalledWith({ demo: 3, settings: { mode: "guided" } });
    expect(action).toHaveBeenCalledOnce();
    expect(socket.sent.map((item) => JSON.parse(item))).toEqual([
      { event: "demo_started", demo: 3 },
      { event: "demo_ended", demo: 3 },
    ]);
    expect(storage.getItem(RUN_STATE_KEY)).toBeNull();
    expect(socket.readyState).toBe(3);
  });

  it("uses registered steps when the server sends an empty steps array", async () => {
    const registry = new DemoRegistry();
    const action = vi.fn();
    registry.customActions.set("registered-action", action);
    registry.add({ id: 3, name: "registered", steps: [{ type: "custom", name: "registered-action" }] });
    const { running } = await beginFreshRun("?automation-demo=3&automation-demo-port=8765", registry);
    await vi.advanceTimersByTimeAsync(START_DELAY_MS + END_HOLD_MS);
    await running;
    expect(action).toHaveBeenCalledOnce();
  });

  it("reports invalid starts and clears their saved run state", async () => {
    const registry = new DemoRegistry();
    registry.add({ id: 3, name: "registered", steps: [] });
    const { running, storage, socket } = await beginFreshRun(
      "?automation-demo=3&automation-demo-port=8765",
      registry,
      new MemoryStorage(),
      startMessage(4),
    );
    await running;
    expect(socket.sent.map((item) => JSON.parse(item))).toEqual([
      { event: "error", message: expect.stringMatching(/requested demo/i) },
    ]);
    expect(storage.getItem(RUN_STATE_KEY)).toBeNull();
  });

  it("stays inactive when the loopback tool cannot be reached", async () => {
    const registry = new DemoRegistry();
    const running = startAutomationDemo(config(
      "?automation-demo=3&automation-demo-port=8765",
      new MemoryStorage(),
      registry,
    ) as never);
    FakeWebSocket.latest.fail();
    await expect(running).resolves.toBeUndefined();
  });

  it("resumes saved steps without waiting for a second start message", async () => {
    const registry = new DemoRegistry();
    const first = vi.fn();
    const second = vi.fn();
    registry.customActions.set("first", first);
    registry.customActions.set("second", second);
    registry.add({
      id: 3,
      name: "registered",
      steps: [
        { type: "custom", name: "first" },
        { type: "custom", name: "second" },
      ],
    });
    const storage = new MemoryStorage();
    const state: RunState = {
      port: 8765,
      demo: 3,
      texts: {},
      configSteps: null,
      nextStep: 1,
    };
    saveRunState(state, storage);
    const running = startAutomationDemo(config("", storage, registry) as never);
    const socket = FakeWebSocket.latest;
    socket.open();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(END_HOLD_MS);
    await running;

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    expect(socket.sent.map((item) => JSON.parse(item))).toEqual([{ event: "demo_ended", demo: 3 }]);
    expect(storage.getItem(RUN_STATE_KEY)).toBeNull();
  });

  it("persists the next step before a navigating click and resumes after navigation", async () => {
    const registry = new DemoRegistry();
    const finished = vi.fn();
    registry.customActions.set("finished", finished);
    const storage = new MemoryStorage();
    const button = document.createElement("button");
    button.id = "next";
    button.addEventListener("click", () => {
      expect(JSON.parse(storage.getItem(RUN_STATE_KEY) ?? "null")).toMatchObject({ nextStep: 1 });
      window.dispatchEvent(new Event("pagehide"));
    });
    document.body.append(button);

    const { running } = await beginFreshRun(
      "?automation-demo=3&automation-demo-port=8765",
      registry,
      storage,
      startMessage(3, [
        { type: "click", selector: "#next", navigates: true },
        { type: "custom", name: "finished" },
      ]),
    );
    await vi.advanceTimersByTimeAsync(START_DELAY_MS + END_HOLD_MS);
    await running;
    expect(finished).toHaveBeenCalledOnce();
  });
});
