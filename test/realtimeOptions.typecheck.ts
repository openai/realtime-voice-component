import type {
  UseVoiceControlOptions,
  VoiceControlController,
  VoiceControlWidgetProps
} from "../src/types";

const validRealtimeOptions = {
  auth: {
    sessionEndpoint: "/session"
  },
  tools: [],
  model: "gpt-realtime-1.5",
  outputMode: "tool-only",
  session: {
    metadata: {
      surface: "widget"
    },
    raw: {
      temperature: 0.4
    }
  },
  audio: {
    input: {
      format: "pcm16",
      noiseReduction: {
        type: "near_field"
      },
      transcription: {
        model: "gpt-4o-transcribe"
      },
      turnDetection: {
        type: "server_vad",
        silenceDurationMs: 250
      }
    },
    output: {
      format: "g711_ulaw",
      voice: "alloy"
    }
  },
  toolChoice: {
    type: "function",
    name: "set_theme"
  },
  tracing: {
    groupId: "grp_123"
  },
  truncation: {
    type: "retention_ratio",
    retentionRatio: 0.5
  }
} satisfies UseVoiceControlOptions;

void validRealtimeOptions;

const validLegacyRealtimeOptions = {
  auth: {
    getClientSecret: async () => "secret"
  },
  tools: [],
  model: "gpt-realtime-1.5",
  outputMode: "tool-only",
  session: {
    metadata: {
      surface: "widget"
    },
    raw: {
      temperature: 0.4
    }
  },
  audio: {
    input: {
      format: "pcm16",
      noiseReduction: {
        type: "near_field"
      },
      transcription: {
        model: "gpt-4o-transcribe"
      },
      turnDetection: {
        type: "server_vad",
        silenceDurationMs: 250
      }
    },
    output: {
      format: "g711_ulaw",
      voice: "alloy"
    }
  },
  toolChoice: {
    type: "function",
    name: "set_theme"
  },
  tracing: {
    groupId: "grp_123"
  },
  truncation: {
    type: "retention_ratio",
    retentionRatio: 0.5
  }
} satisfies UseVoiceControlOptions;

void validLegacyRealtimeOptions;
// @ts-expect-error A function tool choice must include the tool name.
const invalidToolChoice: UseVoiceControlOptions["toolChoice"] = {
  type: "function"
};

void invalidToolChoice;

declare const controller: VoiceControlController;

const validWidgetProps = {
  controller
} satisfies VoiceControlWidgetProps;

void validWidgetProps;

// @ts-expect-error VoiceControlWidget now requires an explicit controller.
const invalidWidgetProps = {} satisfies VoiceControlWidgetProps;

void invalidWidgetProps;
