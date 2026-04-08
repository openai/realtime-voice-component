import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../demo/src/App";

type MockTool = {
  name: string;
  execute: (args: Record<string, unknown>) => Promise<unknown> | unknown;
};

type MockController = {
  __tools: MockTool[];
  activity: string;
  connected: boolean;
  connect: () => Promise<void>;
  destroy: () => void;
  disconnect: () => void;
  getSnapshot: () => {
    sessionConfig: {
      instructions: string;
      postToolResponse?: boolean;
    };
  };
  postToolResponse: boolean;
  requestResponse: () => void;
  sentClientEvents: Array<Record<string, unknown>>;
  subscribe: (listener: () => void) => () => void;
};

const mockState = vi.hoisted(() => ({
  ghostCursorRun: vi.fn(async (_target: unknown, callback: () => unknown) =>
    callback(),
  ),
  ghostCursorRunEach: vi.fn(
    async (
      items: unknown[],
      _resolveTarget: (item: unknown, index: number) => unknown,
      operation: (item: unknown, index: number) => unknown,
    ) => Promise.all(items.map((item, index) => operation(item, index))),
  ),
  latestController: null as MockController | null,
  toast: vi.fn(),
  wakeWord: {
    assetsAvailable: false,
    status: "unavailable",
    detail: "Wake word is unavailable in tests.",
    hasAccessKey: false,
    keywordLabel: "Hey Chappie",
    keywordPath: "/porcupine/hey-chappie_en_wasm_v4_0_0.ppn",
    modelPath: "/porcupine/porcupine_params.pv",
  },
}));

vi.mock("sonner", () => ({
  Toaster: () => null,
  toast: mockState.toast,
}));

vi.mock("react-chessboard", () => ({
  Chessboard: ({
    options,
  }: {
    options?: {
      position?: string;
      onPieceDrop?: (args: {
        piece: { pieceType: string };
        sourceSquare: string;
        targetSquare: string | null;
      }) => boolean;
    };
  }) => (
    <div data-testid="mock-chessboard">
      <div>{options?.position ?? "unknown-position"}</div>
      <button
        data-testid="mock-chessboard-move-e2e4"
        onClick={() => {
          options?.onPieceDrop?.({
            piece: { pieceType: "p" },
            sourceSquare: "e2",
            targetSquare: "e4",
          });
        }}
        type="button"
      >
        move e2e4
      </button>
    </div>
  ),
}));

vi.mock("../demo/src/demos/shared/wakeWord", () => ({
  useWakeWordActivation: () => mockState.wakeWord,
}));

