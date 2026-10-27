import { describe, expect, it, vi } from "vitest";
import { logger } from "../../src/logger.js";
import { readDemoOptions } from "../../src/demo_options.js";

describe("readDemoOptions", () => {
  it("returns null when no automation demo is requested", () => {
    expect(readDemoOptions("?other=value")).toBeNull();
  });

  it("reads the demo, port, optional language and ignores extra parameters", () => {
    expect(
      readDemoOptions("?other=value&automation-demo=12&automation-demo-port=4567&automation-demo-language=de"),
    ).toEqual({ demo: 12, port: 4567, language: "de" });
  });

  it("omits language when it is absent", () => {
    expect(readDemoOptions("?automation-demo=2&automation-demo-port=80")).toEqual({ demo: 2, port: 80 });
  });

  it.each([
    ["zero demo", "?automation-demo=0&automation-demo-port=80"],
    ["non-integer demo", "?automation-demo=1.5&automation-demo-port=80"],
    ["missing port", "?automation-demo=1"],
    ["zero port", "?automation-demo=1&automation-demo-port=0"],
    ["port above range", "?automation-demo=1&automation-demo-port=65536"],
    ["non-integer port", "?automation-demo=1&automation-demo-port=abc"],
  ])("warns and returns null for a %s", (_label, search) => {
    const warning = vi.spyOn(logger, "warning").mockImplementation(() => {});
    expect(readDemoOptions(search)).toBeNull();
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();
  });
});
