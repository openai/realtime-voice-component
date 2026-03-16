
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WebRtcRealtimeTransport } from "../src/transport/webRtcRealtimeTransport";

class MockDataChannel extends EventTarget {
  public readyState: RTCDataChannelState = "connecting";
  public send = vi.fn();
  public close = vi.fn(() => {
    if (this.readyState === "closed") {
      return;
    }

    this.readyState = "closed";
    this.dispatchEvent(new Event("close"));
  });

  open() {
    this.readyState = "open";
    this.dispatchEvent(new Event("open"));
  }

  emitError() {
    this.dispatchEvent(new Event("error"));
  }
}

class MockPeerConnection extends EventTarget {
  public connectionState: RTCPeerConnectionState = "new";
  public localDescription: RTCSessionDescriptionInit | null = null;
  public ontrack: ((event: RTCTrackEvent) => void) | null = null;
  public dataChannel = new MockDataChannel();
  public addTrack = vi.fn();
  public createDataChannel = vi.fn(() => this.dataChannel as unknown as RTCDataChannel);
  public createOffer = vi.fn(async () => ({
    type: "offer" as const,
    sdp: "offer-sdp"
  }));
  public setLocalDescription = vi.fn(async (description: RTCSessionDescriptionInit) => {
    this.localDescription = description;
  });
  public setRemoteDescription = vi.fn(async (_description: RTCSessionDescriptionInit) => {});
  public close = vi.fn(() => {
    if (this.connectionState === "closed") {
      return;
    }

    this.connectionState = "closed";
    this.dispatchEvent(new Event("connectionstatechange"));
  });
}

type SetupResult = {
  fetchMock: ReturnType<typeof vi.fn>;
  getUserMediaMock: ReturnType<typeof vi.fn>;
  onError: ReturnType<typeof vi.fn>;
  peerConnections: MockPeerConnection[];
  track: MediaStreamTrack & { stop: ReturnType<typeof vi.fn> };
  transport: WebRtcRealtimeTransport;
};

function createFetchResponse(body: string, ok = true) {
  return {
    ok,
    text: vi.fn(async () => body)
  };
}

function setupTransportTest(): SetupResult {
  const peerConnections: MockPeerConnection[] = [];
  const track = {
    enabled: false,
    stop: vi.fn()
  } as unknown as MediaStreamTrack & { stop: ReturnType<typeof vi.fn> };
  const getUserMediaMock = vi.fn(async () => ({
    getAudioTracks: () => [track]
  }));
  const fetchMock = vi.fn(async () => createFetchResponse("answer-sdp"));
  const onError = vi.fn();

  vi.stubGlobal(
    "RTCPeerConnection",
    function MockRTCPeerConnection() {
      const connection = new MockPeerConnection();
      peerConnections.push(connection);
      return connection as unknown as RTCPeerConnection;
    } as unknown as typeof RTCPeerConnection
  );
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: getUserMediaMock
    }
  });

  return {
    fetchMock,
    getUserMediaMock,
    onError,
    peerConnections,
    track,
    transport: new WebRtcRealtimeTransport()
  };
}

function getPeerConnection(peerConnections: MockPeerConnection[]) {
  const peerConnection = peerConnections[0];

  if (!peerConnection) {
    throw new Error("Expected a peer connection to be created.");
  }

  return peerConnection;
}

function connect(transport: WebRtcRealtimeTransport, onError: any, signal?: AbortSignal) {
  return transport.connect({
    authToken: "client-secret",
    model: "gpt-realtime-1.5",
    session: {
      model: "gpt-realtime-1.5",
      instructions: "test",
      tools: [],
      activationMode: "push-to-talk",
      outputMode: "tool-only"
    },
    audioPlaybackEnabled: false,
    ...(signal ? { signal } : {}),
    onServerEvent: vi.fn(),
    onError
  });
}

async function connectAndOpen(
  transport: WebRtcRealtimeTransport,
  peerConnections: MockPeerConnection[],
  onError: any
) {
  const connectPromise = connect(transport, onError);
  const peerConnection = getPeerConnection(peerConnections);
  peerConnection.dataChannel.open();
  await connectPromise;
  return peerConnection;
}

describe("WebRtcRealtimeTransport", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("cleans up RTC resources when connect fails after media capture", async () => {
    const { onError, peerConnections, track, transport } = setupTransportTest();

    const connectPromise = connect(transport, onError);
    const peerConnection = getPeerConnection(peerConnections);

    peerConnection.setRemoteDescription = vi.fn(async () => {
      throw new Error("remote description failed");
    });

    await expect(connectPromise).rejects.toThrow("remote description failed");
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(peerConnection.close).toHaveBeenCalledTimes(1);
    expect(peerConnection.dataChannel.close).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("rejects stalled data-channel handshakes after 15 seconds", async () => {
    vi.useFakeTimers();

    const { onError, peerConnections, track, transport } = setupTransportTest();

    const connectPromise = connect(transport, onError);
    const peerConnection = getPeerConnection(peerConnections);
    const rejection = expect(connectPromise).rejects.toThrow(
      "Timed out waiting 15000ms for the Realtime data channel to open."
    );

    await vi.advanceTimersByTimeAsync(15_000);

    await rejection;
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(peerConnection.close).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    ["close", "Realtime data channel closed before opening."],
    ["error", "Realtime data channel failed before opening."]
  ] as const)("rejects %s events before open and cleans up", async (eventType, message) => {
    const { onError, peerConnections, track, transport } = setupTransportTest();

    const connectPromise = connect(transport, onError);
    const peerConnection = getPeerConnection(peerConnections);

    if (eventType === "close") {
      peerConnection.dataChannel.close();
    } else {
      peerConnection.dataChannel.emitError();
    }

    await expect(connectPromise).rejects.toThrow(message);
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(peerConnection.close).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports data-channel closure after connect and cleans up", async () => {
    const { onError, peerConnections, track, transport } = setupTransportTest();
    const peerConnection = await connectAndOpen(transport, peerConnections, onError);

    peerConnection.dataChannel.close();

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Realtime data channel closed during the active session."
      })
    );
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(peerConnection.close).toHaveBeenCalledTimes(1);
  });

  it("reports peer disconnection after connect and cleans up", async () => {
    const { onError, peerConnections, track, transport } = setupTransportTest();
    const peerConnection = await connectAndOpen(transport, peerConnections, onError);

    peerConnection.connectionState = "disconnected";
    peerConnection.dispatchEvent(new Event("connectionstatechange"));

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Realtime peer connection disconnected during the active session."
      })
    );
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(peerConnection.dataChannel.close).toHaveBeenCalledTimes(1);
    expect(peerConnection.close).toHaveBeenCalledTimes(1);
  });

  it("aborts an in-flight connect when the caller cancels it", async () => {
    const { getUserMediaMock, onError, peerConnections, transport } = setupTransportTest();
    const abortController = new AbortController();
    getUserMediaMock.mockImplementationOnce(
      () =>
        new Promise(() => {
          // Keep the permission request pending so the abort path is exercised.
        })
    );

    const connectPromise = connect(transport, onError, abortController.signal);
    const peerConnection = getPeerConnection(peerConnections);

    abortController.abort();

    await expect(connectPromise).rejects.toThrow("Voice control connection was cancelled.");
    expect(peerConnection.dataChannel.close).toHaveBeenCalledTimes(1);
    expect(peerConnection.close).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });
});