vi.mock("realtime-voice-component", async () => {
  const React = await import("react");

  function createMockController({
    instructions = "demo",
    postToolResponse = false,
    tools = [],
  }: {
    instructions?: string;
    postToolResponse?: boolean;
    tools?: MockTool[];
  } = {}) {
    let connected = false;
    let destroyed = false;
    let registeredTools = tools;
    let currentInstructions = instructions;
    let currentPostToolResponse = postToolResponse;
    const listeners = new Set<() => void>();
    let snapshot = {
      status: connected ? "ready" : "idle",
      activity: connected ? "listening" : "idle",
      connected,
      transcript: "",
      toolCalls: [],
      latestToolCall: null,
      sessionConfig: {
        model: "gpt-realtime-1.5",
        instructions: currentInstructions,
        postToolResponse: currentPostToolResponse,
        tools,
        activationMode: "vad" as const,
        outputMode: "tool-only" as const,
      },
    };

    const getSnapshot = () => snapshot;

    const notify = () => {
      snapshot = {
        ...snapshot,
        status: connected ? "ready" : "idle",
        activity: connected ? "listening" : "idle",
        connected,
      };

      for (const listener of listeners) {
        listener();
      }
    };

    const controller = {
      get __tools() {
        return registeredTools;
      },
      sentClientEvents: [] as Array<Record<string, unknown>>,
      get connected() {
        return connected;
      },
      get status() {
        return connected ? "ready" : "idle";
      },
      get activity() {
        return connected ? "listening" : "idle";
      },
      get postToolResponse() {
        return currentPostToolResponse;
      },
      clearToolCalls: () => {},
      connect: async () => {
        if (destroyed) {
          return;
        }

        connected = true;
        notify();
      },
      configure: ({
        instructions,
        postToolResponse,
        tools,
      }: {
        instructions?: string;
        postToolResponse?: boolean;
        tools?: MockTool[];
      }) => {
        const nextToolNames = tools?.map((tool) => tool.name).join("\u0000");
        const currentToolNames = registeredTools
          .map((tool) => tool.name)
          .join("\u0000");
        const instructionsChanged =
          instructions !== undefined && instructions !== currentInstructions;
        const postToolResponseChanged =
          postToolResponse !== undefined &&
          postToolResponse !== currentPostToolResponse;
        const toolsChanged =
          tools !== undefined && nextToolNames !== currentToolNames;

        if (!instructionsChanged && !postToolResponseChanged && !toolsChanged) {
          return;
        }

        if (instructions !== undefined) {
          currentInstructions = instructions;
        }

        if (postToolResponse !== undefined) {
          currentPostToolResponse = postToolResponse;
        }

        if (tools !== undefined) {
          registeredTools = tools;
        }

        snapshot = {
          ...snapshot,
          sessionConfig: {
            ...snapshot.sessionConfig,
            ...(instructions !== undefined ? { instructions } : {}),
            ...(postToolResponse !== undefined ? { postToolResponse } : {}),
            ...(tools !== undefined ? { tools } : {}),
          },
        };
        notify();
      },
      destroy: () => {
        if (destroyed) {
          return;
        }

        destroyed = true;
        connected = false;
        listeners.clear();
      },
      disconnect: () => {
        if (destroyed) {
          return;
        }

        connected = false;
        notify();
      },
      getSnapshot,
      requestResponse: vi.fn(),
      sendClientEvent: (event: Record<string, unknown>) => {
        controller.sentClientEvents.push(event);
      },
      startCapture: () => {},
      stopCapture: () => {},
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      updateSession: () => {},
      updateTools: (tools: MockTool[]) => {
        registeredTools = tools;
        snapshot = {
          ...snapshot,
          sessionConfig: {
            ...snapshot.sessionConfig,
            tools,
          },
        };
        notify();
      },
      updateInstructions: (instructions: string) => {
        snapshot = {
          ...snapshot,
          sessionConfig: {
            ...snapshot.sessionConfig,
            instructions,
          },
        };
        notify();
      },
    };

    mockState.latestController = controller;
    return controller;
  }

  return {
    createVoiceControlController: ({
      instructions,
      postToolResponse,
      tools,
    }: {
      instructions?: string;
      postToolResponse?: boolean;
      tools?: MockTool[];
    }) =>
      createMockController({
        ...(instructions !== undefined ? { instructions } : {}),
        ...(postToolResponse !== undefined ? { postToolResponse } : {}),
        ...(tools !== undefined ? { tools } : {}),
      }),
    defineVoiceTool<T>(tool: T) {
      return tool;
    },
    GhostCursorOverlay: () => null,
    useGhostCursor: () => ({
      cursorState: null,
      run: mockState.ghostCursorRun,
      runEach: mockState.ghostCursorRunEach,
    }),
    useVoiceControl: (controller: ReturnType<typeof createMockController>) => {
      React.useSyncExternalStore(
        controller.subscribe,
        controller.getSnapshot,
        controller.getSnapshot,
      );
      return controller;
    },
    VoiceControlWidget: ({
      controller,
      onEvent,
    }: {
      controller: ReturnType<typeof createMockController>;
      onEvent?: (event: { type: string }) => void;
    }) => {
      React.useSyncExternalStore(
        controller.subscribe,
        controller.getSnapshot,
        controller.getSnapshot,
      );

      return (
        <>
          <div
            data-vc-part="root"
            data-vc-activity={controller.activity}
            data-vc-connected={String(controller.connected)}
          />
          <div data-testid="instructions">
            {controller.getSnapshot().sessionConfig.instructions}
          </div>
          <button
            data-vc-part="launcher-action"
            onClick={async () => {
              if (controller.connected) {
                controller.disconnect();
              } else {
                await controller.connect();
              }
              onEvent?.({ type: "mock.launcher.clicked" });
            }}
            type="button"
          >
            launcher
          </button>
        </>
      );
    },
  };
});

function getWidgetRoot() {
  return document.querySelector<HTMLElement>("[data-vc-part='root']");
}

function getLauncherAction() {
  return document.querySelector<HTMLButtonElement>(
    "[data-vc-part='launcher-action']",
  );
}

function renderDemoApp(path = "/") {
  window.history.replaceState({}, "", path);
  return render(<App />);
}

