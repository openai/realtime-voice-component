import { createWebRtcRealtimeTransport } from "./transport/webRtcRealtimeTransport";
import type {
  OutputMode,
  RealtimeClientEvent,
  RealtimeServerEvent,
  ToolCallErrorEvent,
  ToolCallEvent,
  ToolCallResultEvent,
  UseVoiceControlOptions,
  VoiceControlActivity,
  VoiceControlController,
  VoiceControlError,
  VoiceControlEvent,
  VoiceControlRealtimeSessionOptions,
  VoiceControlRealtimeSessionPatch,
  VoiceControlResolvedSessionConfig,
  VoiceControlSnapshot,
  VoiceTool,
  VoiceToolCallRecord
} from "./types";
import type { RealtimeTransport } from "./transport/types";

const DEFAULT_MODEL = "gpt-realtime-1.5";
const DEFAULT_INSTRUCTIONS =
  "You are a voice control agent for a React web app. Use only the registered tools to act on the UI. Prefer tool calls over chat when a tool can satisfy the request. Ask one short clarification question when required tool arguments are missing or ambiguous. Do not invent capabilities or successful outcomes. Keep any reply brief, and only reply when no tool is appropriate.";
const DEFAULT_MAX_TOOL_CALL_HISTORY = 500;

type FunctionCallItem = {
  call_id?: string;
  id?: string;
  name?: string;
  arguments?: string;
  type?: string;
};

type ToolCallRecordInput = {
  id: string;
  responseId?: string;
  name: string;
  status: VoiceToolCallRecord["status"];
  args?: unknown;
  output?: unknown;
  error?: VoiceControlError;
  startedAt: number;
  finishedAt?: number;
};

type AbortableError = Error & {
  code?: string;
};

function createAbortError() {
  const error = new Error("Voice control connection was cancelled.") as AbortableError;
  error.name = "AbortError";
  error.code = "aborted";
  return error;
}

function isAbortError(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || (error as AbortableError).code === "aborted");
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function inferErrorCode(error: Error): NonNullable<VoiceControlError["code"]> {
  const errorWithCode = error as AbortableError;
  if (errorWithCode.code) {
    return errorWithCode.code as NonNullable<VoiceControlError["code"]>;
  }

  const message = error.message.toLowerCase();

  if (error.name === "AbortError") {
    return "aborted";
  }

  if (error.name === "NotAllowedError") {
    return message.includes("secure context") || message.includes("https")
      ? "insecure_context"
      : "permission_denied";
  }

  if (
    error.name === "NotFoundError" ||
    error.name === "NotReadableError" ||
    error.name === "OverconstrainedError"
  ) {
    return "device_unavailable";
  }

  if (error.name === "NotSupportedError") {
    return "unsupported_browser";
  }

  if (message.includes("secure context") || message.includes("https or localhost")) {
    return "insecure_context";
  }

  if (message.includes("mediadevices") || message.includes("rtcpeerconnection support")) {
    return "unsupported_browser";
  }

  if (message.includes("timed out")) {
    return "media_timeout";
  }

  if (message.includes("failed to establish realtime webrtc session")) {
    return "network_error";
  }

  if (message.includes("failed to fetch realtime client secret")) {
    return "network_error";
  }

  return "unknown";
}

function normalizeError(error: unknown): VoiceControlError {
  if (error instanceof Error) {
    return {
      code: inferErrorCode(error),
      message: error.message,
      cause: error
    };
  }

  if (typeof error === "string") {
    return { code: "unknown", message: error };
  }

  return {
    code: "unknown",
    message: "Unknown voice control error.",
    cause: error
  };
}

function includesAudio(outputMode: OutputMode): boolean {
  return outputMode === "audio" || outputMode === "text+audio";
}

function extractTextDelta(event: RealtimeServerEvent): string | null {
  if (
    event.type === "response.text.delta" ||
    event.type === "response.output_text.delta" ||
    event.type === "response.output_audio_transcript.delta"
  ) {
    const delta = event.delta;
    return typeof delta === "string" ? delta : null;
  }

  return null;
}

function extractCompletedText(event: RealtimeServerEvent): string | null {
  if (event.type === "response.output_text.done") {
    return typeof event.text === "string" ? event.text : null;
  }

  if (event.type === "response.output_audio_transcript.done") {
    return typeof event.transcript === "string" ? event.transcript : null;
  }

  return null;
}

