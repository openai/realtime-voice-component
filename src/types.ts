import type { RealtimeTransport } from "./transport/types";

export type JsonSchema = {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema | JsonSchema[];
  required?: readonly string[];
  enum?: readonly unknown[];
  additionalProperties?: boolean | JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  [key: string]: unknown;
};

export type RealtimeServerEvent = {
  type: string;
  [key: string]: unknown;
};

export type ToolCallStatus = "running" | "success" | "error" | "skipped";

export type ActivationMode = "push-to-talk" | "vad";

export type OutputMode = "tool-only" | "text" | "audio" | "text+audio";

export type KnownRealtimeModel =
  | "gpt-realtime"
  | "gpt-realtime-1.5"
  | "gpt-realtime-mini"

export type RealtimeModel = KnownRealtimeModel | (string & {});

export type RealtimeAudioFormat = "pcm16" | "g711_ulaw" | "g711_alaw";

export type KnownRealtimeVoice =
  | "alloy"
  | "ash"
  | "ballad"
  | "cedar"
  | "coral"
  | "echo"
  | "marin"
  | "sage"
  | "shimmer"
  | "verse";

export type RealtimeVoice = KnownRealtimeVoice | (string & {});

export type KnownRealtimeTranscriptionModel =
  | "gpt-4o-transcribe"
  | "gpt-4o-mini-transcribe"
  | "whisper-1";

export type RealtimeTranscriptionModel =
  | KnownRealtimeTranscriptionModel
  | (string & {});

export type RealtimeNoiseReductionType = "near_field" | "far_field";

export type RealtimeSessionInclude = "item.input_audio_transcription.logprobs";

export type RealtimePrompt = {
  id: string;
  version?: string;
  variables?: Record<string, unknown>;
};

export type RealtimeInputAudioTranscription = {
  language?: string;
  model?: RealtimeTranscriptionModel;
  prompt?: string;
};

export type RealtimeInputAudioNoiseReduction = {
  type?: RealtimeNoiseReductionType;
};

export type RealtimeServerVadTurnDetection = {
  type: "server_vad";
  createResponse?: boolean;
  idleTimeoutMs?: number;
  interruptResponse?: boolean;
  prefixPaddingMs?: number;
  silenceDurationMs?: number;
  threshold?: number;
};

export type RealtimeSemanticVadTurnDetection = {
  type: "semantic_vad";
  createResponse?: boolean;
  eagerness?: "low" | "medium" | "high" | "auto";
  interruptResponse?: boolean;
};

export type RealtimeTurnDetection =
  | RealtimeServerVadTurnDetection
  | RealtimeSemanticVadTurnDetection;

export type RealtimeAudioInputConfig = {
  format?: RealtimeAudioFormat;
  noiseReduction?: RealtimeInputAudioNoiseReduction | null;
  transcription?: RealtimeInputAudioTranscription | null;
  turnDetection?: RealtimeTurnDetection | null;
};

export type RealtimeAudioOutputConfig = {
  format?: RealtimeAudioFormat;
  speed?: number;
  voice?: RealtimeVoice;
};

export type RealtimeAudioConfig = {
  input?: RealtimeAudioInputConfig;
  output?: RealtimeAudioOutputConfig;
};

export type RealtimeToolChoice =
  | "none"
  | "auto"
  | "required"
  | {
      type: "function";
      name: string;
    }
  | {
      type: "mcp";
      serverLabel: string;
      name?: string;
    };

export type RealtimeTracing =
  | "auto"
  | {
      groupId?: string;
      metadata?: Record<string, unknown>;
      workflowName?: string;
    };

export type RealtimeTruncation =
  | "auto"
  | "disabled"
  | {
      type: "retention_ratio";
      retentionRatio: number;
    };

export type RealtimeClientEvent = {
  type: string;
  [key: string]: unknown;
};

export type VoiceControlActivity =
  | "idle"
  | "connecting"
  | "listening"
  | "processing"
  | "executing"
  | "error";

export type VoiceControlErrorCode =
  | "aborted"
  | "device_unavailable"
  | "insecure_context"
  | "network_error"
  | "permission_denied"
  | "media_timeout"
  | "unknown"
  | "unsupported_browser";