describe("Package demo app", () => {
  afterEach(() => {
    mockState.latestController = null;
    mockState.ghostCursorRun.mockClear();
    mockState.ghostCursorRunEach.mockClear();
    mockState.toast.mockClear();
    Object.assign(mockState.wakeWord, {
      assetsAvailable: false,
      status: "unavailable",
      detail: "Wake word is unavailable in tests.",
      hasAccessKey: false,
      keywordLabel: "Hey Chappie",
      keywordPath: "/porcupine/hey-chappie_en_wasm_v4_0_0.ppn",
      modelPath: "/porcupine/porcupine_params.pv",
    });
    window.history.replaceState({}, "", "/");
    vi.restoreAllMocks();
  });

  it("renders the overview page with shared card styling and demo links", async () => {
    renderDemoApp("/");

    const navLinks = screen.getAllByRole("link").slice(0, 4);
    expect(navLinks.map((link) => link.textContent)).toEqual([
      "Overview",
      "Theme Demo",
      "Form Demo",
      "Chess Demo",
    ]);
    expect(
      screen.getByRole("heading", {
        name: "Register your tools. Let voice drive the UI.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Theme Demo/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Form Demo/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Chess Demo/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("demo-card")).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen
          .getAllByTestId("demo-code-block")[0]
          ?.querySelector(".shiki span"),
      ).not.toBeNull();
    });
    expect(getWidgetRoot()).toBeNull();
  });

  it("navigates between the shared overview and interactive demos", async () => {
    renderDemoApp("/");

    fireEvent.click(screen.getByRole("link", { name: "Chess Demo" }));
    expect(
      await screen.findByRole("heading", {
        name: /Play the board with voice and visible state/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("chess-board")).toBeInTheDocument();
    expect(getWidgetRoot()).toHaveAttribute("data-vc-connected", "false");

    fireEvent.click(screen.getByRole("link", { name: "Theme Demo" }));
    expect(
      await screen.findByRole("heading", { name: /Set a visible app theme/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("demo-card")).toBeInTheDocument();
    expect(getWidgetRoot()).toHaveAttribute("data-vc-connected", "false");

    fireEvent.click(screen.getByRole("link", { name: "Form Demo" }));
    expect(
      await screen.findByRole("heading", {
        name: /Fill a simple form one field at a time/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("demo-card")).toBeInTheDocument();
    expect(getWidgetRoot()).toHaveAttribute("data-vc-connected", "false");
  });

  it("renders wake-word status messaging across the interactive demos", async () => {
    Object.assign(mockState.wakeWord, {
      assetsAvailable: true,
      status: "ready",
      detail: 'Listening for "Hey Chappie"...',
      hasAccessKey: true,
    });

    renderDemoApp("/demo/theme");

    expect(screen.getByTestId("wake-word-status")).toHaveTextContent(
      'Say "Hey Chappie" to wake voice.',
    );
    expect(screen.getByTestId("wake-word-status-detail")).toHaveTextContent(
      'Say "Hey Chappie" to wake voice.',
    );

    fireEvent.click(screen.getByRole("link", { name: "Form Demo" }));
    expect(
      await screen.findByRole("heading", {
        name: /Fill a simple form one field at a time/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("wake-word-status")).toHaveTextContent(
      'Say "Hey Chappie" to wake voice.',
    );

    fireEvent.click(screen.getByRole("link", { name: "Chess Demo" }));
    expect(
      await screen.findByRole("heading", {
        name: /Play the board with voice and visible state/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("wake-word-status")).toHaveTextContent(
      'Say "Hey Chappie" to wake voice.',
    );
  });

  it("shows a missing-assets status when Porcupine files are not available", async () => {
    renderDemoApp("/demo/theme");

    expect(
      await screen.findByRole("heading", { name: /Set a visible app theme/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("wake-word-status")).toHaveTextContent(
      "Wake word is unavailable in tests.",
    );
  });

  it("resets the session on demo changes and reconnects the next demo when the widget was live", async () => {
    renderDemoApp("/demo/theme");

    const sharedController = mockState.latestController;
    expect(sharedController).toBeTruthy();

    fireEvent.click(getLauncherAction()!);

    await waitFor(() => {
      expect(getWidgetRoot()).toHaveAttribute("data-vc-connected", "true");
    });

    fireEvent.click(screen.getByRole("link", { name: "Form Demo" }));

    expect(
      await screen.findByRole("heading", {
        name: /Fill a simple form one field at a time/i,
      }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(mockState.latestController).toBe(sharedController);
      expect(getWidgetRoot()).toHaveAttribute("data-vc-connected", "true");
      expect(screen.getByTestId("instructions")).toHaveTextContent(
        "You have exactly five tools: set_field, get_unfilled_fields, submit_form, change_demo, and send_message.",
      );
    });
  });

  it("wires the chess demo tools and sends board context on connect, moves, and reset", async () => {
    renderDemoApp("/demo/chess");

    expect(
      mockState.latestController?.__tools.map((tool) => tool.name).sort(),
    ).toEqual([
      "change_demo",
      "get_best_move",
      "get_board_state",
      "move",
      "reset_board",
      "send_message",
      "show_hint",
      "undo_move",
    ]);
    expect(mockState.latestController?.postToolResponse).toBe(true);
    expect(screen.getByTestId("instructions")).toHaveTextContent(
      "The app may send you system messages with the latest board state after moves, undo, and reset operations.",
    );
    expect(screen.getByTestId("instructions")).toHaveTextContent(
      'Do not treat advisory or evaluative chess questions as permission to move. Questions such as "can I take that?", "should we capture?", "is Nxe5 legal?", "what can take on e5?", or "what is the best move?" require analysis first, not move.',
    );

    fireEvent.click(getLauncherAction()!);

    await waitFor(() => {
      expect(mockState.latestController?.sentClientEvents).toContainEqual({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "system",
          content: [
            {
              type: "input_text",
              text: "Board state update: the visible chessboard has this current state. Turn=white. Status=in_progress. Move count=0. Last move=none. Focused square=none. Current FEN=rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1.",
            },
          ],
        },
      });
    });

    const moveTool = mockState.latestController?.__tools.find(
      (tool) => tool.name === "move",
    );
    const resetBoardTool = mockState.latestController?.__tools.find(
      (tool) => tool.name === "reset_board",
    );
    expect(moveTool).toBeTruthy();
    expect(resetBoardTool).toBeTruthy();

    await expect(moveTool!.execute({ san: "e4" })).resolves.toMatchObject({
      ok: true,
      san: "e4",
    });
    expect(mockState.ghostCursorRunEach).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(mockState.latestController?.sentClientEvents).toContainEqual({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "system",
          content: [
            {
              type: "input_text",
              text: "Board state update: a move was completed on the visible chessboard. This board state came from a tool-driven action. Move played: e4 from e2 to e4. Black is now to move. Game status: in_progress. Move count: 1. Current FEN: rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1.",
            },
          ],
        },
      });
    });
    expect(mockState.latestController?.requestResponse).not.toHaveBeenCalled();

    await expect(resetBoardTool!.execute({})).resolves.toMatchObject({
      ok: true,
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    });

    await waitFor(() => {
      expect(mockState.latestController?.sentClientEvents).toContainEqual({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "system",
          content: [
            {
              type: "input_text",
              text: "Board state update: the chess game was reset to the starting position. This board state came from a tool-driven action. White is now to move. Game status: in_progress. Move count: 0. Current FEN: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1.",
            },
          ],
        },
      });
    });
    expect(mockState.latestController?.requestResponse).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("mock-chessboard-move-e2e4"));

    await waitFor(() => {
      expect(mockState.latestController?.sentClientEvents).toContainEqual({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Board state update: a move was completed on the visible chessboard. This board state came from a manual human move on the board outside of a tool call. Move played: e4 from e2 to e4. Black is now to move. Game status: in_progress. Move count: 1. Current FEN: rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1.",
            },
          ],
        },
      });
    });
    expect(mockState.latestController?.requestResponse).toHaveBeenCalledTimes(
      1,
    );

    fireEvent.click(screen.getByTestId("reset-board-button"));

    await waitFor(() => {
      expect(mockState.latestController?.sentClientEvents).toContainEqual({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "system",
          content: [
            {
              type: "input_text",
              text: "Board state update: the chess game was reset to the starting position. This board state came from a manual control action outside of a tool call. White is now to move. Game status: in_progress. Move count: 0. Current FEN: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1.",
            },
          ],
        },
      });
    });
    expect(mockState.latestController?.requestResponse).toHaveBeenCalledTimes(
      1,
    );
  });

  it("keeps the theme demo controller focused on connection and theme tools", async () => {
    renderDemoApp("/demo/theme");

    const launcherAction = getLauncherAction();

    expect(launcherAction).toBeTruthy();
    expect(
      mockState.latestController?.__tools.map((tool) => tool.name),
    ).toEqual(["set_theme", "change_demo", "send_message"]);
    expect(getWidgetRoot()).toHaveAttribute("data-vc-connected", "false");

    fireEvent.click(launcherAction!);

    await waitFor(() => {
      expect(getWidgetRoot()).toHaveAttribute("data-vc-connected", "true");
    });

    fireEvent.click(launcherAction!);

    await waitFor(() => {
      expect(getWidgetRoot()).toHaveAttribute("data-vc-connected", "false");
    });
  });

  it("keeps the theme model aware of the active theme and no-ops redundant theme requests", async () => {
    renderDemoApp("/demo/theme");

    expect(screen.getByTestId("instructions")).toHaveTextContent(
      "The app may send you a system message with the latest theme state.",
    );
    expect(screen.getByTestId("instructions")).toHaveTextContent(
      "If the latest theme state already matches the user's request, do not call set_theme.",
    );

    const setThemeTool = mockState.latestController?.__tools.find(
      (tool) => tool.name === "set_theme",
    );
    expect(setThemeTool).toBeTruthy();
    expect(mockState.latestController?.sentClientEvents).toEqual([]);

    fireEvent.click(getLauncherAction()!);

    await waitFor(() => {
      expect(mockState.latestController?.sentClientEvents).toContainEqual({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "system",
          content: [
            {
              type: "input_text",
              text: "Theme state update: the page is currently in light mode. If the user asks for light mode again, do not call set_theme. Call send_message and say the page is already in light mode.",
            },
          ],
        },
      });
    });

    const redundantLightResult = await setThemeTool!.execute({
      theme: "light",
    });
    expect(redundantLightResult).toEqual(
      expect.objectContaining({
        theme: "light",
        changed: false,
        alreadyActive: true,
      }),
    );
    expect(mockState.ghostCursorRun).not.toHaveBeenCalled();

    const darkResult = await setThemeTool!.execute({ theme: "dark" });
    expect(darkResult).toEqual(
      expect.objectContaining({
        theme: "dark",
        changed: true,
        alreadyActive: false,
      }),
    );

    await waitFor(() => {
      expect(mockState.latestController?.sentClientEvents).toContainEqual({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "system",
          content: [
            {
              type: "input_text",
              text: "Theme state update: the page is currently in dark mode. If the user asks for dark mode again, do not call set_theme. Call send_message and say the page is already in dark mode.",
            },
          ],
        },
      });
    });

    const sentEventsBeforeRedundantDark =
      mockState.latestController?.sentClientEvents.length ?? 0;
    const redundantDarkResult = await setThemeTool!.execute({ theme: "dark" });

    expect(redundantDarkResult).toEqual(
      expect.objectContaining({
        theme: "dark",
        changed: false,
        alreadyActive: true,
      }),
    );
    expect(mockState.ghostCursorRun).toHaveBeenCalledTimes(1);
    expect(mockState.latestController?.sentClientEvents).toHaveLength(
      sentEventsBeforeRedundantDark,
    );
  });

  it("exposes the simple form tool loop and enables post-tool responses", () => {
    renderDemoApp("/demo/form");

    expect(
      mockState.latestController?.__tools.map((tool) => tool.name).sort(),
    ).toEqual([
      "change_demo",
      "get_unfilled_fields",
      "send_message",
      "set_field",
      "submit_form",
    ]);
    expect(mockState.latestController?.postToolResponse).toBe(true);
    expect(screen.getByTestId("instructions")).toHaveTextContent(
      'Use set_field with exactly one field per call in the shape { "key": "<field_key>", "value": "<string>" }.',
    );
    expect(screen.getByTestId("instructions")).toHaveTextContent(
      "After each tool call, rely on the follow-up response to continue filling the next field when needed.",
    );
    expect(screen.getByTestId("instructions")).toHaveTextContent(
      'Use change_demo with { "demo": "theme" } when the user asks for the theme example, light mode, dark mode, or the simple theme-switching demo.',
    );
    expect(screen.getByTestId("instructions")).toHaveTextContent(
      'Use change_demo with { "demo": "chess" } when the user asks for chess, a chessboard, hints, a best move, or to play a move.',
    );
  });

  it("switches between the interactive demos through change_demo", async () => {
    renderDemoApp("/demo/theme");

    const sharedController = mockState.latestController;
    const changeDemoTool = sharedController?.__tools.find(
      (tool) => tool.name === "change_demo",
    );
    expect(changeDemoTool).toBeTruthy();

    fireEvent.click(getLauncherAction()!);

    await waitFor(() => {
      expect(getWidgetRoot()).toHaveAttribute("data-vc-connected", "true");
    });

    await expect(changeDemoTool!.execute({ demo: "chess" })).resolves.toEqual({
      ok: true,
      demo: "chess",
      path: "/demo/chess",
      changed: true,
      alreadyActive: false,
    });

    expect(
      await screen.findByRole("heading", {
        name: /Play the board with voice and visible state/i,
      }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(mockState.latestController).toBe(sharedController);
      expect(getWidgetRoot()).toHaveAttribute("data-vc-connected", "true");
    });

    const sameDemoTool = mockState.latestController?.__tools.find(
      (tool) => tool.name === "change_demo",
    );

    await expect(sameDemoTool!.execute({ demo: "chess" })).resolves.toEqual({
      ok: true,
      demo: "chess",
      path: "/demo/chess",
      changed: false,
      alreadyActive: true,
    });
  });

  it("updates the simple form one field at a time with set_field", async () => {
    renderDemoApp("/demo/form");

    const setFieldTool = mockState.latestController?.__tools.find(
      (tool) => tool.name === "set_field",
    );
    expect(setFieldTool).toBeTruthy();

    await expect(
      setFieldTool!.execute({ key: "name", value: "Ada Lovelace" }),
    ).resolves.toEqual(
      expect.objectContaining({
        key: "name",
        value: "Ada Lovelace",
        changed: true,
        alreadyActive: false,
      }),
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Name")).toHaveValue("Ada Lovelace");
    });

    await setFieldTool!.execute({ key: "birthday", value: "1815-12-10" });
    await waitFor(() => {
      expect(screen.getByLabelText("Birthday")).toHaveValue("1815-12-10");
    });

    await setFieldTool!.execute({ key: "newsletter_opt_in", value: "yes" });
    await waitFor(() => {
      expect(screen.getByLabelText("Newsletter opt-in")).toBeChecked();
    });

    await setFieldTool!.execute({ key: "accept_terms", value: "yes" });
    await waitFor(() => {
      expect(screen.getByLabelText("Accept terms")).toBeChecked();
    });

    await setFieldTool!.execute({
      key: "notes",
      value: "Prefers a short onboarding call.",
    });
    await waitFor(() => {
      expect(screen.getByLabelText("Notes")).toHaveValue(
        "Prefers a short onboarding call.",
      );
    });

    await expect(
      setFieldTool!.execute({ key: "name", value: "Ada Lovelace" }),
    ).resolves.toEqual(
      expect.objectContaining({
        key: "name",
        value: "Ada Lovelace",
        changed: false,
        alreadyActive: true,
      }),
    );
  });

  it("re-sends the visible form state when the form demo session connects", async () => {
    renderDemoApp("/demo/form");

    const setFieldTool = mockState.latestController?.__tools.find(
      (tool) => tool.name === "set_field",
    );
    expect(setFieldTool).toBeTruthy();

    await setFieldTool!.execute({ key: "name", value: "Ada Lovelace" });
    await setFieldTool!.execute({ key: "birthday", value: "1815-12-10" });

    fireEvent.click(getLauncherAction()!);

    await waitFor(() => {
      expect(mockState.latestController?.sentClientEvents).toContainEqual({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "system",
          content: [
            {
              type: "input_text",
              text: "Form state update: the visible simple form has these current values. name=Ada Lovelace. birthday=1815-12-10. newsletter_opt_in=no. accept_terms=no. notes=<empty>. Required fields still missing or invalid: accept_terms. Optional fields still blank or unset: newsletter_opt_in, notes.",
            },
          ],
        },
      });
    });
  });

  it("reports unfilled fields and blocks submit until required values are present", async () => {
    renderDemoApp("/demo/form");

    const getUnfilledFields = mockState.latestController?.__tools.find(
      (tool) => tool.name === "get_unfilled_fields",
    );
    const submitForm = mockState.latestController?.__tools.find(
      (tool) => tool.name === "submit_form",
    );

    await expect(getUnfilledFields!.execute({})).resolves.toMatchObject({
      ok: true,
      required: [
        { key: "name", label: "Name" },
        { key: "birthday", label: "Birthday" },
        { key: "accept_terms", label: "Accept terms" },
      ],
      optional: [
        { key: "newsletter_opt_in", label: "Newsletter opt-in" },
        { key: "notes", label: "Notes" },
      ],
      suggested: [
        { key: "name", label: "Name" },
        { key: "birthday", label: "Birthday" },
        { key: "accept_terms", label: "Accept terms" },
      ],
    });

    await expect(submitForm!.execute({})).resolves.toEqual({
      ok: false,
      invalidFields: ["name", "birthday", "accept_terms"],
    });

    await waitFor(() => {
      expect(screen.getByTestId("form-progress-summary")).toHaveTextContent(
        "0 of 3 required fields complete",
      );
      expect(screen.getByTestId("form-progress-detail")).toHaveTextContent(
        "Still needed: Name, Birthday, Accept terms.",
      );
      expect(screen.getByText("Name is required.")).toBeInTheDocument();
      expect(screen.getByText("Birthday is required.")).toBeInTheDocument();
      expect(
        screen.getByText("You need to accept the terms before submitting."),
      ).toBeInTheDocument();
    });

    expect(screen.queryByTestId("form-submit-success")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });

  it("submits the simple form after the required fields are filled", async () => {
    renderDemoApp("/demo/form");

    const setFieldTool = mockState.latestController?.__tools.find(
      (tool) => tool.name === "set_field",
    );
    const submitForm = mockState.latestController?.__tools.find(
      (tool) => tool.name === "submit_form",
    );

    await setFieldTool!.execute({ key: "name", value: "Ada Lovelace" });
    await setFieldTool!.execute({ key: "birthday", value: "1815-12-10" });
    await setFieldTool!.execute({ key: "accept_terms", value: "yes" });

    await expect(submitForm!.execute({})).resolves.toEqual({
      ok: true,
      submitted: {
        name: "Ada Lovelace",
        birthday: "1815-12-10",
        newsletterOptIn: false,
        acceptTerms: true,
        notes: "",
      },
    });

    expect(mockState.toast).toHaveBeenCalledWith("Submitted demo form", {
      description: "Ada Lovelace · 1815-12-10",
    });
    await waitFor(() => {
      expect(screen.getByTestId("form-progress-summary")).toHaveTextContent(
        "3 of 3 required fields complete",
      );
      expect(screen.getByTestId("form-progress-summary")).toHaveTextContent(
        "Ready to submit",
      );
      expect(screen.getByTestId("form-submit-success")).toHaveTextContent(
        "Demo form submitted for Ada Lovelace.",
      );
    });

    await setFieldTool!.execute({
      key: "notes",
      value: "Prefers a short onboarding call.",
    });

    await waitFor(() => {
      expect(
        screen.queryByTestId("form-submit-success"),
      ).not.toBeInTheDocument();
    });
  });

  it("keeps the form progress blocked when optional fields are invalid", async () => {
    renderDemoApp("/demo/form");

    const setFieldTool = mockState.latestController?.__tools.find(
      (tool) => tool.name === "set_field",
    );
    const submitForm = mockState.latestController?.__tools.find(
      (tool) => tool.name === "submit_form",
    );

    await setFieldTool!.execute({ key: "name", value: "Ada Lovelace" });
    await setFieldTool!.execute({ key: "birthday", value: "1815-12-10" });
    await setFieldTool!.execute({ key: "accept_terms", value: "yes" });
    fireEvent.change(screen.getByLabelText("Notes"), {
      target: { value: "A".repeat(281) },
    });

    await waitFor(() => {
      expect(screen.getByTestId("form-progress-summary")).toHaveTextContent(
        "3 of 3 required fields complete",
      );
      expect(screen.getByTestId("form-progress-summary")).toHaveTextContent(
        "Still in progress",
      );
      expect(screen.getByTestId("form-progress-detail")).toHaveTextContent(
        "Fix before submitting: Notes.",
      );
    });

    await expect(submitForm!.execute({})).resolves.toEqual({
      ok: false,
      invalidFields: ["notes"],
    });
    await waitFor(() => {
      expect(
        screen.getByText("Notes must be at most 280 characters."),
      ).toBeInTheDocument();
    });
  });
});
