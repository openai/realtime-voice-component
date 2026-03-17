import type {
  OutputMode,
  RealtimeAudioConfig,
  RealtimeInputAudioNoiseReduction,
  RealtimeInputAudioTranscription,
  RealtimePrompt,
  RealtimeToolChoice,
  RealtimeTracing,
  RealtimeTruncation,
  RealtimeTurnDetection
} from "../types";
import type { TransportSessionConfig } from "../transport/types";

export function outputModalitiesForMode(outputMode: OutputMode): string[] {
  switch (outputMode) {
    case "audio":
      return ["audio"];
    case "text+audio":
      return ["audio"];
    case "tool-only":
      return ["text"];
    case "text":
    default:
      return ["text"];
  }
}

function buildDefaultTurnDetection(session: TransportSessionConfig): RealtimeTurnDetection | null {
  if (session.activationMode !== "vad") {
    return null;
  }

  if (session.outputMode === "audio" || session.outputMode === "text+audio") {
    return {
      type: "semantic_vad"
    };
  }

  return {
    type: "server_vad",
    silenceDurationMs: 200
  };
}

function mapTurnDetection(turnDetection: RealtimeTurnDetection | null) {
  if (!turnDetection) {
    return null;
  }

  switch (turnDetection.type) {
    case "semantic_vad":
      return {
        type: "semantic_vad",
        ...(turnDetection.createResponse !== undefined
          ? { create_response: turnDetection.createResponse }
          : {}),
        ...(turnDetection.eagerness !== undefined
          ? { eagerness: turnDetection.eagerness }
          : {}),
        ...(turnDetection.interruptResponse !== undefined
          ? { interrupt_response: turnDetection.interruptResponse }
          : {})
      };
    case "server_vad":
    default:
      return {
        type: "server_vad",
        ...(turnDetection.createResponse !== undefined
          ? { create_response: turnDetection.createResponse }
          : {}),
        ...(turnDetection.idleTimeoutMs !== undefined
          ? { idle_timeout_ms: turnDetection.idleTimeoutMs }
          : {}),
        ...(turnDetection.interruptResponse !== undefined
          ? { interrupt_response: turnDetection.interruptResponse }
          : {}),
        ...(turnDetection.prefixPaddingMs !== undefined
          ? { prefix_padding_ms: turnDetection.prefixPaddingMs }
          : {}),
        ...(turnDetection.silenceDurationMs !== undefined
          ? { silence_duration_ms: turnDetection.silenceDurationMs }
          : {}),
        ...(turnDetection.threshold !== undefined ? { threshold: turnDetection.threshold } : {})
      };
  }
}

function mapNoiseReduction(
  noiseReduction: RealtimeInputAudioNoiseReduction | null | undefined
) {
  if (noiseReduction === null) {
    return null;
  }

  if (!noiseReduction) {
    return undefined;
  }

  return {
    ...(noiseReduction.type !== undefined ? { type: noiseReduction.type } : {})
  };
}

function mapTranscription(
  transcription: RealtimeInputAudioTranscription | null | undefined
) {
  if (transcription === null) {
    return null;
  }

  if (!transcription) {
    return undefined;
  }

  return {
    ...(transcription.language !== undefined ? { language: transcription.language } : {}),
    ...(transcription.model !== undefined ? { model: transcription.model } : {}),
    ...(transcription.prompt !== undefined ? { prompt: transcription.prompt } : {})
  };
}

function mapAudioConfig(
  session: TransportSessionConfig,
  audio: RealtimeAudioConfig | undefined
) {
  const input = audio?.input;
  const output = audio?.output;
  const turnDetection =
    session.activationMode === "vad"
      ? input?.turnDetection ?? buildDefaultTurnDetection(session)
      : null;

  return {
    input: {
      ...(input?.format !== undefined ? { format: input.format } : {}),
      ...(input?.noiseReduction !== undefined
        ? { noise_reduction: mapNoiseReduction(input.noiseReduction) }
        : {}),
      ...(input?.transcription !== undefined
        ? { transcription: mapTranscription(input.transcription) }
        : {}),
      turn_detection: mapTurnDetection(turnDetection)
    },
    ...(output
      ? {
          output: {
            ...(output.format !== undefined ? { format: output.format } : {}),
            ...(output.speed !== undefined ? { speed: output.speed } : {}),
            ...(output.voice !== undefined ? { voice: output.voice } : {})
          }
        }
      : {})
  };
}

function mapToolChoice(toolChoice: RealtimeToolChoice) {
  if (typeof toolChoice === "string") {
    return toolChoice;
  }

  if (toolChoice.type === "mcp") {
    return {
      type: "mcp",
      server_label: toolChoice.serverLabel,
      ...(toolChoice.name !== undefined ? { name: toolChoice.name } : {})
    };
  }

  return toolChoice;
}

function mapPrompt(prompt: RealtimePrompt | undefined) {
  if (!prompt) {
    return undefined;
  }

  return {
    id: prompt.id,
    ...(prompt.version !== undefined ? { version: prompt.version } : {}),
    ...(prompt.variables !== undefined ? { variables: prompt.variables } : {})
  };
}

function mapTracing(tracing: RealtimeTracing | null | undefined) {
  if (tracing === null) {
    return null;
  }

  if (tracing === undefined || tracing === "auto") {
    return tracing;
  }

  return {
    ...(tracing.groupId !== undefined ? { group_id: tracing.groupId } : {}),
    ...(tracing.metadata !== undefined ? { metadata: tracing.metadata } : {}),
    ...(tracing.workflowName !== undefined ? { workflow_name: tracing.workflowName } : {})
  };
}

function mapTruncation(truncation: RealtimeTruncation | undefined) {
  if (!truncation || typeof truncation === "string") {
    return truncation;
  }

  return {
    type: truncation.type,
    retention_ratio: truncation.retentionRatio
  };
}

export function buildRealtimeSessionPayload(session: TransportSessionConfig) {
  const toolChoice =
    session.toolChoice ??
    (session.tools.length > 0 && session.outputMode === "tool-only" ? "required" : "auto");

  return {
    type: "realtime",
    model: session.model,
    instructions: session.instructions,
    tool_choice: mapToolChoice(toolChoice),
    tools: session.tools,
    output_modalities: outputModalitiesForMode(session.outputMode),
    audio: mapAudioConfig(session, session.audio),
    ...(session.include !== undefined ? { include: session.include } : {}),
    ...(session.maxOutputTokens !== undefined
      ? { max_response_output_tokens: session.maxOutputTokens }
      : {}),
    ...(session.metadata !== undefined ? { metadata: session.metadata } : {}),
    ...(session.prompt !== undefined ? { prompt: mapPrompt(session.prompt) } : {}),
    ...(session.tracing !== undefined ? { tracing: mapTracing(session.tracing) } : {}),
    ...(session.truncation !== undefined ? { truncation: mapTruncation(session.truncation) } : {}),
    ...(session.raw ?? {})
  };
}

export function buildSessionUpdateEvent(session: TransportSessionConfig) {
  return {
    type: "session.update",
    session: buildRealtimeSessionPayload(session)
  };
}
