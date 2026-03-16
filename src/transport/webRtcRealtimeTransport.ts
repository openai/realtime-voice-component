import { buildSessionUpdateEvent } from "../internal/session";
import type { ActivationMode, RealtimeClientEvent, RealtimeServerEvent } from "../types";

import type { RealtimeTransport, TransportConnectOptions, TransportSessionConfig } from "./types";

type RealtimePeerState = {
  audioElement: HTMLAudioElement | null;
  dataChannel: RTCDataChannel | null;
  localTrack: MediaStreamTrack | null;
  peerConnection: RTCPeerConnection | null;
  session: TransportSessionConfig | null;
};

const DATA_CHANNEL_OPEN_TIMEOUT_MS = 15_000;

type TransportError = Error & {
  code?: string;
};

function invariantBrowserApi(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function createTransportError(
  message: string,
  options?: {
    code?: string;
    name?: string;
  }
) {
  const error = new Error(message) as TransportError;

  if (options?.code) {
    error.code = options.code;
  }

  if (options?.name) {
    error.name = options.name;
  }

  return error;
}

function createAbortError() {
  return createTransportError("Voice control connection was cancelled.", {
    code: "aborted",
    name: "AbortError"
  });
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

async function withAbort<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
  onResolvedAfterAbort?: (value: T) => void
): Promise<T> {
  throwIfAborted(signal);

  if (!signal) {
    return promise;
  }

  return await new Promise<T>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      signal.removeEventListener("abort", handleAbort);
    };

    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      callback();
    };

    const handleAbort = () => {
      settle(() => {
        reject(createAbortError());
      });
    };

    signal.addEventListener("abort", handleAbort, { once: true });

    void promise.then(
      (value) => {
        if (signal.aborted) {
          onResolvedAfterAbort?.(value);
          settle(() => {
            reject(createAbortError());
          });
          return;
        }

        settle(() => {
          resolve(value);
        });
      },
      (error) => {
        settle(() => {
          reject(error);
        });
      }
    );
  });
}

