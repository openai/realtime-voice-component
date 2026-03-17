import { useCallback, useRef, type CSSProperties, type RefObject } from "react";
import { Chessboard } from "react-chessboard";
import type { ChessboardOptions } from "react-chessboard";

import {
  GhostCursorOverlay,
  useGhostCursor,
  VoiceControlWidget,
} from "realtime-voice-component";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

import {
  DemoCard,
  DemoIntro,
  DemoPageShell,
  DemoSection,
  DemoWakeWordStatus,
} from "../shared/primitives";
import { useWakeWordActivation } from "../shared/wakeWord";
import { useChessDemoVoiceController } from "./controller";
import { useChessDemoState, type ChessDemoState } from "./state";

const STATUS_LABELS: Record<ChessDemoState["status"], string> = {
  in_progress: "In Progress",
  check: "Check",
  checkmate: "Checkmate",
  stalemate: "Stalemate",
  draw: "Draw",
};

function getPositionSummary(historyLength: number) {
  if (historyLength === 0) {
    return "Start";
  }

  return `${historyLength} played`;
}

function getHintSummary(origin: string | null, destinations: string[]) {
  if (!origin) {
    return "None";
  }

  if (destinations.length === 0) {
    return `${origin}: none`;
  }

  return `${origin}: ${destinations.length} legal`;
}

function buildMoveRows(history: ChessDemoState["history"]) {
  const rows: Array<{
    moveNumber: number;
    white?: ChessDemoState["history"][number];
    black?: ChessDemoState["history"][number];
  }> = [];

  for (let index = 0; index < history.length; index += 2) {
    rows.push({
      moveNumber: index / 2 + 1,
      ...(history[index] ? { white: history[index] } : {}),
      ...(history[index + 1] ? { black: history[index + 1] } : {}),
    });
  }

  return rows;
}

function buildSquareStyles(state: ChessDemoState) {
  const squareStyles: Record<string, CSSProperties> = {};

  const applyStyle = (square: string | null, style: CSSProperties) => {
    if (!square) {
      return;
    }

    squareStyles[square] = {
      ...squareStyles[square],
      ...style,
    };
  };

  applyStyle(state.lastMove.from, {
    background: "rgba(17, 17, 17, 0.10)",
  });
  applyStyle(state.lastMove.to, {
    background: "rgba(17, 17, 17, 0.16)",
  });

  for (const destination of state.hint.destinations) {
    applyStyle(destination, {
      background:
        "radial-gradient(circle at center, rgba(17, 17, 17, 0.28) 0 21%, transparent 23%)",
    });
  }

  applyStyle(state.hint.origin, {
    background: "rgba(17, 17, 17, 0.14)",
    outline: "2px solid rgba(17, 17, 17, 0.28)",
  });

  applyStyle(state.selectedSquare, {
    boxShadow: "inset 0 0 0 2px rgba(17, 17, 17, 0.42)",
  });

  return squareStyles;
}

function getStatusVariant(status: ChessDemoState["status"]) {
  if (status === "check" || status === "checkmate") {
    return "destructive" as const;
  }

  if (status === "draw" || status === "stalemate") {
    return "secondary" as const;
  }

  return "outline" as const;
}

type ChessBoardPanelProps = {
  boardRef: RefObject<HTMLDivElement | null>;
  onBoardMove: (from: string, to: string, piece?: string | null) => boolean;
  onSquareClick: (square: string) => void;
  state: ChessDemoState;
};

function ChessBoardPanel({
  boardRef,
  onBoardMove,
  onSquareClick,
  state,
}: ChessBoardPanelProps) {
  const options: ChessboardOptions = {
    id: "demo-chessboard",
    position: state.fen,
    boardOrientation: "white",
    allowDragging: true,
    allowDrawingArrows: false,
    showNotation: true,
    showAnimations: true,
    animationDurationInMs: 220,
    boardStyle: {
      borderRadius: "16px",
      boxShadow:
        "0 1px 2px rgba(17, 17, 17, 0.03), 0 18px 40px rgba(17, 17, 17, 0.10), inset 0 0 0 1px rgba(17, 17, 17, 0.06)",
    },
    squareStyles: buildSquareStyles(state),
    onPieceDrop: ({ piece, sourceSquare, targetSquare }) => {
      if (!targetSquare) {
        return false;
      }

      return onBoardMove(sourceSquare, targetSquare, piece.pieceType);
    },
    onSquareClick: ({ square }) => {
      onSquareClick(square);
    },
  };

  return (
    <div
      ref={boardRef}
      className="rounded-[16px] border border-border bg-panel p-3 shadow-none"
      data-ai-target="chess-board"
      data-testid="chess-board"
    >
      <div data-ai-target="chess-board-grid">
        <Chessboard options={options} />
      </div>
    </div>
  );
}

