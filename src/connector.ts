import { AUTOMATION_DEMO_PARAM, END_HOLD_MS, START_DELAY_MS } from "./constants.js";
import { DemoClient } from "./client.js";
import { readDemoOptions } from "./demo_options.js";
import { logger } from "./logger.js";
import { DemoRegistry } from "./registry.js";
import {
  clearRunState,
  loadRunState,
  saveRunState,
  type RunState,
} from "./run_state.js";
import { localizeSteps, parseSteps, type DemoStep } from "./steps.js";
import { StepExecutor } from "./step_executor.js";

export type PrepareContext = {
  demo: number;
  language?: string;
  settings: Record<string, unknown>;
};

export type ConnectorConfig = {
  registry: DemoRegistry;
  onPrepare?: (context: PrepareContext) => void | Promise<void>;
  location?: Pick<Location, "search">;
  storage?: Storage;
  webSocket?: typeof WebSocket;
};

type ActiveRun = {
  state: RunState;
  steps: DemoStep[];
  resumed: boolean;
};

/** Starts a tool-authorized demo, resuming its saved state after full-page navigation. */
export async function startAutomationDemo(config: ConnectorConfig): Promise<void> {
  const location = config.location ?? (typeof window === "undefined" ? undefined : window.location);
  if (location === undefined) return;

  const storage = config.storage;
  const options = readDemoOptions(location.search);
  const hasDemoParameter = new URLSearchParams(location.search).has(AUTOMATION_DEMO_PARAM);
  const saved = loadRunState(storage);

  let active: ActiveRun | null = null;
  if (options !== null && saved !== null && saved.port === options.port) {
    active = { state: saved, steps: [], resumed: true };
  } else if (options === null && !hasDemoParameter && saved !== null) {
    active = { state: saved, steps: [], resumed: true };
  } else if (options !== null) {
    if (saved !== null) clearRunState(storage);
    active = { state: freshState(options.demo, options.port, options.language), steps: [], resumed: false };
  }

  if (active === null) return;

  const client = new DemoClient(config.webSocket);
  try {
    await client.connect(active.state.port);
  } catch (error) {
    logger.warning("Could not connect to the screenshot tool; the demo remains inactive.", error);
    client.close();
    return;
  }

  try {
    if (active.resumed) {
      active = thisRun(active.state, config.registry, true);
    } else {
      active = await prepareFreshRun(active.state, client, config, storage);
    }

    const state = active.state;
    const executor = new StepExecutor(
      client,
      config.registry.customActions,
      document,
      (nextStep) => saveRunState({ ...state, nextStep }, storage),
    );
    for (let index = state.nextStep; index < active.steps.length; index += 1) {
      const step = active.steps[index];
      if (step === undefined) continue;
      await executor.execute(step, index);
      saveRunState({ ...state, nextStep: index + 1 }, storage);
    }

    await delay(END_HOLD_MS);
    client.sendEnded(state.demo);
    clearRunState(storage);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      client.sendError(message);
    } catch {
      // A disconnected socket cannot carry the error, but must not affect the host page.
    }
    clearRunState(storage);
    logger.error("Automation demo failed.", error);
  } finally {
    client.close();
  }
}

function thisRun(state: RunState, registry: DemoRegistry, resumed: true): ActiveRun {
  const steps = localizeSteps(state.configSteps ?? registry.get(state.demo).steps, state.texts);
  return { state, steps, resumed };
}

function freshState(demo: number, port: number, language: string | undefined): RunState {
  return {
    port,
    demo,
    ...(language === undefined ? {} : { language }),
    texts: {},
    configSteps: null,
    nextStep: 0,
  };
}

async function prepareFreshRun(
  requested: RunState,
  client: DemoClient,
  config: ConnectorConfig,
  storage: Storage | undefined,
): Promise<ActiveRun> {
  const start = await client.waitForStart();
  if (start.demo !== requested.demo) {
    throw new Error(`The tool started demo ${start.demo}, but the page requested demo ${requested.demo}.`);
  }

  const configSteps = start.steps.length === 0 ? null : parseSteps(start.steps);
  const selectedSteps = configSteps ?? config.registry.get(requested.demo).steps;
  const steps = localizeSteps(selectedSteps, start.texts);
  const state: RunState = {
    ...requested,
    ...(start.language === undefined ? {} : { language: start.language }),
    texts: start.texts,
    configSteps,
    nextStep: 0,
  };

  await config.onPrepare?.({
    demo: state.demo,
    ...(state.language === undefined ? {} : { language: state.language }),
    settings: start.settings,
  });
  saveRunState(state, storage);
  await delay(START_DELAY_MS);
  client.sendStarted(state.demo);
  return { state, steps, resumed: false };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
