import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NAVIGATION_TIMEOUT_MS,
  SCREENSHOT_SETTLE_MS,
  SCROLL_SETTLE_MS,
} from "../../src/constants.js";
import { StepExecutor } from "../../src/step_executor.js";
import type { DemoStep } from "../../src/steps.js";

const client = {
  requestScreenshot: vi.fn(async (_name: string): Promise<void> => undefined),
};

function executor(
  actions: Map<string, () => void | Promise<void>> = new Map(),
  onBeforeNavigate: (nextStep: number) => void = () => undefined,
): StepExecutor {
  return new StepExecutor(client as never, actions, document, onBeforeNavigate);
}

async function run(step: DemoStep, index = 0): Promise<void> {
  await executor().execute(step, index);
}

beforeEach(() => {
  document.body.innerHTML = "";
  client.requestScreenshot.mockClear();
});

afterEach(() => vi.useRealTimers());

describe("StepExecutor", () => {
  it("clicks a matching element after scrolling it into view", async () => {
    const button = document.createElement("button");
    const scrollIntoView = vi.fn();
    button.scrollIntoView = scrollIntoView;
    const clicked = vi.fn();
    button.addEventListener("click", clicked);
    button.id = "save";
    document.body.append(button);

    await run({ type: "click", selector: "#save" });

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });
    expect(clicked).toHaveBeenCalledOnce();
  });

  it("types characters into the selected input and emits input and change", async () => {
    const input = document.createElement("input");
    input.id = "name";
    document.body.append(input);
    const inputEvents = vi.fn();
    const changeEvents = vi.fn();
    input.addEventListener("input", inputEvents);
    input.addEventListener("change", changeEvents);

    await run({ type: "type_text", selector: "#name", text: "Ada", char_delay_ms: 0 });

    expect(input.value).toBe("Ada");
    expect(inputEvents).toHaveBeenCalledTimes(3);
    expect(changeEvents).toHaveBeenCalledOnce();
  });

  it("scrolls elements and coordinates, then waits for the page to settle", async () => {
    vi.useFakeTimers();
    const target = document.createElement("section");
    target.id = "bottom";
    target.scrollIntoView = vi.fn();
    document.body.append(target);
    const elementRun = run({ type: "scroll", selector: "#bottom" });
    await vi.advanceTimersByTimeAsync(SCROLL_SETTLE_MS);
    await elementRun;
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });

    const scrollTo = vi.fn();
    window.scrollTo = scrollTo;
    const coordinateRun = run({ type: "scroll", x: 12, y: 340 });
    await vi.advanceTimersByTimeAsync(SCROLL_SETTLE_MS);
    await coordinateRun;
    expect(scrollTo).toHaveBeenCalledWith({ left: 12, top: 340, behavior: "smooth" });
  });

  it("waits for a selector to appear and times out when it does not", async () => {
    const wait = run({ type: "wait_for", selector: "#ready", timeout_ms: 500 });
    setTimeout(() => {
      const ready = document.createElement("div");
      ready.id = "ready";
      document.body.append(ready);
    }, 20);
    await expect(wait).resolves.toBeUndefined();
    await expect(run({ type: "wait_for", selector: "#missing", timeout_ms: 1 })).rejects.toThrow(/timed out/i);
  });

  it("pauses for the requested duration", async () => {
    vi.useFakeTimers();
    const pause = run({ type: "pause", seconds: 0.25 });
    await vi.advanceTimersByTimeAsync(249);
    let settled = false;
    void pause.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pause).resolves.toBeUndefined();
  });

  it("waits before requesting a screenshot and runs registered custom actions", async () => {
    vi.useFakeTimers();
    const screenshot = run({ type: "screenshot", name: "welcome" });
    await vi.advanceTimersByTimeAsync(SCREENSHOT_SETTLE_MS);
    await screenshot;
    expect(client.requestScreenshot).toHaveBeenCalledWith("welcome");

    const action = vi.fn();
    await executor(new Map([["prepare", action]])).execute({ type: "custom", name: "prepare" }, 0);
    expect(action).toHaveBeenCalledOnce();
    await expect(run({ type: "custom", name: "missing" })).rejects.toThrow(/unknown custom/i);
  });

  it("saves the next index before navigating and waits for pagehide", async () => {
    const button = document.createElement("button");
    button.id = "next";
    document.body.append(button);
    const order: string[] = [];
    const pagehide = new Event("pagehide");
    button.addEventListener("click", () => {
      order.push("click");
      window.dispatchEvent(pagehide);
    });

    await executor(new Map(), (nextStep) => order.push(`save:${nextStep}`))
      .execute({ type: "click", selector: "#next", navigates: true }, 4);

    expect(order).toEqual(["save:5", "click"]);
  });

  it("reports a navigating click that does not unload before the timeout", async () => {
    vi.useFakeTimers();
    const button = document.createElement("button");
    button.id = "stay";
    document.body.append(button);
    const click = executor().execute({ type: "click", selector: "#stay", navigates: true }, 0);
    const rejected = expect(click).rejects.toThrow(/navigation.*timed out/i);
    await vi.advanceTimersByTimeAsync(NAVIGATION_TIMEOUT_MS);
    await rejected;
  });
});
