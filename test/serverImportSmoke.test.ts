// @vitest-environment node

import { describe, expect, it } from "vitest";

describe("package entrypoint", () => {
  it("can be imported on the server without touching browser globals", async () => {
    const mod = await import("../src/index");

    expect(mod.createVoiceControlController).toBeTypeOf("function");
    expect(mod.defineVoiceTool).toBeTypeOf("function");
    expect(mod.useVoiceControl).toBeTypeOf("function");
    expect(mod.VoiceControlWidget).toBeTypeOf("function");
  });
});
