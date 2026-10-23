import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WebRtcRealtimeTransport } from "../src/transport/webRtcRealtimeTransport";
import { buildRealtimeSessionPayload } from "../src/internal/session";

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
    sdp: "offer-sdp",
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
    text: vi.fn(async () => body),
  };
}

function setupTransportTest(): SetupResult {
  const peerConnections: MockPeerConnection[] = [];
  const track = {
    enabled: false,
    stop: vi.fn(),
  } as unknown as MediaStreamTrack & { stop: ReturnType<typeof vi.fn> };
  const getUserMediaMock = vi.fn(async () => ({
    getAudioTracks: () => [track],
  }));
  const fetchMock = vi.fn(async () => createFetchResponse("answer-sdp"));
  const onError = vi.fn();

  vi.stubGlobal("RTCPeerConnection", function MockRTCPeerConnection() {
    const connection = new MockPeerConnection();
    peerConnections.push(connection);
    return connection as unknown as RTCPeerConnection;
  } as unknown as typeof RTCPeerConnection);
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: getUserMediaMock,
    },
  });

  return {
    fetchMock,
    getUserMediaMock,
    onError,
    peerConnections,
    track,
    transport: new WebRtcRealtimeTransport(),
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
    auth: {
      type: "auth_token",
      authToken: "client-secret",
    },
    session: {
      model: "gpt-realtime-1.5",
      instructions: "test",
      tools: [],
      activationMode: "push-to-talk",
      outputMode: "tool-only",
    },
    audioPlaybackEnabled: false,
    ...(signal ? { signal } : {}),
    onServerEvent: vi.fn(),
    onError,
  });
}

function baseSession(activationMode: "push-to-talk" | "vad" = "push-to-talk") {
  return {
    model: "gpt-realtime-1.5",
    instructions: "test",
    tools: [],
    activationMode,
    outputMode: "tool-only" as const,
  };
}

