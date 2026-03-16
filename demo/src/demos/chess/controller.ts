import { type UseGhostCursorReturn } from "realtime-voice-component";
import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { createChangeDemoTool, createSendMessageTool, getInteractiveDemoPath } from "../shared/tools";
import { useSharedDemoController } from "../shared/session";
import {
  buildChessBoardStateMessage,
  buildChessContextMessage,
  CHESS_DEMO_INSTRUCTIONS
} from "./config";
import {
  createGetBestMoveTool,
  createGetBoardStateTool,
  createMoveTool,
  createResetBoardTool,
  createShowHintTool,
  createUndoMoveTool
} from "./tools";
import type { ChessEngineRecommendation } from "./engine";
import type {
  ChessBoardStateResult,
  ChessContextEvent,
  ChessHintResult,
  ChessMoveArgs,
  ChessMovePreview,
  ChessMoveResult,
  ChessResetResult,
  ChessUndoResult
} from "./state";

type UseChessDemoVoiceControllerOptions = {
  applyMove: (args: ChessMoveArgs) => ChessMoveResult;
  getBestMove: () => ChessEngineRecommendation;
  getBoardElement: () => HTMLElement | null;
  getSquareElement: (square: string) => HTMLElement | null;
  getBoardState: () => ChessBoardStateResult;
  getResetButton: () => HTMLButtonElement | null;
  getUndoButton: () => HTMLButtonElement | null;
  latestContextEvent: ChessContextEvent | null;
  previewMove: (args: ChessMoveArgs) => ChessMovePreview | null;
  resetBoard: () => ChessResetResult;
  runCursor: UseGhostCursorReturn["run"];
  runCursorEach: UseGhostCursorReturn["runEach"];
  showHint: (square: string) => ChessHintResult;
  undoMove: () => ChessUndoResult;
};

export function useChessDemoVoiceController({
  applyMove,
  getBestMove,
  getBoardElement,
  getSquareElement,
  getBoardState,
  getResetButton,
  getUndoButton,
  latestContextEvent,
  previewMove,
  resetBoard,
  runCursor,
  runCursorEach,
  showHint,
  undoMove
}: UseChessDemoVoiceControllerOptions) {
  const navigate = useNavigate();
  const lastSentContextIdRef = useRef<number | null>(null);
  const applyMoveRef = useRef(applyMove);
  const getBestMoveRef = useRef(getBestMove);
  const getBoardElementRef = useRef(getBoardElement);
  const getSquareElementRef = useRef(getSquareElement);
  const getBoardStateRef = useRef(getBoardState);
  const getResetButtonRef = useRef(getResetButton);
  const getUndoButtonRef = useRef(getUndoButton);
  const previewMoveRef = useRef(previewMove);
  const resetBoardRef = useRef(resetBoard);
  const showHintRef = useRef(showHint);
  const undoMoveRef = useRef(undoMove);

  applyMoveRef.current = applyMove;
  getBestMoveRef.current = getBestMove;
  getBoardElementRef.current = getBoardElement;
  getSquareElementRef.current = getSquareElement;
  getBoardStateRef.current = getBoardState;
  getResetButtonRef.current = getResetButton;
  getUndoButtonRef.current = getUndoButton;
  previewMoveRef.current = previewMove;
  resetBoardRef.current = resetBoard;
  showHintRef.current = showHint;
  undoMoveRef.current = undoMove;

  const tools = useMemo(
    () => [
      createMoveTool({
        applyMove: (args) => applyMoveRef.current(args),
        getBoardElement: () => getBoardElementRef.current(),
        previewMove: (args) => previewMoveRef.current(args),
        runCursor,
        runCursorEach
      }),
      createShowHintTool({
        getSquareElement: (square) => getSquareElementRef.current(square),
        runCursor,
        showHint: (square) => showHintRef.current(square)
      }),
      createGetBoardStateTool(() => getBoardStateRef.current()),
      createGetBestMoveTool(() => getBestMoveRef.current()),
      createUndoMoveTool({
        getButton: () => getUndoButtonRef.current(),
        runCursor,
        undoMove: () => undoMoveRef.current()
      }),
      createResetBoardTool({
        getButton: () => getResetButtonRef.current(),
        resetBoard: () => resetBoardRef.current(),
        runCursor
      }),
      createChangeDemoTool({
        getActiveDemo: () => "chess",
        getDemoTab: (demo) =>
          document.querySelector<HTMLElement>(`[data-ai-target="demo-tab-${demo}"]`),
        navigateToDemo: (demo) => {
          navigate(getInteractiveDemoPath(demo));
        },
        runCursor
      }),
      createSendMessageTool()
    ],
    [navigate, runCursor, runCursorEach]
  );

  const { controller, runtime } = useSharedDemoController({
    demoId: "chess",
    instructions: CHESS_DEMO_INSTRUCTIONS,
    postToolResponse: true,
    tools
  });

  useEffect(() => {
    if (!runtime.connected) {
      return;
    }

    controller.sendClientEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "system",
        content: [
          {
            type: "input_text",
            text: buildChessBoardStateMessage(getBoardStateRef.current())
          }
        ]
      }
    });
  }, [controller, runtime.connected]);

  useEffect(() => {
    if (!runtime.connected || !latestContextEvent) {
      return;
    }

    if (lastSentContextIdRef.current === latestContextEvent.id) {
      return;
    }

    lastSentContextIdRef.current = latestContextEvent.id;
    controller.sendClientEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: latestContextEvent.source === "board" ? "user" : "system",
        content: [
          {
            type: "input_text",
            text: buildChessContextMessage(latestContextEvent)
          }
        ]
      }
    });

    if (latestContextEvent.source === "board") {
      controller.requestResponse();
    }
  }, [controller, latestContextEvent, runtime.connected]);

  return {
    controller,
    runtime
  };
}
