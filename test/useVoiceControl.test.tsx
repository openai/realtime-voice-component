
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { VoiceControlWidget } from "../src/components/VoiceControlWidget";
import { createVoiceControlController } from "../src/voiceControlController";
import { defineVoiceTool } from "../src/defineVoiceTool";
import { buildSessionUpdateEvent } from "../src/internal/session";
import { MockRealtimeTransport } from "../src/transport/mockRealtimeTransport";
import { useVoiceControl } from "../src/useVoiceControl";
import type {
  OutputMode,
  UseVoiceControlOptions,
  UseVoiceControlReturn,
  VoiceControlController,
  VoiceControlEvent,
  VoiceControlError,
  VoiceTool,
  VoiceToolCallRecord
} from "../src/types";

const POSITION_STORAGE_KEY = "voice-control-position:v1:voice-control-widget";
const LEGACY_POSITION_STORAGE_KEY = "voice-control-position:voice-control-widget";
const CORNER_STORAGE_KEY = "voice-control-corner:v1:voice-control-widget";
const LEGACY_CORNER_STORAGE_KEY = "voice-control-corner:voice-control-widget";

function parseToolCalls() {
  return JSON.parse(screen.getByTestId("tool-calls").textContent ?? "[]") as VoiceToolCallRecord[];
}

function getWidgetRoot() {
  return document.body.querySelector('[data-vc-part="root"]');
}

function createWidgetController(
  transport: MockRealtimeTransport,
  options: Partial<UseVoiceControlOptions> = {}
): VoiceControlController {
  return createVoiceControlController({
    auth: {
      getClientSecret: async () => "client-secret"
    },
    activationMode: "vad",
    tools: [],
    transportFactory: () => transport,
    ...options
  });
}

function createDomRect(width: number, height: number, left = 0, top = 0) {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({})
  } as DOMRect;
}

function HookHarness({
  transport,
  tools,
  model = "gpt-realtime",
  outputMode = "tool-only",
  onEvent,
  onError,
  maxToolCallHistory,
  postToolResponse,
  session
}: {
  transport: MockRealtimeTransport;
  tools: VoiceTool<any>[];
  model?: string;
  outputMode?: OutputMode;
  onEvent?: (event: VoiceControlEvent) => void;
  onError?: (error: VoiceControlError) => void;
  maxToolCallHistory?: number | null;
  postToolResponse?: boolean;
  session?: UseVoiceControlOptions["session"];
}) {
  const controller = useVoiceControl({
    auth: {
      getClientSecret: async () => "client-secret"
    },
    tools,
    instructions: "first instructions",
    model,
    outputMode,
    ...(session ? { session } : {}),
    ...(postToolResponse !== undefined ? { postToolResponse } : {}),
    ...(maxToolCallHistory !== undefined ? { maxToolCallHistory } : {}),
    transportFactory: () => transport,
    ...(onError ? { onError } : {}),
    ...(onEvent ? { onEvent } : {})
  });

  return (
    <div>
      <div data-testid="status">{controller.status}</div>
      <div data-testid="activity">{controller.activity}</div>
      <div data-testid="connected">{String(controller.connected)}</div>
      <div data-testid="has-expanded">{String("expanded" in controller)}</div>
      <div data-testid="has-set-expanded">{String("setExpanded" in controller)}</div>
      <div data-testid="latest-tool">{controller.latestToolCall?.name ?? ""}</div>
      <div data-testid="tool-count">{String(controller.toolCalls.length)}</div>
      <div data-testid="transcript">{controller.transcript}</div>
      <div data-testid="session-config">{JSON.stringify(controller.sessionConfig)}</div>
      <div data-testid="tool-calls">{JSON.stringify(controller.toolCalls)}</div>
      <button onClick={() => void controller.connect()} type="button">
        connect
      </button>
      <button onClick={() => controller.updateInstructions("updated instructions")} type="button">
        update instructions
      </button>
      <button onClick={controller.startCapture} type="button">
        start capture
      </button>
      <button onClick={controller.stopCapture} type="button">
        stop capture
      </button>
      <button onClick={controller.clearToolCalls} type="button">
        clear tool calls
      </button>
      <button
        onClick={() =>
          controller.updateSession({
            metadata: {
              surface: "inline"
            },
            raw: {
              temperature: 0.4
            }
          })
        }
        type="button"
      >
        patch session
      </button>
      <button onClick={controller.requestResponse} type="button">
        request response
      </button>
      <button
        onClick={() =>
          controller.sendClientEvent({
            type: "conversation.item.delete",
            item_id: "item_123"
          })
        }
        type="button"
      >
        send client event
      </button>
    </div>
  );
}

function emitFunctionCallResponse(
  transport: MockRealtimeTransport,
  {
    callId,
    name,
    argumentsJson,
    responseId
  }: {
    callId: string;
    name: string;
    argumentsJson: string;
    responseId: string;
  }
) {
  act(() => {
    transport.emitServerEvent({ type: "response.created", response_id: responseId });
    transport.emitServerEvent({
      type: "response.output_item.done",
      response_id: responseId,
      item: {
        type: "function_call",
        call_id: callId,
        name,
        arguments: argumentsJson
      }
    });
    transport.emitServerEvent({
      type: "response.done",
      response: {
        id: responseId,
        output: [
          {
            type: "function_call",
            call_id: callId,
            name,
            arguments: argumentsJson
          }
        ]
      }
    });
  });
}

function ExternalControllerHarness({
  controller
}: {
  controller: ReturnType<typeof createVoiceControlController>;
}) {
  const runtime = useVoiceControl(controller);

  return (
    <div>
      <div data-testid="external-status">{runtime.status}</div>
      <div data-testid="external-connected">{String(runtime.connected)}</div>
      <button onClick={() => void runtime.connect()} type="button">
        external connect
      </button>
    </div>
  );
}

