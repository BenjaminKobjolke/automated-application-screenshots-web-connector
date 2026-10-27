import { describe, expect, it } from "vitest";
import { clearRunState, loadRunState, saveRunState, type RunState } from "../../src/run_state.js";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, String(value)); }
}

const state: RunState = {
  port: 4321,
  demo: 3,
  language: "de",
  texts: { title: "Hallo" },
  configSteps: [{ type: "screenshot", name: "welcome" }],
  nextStep: 1,
};

describe("run state storage", () => {
  it("round-trips state including optional fields and configured steps", () => {
    const storage = new MemoryStorage();
    saveRunState(state, storage);
    expect(loadRunState(storage)).toEqual(state);
  });

  it("round-trips an absent language and null configured steps", () => {
    const storage = new MemoryStorage();
    const withoutOptionalValues: RunState = {
      port: 1234,
      demo: 1,
      texts: {},
      configSteps: null,
      nextStep: 0,
    };
    saveRunState(withoutOptionalValues, storage);
    expect(loadRunState(storage)).toEqual(withoutOptionalValues);
  });

  it("clears malformed JSON and returns null", () => {
    const storage = new MemoryStorage();
    storage.setItem("automated-screenshot-web-connector-run", "{");
    expect(loadRunState(storage)).toBeNull();
    expect(storage.length).toBe(0);
  });

  it("clears a structurally invalid state and returns null", () => {
    const storage = new MemoryStorage();
    storage.setItem("automated-screenshot-web-connector-run", JSON.stringify({ demo: -1 }));
    expect(loadRunState(storage)).toBeNull();
    expect(storage.length).toBe(0);
  });

  it("clears the saved run", () => {
    const storage = new MemoryStorage();
    saveRunState(state, storage);
    clearRunState(storage);
    expect(loadRunState(storage)).toBeNull();
  });
});
