import {
  DEFAULT_CHAR_DELAY_MS,
  DEFAULT_WAIT_TIMEOUT_MS,
  NAVIGATION_TIMEOUT_MS,
  SCREENSHOT_SETTLE_MS,
  SCROLL_SETTLE_MS,
} from "./constants.js";
import type { DemoClient } from "./client.js";
import type { DemoStep } from "./steps.js";

/** Executes one validated demo step against a page and its screenshot-tool client. */
export class StepExecutor {
  constructor(
    private readonly client: DemoClient,
    private readonly customActions: ReadonlyMap<string, () => void | Promise<void>>,
    private readonly doc: Document = document,
    private readonly onBeforeNavigate: (nextStep: number) => void = () => undefined,
  ) {}

  async execute(step: DemoStep, index: number): Promise<void> {
    switch (step.type) {
      case "click":
        await this.click(step.selector, step.navigates === true, index);
        return;
      case "type_text":
        await this.typeText(step.selector, step.text, step.char_delay_ms ?? DEFAULT_CHAR_DELAY_MS);
        return;
      case "scroll":
        await this.scroll(step);
        return;
      case "wait_for":
        await this.waitForElement(step.selector, step.timeout_ms ?? DEFAULT_WAIT_TIMEOUT_MS);
        return;
      case "pause":
        await this.delay(step.seconds * 1_000);
        return;
      case "screenshot":
        await this.delay(SCREENSHOT_SETTLE_MS);
        await this.client.requestScreenshot(step.name);
        return;
      case "custom": {
        const action = this.customActions.get(step.name);
        if (action === undefined) throw new Error(`Unknown custom action "${step.name}".`);
        await action();
        return;
      }
    }
  }

  private async click(selector: string, navigates: boolean, index: number): Promise<void> {
    const element = await this.waitForElement(selector, DEFAULT_WAIT_TIMEOUT_MS);
    element.scrollIntoView?.({ block: "center" });
    if (!navigates) {
      element.click();
      return;
    }

    this.onBeforeNavigate(index + 1);
    const unload = this.waitForPageHide();
    try {
      element.click();
      await unload.promise;
    } catch (error) {
      unload.cancel();
      throw error;
    }
  }

  private async typeText(selector: string | undefined, text: string, charDelayMs: number): Promise<void> {
    const target = selector === undefined
      ? this.doc.activeElement
      : await this.waitForElement(selector, DEFAULT_WAIT_TIMEOUT_MS);
    if (!(target instanceof this.doc.defaultView!.HTMLElement) || !("value" in target)) {
      throw new Error("The type_text step needs an input or textarea element.");
    }

    target.focus();
    const field = target as HTMLInputElement | HTMLTextAreaElement;
    const valueSetter = this.findValueSetter(field);
    for (const character of text) {
      valueSetter.call(field, field.value + character);
      field.dispatchEvent(new Event("input", { bubbles: true }));
      if (charDelayMs > 0) await this.delay(charDelayMs);
    }
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }

  private findValueSetter(field: HTMLInputElement | HTMLTextAreaElement): (value: string) => void {
    let prototype: object | null = Object.getPrototypeOf(field) as object | null;
    while (prototype !== null) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
      if (descriptor?.set !== undefined) return descriptor.set as (value: string) => void;
      prototype = Object.getPrototypeOf(prototype) as object | null;
    }
    throw new Error("The type_text step could not set the input value.");
  }

  private async scroll(step: Extract<DemoStep, { type: "scroll" }>): Promise<void> {
    if ("selector" in step) {
      const element = await this.waitForElement(step.selector, DEFAULT_WAIT_TIMEOUT_MS);
      element.scrollIntoView?.({ behavior: "smooth", block: "center" });
    } else {
      this.doc.defaultView?.scrollTo({
        left: step.x ?? 0,
        top: step.y ?? 0,
        behavior: "smooth",
      });
    }
    await this.delay(SCROLL_SETTLE_MS);
  }

  private async waitForElement(selector: string, timeoutMs: number): Promise<HTMLElement> {
    const startedAt = Date.now();
    while (true) {
      const element = this.doc.querySelector<HTMLElement>(selector);
      if (element !== null) return element;
      const remainingMs = timeoutMs - (Date.now() - startedAt);
      if (remainingMs <= 0) throw new Error(`Timed out waiting for element "${selector}".`);
      await this.delay(Math.min(100, remainingMs));
    }
  }

  private waitForPageHide(): { promise: Promise<void>; cancel: () => void } {
    const view = this.doc.defaultView;
    if (view === null) throw new Error("Cannot wait for navigation without a page window.");

    return this.waitForEvent(view, "pagehide", NAVIGATION_TIMEOUT_MS, "Navigation timed out after click.");
  }

  private waitForEvent(
    target: EventTarget,
    eventName: string,
    timeoutMs: number,
    timeoutMessage: string,
  ): { promise: Promise<void>; cancel: () => void } {
    let timer: ReturnType<typeof setTimeout>;
    let finish: (error?: Error) => void;
    const promise = new Promise<void>((resolve, reject) => {
      finish = (error?: Error): void => {
        clearTimeout(timer);
        target.removeEventListener(eventName, onEvent);
        if (error === undefined) resolve();
        else reject(error);
      };
      const onEvent = (): void => finish();
      target.addEventListener(eventName, onEvent, { once: true });
      timer = setTimeout(() => finish(new Error(timeoutMessage)), timeoutMs);
    });
    return { promise, cancel: () => finish(new Error("Navigation wait cancelled.")) };
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