describe("useVoiceControl", () => {
  beforeEach(() => {
    window.localStorage.clear();
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(true);
    HTMLElement.prototype.releasePointerCapture = vi.fn();
  });

  it("connects, updates session instructions, deduplicates tool calls, and exposes derived state", async () => {
    const transport = new MockRealtimeTransport();
    const execute = vi.fn(({ value }: { value: string }) => ({ ok: true, value }));
    const tool = defineVoiceTool({
      name: "set_first_name",
      description: "Set the first name.",
      parameters: z.object({
        value: z.string()
      }),
      execute
    });

    render(
      <HookHarness
        transport={transport}
        tools={[tool]}
        model="gpt-realtime-2025-08-28"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "connect" }));

    await waitFor(() => {
      expect(screen.getByTestId("connected")).toHaveTextContent("true");
    });

    expect(screen.getByTestId("activity")).toHaveTextContent("listening");
    expect(screen.getByTestId("status")).toHaveTextContent("ready");
    expect(transport.sentClientEvents[0]).toMatchObject({
      type: "session.update",
      session: {
        instructions: "first instructions",
        model: "gpt-realtime-2025-08-28"
      }
    });

    fireEvent.click(screen.getByRole("button", { name: "update instructions" }));

    await waitFor(() => {
      expect(
        transport.sentClientEvents.some(
          (event) =>
            typeof event === "object" &&
            event !== null &&
            "type" in event &&
            (event as { type: string }).type === "session.update" &&
            (event as { session?: { instructions?: string } }).session?.instructions ===
              "updated instructions"
        )
      ).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: "start capture" }));
    expect(screen.getByTestId("status")).toHaveTextContent("listening");

    fireEvent.click(screen.getByRole("button", { name: "stop capture" }));
    expect(screen.getByTestId("activity")).toHaveTextContent("processing");
    expect(transport.sentClientEvents).toContainEqual({ type: "input_audio_buffer.clear" });
    expect(transport.sentClientEvents).toContainEqual({ type: "input_audio_buffer.commit" });

    emitFunctionCallResponse(transport, {
      callId: "call-1",
      name: "set_first_name",
      argumentsJson: "{\"value\":\"Ada\"}",
      responseId: "resp-1"
    });

    await waitFor(() => {
      expect(execute).toHaveBeenCalledWith({ value: "Ada" });
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(transport.sentClientEvents).toContainEqual({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: "call-1",
        output: JSON.stringify({ ok: true, value: "Ada" })
      }
    });
    expect(screen.getByTestId("latest-tool")).toHaveTextContent("set_first_name");
    expect(screen.getByTestId("tool-count")).toHaveTextContent("1");
    expect(screen.getByTestId("activity")).toHaveTextContent("listening");

    const [record] = parseToolCalls();
    expect(record).toBeDefined();
    expect(record).toMatchObject({
      id: "call-1",
      responseId: "resp-1",
      sequence: 1,
      name: "set_first_name",
      status: "success",
      args: { value: "Ada" },
      output: { ok: true, value: "Ada" }
    });
    expect(record?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("passes sessionEndpoint auth through to the transport", async () => {
    const transport = new MockRealtimeTransport();
    const controller = createVoiceControlController({
      auth: {
        sessionEndpoint: "/session",
        sessionRequestInit: {
          credentials: "include"
        }
      },
      tools: [],
      transportFactory: () => transport
    });

    await controller.connect();

    expect(transport.connectOptions?.auth).toMatchObject({
      type: "session_endpoint",
      sessionEndpoint: expect.stringMatching(/\/session$/),
      sessionRequestInit: {
        credentials: "include"
      }
    });
  });

  it("does not expose widget expansion state from the headless controller", () => {
    const transport = new MockRealtimeTransport();

    render(<HookHarness transport={transport} tools={[]} />);

    expect(screen.getByTestId("has-expanded")).toHaveTextContent("false");
    expect(screen.getByTestId("has-set-expanded")).toHaveTextContent("false");
  });

  it("creates a headless controller that can be used without React", async () => {
    const transport = new MockRealtimeTransport();
    const controller = createVoiceControlController({
      auth: {
        getClientSecret: async () => "client-secret"
      },
      tools: [],
      transportFactory: () => transport
    });
    const onChange = vi.fn();
    const unsubscribe = controller.subscribe(onChange);

    await controller.connect();

    expect(controller.connected).toBe(true);
    expect(controller.status).toBe("ready");

    controller.updateInstructions("controller instructions");

    expect(controller.sessionConfig.instructions).toBe("controller instructions");

    controller.disconnect();
    unsubscribe();
    controller.destroy();

    expect(onChange).toHaveBeenCalled();
    expect(transport.sentClientEvents).toContainEqual({ type: "__disconnect" });
  });

  it("accepts an external controller instance in useVoiceControl", async () => {
    const transport = new MockRealtimeTransport();
    const controller = createVoiceControlController({
      auth: {
        getClientSecret: async () => "client-secret"
      },
      tools: [],
      transportFactory: () => transport
    });

    render(<ExternalControllerHarness controller={controller} />);

    fireEvent.click(screen.getByRole("button", { name: "external connect" }));

    await waitFor(() => {
      expect(screen.getByTestId("external-connected")).toHaveTextContent("true");
    });

    expect(screen.getByTestId("external-status")).toHaveTextContent("ready");

    controller.destroy();
  });

  it("uses server VAD with a short silence window for non-audio output", () => {
    expect(
      buildSessionUpdateEvent({
        model: "gpt-realtime",
        instructions: "test",
        tools: [],
        activationMode: "vad",
        outputMode: "tool-only"
      })
    ).toMatchObject({
      session: {
        audio: {
          input: {
            turn_detection: {
              type: "server_vad",
              silence_duration_ms: 200
            }
          }
        }
      }
    });
  });

  it("keeps semantic VAD for response-audio modes", () => {
    expect(
      buildSessionUpdateEvent({
        model: "gpt-realtime",
        instructions: "test",
        tools: [],
        activationMode: "vad",
        outputMode: "audio"
      })
    ).toMatchObject({
      session: {
        audio: {
          input: {
            turn_detection: {
              type: "semantic_vad"
            }
          }
        }
      }
    });
  });

  it("maps advanced Realtime session options into the session.update payload", () => {
    expect(
      buildSessionUpdateEvent({
        model: "gpt-realtime-1.5",
        instructions: "test",
        tools: [],
        activationMode: "vad",
        outputMode: "audio",
        audio: {
          input: {
            format: "pcm16",
            noiseReduction: {
              type: "near_field"
            },
            transcription: {
              language: "en",
              model: "gpt-4o-transcribe",
              prompt: "bias to product names"
            },
            turnDetection: {
              type: "server_vad",
              createResponse: false,
              idleTimeoutMs: 4000,
              interruptResponse: false,
              prefixPaddingMs: 200,
              silenceDurationMs: 350,
              threshold: 0.7
            }
          },
          output: {
            format: "g711_ulaw",
            speed: 1.1,
            voice: "marin"
          }
        },
        include: ["item.input_audio_transcription.logprobs"],
        maxOutputTokens: "inf",
        prompt: {
          id: "pmpt_123",
          version: "7",
          variables: {
            mode: "assist"
          }
        },
        toolChoice: {
          type: "mcp",
          serverLabel: "demo-server",
          name: "set_theme"
        },
        tracing: {
          groupId: "grp_123",
          workflowName: "voice_widget",
          metadata: {
            surface: "widget"
          }
        },
        truncation: {
          type: "retention_ratio",
          retentionRatio: 0.6
        }
      })
    ).toMatchObject({
      session: {
        model: "gpt-realtime-1.5",
        output_modalities: ["audio"],
        include: ["item.input_audio_transcription.logprobs"],
        max_response_output_tokens: "inf",
        prompt: {
          id: "pmpt_123",
          version: "7",
          variables: {
            mode: "assist"
          }
        },
        tool_choice: {
          type: "mcp",
          server_label: "demo-server",
          name: "set_theme"
        },
        tracing: {
          group_id: "grp_123",
          workflow_name: "voice_widget",
          metadata: {
            surface: "widget"
          }
        },
        truncation: {
          type: "retention_ratio",
          retention_ratio: 0.6
        },
        audio: {
          input: {
            format: "pcm16",
            noise_reduction: {
              type: "near_field"
            },
            transcription: {
              language: "en",
              model: "gpt-4o-transcribe",
              prompt: "bias to product names"
            },
            turn_detection: {
              type: "server_vad",
              create_response: false,
              idle_timeout_ms: 4000,
              interrupt_response: false,
              prefix_padding_ms: 200,
              silence_duration_ms: 350,
              threshold: 0.7
            }
          },
          output: {
            format: "g711_ulaw",
            speed: 1.1,
            voice: "marin"
          }
        }
      }
    });
  });

  it("maps legacy text+audio output mode to audio-only Realtime modalities", () => {
    expect(
      buildSessionUpdateEvent({
        model: "gpt-realtime",
        instructions: "test",
        tools: [],
        activationMode: "vad",
        outputMode: "text+audio"
      })
    ).toMatchObject({
      session: {
        output_modalities: ["audio"],
        audio: {
          input: {
            turn_detection: {
              type: "semantic_vad"
            }
          }
        }
      }
    });
  });

  it("exposes session config and imperative session helpers", async () => {
    const transport = new MockRealtimeTransport();

    render(
      <HookHarness
        transport={transport}
        tools={[]}
        session={{
          metadata: {
            surface: "widget"
          }
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "connect" }));

    await waitFor(() => {
      expect(screen.getByTestId("connected")).toHaveTextContent("true");
    });

    expect(screen.getByTestId("session-config")).toHaveTextContent("\"surface\":\"widget\"");

    fireEvent.click(screen.getByRole("button", { name: "patch session" }));

    await waitFor(() => {
      expect(
        transport.sentClientEvents.some(
          (event) =>
            typeof event === "object" &&
            event !== null &&
            "type" in event &&
            (event as { type: string }).type === "session.update" &&
            (event as { session?: { metadata?: { surface?: string }; temperature?: number } }).session
              ?.metadata?.surface === "inline" &&
            (event as { session?: { metadata?: { surface?: string }; temperature?: number } }).session
              ?.temperature === 0.4
        )
      ).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: "request response" }));
    fireEvent.click(screen.getByRole("button", { name: "send client event" }));

    expect(transport.sentClientEvents).toContainEqual({ type: "response.create" });
    expect(transport.sentClientEvents).toContainEqual({
      type: "conversation.item.delete",
      item_id: "item_123"
    });
  });

  it("serializes tool errors, keeps no-op records, and clears history", async () => {
    const transport = new MockRealtimeTransport();
    const onEvent = vi.fn();
    const tool = defineVoiceTool({
      name: "set_theme",
      description: "Set the theme.",
      parameters: z.object({
        theme: z.enum(["light", "dark"])
      }),
      execute: () => {
        throw new Error("boom");
      }
    });

    render(<HookHarness transport={transport} tools={[tool]} onEvent={onEvent} />);

    fireEvent.click(screen.getByRole("button", { name: "connect" }));

    await waitFor(() => {
      expect(screen.getByTestId("connected")).toHaveTextContent("true");
    });

    act(() => {
      transport.emitServerEvent({
        type: "response.done",
        response: {
          id: "resp-2",
          output: [
            {
              type: "function_call",
              call_id: "call-2",
              name: "set_theme",
              arguments: "{\"theme\":\"dark\"}"
            }
          ]
        }
      });
    });

    await waitFor(() => {
      expect(transport.sentClientEvents).toContainEqual({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: "call-2",
          output: JSON.stringify({ ok: false, error: "boom" })
        }
      });
    });

    act(() => {
      transport.emitServerEvent({
        type: "response.done",
        response: {
          id: "resp-3",
          output: []
        }
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("latest-tool")).toHaveTextContent("no_action");
    });

    const records = parseToolCalls();
    expect(records).toHaveLength(2);
    const firstRecord = records[0];
    const secondRecord = records[1];
    expect(firstRecord).toBeDefined();
    expect(secondRecord).toBeDefined();
    expect(firstRecord).toMatchObject({
      id: "call-2",
      responseId: "resp-2",
      name: "set_theme",
      status: "error"
    });
    expect(firstRecord?.error?.message).toBe("boom");
    expect(secondRecord).toMatchObject({
      name: "no_action",
      responseId: "resp-3",
      status: "skipped"
    });
    expect(onEvent).toHaveBeenCalledWith({
      type: "voice.no_action",
      message: "The model responded without choosing a registered tool."
    });

    fireEvent.click(screen.getByRole("button", { name: "clear tool calls" }));
    expect(screen.getByTestId("tool-count")).toHaveTextContent("0");
  });

  it("serializes malformed tool arguments as tool failures without dropping the session", async () => {
    const transport = new MockRealtimeTransport();
    const onError = vi.fn();
    const execute = vi.fn();
    const tool = defineVoiceTool({
      name: "set_name",
      description: "Set a value.",
      parameters: z.object({
        value: z.string()
      }),
      execute
    });

    render(
      <HookHarness
        transport={transport}
        tools={[tool]}
        onError={onError}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "connect" }));

    await waitFor(() => {
      expect(screen.getByTestId("connected")).toHaveTextContent("true");
    });

    act(() => {
      transport.emitServerEvent({
        type: "response.done",
        response: {
          id: "resp-parse",
          output: [
            {
              type: "function_call",
              call_id: "call-parse",
              name: "set_name",
              arguments: "{\"value\":42}"
            }
          ]
        }
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("tool-count")).toHaveTextContent("1");
      expect(screen.getByTestId("connected")).toHaveTextContent("true");
      expect(screen.getByTestId("status")).toHaveTextContent("ready");
    });

    expect(execute).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();

    const functionResultEvent = transport.sentClientEvents.find((event) => {
      return (
        typeof event === "object" &&
        event !== null &&
        "type" in event &&
        event.type === "conversation.item.create" &&
        "item" in event &&
        typeof event.item === "object" &&
        event.item !== null &&
        "call_id" in event.item &&
        event.item.call_id === "call-parse"
      );
    });

    expect(functionResultEvent).toBeDefined();
    expect(
      JSON.parse(
        (
          functionResultEvent as {
            item: {
              output: string;
            };
          }
        ).item.output
      )
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("expected string")
    });

    const record = parseToolCalls()[0];
    expect(record).toMatchObject({
      id: "call-parse",
      responseId: "resp-parse",
      name: "set_name",
      status: "error",
      args: "{\"value\":42}"
    });
    expect(record?.error?.message).toContain("expected string");
  });

  it("ignores stopCapture before capture has started", async () => {
    const transport = new MockRealtimeTransport();
    const onEvent = vi.fn();

    render(<HookHarness transport={transport} tools={[]} onEvent={onEvent} />);

    fireEvent.click(screen.getByRole("button", { name: "connect" }));

    await waitFor(() => {
      expect(screen.getByTestId("connected")).toHaveTextContent("true");
    });

    expect(screen.getByTestId("status")).toHaveTextContent("ready");
    expect(screen.getByTestId("activity")).toHaveTextContent("listening");

    fireEvent.click(screen.getByRole("button", { name: "stop capture" }));

    expect(screen.getByTestId("status")).toHaveTextContent("ready");
    expect(screen.getByTestId("activity")).toHaveTextContent("listening");
    expect(onEvent).not.toHaveBeenCalledWith({ type: "voice.capture.stopped" });
    expect(transport.sentClientEvents).not.toContainEqual({ type: "input_audio_buffer.commit" });
  });

  it("does not emit duplicate capture-start events", async () => {
    const transport = new MockRealtimeTransport();
    const onEvent = vi.fn();

    render(<HookHarness transport={transport} tools={[]} onEvent={onEvent} />);

    fireEvent.click(screen.getByRole("button", { name: "connect" }));

    await waitFor(() => {
      expect(screen.getByTestId("connected")).toHaveTextContent("true");
    });

    fireEvent.click(screen.getByRole("button", { name: "start capture" }));
    fireEvent.click(screen.getByRole("button", { name: "start capture" }));

    const startEvents = onEvent.mock.calls.filter(
      ([event]) => event?.type === "voice.capture.started"
    );

    expect(startEvents).toHaveLength(1);
    expect(transport.sentClientEvents.filter((event) => {
      return (
        typeof event === "object" &&
        event !== null &&
        "type" in event &&
        event.type === "input_audio_buffer.clear"
      );
    })).toHaveLength(1);
  });

  it("truncates tool call history when configured", async () => {
    const transport = new MockRealtimeTransport();
    const tool = defineVoiceTool({
      name: "set_name",
      description: "Set a value.",
      parameters: z.object({
        value: z.string()
      }),
      execute: ({ value }: { value: string }) => ({ ok: true, value })
    });

    render(
      <HookHarness
        transport={transport}
        tools={[tool]}
        maxToolCallHistory={2}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "connect" }));

    await waitFor(() => {
      expect(screen.getByTestId("connected")).toHaveTextContent("true");
    });

    emitFunctionCallResponse(transport, {
      callId: "call-1",
      name: "set_name",
      argumentsJson: "{\"value\":\"one\"}",
      responseId: "resp-1"
    });
    emitFunctionCallResponse(transport, {
      callId: "call-2",
      name: "set_name",
      argumentsJson: "{\"value\":\"two\"}",
      responseId: "resp-2"
    });
    emitFunctionCallResponse(transport, {
      callId: "call-3",
      name: "set_name",
      argumentsJson: "{\"value\":\"three\"}",
      responseId: "resp-3"
    });

    await waitFor(() => {
      expect(screen.getByTestId("tool-count")).toHaveTextContent("2");
    });

    const records = parseToolCalls();
    expect(records.map((record) => record.id)).toEqual(["call-2", "call-3"]);
    expect(records.at(-1)?.name).toBe("set_name");
    expect(screen.getByTestId("latest-tool")).toHaveTextContent("set_name");
  });

  it("supports unlimited history and keeps only the latest transcript message", async () => {
    const transport = new MockRealtimeTransport();
    const tool = defineVoiceTool({
      name: "set_name",
      description: "Set a value.",
      parameters: z.object({
        value: z.string()
      }),
      execute: ({ value }: { value: string }) => ({ ok: true, value })
    });

    render(
      <HookHarness
        transport={transport}
        tools={[tool]}
        outputMode="text"
        maxToolCallHistory={null}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "connect" }));

    await waitFor(() => {
      expect(screen.getByTestId("connected")).toHaveTextContent("true");
    });

    emitFunctionCallResponse(transport, {
      callId: "call-1",
      name: "set_name",
      argumentsJson: "{\"value\":\"one\"}",
      responseId: "resp-1"
    });
    emitFunctionCallResponse(transport, {
      callId: "call-2",
      name: "set_name",
      argumentsJson: "{\"value\":\"two\"}",
      responseId: "resp-2"
    });
    emitFunctionCallResponse(transport, {
      callId: "call-3",
      name: "set_name",
      argumentsJson: "{\"value\":\"three\"}",
      responseId: "resp-3"
    });

    await waitFor(() => {
      expect(screen.getByTestId("tool-count")).toHaveTextContent("3");
    });

    act(() => {
      transport.emitServerEvent({ type: "response.created" });
      transport.emitServerEvent({ type: "response.output_text.delta", delta: "Hello" });
      transport.emitServerEvent({ type: "response.output_text.delta", delta: " world" });
    });

    expect(screen.getByTestId("transcript")).toHaveTextContent("Hello world");

    act(() => {
      transport.emitServerEvent({ type: "response.created" });
      transport.emitServerEvent({ type: "response.output_text.delta", delta: "Latest" });
    });

    expect(screen.getByTestId("transcript")).toHaveTextContent("Latest");
  });

  it("requests a follow-up response when postToolResponse is enabled and executes the next tool call", async () => {
    const transport = new MockRealtimeTransport();
    const lookupTool = defineVoiceTool({
      name: "lookup_name",
      description: "Look up a suggested name.",
      parameters: z.object({}),
      execute: () => ({ ok: true, value: "Ada" })
    });
    const applyTool = defineVoiceTool({
      name: "set_name",
      description: "Apply a value.",
      parameters: z.object({
        value: z.string()
      }),
      execute: ({ value }: { value: string }) => ({ ok: true, value })
    });

    render(
      <HookHarness
        transport={transport}
        tools={[lookupTool, applyTool]}
        postToolResponse
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "connect" }));

    await waitFor(() => {
      expect(screen.getByTestId("connected")).toHaveTextContent("true");
    });

    emitFunctionCallResponse(transport, {
      callId: "call-1",
      name: "lookup_name",
      argumentsJson: "{}",
      responseId: "resp-1"
    });

    await waitFor(() => {
      expect(transport.sentClientEvents).toContainEqual({
        type: "response.create"
      });
    });

    emitFunctionCallResponse(transport, {
      callId: "call-2",
      name: "set_name",
      argumentsJson: "{\"value\":\"Ada\"}",
      responseId: "resp-2"
    });

    await waitFor(() => {
      expect(screen.getByTestId("tool-count")).toHaveTextContent("2");
    });

    expect(
      transport.sentClientEvents.filter(
        (event) =>
          typeof event === "object" &&
          event !== null &&
          "type" in event &&
          (event as { type: string }).type === "response.create"
      )
    ).toHaveLength(1);

    const records = parseToolCalls();
    expect(records.map((record) => record.name)).toEqual(["lookup_name", "set_name"]);
    expect(records.at(-1)).toMatchObject({
      name: "set_name",
      status: "success",
      args: {
        value: "Ada"
      }
    });
  });

  it("marks the controller disconnected when the transport fails after connect", async () => {
    const transport = new MockRealtimeTransport();
    const onError = vi.fn();

    render(
      <HookHarness
        transport={transport}
        tools={[]}
        onError={onError}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "connect" }));

    await waitFor(() => {
      expect(screen.getByTestId("connected")).toHaveTextContent("true");
    });

    act(() => {
      transport.emitError(new Error("rtc dropped"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("connected")).toHaveTextContent("false");
      expect(screen.getByTestId("status")).toHaveTextContent("error");
      expect(screen.getByTestId("activity")).toHaveTextContent("error");
    });

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "rtc dropped"
      })
    );
  });
});