function waitForDataChannelOpen(
  dataChannel: RTCDataChannel,
  peerConnection: RTCPeerConnection,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      settle(
        new Error(
          `Timed out waiting ${DATA_CHANNEL_OPEN_TIMEOUT_MS}ms for the Realtime data channel to open.`
        )
      );
    }, DATA_CHANNEL_OPEN_TIMEOUT_MS);

    const cleanup = () => {
      dataChannel.removeEventListener("open", handleOpen);
      dataChannel.removeEventListener("error", handleError);
      dataChannel.removeEventListener("close", handleClose);
      peerConnection.removeEventListener("connectionstatechange", handleConnectionStateChange);
      signal?.removeEventListener("abort", handleAbort);

      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const settle = (error?: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();

      if (error) {
        reject(error);
        return;
      }

      resolve();
    };

    const handleOpen = () => {
      settle();
    };

    const handleAbort = () => {
      settle(createAbortError());
    };

    const handleError = () => {
      settle(new Error("Realtime data channel failed before opening."));
    };

    const handleClose = () => {
      settle(new Error("Realtime data channel closed before opening."));
    };

    const handleConnectionStateChange = () => {
      switch (peerConnection.connectionState) {
        case "failed":
        case "closed":
        case "disconnected":
          settle(
            new Error(
              `Realtime peer connection ${peerConnection.connectionState} before the data channel opened.`
            )
          );
          break;
        default:
          break;
      }
    };

    dataChannel.addEventListener("open", handleOpen, { once: true });
    dataChannel.addEventListener("error", handleError, { once: true });
    dataChannel.addEventListener("close", handleClose, { once: true });
    peerConnection.addEventListener("connectionstatechange", handleConnectionStateChange);
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

export class WebRtcRealtimeTransport implements RealtimeTransport {
  private state: RealtimePeerState = {
    audioElement: null,
    dataChannel: null,
    localTrack: null,
    peerConnection: null,
    session: null
  };

  private onServerEvent: ((event: RealtimeServerEvent) => void) | null = null;
  private onError: ((error: Error) => void) | null = null;
  private isCapturing = false;
  private isDisconnecting = false;
  private hasOpenedDataChannel = false;

  async connect(options: TransportConnectOptions): Promise<void> {
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      throw createTransportError(
        "Voice control requires HTTPS or localhost because microphone access only works in secure contexts.",
        {
          code: "insecure_context",
          name: "NotAllowedError"
        }
      );
    }

    invariantBrowserApi(
      typeof window !== "undefined" &&
        "RTCPeerConnection" in window &&
        navigator?.mediaDevices?.getUserMedia,
      "WebRTC voice control requires a browser with mediaDevices and RTCPeerConnection support.",
    );

    this.disconnect();
    throwIfAborted(options.signal);

    let openPromise: Promise<void> | null = null;

    try {
      this.onServerEvent = options.onServerEvent;
      this.onError = options.onError;
      this.state.session = options.session;
      this.state.audioElement = document.createElement("audio");
      this.state.audioElement.autoplay = true;
      this.state.audioElement.muted = !options.audioPlaybackEnabled;

      const peerConnection = new RTCPeerConnection();
      this.state.peerConnection = peerConnection;

      peerConnection.ontrack = (event) => {
        if (this.state.audioElement) {
          this.state.audioElement.srcObject = event.streams[0] ?? null;
        }
      };

      const dataChannel = peerConnection.createDataChannel("oai-events");
      this.state.dataChannel = dataChannel;

      dataChannel.addEventListener("message", (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as RealtimeServerEvent;
          this.onServerEvent?.(payload);
        } catch (error) {
          this.onError?.(
            error instanceof Error ? error : new Error("Invalid Realtime event payload.")
          );
        }
      });

      dataChannel.addEventListener("error", () => {
        if (this.hasOpenedDataChannel) {
          this.handleRuntimeFailure("Realtime data channel error during the active session.");
        }
      });
      dataChannel.addEventListener("close", () => {
        if (this.hasOpenedDataChannel) {
          this.handleRuntimeFailure("Realtime data channel closed during the active session.");
        }
      });

      peerConnection.addEventListener("connectionstatechange", () => {
        if (!this.hasOpenedDataChannel) {
          return;
        }

        switch (peerConnection.connectionState) {
          case "failed":
          case "closed":
          case "disconnected":
            this.handleRuntimeFailure(
              `Realtime peer connection ${peerConnection.connectionState} during the active session.`
            );
            break;
          default:
            break;
        }
      });

      openPromise = waitForDataChannelOpen(dataChannel, peerConnection, options.signal).then(() => {
        this.hasOpenedDataChannel = true;

        if (this.state.session) {
          this.sendClientEventInternal(buildSessionUpdateEvent(this.state.session));
          this.applyTrackMode(this.state.session.activationMode);
        }
      });
      void openPromise.catch(() => {});

      const mediaStream = await withAbort(
        navigator.mediaDevices.getUserMedia({ audio: true }),
        options.signal,
        (stream) => {
          stream.getTracks().forEach((track) => track.stop());
        }
      );
      const [localTrack] = mediaStream.getAudioTracks();
      this.state.localTrack = localTrack ?? null;

      if (localTrack) {
        peerConnection.addTrack(localTrack, mediaStream);
      }

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      const sdp = peerConnection.localDescription?.sdp;
      if (!sdp) {
        throw new Error("Failed to generate a local SDP offer.");
      }

      const response = await withAbort(
        fetch("https://api.openai.com/v1/realtime/calls", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.authToken}`,
            "Content-Type": "application/sdp"
          },
          body: sdp,
          ...(options.signal ? { signal: options.signal } : {})
        }),
        options.signal
      );

      if (!response.ok) {
        const details = await withAbort(response.text(), options.signal);
        throw new Error(`Failed to establish Realtime WebRTC session: ${details}`);
      }

      const answerSdp = await withAbort(response.text(), options.signal);
      await withAbort(
        peerConnection.setRemoteDescription({
          type: "answer",
          sdp: answerSdp
        }),
        options.signal
      );

      await openPromise;
      throwIfAborted(options.signal);
    } catch (error) {
      this.disconnect();
      throw error;
    }
  }

  disconnect(): void {
    if (this.isDisconnecting) {
      return;
    }

    this.isDisconnecting = true;
    this.state.localTrack?.stop();

    if (this.state.dataChannel && this.state.dataChannel.readyState !== "closed") {
      this.state.dataChannel.close();
    }

    if (this.state.peerConnection && this.state.peerConnection.connectionState !== "closed") {
      this.state.peerConnection.close();
    }

    this.state.audioElement?.remove();

    this.state = {
      audioElement: null,
      dataChannel: null,
      localTrack: null,
      peerConnection: null,
      session: null
    };
    this.isCapturing = false;
    this.hasOpenedDataChannel = false;
    this.onServerEvent = null;
    this.onError = null;
    this.isDisconnecting = false;
  }

  updateSession(session: TransportSessionConfig): void {
    this.state.session = session;
    if (this.state.dataChannel?.readyState === "open") {
      this.sendClientEventInternal(buildSessionUpdateEvent(session));
      this.applyTrackMode(session.activationMode);
    }
  }

  startCapture(): void {
    if (!this.state.session || this.state.session.activationMode === "vad") {
      return;
    }

    this.sendClientEventInternal({ type: "input_audio_buffer.clear" });
    this.isCapturing = true;
    if (this.state.localTrack) {
      this.state.localTrack.enabled = true;
    }
  }

  stopCapture(): void {
    if (!this.state.session || this.state.session.activationMode === "vad" || !this.isCapturing) {
      return;
    }

    this.isCapturing = false;
    if (this.state.localTrack) {
      this.state.localTrack.enabled = false;
    }
    this.sendClientEventInternal({ type: "input_audio_buffer.commit" });
    this.sendClientEventInternal({ type: "response.create" });
  }

  sendFunctionResult(callId: string, output: unknown): void {
    this.sendClientEventInternal({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(output)
      }
    });
  }

  requestResponse(): void {
    this.sendClientEventInternal({ type: "response.create" });
  }

  sendClientEvent(event: RealtimeClientEvent): void {
    this.sendClientEventInternal(event);
  }

  setAudioPlaybackEnabled(enabled: boolean): void {
    if (this.state.audioElement) {
      this.state.audioElement.muted = !enabled;
    }
  }

  private handleRuntimeFailure(message: string): void {
    if (this.isDisconnecting) {
      return;
    }

    const onError = this.onError;
    this.disconnect();
    onError?.(new Error(message));
  }

  private applyTrackMode(mode: ActivationMode): void {
    if (!this.state.localTrack) {
      return;
    }

    if (mode === "vad") {
      this.state.localTrack.enabled = true;
      return;
    }

    this.state.localTrack.enabled = this.isCapturing;
  }

  private sendClientEventInternal(event: unknown): void {
    if (this.state.dataChannel?.readyState === "open") {
      this.state.dataChannel.send(JSON.stringify(event));
    }
  }
}

export function createWebRtcRealtimeTransport(): RealtimeTransport {
  return new WebRtcRealtimeTransport();
}
