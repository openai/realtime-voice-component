import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";

import { MockRealtimeTransport } from "../src/transport/mockRealtimeTransport";
import type { UseVoiceControlInput, VoiceControlController } from "../src/types";
import { useVoiceControl } from "../src/useVoiceControl";
import { createVoiceControlController } from "../src/voiceControlController";

describe("useVoiceControl ownership in Strict Mode", () => {
  it.each([false, true])(
    "keeps an owned controller usable with autoConnect=%s",
    async (autoConnect) => {
      const transport = new MockRealtimeTransport();
      const getClientSecret = vi.fn(async () => "client-secret");
      const options = {
        auth: { getClientSecret },
        tools: [],
        autoConnect,
        transportFactory: () => transport,
      };
      const { result, unmount } = renderHook(() => useVoiceControl(options), {
        wrapper: StrictMode,
      });
      await act(async () => {
        if (!autoConnect) await result.current.connect();
      });
      expect(result.current.connected).toBe(true);
      expect(getClientSecret).toHaveBeenCalledTimes(1);
      expect(transport.sentClientEvents).not.toContainEqual({ type: "__disconnect" });

      unmount();
      await act(async () => {});
      expect(transport.sentClientEvents).toContainEqual({ type: "__disconnect" });
    },
  );

  it("does not destroy an external controller on unmount", async () => {
    const transport = new MockRealtimeTransport();
    const controller = createVoiceControlController({
      auth: { getClientSecret: async () => "client-secret" },
      tools: [],
      transportFactory: () => transport,
    });
    const { unmount } = renderHook(() => useVoiceControl(controller), { wrapper: StrictMode });
    unmount();
    await act(async () => {
      await controller.connect();
    });
    expect(controller.connected).toBe(true);
    controller.destroy();
  });

  it("disposes a replaced owned controller while keeping the external replacement", async () => {
    const options = { auth: { getClientSecret: async () => "client-secret" }, tools: [] };
    const external = createVoiceControlController(options);
    const { result, rerender, unmount } = renderHook(
      ({ input }: { input: UseVoiceControlInput }) => useVoiceControl(input),
      { initialProps: { input: options as UseVoiceControlInput }, wrapper: StrictMode },
    );
    const destroyOwned = vi.spyOn(result.current as VoiceControlController, "destroy");
    const destroyExternal = vi.spyOn(external, "destroy");
    rerender({ input: external });
    await act(async () => {});
    expect(destroyOwned).toHaveBeenCalled();
    expect(result.current).toBe(external);
    unmount();
    await act(async () => {});
    expect(destroyExternal).not.toHaveBeenCalled();
    external.destroy();
  });
});