export type VoiceControlError = {
  code?: VoiceControlErrorCode;
  message: string;
  cause?: unknown;
};

export type ToolCallEvent = {
  callId: string;
  name: string;
  args: unknown;
};

export type VoiceToolCallRecord = {
  id: string;
  responseId?: string;
  sequence: number;
  name: string;
  status: ToolCallStatus;
  args?: unknown;
  output?: unknown;
  error?: VoiceControlError;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
};

export type ToolCallResultEvent = ToolCallEvent & {
  output: unknown;
};

export type ToolCallErrorEvent = ToolCallEvent & {
  error: VoiceControlError;
};

export type VoiceControlLocalEvent =
  | { type: "voice.transport.connected" }
  | { type: "voice.transport.disconnected" }
  | { type: "voice.capture.started" }
  | { type: "voice.capture.stopped" }
  | { type: "voice.no_action"; message: string }
  | ({ type: "voice.tool.started" } & ToolCallEvent)
  | ({ type: "voice.tool.succeeded" } & ToolCallResultEvent)
  | ({ type: "voice.tool.failed" } & ToolCallErrorEvent);

export type VoiceControlEvent = VoiceControlLocalEvent | RealtimeServerEvent;

export type RealtimeFunctionTool = {
  type: "function";
  name: string;
  description: string;
  parameters: JsonSchema;
};

export type ZodLikeSchema<TArgs = unknown> = {
  parse: (input: unknown) => TArgs;
  safeParse: (input: unknown) => unknown;
};

export type VoiceToolDefinition<TArgs = unknown> = {
  name: string;
  description: string;
  parameters: ZodLikeSchema<TArgs>;
  execute: (args: TArgs) => Promise<unknown> | unknown;
};

export type VoiceTool<TArgs = unknown> = VoiceToolDefinition<TArgs> & {
  jsonSchema: JsonSchema;
  realtimeTool: RealtimeFunctionTool;
  parseArguments: (rawArgs: string) => TArgs;
};

