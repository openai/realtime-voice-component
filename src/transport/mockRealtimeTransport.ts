import { buildSessionUpdateEvent } from "../internal/session";
import type { RealtimeClientEvent, RealtimeServerEvent } from "../types";

import type { RealtimeTransport, TransportConnectOptions, TransportSessionConfig } from "./types";

export class MockRealtimeTransport implements RealtimeTransport {
  public sentClientEvents: unknown[] = [];
  public session: TransportSessionConfig | null = null;
  private onServerEvent: ((event: RealtimeServerEvent) => void) | null = null;
  private onError: ((error: Error) => void) | null = null;

  async connect(options: TransportConnectOptions): Promise<void> {
    this.onServerEvent = options.onServerEvent;
    this.onError = options.onError;
    this.session = options.session;
    this.sentClientEvents.push(buildSessionUpdateEvent(options.session));
  }

  disconnect(): void {
    this.onServerEvent = null;
    this.onError = null;
    this.session = null;
    this.sentClientEvents.push({ type: "__disconnect" });
  }

  updateSession(session: TransportSessionConfig): void {
    this.session = session;
    this.sentClientEvents.push(buildSessionUpdateEvent(session));
  }

  startCapture(): void {
    this.sentClientEvents.push({ type: "input_audio_buffer.clear" });
  }

  stopCapture(): void {
    this.sentClientEvents.push({ type: "input_audio_buffer.commit" });
    this.sentClientEvents.push({ type: "response.create" });
  }

  sendFunctionResult(callId: string, output: unknown): void {
    this.sentClientEvents.push({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(output)
      }
    });
  }

  requestResponse(): void {
    this.sentClientEvents.push({ type: "response.create" });
  }

  sendClientEvent(event: RealtimeClientEvent): void {
    this.sentClientEvents.push(event);
  }

  setAudioPlaybackEnabled(enabled: boolean): void {
    this.sentClientEvents.push({ type: "__audio", enabled });
  }

  emitServerEvent(event: RealtimeServerEvent): void {
    this.onServerEvent?.(event);
  }

  emitError(error: Error): void {
    this.onError?.(error);
  }
}
