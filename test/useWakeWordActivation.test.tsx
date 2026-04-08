import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useWakeWordActivation } from "../demo/src/demos/shared/wakeWord";

type MockPorcupineState = {
  error: Error | null;
  init: ReturnType<typeof vi.fn>;
  isLoaded: boolean;
  isListening: boolean;
  keywordDetection: { label: string } | null;
  release: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

let porcupineState: MockPorcupineState;

vi.mock("@picovoice/porcupine-react", () => ({
  usePorcupine: () => porcupineState
}));

function Harness({
  canActivateWidget,
  enabled,
  onWakeWord
}: {
  canActivateWidget: boolean;
  enabled: boolean;
  onWakeWord: (label: string) => boolean;
}) {
  useWakeWordActivation({
    enabled,
    canActivateWidget,
    onWakeWord
  });

  return null;
}

describe("useWakeWordActivation", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_PICOVOICE_ACCESS_KEY", "test-access-key");

    porcupineState = {
      error: null,
      init: vi.fn(async () => {}),
      isLoaded: true,
      isListening: true,
      keywordDetection: null,
      release: vi.fn(async () => {}),
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {})
    };

    global.fetch = vi.fn(async () => ({
      headers: new Headers([["content-type", "application/octet-stream"]]),
      ok: true,
      status: 200
    })) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("stops Porcupine after wake-word activation succeeds so WebRTC can take over the mic", async () => {
    const onWakeWord = vi.fn(() => true);
    porcupineState.keywordDetection = { label: "Hey Chappie" };

    render(
      <Harness
        canActivateWidget
        enabled
        onWakeWord={onWakeWord}
      />
    );

    await waitFor(() => {
      expect(onWakeWord).toHaveBeenCalledWith("Hey Chappie");
      expect(porcupineState.stop).toHaveBeenCalled();
    });
  });

  it("keeps wake-word listening paused while the widget cannot be activated", async () => {
    const onWakeWord = vi.fn(() => false);

    render(
      <Harness
        canActivateWidget={false}
        enabled
        onWakeWord={onWakeWord}
      />
    );

    await waitFor(() => {
      expect(porcupineState.stop).toHaveBeenCalled();
      expect(porcupineState.start).not.toHaveBeenCalled();
    });
  });

  it("does not replay the same detection when activation becomes available later", async () => {
    const onWakeWord = vi.fn(() => true);
    const staleDetection = { label: "Hey Chappie" };
    porcupineState.keywordDetection = staleDetection;

    const { rerender } = render(
      <Harness
        canActivateWidget={false}
        enabled
        onWakeWord={onWakeWord}
      />
    );

    await waitFor(() => {
      expect(porcupineState.stop).toHaveBeenCalled();
    });
    expect(onWakeWord).not.toHaveBeenCalled();

    rerender(
      <Harness
        canActivateWidget
        enabled
        onWakeWord={onWakeWord}
      />
    );

    await waitFor(() => {
      expect(porcupineState.start).not.toHaveBeenCalled();
    });
    expect(onWakeWord).not.toHaveBeenCalled();
  });

  it("does not initialize Porcupine when the required asset files are missing", async () => {
    const onWakeWord = vi.fn(() => true);
    porcupineState.isLoaded = false;
    porcupineState.isListening = false;
    global.fetch = vi
      .fn(async () => ({
        ok: false,
        status: 404,
      }))
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      }) as unknown as typeof fetch;

    render(
      <Harness
        canActivateWidget
        enabled
        onWakeWord={onWakeWord}
      />,
    );

    await waitFor(() => {
      expect(porcupineState.init).not.toHaveBeenCalled();
      expect(porcupineState.start).not.toHaveBeenCalled();
    });
    expect(onWakeWord).not.toHaveBeenCalled();
  });

  it("treats HTML fallback responses as missing Porcupine assets", async () => {
    const onWakeWord = vi.fn(() => true);
    global.fetch = vi.fn(async () => ({
      headers: new Headers([["content-type", "text/html"]]),
      ok: true,
      status: 200,
    })) as unknown as typeof fetch;

    render(
      <Harness
        canActivateWidget
        enabled
        onWakeWord={onWakeWord}
      />,
    );

    await waitFor(() => {
      expect(porcupineState.init).not.toHaveBeenCalled();
    });
    expect(onWakeWord).not.toHaveBeenCalled();
  });
});