export type VoiceControlRealtimeSessionOptions = {
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

export type VoiceControlRealtimeSessionPatch = {
  audio?: RealtimeAudioConfig | null;
  include?: RealtimeSessionInclude[] | null;
  maxOutputTokens?: number | "inf" | null;
  metadata?: Record<string, unknown> | null;
  prompt?: RealtimePrompt | null;
  toolChoice?: RealtimeToolChoice | null;
  tracing?: RealtimeTracing | null;
  truncation?: RealtimeTruncation | null;
  raw?: Record<string, unknown> | null;
};

export type VoiceControlResolvedSessionConfig = {
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

export type UseVoiceControlOptions = {
  auth:
    | { getClientSecret: () => Promise<string> }
    | { tokenEndpoint: string; tokenRequestInit?: RequestInit };
  tools: VoiceTool<any>[];
  instructions?: string;
  model?: RealtimeModel;
  activationMode?: ActivationMode;
  outputMode?: OutputMode;
  session?: VoiceControlRealtimeSessionOptions;
  audio?: RealtimeAudioConfig;
  include?: RealtimeSessionInclude[];
  maxOutputTokens?: number | "inf";
  prompt?: RealtimePrompt;
  toolChoice?: RealtimeToolChoice;
  tracing?: RealtimeTracing | null;
  truncation?: RealtimeTruncation;
  postToolResponse?: boolean;
  autoConnect?: boolean;
  debug?: boolean;
  maxToolCallHistory?: number | null;
  onEvent?: (event: VoiceControlEvent) => void;
  onToolStart?: (call: ToolCallEvent) => void;
  onToolSuccess?: (call: ToolCallResultEvent) => void;
  onToolError?: (call: ToolCallErrorEvent) => void;
  onError?: (error: VoiceControlError) => void;
  transportFactory?: () => RealtimeTransport;
};

export type VoiceControlStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "listening"
  | "processing"
  | "error";

export type VoiceControlSnapshot = {
  status: VoiceControlStatus;
  activity: VoiceControlActivity;
  connected: boolean;
  transcript: string;
  toolCalls: VoiceToolCallRecord[];
  latestToolCall: VoiceToolCallRecord | null;
  sessionConfig: VoiceControlResolvedSessionConfig;
};

export type UseVoiceControlReturn = VoiceControlSnapshot & {
  clearToolCalls: () => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  startCapture: () => void;
  stopCapture: () => void;
  updateInstructions: (instructions: string) => void;
  updateTools: (tools: VoiceTool<any>[]) => void;
  updateSession: (patch: VoiceControlRealtimeSessionPatch) => void;
  requestResponse: () => void;
  sendClientEvent: (event: RealtimeClientEvent) => void;
};

export type VoiceControlController = UseVoiceControlReturn & {
  configure: (options: UseVoiceControlOptions) => void;
  destroy: () => void;
  getSnapshot: () => VoiceControlSnapshot;
  subscribe: (listener: () => void) => () => void;
};

export type UseVoiceControlInput = UseVoiceControlOptions | VoiceControlController;

export type VoiceControlWidgetLabels = {
  launcher: string;
  disconnected: string;
};

export type VoiceControlWidgetLayout = "floating" | "inline";

export type VoiceControlWidgetCorner =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type VoiceControlWidgetPart =
  | "root"
  | "overlay"
  | "launcher"
  | "launcher-toast"
  | "launcher-action"
  | "launcher-status"
  | "launcher-label"
  | "launcher-handle"
  | "launcher-separator"
  | "launcher-core"
  | "launcher-indicator"
  | "launcher-drag-glyph";

export type VoiceControlWidgetPartClassNames = Partial<Record<VoiceControlWidgetPart, string>>;

export type VoiceControlWidgetProps =
  {
    widgetId?: string;
    className?: string;
    controllerRef?: { current: VoiceControlController | null };
    draggable?: boolean;
    persistPosition?: boolean;
    snapToCorners?: boolean;
    snapInset?: number;
    snapDefaultCorner?: VoiceControlWidgetCorner;
    partClassNames?: VoiceControlWidgetPartClassNames;
    labels?: Partial<VoiceControlWidgetLabels>;
    layout?: VoiceControlWidgetLayout;
    mobileLayout?: VoiceControlWidgetLayout;
    mobileBreakpoint?: number;
    unstyled?: boolean;
    controller: VoiceControlController;
  };

export type GhostCursorEasing = "smooth" | "expressive";

export type GhostCursorOrigin = "pointer" | "previous" | GhostCursorPoint;

export type GhostCursorPoint = {
  x: number;
  y: number;
};

export type GhostCursorPhase = "hidden" | "traveling" | "arrived" | "error";

export type GhostCursorSpriteState = {
  id: string;
  role: "main" | "satellite";
  phase: GhostCursorPhase;
  position: GhostCursorPoint;
  durationMs: number;
  easing?: GhostCursorEasing;
  fade?: number;
};

export type GhostCursorState = {
  main: GhostCursorSpriteState;
  satellites: GhostCursorSpriteState[];
};

export type GhostCursorMotionOptions = {
  easing?: GhostCursorEasing;
  from?: GhostCursorOrigin;
};

export type GhostCursorTarget = {
  element?: HTMLElement | null;
  point?: GhostCursorPoint;
  pulseElement?: HTMLElement | null;
};

export type UseGhostCursorOptions = {
  viewportPadding?: number;
  idleHideMs?: number;
  scrollSettleMs?: number;
};

export type UseGhostCursorReturn = {
  cursorState: GhostCursorState;
  run: <TResult>(
    target: GhostCursorTarget,
    operation: () => Promise<TResult> | TResult,
    options?: GhostCursorMotionOptions
  ) => Promise<TResult>;
  runEach: <TItem, TResult>(
    items: TItem[],
    resolveTarget: (item: TItem, index: number) => GhostCursorTarget | null | undefined,
    operation: (item: TItem, index: number) => Promise<TResult> | TResult,
    options?: GhostCursorMotionOptions
  ) => Promise<TResult[]>;
  hide: () => void;
};

export type GhostCursorOverlayProps = {
  state: GhostCursorState;
  className?: string;
};