export function ChessDemoPage() {
  const chess = useChessDemoState();
  const { cursorState, run, runEach } = useGhostCursor();
  const boardRef = useRef<HTMLDivElement | null>(null);
  const undoButtonRef = useRef<HTMLButtonElement | null>(null);
  const resetButtonRef = useRef<HTMLButtonElement | null>(null);
  const { controller, runtime } = useChessDemoVoiceController({
    applyMove: chess.applyMove,
    getBestMove: chess.getBestMove,
    getBoardElement: () => boardRef.current,
    getSquareElement: (square) =>
      boardRef.current?.querySelector<HTMLElement>(
        `[data-square="${square}"]`,
      ) ?? null,
    getBoardState: chess.getBoardState,
    getResetButton: () => resetButtonRef.current,
    getUndoButton: () => undoButtonRef.current,
    latestContextEvent: chess.latestContextEvent,
    previewMove: chess.previewMove,
    resetBoard: chess.resetBoard,
    runCursor: run,
    runCursorEach: runEach,
    showHint: chess.showHint,
    undoMove: chess.undoMove,
  });

  const canActivateFromWakeWord =
    !runtime.connected && runtime.activity !== "connecting";

  const activateWidgetFromWakeWord = useCallback(() => {
    if (!canActivateFromWakeWord) {
      return false;
    }

    void controller.connect();
    return true;
  }, [canActivateFromWakeWord, controller]);

  const wakeWord = useWakeWordActivation({
    enabled: true,
    canActivateWidget: canActivateFromWakeWord,
    onWakeWord: () => activateWidgetFromWakeWord(),
  });

  const moveRows = buildMoveRows(chess.state.history);
  const positionSummary = getPositionSummary(chess.state.history.length);
  const hintSummary = getHintSummary(
    chess.state.hint.origin,
    chess.state.hint.destinations,
  );

  return (
    <DemoPageShell>
      <GhostCursorOverlay state={cursorState} />

      <DemoCard>
        <DemoIntro
          eyebrow="Chess Demo"
          title="Play the board with voice and visible state."
          body="This demo keeps voice actions, drag-and-drop moves, hints, and engine suggestions on one shared chess position."
        />

        <DemoSection
          heading="Try Saying"
          aside={<DemoWakeWordStatus wakeWord={wakeWord} />}
          description={
            <>
              Say <strong>{wakeWord.keywordLabel}</strong> to wake it, ask for{" "}
              <strong>e4</strong> or <strong>knight f3</strong> to play a move,
              ask for <strong>a hint from g1</strong>, or say{" "}
              <strong>what is the best move</strong>.
            </>
          }
        />

        <DemoSection
          heading="Board"
          description="Voice actions and direct board interaction both update the same visible game."
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)] lg:items-start">
            <ChessBoardPanel
              boardRef={boardRef}
              onBoardMove={chess.attemptBoardMove}
              onSquareClick={chess.selectSquare}
              state={chess.state}
            />

            <Card className="self-start rounded-[20px] shadow-none">
              <CardHeader className="gap-2">
                <div className="flex items-center justify-between gap-3">
                  <Badge
                    data-testid="chess-status"
                    variant={getStatusVariant(chess.state.status)}
                  >
                    {STATUS_LABELS[chess.state.status]}
                  </Badge>
                  <div
                    className="text-sm font-medium text-muted-foreground"
                    data-testid="chess-turn"
                  >
                    {chess.state.turn === "w" ? "White to move" : "Black to move"}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="grid gap-4">
                <dl className="grid gap-2">
                  <div className="flex items-center justify-between gap-3 py-1">
                    <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                      Game
                    </dt>
                    <dd className="font-medium">{positionSummary}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 py-1">
                    <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                      Hint
                    </dt>
                    <dd
                      className="text-right font-medium"
                      data-testid="chess-hint-banner"
                    >
                      {hintSummary}
                    </dd>
                  </div>
                </dl>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    ref={undoButtonRef}
                    type="button"
                    variant="outline"
                    size="lg"
                    data-ai-target="chess-undo"
                    data-testid="undo-move-button"
                    onClick={() => {
                      chess.undoMoveFromControl();
                    }}
                  >
                    Undo
                  </Button>
                  <Button
                    ref={resetButtonRef}
                    type="button"
                    variant="outline"
                    size="lg"
                    data-ai-target="chess-reset"
                    data-testid="reset-board-button"
                    onClick={() => {
                      chess.resetBoardFromControl();
                    }}
                  >
                    Reset
                  </Button>
                </div>

                <div className="grid gap-2">
                  <div className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    Moves
                  </div>

                  {moveRows.length > 0 ? (
                    <ol className="grid gap-2" data-testid="chess-history">
                      {moveRows.map((row) => (
                        <li
                          key={row.moveNumber}
                          className="grid grid-cols-[auto_1fr_1fr] items-center gap-3 px-1 py-1.5"
                        >
                          <span className="text-sm text-muted-foreground">
                            {row.moveNumber}.
                          </span>
                          <span className="font-medium">
                            {row.white?.san ?? "..."}
                          </span>
                          <span className="text-muted-foreground">
                            {row.black?.san ?? ""}
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p
                      className="text-sm text-muted-foreground"
                      data-testid="chess-history-empty"
                    >
                      No moves yet.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </DemoSection>

        <div className="mt-10">
          <VoiceControlWidget controller={controller} snapToCorners />
        </div>
      </DemoCard>
    </DemoPageShell>
  );
}