async function connectAndOpen(
  transport: WebRtcRealtimeTransport,
  peerConnections: MockPeerConnection[],
  onError: any,
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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe.each(["input", "output"] as const)("%s audio format", (side) => {
    it.each([
      ["pcm16", { type: "audio/pcm", rate: 24000 }],
      ["g711_ulaw", { type: "audio/pcmu" }],
      ["g711_alaw", { type: "audio/pcma" }],
    ] as const)("serializes %s for session creation and updates", async (format, expected) => {
      const { fetchMock, onError, peerConnections, transport } = setupTransportTest();
      const session = { ...baseSession(), audio: { [side]: { format } } };
      const originalSession = JSON.stringify(session);
      const connectPromise = transport.connect({
        auth: { type: "session_endpoint", sessionEndpoint: "/session" },
        session,
        audioPlaybackEnabled: false,
        onServerEvent: vi.fn(),
        onError: onError as (error: Error) => void,
      });
      const peerConnection = getPeerConnection(peerConnections);
      peerConnection.dataChannel.open();

      try {
        await connectPromise;
        const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
        const body = requestInit.body as FormData;
        const createdSession = JSON.parse(body.get("session") as string);
        expect(createdSession.audio[side].format).toEqual(expected);

        const initialUpdate = JSON.parse(peerConnection.dataChannel.send.mock.calls[0]![0]);
        expect(initialUpdate.type).toBe("session.update");
        expect(initialUpdate.session.audio[side].format).toEqual(expected);

        peerConnection.dataChannel.send.mockClear();
        transport.updateSession(session);
        const laterUpdate = JSON.parse(peerConnection.dataChannel.send.mock.calls[0]![0]);
        expect(laterUpdate.type).toBe("session.update");
        expect(laterUpdate.session.audio[side].format).toEqual(expected);
        expect(JSON.stringify(session)).toBe(originalSession);
        expect(onError).not.toHaveBeenCalled();
      } finally {
        transport.disconnect();
      }
    });
  });

  it("leaves omitted formats and other audio settings unchanged", () => {
    const payload = buildRealtimeSessionPayload({
      ...baseSession(),
      audio: {
        input: { noiseReduction: { type: "near_field" }, transcription: { language: "en" } },
        output: { voice: "marin", speed: 1.1 },
      },
    });

    expect(payload.audio).toEqual({
      input: {
        noise_reduction: { type: "near_field" },
        transcription: { language: "en" },
        turn_detection: null,
      },
      output: { voice: "marin", speed: 1.1 },
    });
  });

  it("keeps raw audio overrides authoritative", () => {
    const audio = { output: { format: { type: "audio/pcmu" } } };
    const payload = buildRealtimeSessionPayload({
      ...baseSession(),
      audio: { input: { format: "pcm16" }, output: { format: "g711_alaw" } },
      raw: { audio },
    });

    expect(payload.audio).toEqual(audio);
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
      "Timed out waiting 15000ms for the Realtime data channel to open.",
    );

    await vi.advanceTimersByTimeAsync(15_000);

    await rejection;
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(peerConnection.close).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    ["close", "Realtime data channel closed before opening."],
    ["error", "Realtime data channel failed before opening."],
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
        message: "Realtime data channel closed during the active session.",
      }),
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
        message: "Realtime peer connection disconnected during the active session.",
      }),
    );
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(peerConnection.dataChannel.close).toHaveBeenCalledTimes(1);
    expect(peerConnection.close).toHaveBeenCalledTimes(1);
  });

  it("rejects insecure contexts before opening WebRTC resources", async () => {
    const { onError, peerConnections, transport } = setupTransportTest();

    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: false,
    });

    await expect(connect(transport, onError)).rejects.toThrow(
      "Voice control requires HTTPS or localhost because microphone access only works in secure contexts.",
    );
    expect(peerConnections).toHaveLength(0);
    expect(onError).not.toHaveBeenCalled();
  });

  it("rejects browsers without required WebRTC APIs", async () => {
    const transport = new WebRtcRealtimeTransport();
    const onError = vi.fn();

    vi.unstubAllGlobals();
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(window, "RTCPeerConnection", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });

    await expect(connect(transport, onError)).rejects.toThrow(
      "WebRTC voice control requires a browser with mediaDevices and RTCPeerConnection support.",
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it("posts direct auth-token requests to the Realtime calls endpoint", async () => {
    const { fetchMock, onError, peerConnections, transport } = setupTransportTest();

    const connectPromise = connect(transport, onError);
    const peerConnection = getPeerConnection(peerConnections);
    peerConnection.dataChannel.open();
    await connectPromise;

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/realtime/calls",
      expect.objectContaining({
        body: "offer-sdp",
        method: "POST",
      }),
    );

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(requestInit.headers).toMatchObject({
      Authorization: "Bearer client-secret",
      "Content-Type": "application/sdp",
    });
  });

  it("forwards parsed server events and surfaces malformed payloads", async () => {
    const { onError, peerConnections, transport } = setupTransportTest();
    const onServerEvent = vi.fn();

    const connectPromise = transport.connect({
      auth: {
        type: "auth_token",
        authToken: "client-secret",
      },
      session: baseSession(),
      audioPlaybackEnabled: false,
      onServerEvent,
      onError: onError as (error: Error) => void,
    });

    const peerConnection = getPeerConnection(peerConnections);
    peerConnection.dataChannel.open();
    await connectPromise;

    peerConnection.dataChannel.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify({ type: "response.created", response_id: "resp_123" }),
      }),
    );
    peerConnection.dataChannel.dispatchEvent(
      new MessageEvent("message", {
        data: "{not-json",
      }),
    );

    expect(onServerEvent).toHaveBeenCalledWith({
      type: "response.created",
      response_id: "resp_123",
    });
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(onError.mock.calls.at(-1)?.[0]).toBeInstanceOf(SyntaxError);
  });

  it("sends session updates, capture commands, responses, tool output, and audio toggles after connect", async () => {
    const { onError, peerConnections, track, transport } = setupTransportTest();
    const originalCreateElement = document.createElement.bind(document);
    let createdAudioElement: { muted: boolean } | null = null;

    vi.spyOn(document, "createElement").mockImplementation(((
      tagName: string,
      options?: ElementCreationOptions,
    ) => {
      const element = originalCreateElement(tagName, options);
      if (tagName === "audio") {
        createdAudioElement = element as HTMLAudioElement;
      }
      return element;
    }) as typeof document.createElement);
    const getCreatedAudioElement = () => {
      if (!createdAudioElement) {
        throw new Error("Expected the transport to create an audio element.");
      }

      return createdAudioElement;
    };

    const peerConnection = await connectAndOpen(transport, peerConnections, onError);

    expect(getCreatedAudioElement().muted).toBe(true);
    expect(track.enabled).toBe(false);

    transport.updateSession({
      ...baseSession("push-to-talk"),
      instructions: "updated instructions",
    });
    transport.startCapture();
    expect(track.enabled).toBe(true);
    transport.stopCapture();
    expect(track.enabled).toBe(false);
    transport.sendFunctionResult("call_123", { ok: true });
    transport.requestResponse();
    transport.sendClientEvent({
      type: "conversation.item.delete",
      item_id: "item_123",
    });
    transport.setAudioPlaybackEnabled(true);

    expect(getCreatedAudioElement().muted).toBe(false);
    expect(peerConnection.dataChannel.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "session.update",
        session: {
          type: "realtime",
          model: "gpt-realtime-1.5",
          instructions: "updated instructions",
          tool_choice: "auto",
          tools: [],
          output_modalities: ["text"],
          audio: {
            input: {
              turn_detection: null,
            },
          },
        },
      }),
    );
    expect(peerConnection.dataChannel.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "input_audio_buffer.clear" }),
    );
    expect(peerConnection.dataChannel.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "input_audio_buffer.commit" }),
    );
    expect(peerConnection.dataChannel.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "response.create" }),
    );
    expect(peerConnection.dataChannel.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: "call_123",
          output: JSON.stringify({ ok: true }),
        },
      }),
    );
    expect(peerConnection.dataChannel.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "conversation.item.delete",
        item_id: "item_123",
      }),
    );
  });

  it("posts SDP and serialized session payload to a session endpoint", async () => {
    const { fetchMock, onError, peerConnections, transport } = setupTransportTest();

    const connectPromise = transport.connect({
      auth: {
        type: "session_endpoint",
        sessionEndpoint: "/session",
        sessionRequestInit: {
          credentials: "include",
          headers: {
            "X-Demo": "1",
            "Content-Type": "text/plain",
          },
        },
      },
      session: {
        model: "gpt-realtime-1.5",
        instructions: "test",
        tools: [],
        activationMode: "push-to-talk",
        outputMode: "tool-only",
      },
      audioPlaybackEnabled: false,
      onServerEvent: vi.fn(),
      onError: onError as (error: Error) => void,
    });

    const peerConnection = getPeerConnection(peerConnections);
    peerConnection.dataChannel.open();
    await connectPromise;

    expect(fetchMock).toHaveBeenCalledWith(
      "/session",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(requestInit.headers).toBeInstanceOf(Headers);
    expect(new Headers(requestInit.headers).get("X-Demo")).toBe("1");
    expect(new Headers(requestInit.headers).get("Content-Type")).toBeNull();
    expect(requestInit.body).toBeInstanceOf(FormData);

    const body = requestInit.body as FormData;
    expect(body.get("sdp")).toBe("offer-sdp");
    expect(body.get("session")).toBe(
      JSON.stringify({
        type: "realtime",
        model: "gpt-realtime-1.5",
        instructions: "test",
        tool_choice: "auto",
        tools: [],
        output_modalities: ["text"],
        audio: {
          input: {
            turn_detection: null,
          },
        },
      }),
    );
  });

  it("surfaces session endpoint failures", async () => {
    const { fetchMock, onError, peerConnections, track, transport } = setupTransportTest();
    fetchMock.mockResolvedValueOnce(createFetchResponse("session failed", false));

    const connectPromise = transport.connect({
      auth: {
        type: "session_endpoint",
        sessionEndpoint: "/session",
      },
      session: {
        model: "gpt-realtime-1.5",
        instructions: "test",
        tools: [],
        activationMode: "push-to-talk",
        outputMode: "tool-only",
      },
      audioPlaybackEnabled: false,
      onServerEvent: vi.fn(),
      onError: onError as (error: Error) => void,
    });

    getPeerConnection(peerConnections);

    await expect(connectPromise).rejects.toThrow(
      "Failed to establish Realtime WebRTC session: session failed",
    );
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("rejects empty SDP answers from the session endpoint", async () => {
    const { fetchMock, onError, peerConnections, track, transport } = setupTransportTest();
    fetchMock.mockResolvedValueOnce(createFetchResponse("   "));

    const connectPromise = transport.connect({
      auth: {
        type: "session_endpoint",
        sessionEndpoint: "/session",
      },
      session: {
        model: "gpt-realtime-1.5",
        instructions: "test",
        tools: [],
        activationMode: "push-to-talk",
        outputMode: "tool-only",
      },
      audioPlaybackEnabled: false,
      onServerEvent: vi.fn(),
      onError: onError as (error: Error) => void,
    });

    const peerConnection = getPeerConnection(peerConnections);
    peerConnection.dataChannel.open();

    await expect(connectPromise).rejects.toThrow(
      "Failed to establish Realtime WebRTC session: empty SDP answer.",
    );
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(peerConnection.close).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("aborts an in-flight connect when the caller cancels it", async () => {
    const { getUserMediaMock, onError, peerConnections, transport } = setupTransportTest();
    const abortController = new AbortController();
    getUserMediaMock.mockImplementationOnce(
      () =>
        new Promise(() => {
          // Keep the permission request pending so the abort path is exercised.
        }),
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