describe("VoiceControlWidget", () => {
  beforeEach(() => {
    window.localStorage.clear();
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
    Object.defineProperty(document.documentElement, "clientWidth", {
      configurable: true,
      value: 1000
    });
    Object.defineProperty(document.documentElement, "clientHeight", {
      configurable: true,
      value: 700
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    });
  });

  it("renders a launcher-only widget by default", () => {
    const transport = new MockRealtimeTransport();
    const controller = createWidgetController(transport);

    render(<VoiceControlWidget controller={controller} />);

    expect(document.body.querySelector('[data-vc-part="panel"]')).toBeNull();
    expect(getWidgetRoot()).toHaveAttribute("data-vc-layout", "floating");
    expect(screen.getByRole("button", { name: "Start Voice" })).not.toHaveAttribute("aria-controls");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("connects and disconnects from the collapsed launcher by default", async () => {
    const transport = new MockRealtimeTransport();
    const controller = createWidgetController(transport);

    render(<VoiceControlWidget controller={controller} />);

    fireEvent.click(screen.getByRole("button", { name: "Start Voice" }));

    await waitFor(() => {
      expect(getWidgetRoot()).toHaveAttribute("data-vc-connected", "true");
      expect(document.body.querySelector('[data-vc-part="launcher"]')).toHaveAttribute(
        "data-vc-launcher-state",
        "listening"
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Disconnect Voice" }));

    await waitFor(() => {
      expect(transport.sentClientEvents).toContainEqual({ type: "__disconnect" });
      expect(getWidgetRoot()).toHaveAttribute("data-vc-connected", "false");
    });
  });

  it("exposes the widget controller through controllerRef for direct connect and disconnect", async () => {
    const transport = new MockRealtimeTransport();
    const controller = createWidgetController(transport);
    const controllerRef: { current: VoiceControlController | null } = { current: null };

    render(
      <VoiceControlWidget
        controller={controller}
        controllerRef={controllerRef}
      />
    );

    await waitFor(() => {
      expect(controllerRef.current).not.toBeNull();
    });

    await act(async () => {
      await controllerRef.current?.connect();
    });

    await waitFor(() => {
      expect(getWidgetRoot()).toHaveAttribute("data-vc-connected", "true");
    });

    act(() => {
      controllerRef.current?.disconnect();
    });

    await waitFor(() => {
      expect(transport.sentClientEvents).toContainEqual({ type: "__disconnect" });
      expect(getWidgetRoot()).toHaveAttribute("data-vc-connected", "false");
    });
  });

  it("accepts an external controller instance", async () => {
    const transport = new MockRealtimeTransport();
    const controller = createWidgetController(transport);

    render(<VoiceControlWidget controller={controller} />);

    fireEvent.click(screen.getByRole("button", { name: "Start Voice" }));

    await waitFor(() => {
      expect(getWidgetRoot()).toHaveAttribute("data-vc-connected", "true");
    });

    controller.destroy();
  });

  it("renders svg launcher icons instead of literal glyph text", () => {
    const transport = new MockRealtimeTransport();
    const controller = createWidgetController(transport);

    render(<VoiceControlWidget controller={controller} />);

    const launcher = document.body.querySelector('[data-vc-part="launcher"]');
    expect(launcher?.querySelector('[data-vc-part="launcher-action"] svg')).not.toBeNull();
    expect(launcher?.querySelector('[data-vc-part="launcher-handle"] svg')).not.toBeNull();
    expect(launcher).not.toHaveTextContent(":::");
  });

  it("disconnects from the collapsed launcher while work is in flight", async () => {
    const transport = new MockRealtimeTransport();
    let resolveTool: ((value: { ok: true }) => void) | null = null;
    const tool = defineVoiceTool({
      name: "slow_tool",
      description: "Slow tool.",
      parameters: z.object({
        value: z.string()
      }),
      execute: () =>
        new Promise<{ ok: true }>((resolve) => {
          resolveTool = resolve;
        })
    });

    const controller = createWidgetController(transport, {
      tools: [tool]
    });

    render(<VoiceControlWidget controller={controller} />);

    fireEvent.click(screen.getByRole("button", { name: "Start Voice" }));

    await waitFor(() => {
      expect(getWidgetRoot()).toHaveAttribute("data-vc-connected", "true");
    });

    emitFunctionCallResponse(transport, {
      callId: "call-busy",
      name: "slow_tool",
      argumentsJson: "{\"value\":\"Ada\"}",
      responseId: "resp-busy"
    });

    await waitFor(() => {
      expect(document.body.querySelector('[data-vc-part="launcher"]')).toHaveAttribute(
        "data-vc-launcher-state",
        "busy"
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Disconnect Voice" }));

    await waitFor(() => {
      expect(transport.sentClientEvents).toContainEqual({ type: "__disconnect" });
    });

    await act(async () => {
      resolveTool?.({ ok: true });
      await Promise.resolve();
    });
  });

  it("does not reconnect while the launcher is already connecting", async () => {
    const transport = new MockRealtimeTransport();
    const connectSpy = vi
      .spyOn(transport, "connect")
      .mockImplementation(() => new Promise<void>(() => {}));
    const controller = createWidgetController(transport);

    render(<VoiceControlWidget controller={controller} />);

    fireEvent.click(screen.getByRole("button", { name: "Start Voice" }));

    await waitFor(() => {
      expect(document.body.querySelector('[data-vc-part="launcher"]')).toHaveAttribute(
        "data-vc-launcher-state",
        "connecting"
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Voice is connecting" }));
    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  it("shows a local launcher error toast and clears it after a successful retry", async () => {
    const transport = new MockRealtimeTransport();
    const originalConnect = transport.connect.bind(transport);
    const connectSpy = vi.spyOn(transport, "connect");
    connectSpy.mockImplementationOnce(async () => {
      throw new Error("connect failed");
    });
    connectSpy.mockImplementation(originalConnect);
    const controller = createWidgetController(transport);

    render(<VoiceControlWidget controller={controller} />);

    fireEvent.click(screen.getByRole("button", { name: "Start Voice" }));

    await waitFor(() => {
      expect(
        screen.getByText("Couldn't connect. Press the voice button to retry.")
      ).toBeInTheDocument();
      expect(document.body.querySelector('[data-vc-part="launcher"]')).toHaveAttribute(
        "data-vc-launcher-state",
        "error"
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Retry Voice" }));

    await waitFor(() => {
      expect(getWidgetRoot()).toHaveAttribute("data-vc-connected", "true");
      expect(screen.queryByText("Couldn't connect. Press the voice button to retry.")).toBeNull();
    });
  });

  it("persists widget drag position", () => {
    const transport = new MockRealtimeTransport();
    const controller = createWidgetController(transport);

    render(<VoiceControlWidget controller={controller} />);

    const handle = screen.getByRole("button", { name: /drag widget/i });
    fireEvent.pointerDown(handle, { clientX: 20, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 80, clientY: 90, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 80, clientY: 90, pointerId: 1 });

    expect(window.localStorage.getItem(POSITION_STORAGE_KEY)).toBe(
      JSON.stringify({
        x: 60,
        y: 70
      })
    );
  });

  it("treats widget position persistence as best-effort when storage writes fail", () => {
    const transport = new MockRealtimeTransport();
    const controller = createWidgetController(transport);
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage disabled");
    });

    render(<VoiceControlWidget controller={controller} />);

    const handle = screen.getByRole("button", { name: /drag widget/i });

    expect(() => {
      fireEvent.pointerDown(handle, { clientX: 20, clientY: 20, pointerId: 1 });
      fireEvent.pointerMove(handle, { clientX: 80, clientY: 90, pointerId: 1 });
      fireEvent.pointerUp(handle, { clientX: 80, clientY: 90, pointerId: 1 });
    }).not.toThrow();

    expect(window.localStorage.getItem(POSITION_STORAGE_KEY)).toBeNull();
    setItemSpy.mockRestore();
  });

  it("snaps to the nearest corner and persists the chosen corner", async () => {
    const transport = new MockRealtimeTransport();
    const controller = createWidgetController(transport);
    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(() => createDomRect(74, 44));

    render(<VoiceControlWidget controller={controller} snapToCorners />);

    const handle = screen.getByRole("button", { name: /drag widget/i });
    fireEvent.pointerDown(handle, { clientX: 900, clientY: 660, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 90, clientY: 60, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 90, clientY: 60, pointerId: 1 });

    await waitFor(() => {
      expect(window.localStorage.getItem(CORNER_STORAGE_KEY)).toBe(
        JSON.stringify({ corner: "top-left" })
      );
    });

    getBoundingClientRectSpy.mockRestore();
  });

  it("keeps launcher clicks and snap dragging separate", () => {
    const transport = new MockRealtimeTransport();
    const controller = createWidgetController(transport);
    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(() => createDomRect(74, 44));

    render(<VoiceControlWidget controller={controller} snapToCorners />);

    const handle = screen.getByRole("button", { name: /drag widget/i });
    fireEvent.pointerDown(handle, { clientX: 900, clientY: 660, pointerId: 2 });
    fireEvent.pointerMove(window, { clientX: 903, clientY: 663, pointerId: 2 });
    fireEvent.pointerUp(window, { clientX: 903, clientY: 663, pointerId: 2 });

    expect(window.localStorage.getItem(CORNER_STORAGE_KEY)).toBeNull();

    getBoundingClientRectSpy.mockRestore();
  });

  it("snaps to the nearest corner when the drag ends with pointercancel", async () => {
    const transport = new MockRealtimeTransport();
    const controller = createWidgetController(transport);
    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(() => createDomRect(74, 44));

    render(<VoiceControlWidget controller={controller} snapToCorners />);

    const handle = screen.getByRole("button", { name: /drag widget/i });
    fireEvent.pointerDown(handle, { clientX: 900, clientY: 660, pointerId: 4 });
    fireEvent.pointerMove(window, { clientX: 90, clientY: 60, pointerId: 4 });
    fireEvent.pointerCancel(window, { clientX: 90, clientY: 60, pointerId: 4 });

    await waitFor(() => {
      expect(window.localStorage.getItem(CORNER_STORAGE_KEY)).toBe(
        JSON.stringify({ corner: "top-left" })
      );
    });

    getBoundingClientRectSpy.mockRestore();
  });

  it("does not start dragging from interactive no-drag descendants", () => {
    const transport = new MockRealtimeTransport();
    const controller = createWidgetController(transport);
    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(() => createDomRect(74, 44));

    render(<VoiceControlWidget controller={controller} snapToCorners />);

    const handle = screen.getByRole("button", { name: /drag widget/i });
    const blocker = document.createElement("span");
    blocker.setAttribute("data-vc-no-drag", "true");
    handle.appendChild(blocker);

    fireEvent.pointerDown(blocker, { clientX: 900, clientY: 660, pointerId: 5 });
    fireEvent.pointerMove(window, { clientX: 90, clientY: 60, pointerId: 5 });
    fireEvent.pointerUp(window, { clientX: 90, clientY: 60, pointerId: 5 });

    expect(window.localStorage.getItem(CORNER_STORAGE_KEY)).toBeNull();

    getBoundingClientRectSpy.mockRestore();
  });

  it("uses snapDefaultCorner for initial PIP placement", async () => {
    const transport = new MockRealtimeTransport();
    const controller = createWidgetController(transport);
    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(() => createDomRect(74, 44));

    render(
      <VoiceControlWidget
        controller={controller}
        snapDefaultCorner="top-left"
        snapToCorners
      />
    );

    await waitFor(() => {
      expect(getWidgetRoot()).toHaveStyle({
        bottom: "auto",
        left: "16px",
        right: "auto",
        top: "16px",
        transform: "none"
      });
    });

    getBoundingClientRectSpy.mockRestore();
  });

  it("uses snapInset for PIP border spacing", async () => {
    const transport = new MockRealtimeTransport();
    const controller = createWidgetController(transport);
    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(() => createDomRect(74, 44));

    render(
      <VoiceControlWidget controller={controller} snapInset={24} snapToCorners />
    );

    await waitFor(() => {
      expect(getWidgetRoot()).toHaveStyle({
        bottom: "24px",
        left: "auto",
        right: "24px",
        top: "auto",
        transform: "none"
      });
      expect(document.body.querySelector('[data-vc-part="overlay"]')?.parentElement).toBe(
        document.body
      );
    });

    getBoundingClientRectSpy.mockRestore();
  });

  it("uses the measured non-square widget size for PIP placement", async () => {
    const transport = new MockRealtimeTransport();
    const controller = createWidgetController(transport);
    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(() => createDomRect(240, 72));

    render(
      <VoiceControlWidget
        controller={controller}
        persistPosition={false}
        snapDefaultCorner="top-right"
        snapToCorners
      />
    );

    await waitFor(() => {
      expect(getWidgetRoot()).toHaveStyle({
        bottom: "auto",
        left: "auto",
        right: "16px",
        top: "16px",
        transform: "none"
      });
    });

    getBoundingClientRectSpy.mockRestore();
  });

  it("restores the persisted snap corner and ignores legacy raw position storage", async () => {
    const transport = new MockRealtimeTransport();
    const controller = createWidgetController(transport);
    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(() => createDomRect(74, 44));

    window.localStorage.setItem(LEGACY_CORNER_STORAGE_KEY, JSON.stringify({ corner: "top-left" }));
    window.localStorage.setItem(
      LEGACY_POSITION_STORAGE_KEY,
      JSON.stringify({ x: 60, y: 70 })
    );

    render(
      <VoiceControlWidget
        controller={controller}
        snapDefaultCorner="bottom-right"
        snapToCorners
      />
    );

    await waitFor(() => {
      expect(getWidgetRoot()).toHaveStyle({
        bottom: "auto",
        left: "16px",
        right: "auto",
        top: "16px",
        transform: "none"
      });
    });

    getBoundingClientRectSpy.mockRestore();
  });

  it("reloads persisted corner state when widgetId changes", async () => {
    const transport = new MockRealtimeTransport();
    const controller = createWidgetController(transport);
    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(() => createDomRect(74, 44));

    window.localStorage.setItem(
      "voice-control-corner:v1:voice-alpha",
      JSON.stringify({ corner: "top-left" })
    );
    window.localStorage.setItem(
      "voice-control-corner:v1:voice-beta",
      JSON.stringify({ corner: "top-right" })
    );

    const { rerender } = render(
      <VoiceControlWidget
        controller={controller}
        snapToCorners
        widgetId="voice-alpha"
      />
    );

    await waitFor(() => {
      expect(getWidgetRoot()).toHaveStyle({
        left: "16px",
        right: "auto",
        top: "16px"
      });
    });

    rerender(
      <VoiceControlWidget
        controller={controller}
        snapToCorners
        widgetId="voice-beta"
      />
    );

    await waitFor(() => {
      expect(getWidgetRoot()).toHaveStyle({
        left: "auto",
        right: "16px",
        top: "16px"
      });
    });

    getBoundingClientRectSpy.mockRestore();
  });

  it("stays pinned to the same corner when the viewport changes", async () => {
    const transport = new MockRealtimeTransport();
    const controller = createWidgetController(transport);
    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(() => createDomRect(74, 44));

    render(
      <VoiceControlWidget
        controller={controller}
        persistPosition={false}
        snapDefaultCorner="top-right"
        snapToCorners
      />
    );

    await waitFor(() => {
      expect(getWidgetRoot()).toHaveStyle({
        bottom: "auto",
        left: "auto",
        right: "16px",
        top: "16px",
        transform: "none"
      });
    });

    Object.defineProperty(document.documentElement, "clientWidth", {
      configurable: true,
      value: 800
    });
    Object.defineProperty(document.documentElement, "clientHeight", {
      configurable: true,
      value: 600
    });

    await act(async () => {
      window.dispatchEvent(new Event("resize"));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(getWidgetRoot()).toHaveStyle({
        bottom: "auto",
        left: "auto",
        right: "16px",
        top: "16px",
        transform: "none"
      });
    });

    getBoundingClientRectSpy.mockRestore();
  });

  it("falls back to window resize listeners when ResizeObserver is unavailable", async () => {
    const transport = new MockRealtimeTransport();
    const controller = createWidgetController(transport);
    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(() => createDomRect(74, 44));
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    const originalResizeObserver = globalThis.ResizeObserver;

    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: undefined
    });

    render(
      <VoiceControlWidget
        controller={controller}
        persistPosition={false}
        snapDefaultCorner="top-right"
        snapToCorners
      />
    );

    await act(async () => {
      window.dispatchEvent(new Event("resize"));
      await Promise.resolve();
    });

    expect(addEventListenerSpy).toHaveBeenCalledWith("resize", expect.any(Function));

    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: originalResizeObserver
    });

    getBoundingClientRectSpy.mockRestore();
  });

  it("keeps the base floating layout on mobile breakpoints by default", () => {
    const transport = new MockRealtimeTransport();
    const controller = createWidgetController(transport);
    const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("640px"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: matchMediaMock
    });

    render(<VoiceControlWidget controller={controller} />);

    return waitFor(() => {
      expect(getWidgetRoot()).toHaveAttribute("data-vc-layout", "floating");
      expect(window.localStorage.getItem(POSITION_STORAGE_KEY)).toBeNull();
    });
  });

  it("supports an explicit mobileLayout override and hides the drag handle inline", () => {
    const transport = new MockRealtimeTransport();
    const controller = createWidgetController(transport);
    const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("640px"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: matchMediaMock
    });

    render(<VoiceControlWidget controller={controller} mobileLayout="inline" />);

    return waitFor(() => {
      expect(getWidgetRoot()).toHaveAttribute("data-vc-layout", "inline");
      expect(document.body.querySelector('[data-vc-part="launcher-handle"]')).toBeNull();
    });
  });

  it("does not move when dragging is disabled", async () => {
    const transport = new MockRealtimeTransport();
    const controller = createWidgetController(transport);

    render(<VoiceControlWidget controller={controller} draggable={false} />);

    expect(document.body.querySelector('[data-vc-part="launcher-handle"]')).toBeNull();

    await waitFor(() => {
      expect(window.localStorage.getItem(POSITION_STORAGE_KEY)).toBeNull();
    });
  });

  it("supports root and per-part class name overrides", () => {
    const transport = new MockRealtimeTransport();
    const controller = createWidgetController(transport);

    render(
      <VoiceControlWidget
        controller={controller}
        className="custom-widget-root"
        partClassNames={{
          launcher: "custom-widget-launcher",
          "launcher-action": "custom-widget-action",
          "launcher-indicator": "custom-widget-indicator",
          "launcher-drag-glyph": "custom-widget-drag-glyph"
        }}
      />
    );

    expect(getWidgetRoot()).toHaveClass("vc-root", "custom-widget-root");
    expect(document.body.querySelector('[data-vc-part="launcher"]')).toHaveClass(
      "vc-launcher",
      "custom-widget-launcher"
    );
    expect(document.body.querySelector('[data-vc-part="launcher-action"]')).toHaveClass(
      "vc-launcher-action",
      "custom-widget-action"
    );
    expect(document.body.querySelector('[data-vc-part="launcher-indicator"]')).toHaveClass(
      "vc-launcher-indicator",
      "custom-widget-indicator"
    );
    expect(document.body.querySelector('[data-vc-part="launcher-drag-glyph"]')).toHaveClass(
      "vc-launcher-drag-glyph",
      "custom-widget-drag-glyph"
    );
  });

  it("supports unstyled mode without dropping widget behavior", async () => {
    const transport = new MockRealtimeTransport();
    const controller = createWidgetController(transport);

    render(
      <VoiceControlWidget
        controller={controller}
        partClassNames={{
          launcher: "custom-unstyled-launcher"
        }}
        unstyled
      />
    );

    expect(getWidgetRoot()).not.toHaveClass("vc-root");
    expect(document.body.querySelector('[data-vc-part="launcher"]')).not.toHaveClass("vc-launcher");
    expect(document.body.querySelector('[data-vc-part="launcher-action"]')).not.toHaveClass(
      "vc-launcher-action"
    );
    expect(document.body.querySelector('[data-vc-part="launcher-indicator"]')).not.toHaveClass(
      "vc-launcher-indicator"
    );
    expect(document.body.querySelector('[data-vc-part="launcher"]')).toHaveClass(
      "custom-unstyled-launcher"
    );

    fireEvent.click(screen.getByRole("button", { name: "Start Voice" }));

    await waitFor(() => {
      expect(getWidgetRoot()).toHaveAttribute("data-vc-connected", "true");
      expect(document.body.querySelector('[data-vc-part="launcher"]')).toHaveAttribute(
        "data-vc-launcher-state",
        "listening"
      );
    });
  });

  it("supports label overrides while keeping the widget launcher-only", () => {
    const transport = new MockRealtimeTransport();
    const controller = createWidgetController(transport);

    render(
      <VoiceControlWidget
        controller={controller}
        labels={{
          launcher: "Assistant",
          disconnected: "Offline"
        }}
      />
    );

    expect(screen.getByRole("button", { name: "Start Assistant" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Offline");
  });
});
