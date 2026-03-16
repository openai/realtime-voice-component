import type {
  ActivationMode,
  OutputMode,
  RealtimeAudioConfig,
  RealtimeClientEvent,
  RealtimeFunctionTool,
  RealtimeModel,
  RealtimePrompt,
  RealtimeServerEvent,
  RealtimeSessionInclude,
  RealtimeToolChoice,
  RealtimeTracing,
  RealtimeTruncation
} from "../types";

export type TransportSessionConfig = {
  model: RealtimeModel;
  instructions: string;
  tools: RealtimeFunctionTool[];
  activationMode: ActivationMode;
  outputMode: OutputMode;
  audio?: RealtimeAudioConfig;
  include?: RealtimeSessionInclude[];
  maxOutputTokens?: number | "inf";
  metadata?: Record<string, unknown>;
  prompt?: RealtimePrompt;
  toolChoice?: RealtimeToolChoice;
  tracing?: RealtimeTracing | null;
  truncation?: RealtimeTruncation;
  raw?: Record<string, unknown>;
};

export type TransportConnectOptions = {
  authToken: string;
  model: RealtimeModel;
  session: TransportSessionConfig;
  audioPlaybackEnabled: boolean;
  signal?: AbortSignal;
  onServerEvent: (event: RealtimeServerEvent) => void;
  onError: (error: Error) => void;
};

export interface RealtimeTransport {
  connect(options: TransportConnectOptions): Promise<void>;
  disconnect(): void;
  updateSession(session: TransportSessionConfig): void;
  startCapture(): void;
  stopCapture(): void;
  sendFunctionResult(callId: string, output: unknown): void;
  requestResponse(): void;
  sendClientEvent(event: RealtimeClientEvent): void;
  setAudioPlaybackEnabled(enabled: boolean): void;
}