function extractResponseId(event: RealtimeServerEvent): string | null {
  if (typeof event.response_id === "string") {
    return event.response_id;
  }

  const response = event.response as { id?: string } | undefined;
  return typeof response?.id === "string" ? response.id : null;
}

function isFunctionCallItem(item: unknown): item is FunctionCallItem {
  return typeof item === "object" && item !== null && (item as { type?: string }).type === "function_call";
}

function normalizeToolCallHistoryLimit(limit: number | null | undefined): number | null {
  if (limit === null) {
    return null;
  }

  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_MAX_TOOL_CALL_HISTORY;
  }

  return Math.max(0, Math.floor(limit));
}

function finalizeToolCallRecord(record: VoiceToolCallRecord): VoiceToolCallRecord {
  const finishedAt = record.finishedAt;
  return {
    id: record.id,
    ...(record.responseId ? { responseId: record.responseId } : {}),
    sequence: record.sequence,
    name: record.name,
    status: record.status,
    ...(record.args !== undefined ? { args: record.args } : {}),
    ...(record.output !== undefined ? { output: record.output } : {}),
    ...(record.error ? { error: record.error } : {}),
    startedAt: record.startedAt,
    ...(finishedAt === undefined
      ? {}
      : {
          finishedAt,
          durationMs: Math.max(0, finishedAt - record.startedAt)
        })
  };
}

function deriveStatus(
  activity: VoiceControlActivity,
  connected: boolean,
  activationMode: UseVoiceControlOptions["activationMode"],
  capturing: boolean
): VoiceControlSnapshot["status"] {
  if (activity === "error") {
    return "error";
  }

  if (activity === "connecting") {
    return "connecting";
  }

  if (!connected) {
    return "idle";
  }

  if (activity === "processing" || activity === "executing") {
    return "processing";
  }

  if (activationMode === "vad" || capturing) {
    return "listening";
  }

  return "ready";
}

