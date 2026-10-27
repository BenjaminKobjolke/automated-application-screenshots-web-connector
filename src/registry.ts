import { validateScreenshotName } from "./steps.js";
import type { DemoScript } from "./steps.js";

/** Registry for page-owned demo scripts and their custom action callbacks. */

export class UnknownDemoError extends Error {
  constructor(readonly demoId: number, readonly availableIds: number[]) {
    super(`Unknown demo ${demoId}. Available demo ids: ${availableIds.join(", ") || "none"}.`);
    this.name = "UnknownDemoError";
  }
}

export class DemoRegistry {
  readonly customActions = new Map<string, () => void | Promise<void>>();
  private readonly scripts = new Map<number, DemoScript>();

  add(...scripts: DemoScript[]): void {
    const incomingIds = new Set<number>();
    for (const script of scripts) {
      if (this.scripts.has(script.id) || incomingIds.has(script.id)) {
        throw new Error(`Duplicate demo id ${script.id}.`);
      }
      incomingIds.add(script.id);
      for (const step of script.steps) {
        if (step.type === "screenshot") validateScreenshotName(step.name);
      }
    }

    for (const script of scripts) this.scripts.set(script.id, script);
  }

  get(id: number): DemoScript {
    const script = this.scripts.get(id);
    if (script === undefined) throw new UnknownDemoError(id, this.ids());
    return script;
  }

  ids(): number[] {
    return [...this.scripts.keys()];
  }

  has(id: number): boolean {
    return this.scripts.has(id);
  }
}