async function resolveClientSecret(
  options: UseVoiceControlOptions["auth"],
  model: string,
  signal?: AbortSignal
): Promise<string> {
  if ("getClientSecret" in options) {
    const clientSecret = await options.getClientSecret();
    throwIfAborted(signal);
    return clientSecret;
  }

  const requestUrl = new URL(
    options.tokenEndpoint,
    typeof window === "undefined" ? "http://localhost" : window.location.origin
  );

  requestUrl.searchParams.set("model", model);

  const response = await fetch(requestUrl.toString(), {
    method: "GET",
    ...(signal ? { signal } : {}),
    ...options.tokenRequestInit
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Realtime client secret: ${response.status}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const fromNested =
    typeof payload.client_secret === "object" && payload.client_secret !== null
      ? (payload.client_secret as Record<string, unknown>).value
      : undefined;

  const value = payload.value ?? fromNested ?? payload.client_secret;
  if (typeof value !== "string") {
    throw new Error("Token endpoint did not return a usable Realtime client secret.");
  }

  return value;
}

function mergeAudioConfig(
  base: VoiceControlRealtimeSessionOptions["audio"],
  patch: VoiceControlRealtimeSessionOptions["audio"]
): VoiceControlRealtimeSessionOptions["audio"] {
  if (!base) {
    return patch;
  }

  if (!patch) {
    return base;
  }

  const input =
    base.input || patch.input
      ? {
          ...(base.input ?? {}),
          ...(patch.input ?? {})
        }
      : undefined;
  const output =
    base.output || patch.output
      ? {
          ...(base.output ?? {}),
          ...(patch.output ?? {})
        }
      : undefined;

  return {
    ...(input ? { input } : {}),
    ...(output ? { output } : {})
  };
}

function withOptionalField<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined
) {
  if (value !== undefined) {
    target[key] = value;
  }

  return target;
}

function resolveClearablePatch<T>(base: T | undefined, patch: T | null | undefined) {
  if (patch === undefined) {
    return base;
  }

  return patch ?? undefined;
}

function mergeRealtimeSessionOptions(
  base: VoiceControlRealtimeSessionOptions,
  patch: VoiceControlRealtimeSessionPatch
): VoiceControlRealtimeSessionOptions {
  const next: VoiceControlRealtimeSessionOptions = {};

  const audio =
    patch.audio === undefined
      ? base.audio
      : patch.audio
        ? mergeAudioConfig(base.audio, patch.audio)
        : undefined;
  withOptionalField(next, "audio", audio);
  withOptionalField(next, "include", resolveClearablePatch(base.include, patch.include));
  withOptionalField(
    next,
    "maxOutputTokens",
    resolveClearablePatch(base.maxOutputTokens, patch.maxOutputTokens)
  );
  withOptionalField(next, "metadata", resolveClearablePatch(base.metadata, patch.metadata));
  withOptionalField(next, "prompt", resolveClearablePatch(base.prompt, patch.prompt));
  withOptionalField(next, "toolChoice", resolveClearablePatch(base.toolChoice, patch.toolChoice));
  withOptionalField(next, "tracing", patch.tracing !== undefined ? patch.tracing : base.tracing);
  withOptionalField(next, "truncation", resolveClearablePatch(base.truncation, patch.truncation));
  withOptionalField(next, "raw", resolveClearablePatch(base.raw, patch.raw));

  return next;
}

function resolveAdvancedRealtimeSessionOptions(
  options: UseVoiceControlOptions,
  runtimePatch: VoiceControlRealtimeSessionOptions
): VoiceControlRealtimeSessionOptions {
  const mergedTopLevel: VoiceControlRealtimeSessionOptions = {
    ...(options.session ?? {}),
    ...(options.audio !== undefined ? { audio: options.audio } : {}),
    ...(options.include !== undefined ? { include: options.include } : {}),
    ...(options.maxOutputTokens !== undefined
      ? { maxOutputTokens: options.maxOutputTokens }
      : {}),
    ...(options.prompt !== undefined ? { prompt: options.prompt } : {}),
    ...(options.toolChoice !== undefined ? { toolChoice: options.toolChoice } : {}),
    ...(options.tracing !== undefined ? { tracing: options.tracing } : {}),
    ...(options.truncation !== undefined ? { truncation: options.truncation } : {})
  };

  return mergeRealtimeSessionOptions(mergedTopLevel, runtimePatch);
}

function resolveSessionConfig(
  options: UseVoiceControlOptions,
  instructions: string,
  tools: VoiceTool[],
  runtimePatch: VoiceControlRealtimeSessionOptions
): VoiceControlResolvedSessionConfig {
  const advanced = resolveAdvancedRealtimeSessionOptions(options, runtimePatch);

  return {
    model: options.model ?? DEFAULT_MODEL,
    instructions,
    tools: tools.map((tool) => tool.realtimeTool),
    activationMode: options.activationMode ?? "push-to-talk",
    outputMode: options.outputMode ?? "tool-only",
    ...(advanced.audio !== undefined ? { audio: advanced.audio } : {}),
    ...(advanced.include !== undefined ? { include: advanced.include } : {}),
    ...(advanced.maxOutputTokens !== undefined
      ? { maxOutputTokens: advanced.maxOutputTokens }
      : {}),
    ...(advanced.metadata !== undefined ? { metadata: advanced.metadata } : {}),
    ...(advanced.prompt !== undefined ? { prompt: advanced.prompt } : {}),
    ...(advanced.toolChoice !== undefined ? { toolChoice: advanced.toolChoice } : {}),
    ...(advanced.tracing !== undefined ? { tracing: advanced.tracing } : {}),
    ...(advanced.truncation !== undefined ? { truncation: advanced.truncation } : {}),
    ...(advanced.raw !== undefined ? { raw: advanced.raw } : {})
  };
}

function createInitialSnapshot(options: UseVoiceControlOptions): VoiceControlSnapshot {
  const sessionConfig = resolveSessionConfig(
    options,
    options.instructions ?? DEFAULT_INSTRUCTIONS,
    options.tools,
    {}
  );

  return {
    status: "idle",
    activity: "idle",
    connected: false,
    transcript: "",
    toolCalls: [],
    latestToolCall: null,
    sessionConfig
  };
}

export function isVoiceControlController(value: unknown): value is VoiceControlController {
  return (
    typeof value === "object" &&
    value !== null &&
    "configure" in value &&
    typeof value.configure === "function" &&
    "getSnapshot" in value &&
    typeof value.getSnapshot === "function" &&
    "subscribe" in value &&
    typeof value.subscribe === "function"
  );
}

class VoiceControlControllerImpl implements VoiceControlController {
  #listeners = new Set<() => void>();
  #options: UseVoiceControlOptions;
  #snapshot: VoiceControlSnapshot;
  #liveInstructions: string;
  #liveTools: VoiceTool[];
  #runtimeSessionPatch: VoiceControlRealtimeSessionOptions = {};
  #capturing = false;
  #transport: RealtimeTransport | null = null;
  #connectAbortController: AbortController | null = null;
  #sessionQueue: Promise<void> = Promise.resolve();
  #historyLimit: number | null;
  #executedCallIds = new Set<string>();
  #responseToolCounts = new Map<string, number>();
  #toolExecutedDuringResponse = false;
  #responseInFlight = false;
  #pendingPostToolResponse = false;
  #currentResponseIsPostTool = false;
  #runningToolCallCount = 0;
  #toolCallRecords = new Map<string, VoiceToolCallRecord>();
  #toolCallOrder: string[] = [];
  #nextToolCallSequence = 1;
  #destroyed = false;

  constructor(options: UseVoiceControlOptions) {
    this.#options = options;
    this.#snapshot = createInitialSnapshot(options);
    this.#liveInstructions = this.#snapshot.sessionConfig.instructions;
    this.#liveTools = options.tools;
    this.#historyLimit = normalizeToolCallHistoryLimit(options.maxToolCallHistory);

    if (options.autoConnect) {
      void this.connect();
    }
  }

  get status() {
    return this.#snapshot.status;
  }

  get activity() {
    return this.#snapshot.activity;
  }

  get connected() {
    return this.#snapshot.connected;
  }

  get transcript() {
    return this.#snapshot.transcript;
  }

  get toolCalls() {
    return this.#snapshot.toolCalls;
  }

  get latestToolCall() {
    return this.#snapshot.latestToolCall;
  }

  get sessionConfig() {
    return this.#snapshot.sessionConfig;
  }

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  getSnapshot = () => this.#snapshot;

  configure = (options: UseVoiceControlOptions) => {
    if (this.#destroyed) {
      return;
    }

    const previous = this.#options;
    this.#options = options;

    let shouldSyncSession = false;

    if (previous.instructions !== options.instructions) {
      this.#liveInstructions = options.instructions ?? DEFAULT_INSTRUCTIONS;
      shouldSyncSession = true;
    }

    if (previous.tools !== options.tools) {
      this.#liveTools = options.tools;
      shouldSyncSession = true;
    }

    if (previous.maxToolCallHistory !== options.maxToolCallHistory) {
      this.#historyLimit = normalizeToolCallHistoryLimit(options.maxToolCallHistory);
      this.#syncToolCallSnapshot();
    }

    shouldSyncSession ||= (
      previous.activationMode !== options.activationMode ||
      previous.audio !== options.audio ||
      previous.include !== options.include ||
      previous.maxOutputTokens !== options.maxOutputTokens ||
      previous.model !== options.model ||
      previous.outputMode !== options.outputMode ||
      previous.prompt !== options.prompt ||
      previous.session !== options.session ||
      previous.toolChoice !== options.toolChoice ||
      previous.tracing !== options.tracing ||
      previous.truncation !== options.truncation
    );

    if (shouldSyncSession) {
      this.#setSessionConfig(
        resolveSessionConfig(this.#options, this.#liveInstructions, this.#liveTools, this.#runtimeSessionPatch)
      );
    }

    if (options.autoConnect && !previous.autoConnect) {
      void this.connect();
    }
  };

  destroy = () => {
    if (this.#destroyed) {
      return;
    }

    this.#destroyed = true;
    this.#connectAbortController?.abort();
    this.#connectAbortController = null;
    this.#transport?.disconnect();
    this.#transport = null;
    this.#listeners.clear();
  };

  clearToolCalls = () => {
    this.#toolCallRecords.clear();
    this.#toolCallOrder = [];
    this.#nextToolCallSequence = 1;
    this.#publish({ toolCalls: [] });
  };

  connect = async () => {
    if (this.#destroyed || this.connected || this.activity === "connecting") {
      return;
    }

    this.#connectAbortController?.abort();
    const connectAbortController = new AbortController();
    this.#connectAbortController = connectAbortController;

    this.#setActivity("connecting");
    this.#debugLog("connect.start", this.sessionConfig);

    try {
      const clientSecret = await resolveClientSecret(
        this.#options.auth,
        this.sessionConfig.model,
        connectAbortController.signal
      );
      throwIfAborted(connectAbortController.signal);

      const transport = this.#options.transportFactory?.() ?? createWebRtcRealtimeTransport();

      this.#resetTransientState("connecting", { clearTranscript: true });
      this.clearToolCalls();

      await transport.connect({
        authToken: clientSecret,
        model: this.sessionConfig.model,
        session: this.sessionConfig,
        audioPlaybackEnabled: includesAudio(this.sessionConfig.outputMode),
        signal: connectAbortController.signal,
        onServerEvent: this.#handleServerEvent,
        onError: (error) => {
          this.#emitError(error, { disconnect: true });
        }
      });
      throwIfAborted(connectAbortController.signal);

      this.#transport = transport;
      this.#connectAbortController = null;
      this.#setConnected(true);
      this.#setActivity("listening");
      this.#debugLog("connect.ready");
      this.#emitEvent({ type: "voice.transport.connected" });
    } catch (error) {
      if (this.#connectAbortController === connectAbortController) {
        this.#connectAbortController = null;
      }

      if (isAbortError(error)) {
        this.#resetTransientState("idle");
        return;
      }

      this.#emitError(error);
    }
  };

  disconnect = () => {
    if (this.#destroyed) {
      return;
    }

    this.#debugLog("disconnect");
    this.#connectAbortController?.abort();
    this.#connectAbortController = null;

    const wasConnected = this.connected;
    this.#transport?.disconnect();
    this.#transport = null;
    this.#setConnected(false);
    this.#resetTransientState("idle");

    if (wasConnected) {
      this.#emitEvent({ type: "voice.transport.disconnected" });
    }
  };

  startCapture = () => {
    if (
      this.#destroyed ||
      !this.connected ||
      this.sessionConfig.activationMode === "vad" ||
      this.#capturing
    ) {
      return;
    }

    this.#setCapturing(true);
    this.#setActivity("listening");
    this.#transport?.startCapture();
    this.#emitEvent({ type: "voice.capture.started" });
  };

  stopCapture = () => {
    if (
      this.#destroyed ||
      !this.connected ||
      this.sessionConfig.activationMode === "vad" ||
      !this.#capturing
    ) {
      return;
    }

    this.#setCapturing(false);
    this.#responseInFlight = true;
    this.#setActivity("processing");
    this.#transport?.stopCapture();
    this.#emitEvent({ type: "voice.capture.stopped" });
  };

  updateInstructions = (instructions: string) => {
    this.#liveInstructions = instructions;
    this.#setSessionConfig(
      resolveSessionConfig(this.#options, this.#liveInstructions, this.#liveTools, this.#runtimeSessionPatch)
    );
  };

  updateTools = (tools: VoiceTool[]) => {
    this.#liveTools = tools;
    this.#setSessionConfig(
      resolveSessionConfig(this.#options, this.#liveInstructions, this.#liveTools, this.#runtimeSessionPatch)
    );
  };

  updateSession = (patch: VoiceControlRealtimeSessionPatch) => {
    this.#runtimeSessionPatch = mergeRealtimeSessionOptions(this.#runtimeSessionPatch, patch);
    this.#debugLog("session.patch", patch, this.#runtimeSessionPatch);
    this.#setSessionConfig(
      resolveSessionConfig(this.#options, this.#liveInstructions, this.#liveTools, this.#runtimeSessionPatch)
    );
  };

  requestResponse = () => {
    if (this.#destroyed || !this.connected) {
      return;
    }

    this.#pendingPostToolResponse = false;
    this.#currentResponseIsPostTool = false;
    this.#responseInFlight = true;
    this.#setActivity("processing");
    this.#debugLog("response.create");
    this.#transport?.requestResponse();
  };

  sendClientEvent = (event: RealtimeClientEvent) => {
    if (this.#destroyed) {
      return;
    }

    this.#debugLog("client.send", event);
    this.#transport?.sendClientEvent(event);
  };

  #notify() {
    if (this.#destroyed) {
      return;
    }

    for (const listener of this.#listeners) {
      listener();
    }
  }

  #publish(partial: Partial<Omit<VoiceControlSnapshot, "latestToolCall" | "status">> = {}) {
    const nextActivity = partial.activity ?? this.#snapshot.activity;
    const nextConnected = partial.connected ?? this.#snapshot.connected;
    const nextTranscript = partial.transcript ?? this.#snapshot.transcript;
    const nextToolCalls = partial.toolCalls ?? this.#snapshot.toolCalls;
    const nextSessionConfig = partial.sessionConfig ?? this.#snapshot.sessionConfig;
    const nextStatus = deriveStatus(
      nextActivity,
      nextConnected,
      nextSessionConfig.activationMode,
      this.#capturing
    );
    const nextLatestToolCall = nextToolCalls.at(-1) ?? null;

    if (
      this.#snapshot.activity === nextActivity &&
      this.#snapshot.connected === nextConnected &&
      this.#snapshot.transcript === nextTranscript &&
      this.#snapshot.toolCalls === nextToolCalls &&
      this.#snapshot.sessionConfig === nextSessionConfig &&
      this.#snapshot.status === nextStatus &&
      this.#snapshot.latestToolCall === nextLatestToolCall
    ) {
      return;
    }

    this.#snapshot = {
      activity: nextActivity,
      connected: nextConnected,
      transcript: nextTranscript,
      toolCalls: nextToolCalls,
      latestToolCall: nextLatestToolCall,
      sessionConfig: nextSessionConfig,
      status: nextStatus
    };
    this.#notify();
  }

  #setActivity(next: VoiceControlActivity) {
    this.#publish({ activity: next });
  }

  #setCapturing(next: boolean) {
    if (this.#capturing === next) {
      return;
    }

    this.#capturing = next;
    this.#publish();
  }

  #setConnected(next: boolean) {
    this.#publish({ connected: next });
  }

  #setTranscript(next: string) {
    this.#publish({ transcript: next });
  }

  #setSessionConfig(next: VoiceControlResolvedSessionConfig) {
    this.#publish({ sessionConfig: next });

    if (this.connected) {
      this.#applySessionUpdate();
    }
  }

  #debugLog(...parts: unknown[]) {
    if (this.#options.debug && typeof console !== "undefined" && console.debug) {
      console.debug("[voice-control]", ...parts);
    }
  }

  #emitEvent(event: VoiceControlEvent) {
    if (this.#destroyed) {
      return;
    }

    if ("type" in event) {
      this.#debugLog("event", event.type, event);
    }

    this.#options.onEvent?.(event);
  }

  #resetResponseState() {
    this.#executedCallIds.clear();
    this.#responseToolCounts.clear();
    this.#toolExecutedDuringResponse = false;
    this.#responseInFlight = false;
    this.#pendingPostToolResponse = false;
    this.#currentResponseIsPostTool = false;
    this.#runningToolCallCount = 0;
    this.#setCapturing(false);
  }

  #emitError(
    error: unknown,
    options?: {
      disconnect?: boolean;
    }
  ) {
    if (this.#destroyed) {
      return;
    }

    const normalized = normalizeError(error);
    const shouldDisconnect = options?.disconnect ?? false;

    if (shouldDisconnect) {
      const wasConnected = this.connected;
      this.#transport = null;
      this.#setConnected(false);

      if (wasConnected) {
        this.#emitEvent({ type: "voice.transport.disconnected" });
      }
    }

    this.#resetResponseState();
    this.#setActivity("error");
    this.#debugLog("error", normalized);
    this.#options.onError?.(normalized);
  }

  #resetTransientState(
    nextActivity: VoiceControlActivity,
    options?: {
      clearTranscript?: boolean;
    }
  ) {
    this.#resetResponseState();

    if (options?.clearTranscript) {
      this.#setTranscript("");
    }

    this.#setActivity(nextActivity);
  }

  #restingActivity() {
    return this.connected ? "listening" : "idle";
  }

  #applySessionUpdate() {
    this.#debugLog("session.update", this.sessionConfig);
    this.#transport?.updateSession(this.sessionConfig);
    this.#transport?.setAudioPlaybackEnabled(includesAudio(this.sessionConfig.outputMode));
  }

  #requestPostToolResponse() {
    this.#pendingPostToolResponse = true;
    this.#debugLog("response.create.post-tool");
    this.#transport?.requestResponse();
    this.#setActivity("processing");
  }

  #finishToolExecution() {
    this.#runningToolCallCount = Math.max(0, this.#runningToolCallCount - 1);

    if (this.activity === "error") {
      return;
    }

    if (this.#runningToolCallCount > 0) {
      this.#setActivity("executing");
      return;
    }

    this.#setActivity(this.#responseInFlight ? "processing" : this.#restingActivity());
  }

  #queueSessionTask(task: () => Promise<void>) {
    this.#sessionQueue = this.#sessionQueue.then(task).catch((error) => {
      this.#emitError(error);
    });
  }

  #trackExecutedCall(callId?: string) {
    if (!callId) {
      return true;
    }

    if (this.#executedCallIds.has(callId)) {
      return false;
    }

    this.#executedCallIds.add(callId);
    return true;
  }

  #incrementResponseToolCount(responseId: string | null, count = 1) {
    if (!responseId) {
      return;
    }

    this.#responseToolCounts.set(
      responseId,
      (this.#responseToolCounts.get(responseId) ?? 0) + count
    );
  }

  #syncToolCallSnapshot() {
    const limit = this.#historyLimit;
    if (limit !== null && this.#toolCallOrder.length > limit) {
      const overflowCount = this.#toolCallOrder.length - limit;
      const droppedIds = this.#toolCallOrder.slice(0, overflowCount);
      this.#toolCallOrder = this.#toolCallOrder.slice(overflowCount);

      for (const id of droppedIds) {
        this.#toolCallRecords.delete(id);
      }
    }

    this.#publish({
      toolCalls: this.#toolCallOrder
        .map((id) => this.#toolCallRecords.get(id))
        .filter((record): record is VoiceToolCallRecord => record !== undefined)
    });
  }

  #upsertToolCallRecord(record: ToolCallRecordInput) {
    const existing = this.#toolCallRecords.get(record.id);
    const responseId = record.responseId ?? existing?.responseId;
    const args = record.args !== undefined ? record.args : existing?.args;
    const next = finalizeToolCallRecord({
      id: record.id,
      ...(responseId ? { responseId } : {}),
      sequence: existing?.sequence ?? this.#nextToolCallSequence++,
      name: record.name,
      status: record.status,
      ...(args !== undefined ? { args } : {}),
      ...(record.output !== undefined ? { output: record.output } : {}),
      ...(record.error ? { error: record.error } : {}),
      startedAt: existing?.startedAt ?? record.startedAt,
      ...(record.finishedAt !== undefined ? { finishedAt: record.finishedAt } : {})
    });

    if (!existing) {
      this.#toolCallOrder = [...this.#toolCallOrder, record.id];
    }

    this.#toolCallRecords.set(record.id, next);
    this.#syncToolCallSnapshot();
    return next;
  }

  #failToolCall({
    callId,
    responseId,
    toolName,
    args,
    startedAt,
    error
  }: {
    callId: string;
    responseId: string | null;
    toolName: string;
    args: unknown;
    startedAt: number;
    error: unknown;
  }) {
    const finishedAt = Date.now();
    const normalizedError = normalizeError(error);
    const failureEvent: ToolCallErrorEvent = {
      callId,
      name: toolName,
      args,
      error: normalizedError
    };

    this.#transport?.sendFunctionResult(callId, {
      ok: false,
      error: normalizedError.message
    });
    this.#emitEvent({
      type: "voice.tool.failed",
      ...failureEvent
    });
    this.#options.onToolError?.(failureEvent);

    this.#upsertToolCallRecord({
      id: callId,
      ...(responseId ? { responseId } : {}),
      name: toolName,
      status: "error",
      args,
      error: normalizedError,
      startedAt,
      finishedAt
    });
  }

  #executeToolCall = async (item: FunctionCallItem, responseId: string | null) => {
    this.#toolExecutedDuringResponse = true;

    const callId = item.call_id ?? item.id ?? `call-${Date.now()}`;
    const toolName = item.name ?? "unknown_tool";
    const rawArgs = item.arguments ?? "{}";
    const startedAt = Date.now();
    const matchingTool = this.#liveTools.find((tool) => tool.name === toolName);

    if (!matchingTool) {
      const output = { ok: false, error: `No tool registered for ${toolName}.` };
      this.#transport?.sendFunctionResult(callId, output);
      this.#upsertToolCallRecord({
        id: callId,
        ...(responseId ? { responseId } : {}),
        name: toolName,
        status: "skipped",
        args: rawArgs,
        output,
        startedAt,
        finishedAt: Date.now()
      });
      return;
    }

    let parsedArgs: unknown;

    try {
      parsedArgs = matchingTool.parseArguments(rawArgs);
    } catch (error) {
      this.#failToolCall({
        callId,
        responseId,
        toolName,
        args: rawArgs,
        startedAt,
        error
      });
      return;
    }

    const startEvent: ToolCallEvent = {
      callId,
      name: toolName,
      args: parsedArgs
    };

    this.#runningToolCallCount += 1;
    this.#setActivity("executing");

    this.#emitEvent({
      type: "voice.tool.started",
      ...startEvent
    });
    this.#options.onToolStart?.(startEvent);

    this.#upsertToolCallRecord({
      id: callId,
      ...(responseId ? { responseId } : {}),
      name: toolName,
      status: "running",
      args: parsedArgs,
      startedAt
    });

    try {
      const output = await matchingTool.execute(parsedArgs);
      const finishedAt = Date.now();
      const successEvent: ToolCallResultEvent = {
        ...startEvent,
        output
      };

      this.#transport?.sendFunctionResult(callId, output);
      this.#emitEvent({
        type: "voice.tool.succeeded",
        ...successEvent
      });
      this.#options.onToolSuccess?.(successEvent);

      this.#upsertToolCallRecord({
        id: callId,
        ...(responseId ? { responseId } : {}),
        name: toolName,
        status: "success",
        args: parsedArgs,
        output,
        startedAt,
        finishedAt
      });
    } catch (error) {
      this.#failToolCall({
        callId,
        responseId,
        toolName,
        args: parsedArgs,
        startedAt,
        error
      });
    } finally {
      this.#finishToolExecution();
    }
  };

  #handleToolOnlyNoAction(responseId: string | null) {
    const message = "The model responded without choosing a registered tool.";
    const startedAt = Date.now();

    this.#emitEvent({
      type: "voice.no_action",
      message
    });

    this.#upsertToolCallRecord({
      id: `no-action-${startedAt}`,
      ...(responseId ? { responseId } : {}),
      name: "no_action",
      status: "skipped",
      output: { message },
      startedAt,
      finishedAt: startedAt
    });

    if (responseId) {
      this.#responseToolCounts.delete(responseId);
    }

    this.#toolExecutedDuringResponse = false;
    this.#setActivity(this.#restingActivity());
  }

  #handleResponseDone(event: RealtimeServerEvent, functionCalls: FunctionCallItem[]) {
    this.#queueSessionTask(async () => {
      const responseId = extractResponseId(event);
      this.#responseInFlight = false;

      const executedCount = responseId
        ? (this.#responseToolCounts.get(responseId) ?? 0)
        : 0;
      const pendingCalls = functionCalls.filter((call) => this.#trackExecutedCall(call.call_id ?? call.id));

      if (
        pendingCalls.length === 0 &&
        executedCount === 0 &&
        !this.#toolExecutedDuringResponse &&
        this.sessionConfig.outputMode === "tool-only"
      ) {
        this.#handleToolOnlyNoAction(responseId);
        return;
      }

      for (const call of pendingCalls) {
        await this.#executeToolCall(call, responseId);
      }

      this.#incrementResponseToolCount(responseId, pendingCalls.length);

      if (
        this.#options.postToolResponse &&
        !this.#currentResponseIsPostTool &&
        (pendingCalls.length > 0 || executedCount > 0)
      ) {
        this.#requestPostToolResponse();
      } else if (this.#runningToolCallCount === 0 && this.activity !== "error") {
        this.#setActivity(this.#restingActivity());
      }

      if (responseId) {
        this.#responseToolCounts.delete(responseId);
      }

      this.#toolExecutedDuringResponse = false;
    });
  }

  #handleOutputItemDone(event: RealtimeServerEvent) {
    const item = event.item;

    if (!isFunctionCallItem(item)) {
      return;
    }

    this.#queueSessionTask(async () => {
      if (!this.#trackExecutedCall(item.call_id ?? item.id)) {
        return;
      }

      const responseId = extractResponseId(event);
      this.#incrementResponseToolCount(responseId);
      await this.#executeToolCall(item, responseId);
    });
  }

  #handleServerEvent = (event: RealtimeServerEvent) => {
    this.#emitEvent(event);

    if (event.type === "response.created") {
      this.#currentResponseIsPostTool = this.#pendingPostToolResponse;
      this.#pendingPostToolResponse = false;
      this.#responseInFlight = true;
      this.#toolExecutedDuringResponse = false;
      this.#setCapturing(false);
      this.#setTranscript("");
      this.#setActivity("processing");
    }

    const textDelta = extractTextDelta(event);
    if (textDelta) {
      this.#setTranscript(`${this.transcript}${textDelta}`);
    }

    const completedText = extractCompletedText(event);
    if (completedText) {
      this.#setTranscript(completedText);
    }

    if (event.type === "error") {
      const error = event.error as { message?: string } | undefined;
      this.#emitError(error?.message ?? "Realtime server error.");
      return;
    }

    if (event.type === "response.output_item.done") {
      this.#handleOutputItemDone(event);
      return;
    }

    if (event.type === "response.done") {
      const response = event.response as { output?: unknown[] } | undefined;
      const items = Array.isArray(response?.output) ? response.output : [];
      this.#handleResponseDone(event, items.filter(isFunctionCallItem));
    }
  };
}

export function createVoiceControlController(
  options: UseVoiceControlOptions
): VoiceControlController {
  return new VoiceControlControllerImpl(options);
}
