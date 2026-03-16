import { useRef, useState } from "react";
import { Chess, type Move, type Square } from "chess.js";
import { toast } from "sonner";

import { getBestMoveForFen, type ChessEngineRecommendation } from "./engine";

const SQUARE_PATTERN = /^[a-h][1-8]$/i;
const PROMOTION_PIECES = new Set(["q", "r", "b", "n"]);

export type ChessHintState = {
  origin: string | null;
  destinations: string[];
};

export type ChessLastMoveState = {
  from: string | null;
  to: string | null;
};

export type ChessHistoryEntry = {
  san: string;
  from: string;
  to: string;
};

export type ChessMoveSummary = ChessHistoryEntry & {
  flags: string;
};

export type ChessStatus = "in_progress" | "check" | "checkmate" | "stalemate" | "draw";

export type ChessContextEvent =
  | {
      id: number;
      source: "board" | "tool";
      type: "move";
      move: ChessHistoryEntry;
      fen: string;
      turn: "w" | "b";
      status: ChessStatus;
      historyLength: number;
    }
  | {
      id: number;
      source: "control" | "tool";
      type: "undo";
      undone: ChessHistoryEntry;
      fen: string;
      turn: "w" | "b";
      status: ChessStatus;
      historyLength: number;
    }
  | {
      id: number;
      source: "control" | "tool";
      type: "reset";
      fen: string;
      turn: "w" | "b";
      status: ChessStatus;
      historyLength: 0;
    };

type ChessContextEventPayload =
  | {
      source: "board" | "tool";
      type: "move";
      move: ChessHistoryEntry;
      fen: string;
      turn: "w" | "b";
      status: ChessStatus;
      historyLength: number;
    }
  | {
      source: "control" | "tool";
      type: "undo";
      undone: ChessHistoryEntry;
      fen: string;
      turn: "w" | "b";
      status: ChessStatus;
      historyLength: number;
    }
  | {
      source: "control" | "tool";
      type: "reset";
      fen: string;
      turn: "w" | "b";
      status: ChessStatus;
      historyLength: 0;
    };

export type ChessDemoState = {
  fen: string;
  turn: "w" | "b";
  history: ChessHistoryEntry[];
  hint: ChessHintState;
  lastMove: ChessLastMoveState;
  status: ChessStatus;
  selectedSquare: string | null;
};

export type ChessMoveArgs = {
  san?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  promotion?: "q" | "r" | "b" | "n" | undefined;
};

export type ChessMovePreview = {
  from: string;
  to: string;
};

export type ChessMoveResult =
  | {
      ok: true;
      san: string;
      from: string;
      to: string;
      fen: string;
      turn: "w" | "b";
      isCheck: boolean;
      isCheckmate: boolean;
      isDraw: boolean;
      isStalemate: boolean;
    }
  | {
      ok: false;
      message: string;
      fen: string;
    };

export type ChessHintResult =
  | {
      ok: true;
      square: string;
      moves: Array<{
        from: string;
        to: string;
        san: string;
        flags: string;
      }>;
    }
  | {
      ok: false;
      message: string;
      fen: string;
    };

export type ChessUndoResult =
  | {
      ok: true;
      undone: ChessHistoryEntry;
      fen: string;
      turn: "w" | "b";
    }
  | {
      ok: false;
      message: string;
      fen: string;
    };

export type ChessResetResult = {
  ok: true;
  fen: string;
  turn: "w" | "b";
};

export type ChessBoardStateResult = {
  ok: true;
  fen: string;
  turn: "w" | "b";
  status: ChessStatus;
  history: ChessHistoryEntry[];
  lastMove: ChessLastMoveState;
  hint: ChessHintState;
  selectedSquare: string | null;
  legalMovesFromFocusSquare: ChessMoveSummary[];
};

type DraggedPiece = string | null | undefined;

function isSquare(value: unknown): value is Square {
  return typeof value === "string" && SQUARE_PATTERN.test(value);
}

function normalizeSquare(value: unknown) {
  if (!isSquare(value)) {
    return null;
  }

  return value.toLowerCase() as Square;
}

function normalizePromotion(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.toLowerCase();
  if (!PROMOTION_PIECES.has(normalized)) {
    return null;
  }

  return normalized as ChessMoveArgs["promotion"];
}

function toHistoryEntry(move: Move): ChessHistoryEntry {
  return {
    san: move.san,
    from: move.from,
    to: move.to
  };
}

function deriveStatus(chess: Chess): ChessStatus {
  if (chess.isCheckmate()) {
    return "checkmate";
  }

  if (chess.isStalemate()) {
    return "stalemate";
  }

  if (chess.isDraw()) {
    return "draw";
  }

  if (chess.isCheck()) {
    return "check";
  }

  return "in_progress";
}

function buildState(
  chess: Chess,
  hint: ChessHintState,
  selectedSquare: string | null
): ChessDemoState {
  const history = chess.history({ verbose: true }).map(toHistoryEntry);
  const lastMove = history.at(-1);

  return {
    fen: chess.fen(),
    turn: chess.turn(),
    history,
    hint,
    lastMove: {
      from: lastMove?.from ?? null,
      to: lastMove?.to ?? null
    },
    status: deriveStatus(chess),
    selectedSquare
  };
}

function isPawnPromotionMove(piece: DraggedPiece, targetSquare: Square) {
  if (!piece?.endsWith("P")) {
    return false;
  }

  const rank = targetSquare[1];
  return rank === "1" || rank === "8";
}

function buildMoveWarningDescription(square: string, moveCount: number) {
  return moveCount > 0
    ? `Showing ${moveCount} legal move${moveCount === 1 ? "" : "s"} from ${square}.`
    : `No legal moves from ${square}.`;
}

function summarizeMovesForSquare(chess: Chess, square: string | null): ChessMoveSummary[] {
  const normalized = normalizeSquare(square);
  if (!normalized) {
    return [];
  }

  const piece = chess.get(normalized);
  if (!piece || piece.color !== chess.turn()) {
    return [];
  }

  return chess.moves({ verbose: true, square: normalized }).map((move) => ({
    san: move.san,
    from: move.from,
    to: move.to,
    flags: move.flags
  }));
}

export type UseChessDemoStateReturn = {
  state: ChessDemoState;
  latestContextEvent: ChessContextEvent | null;
  applyMove: (args: ChessMoveArgs) => ChessMoveResult;
  getBestMove: () => ChessEngineRecommendation;
  getBoardState: () => ChessBoardStateResult;
  previewMove: (args: ChessMoveArgs) => ChessMovePreview | null;
  showHint: (square: string) => ChessHintResult;
  undoMove: () => ChessUndoResult;
  undoMoveFromControl: () => ChessUndoResult;
  resetBoard: () => ChessResetResult;
  resetBoardFromControl: () => ChessResetResult;
  attemptBoardMove: (from: string, to: string, piece?: string | null) => boolean;
  selectSquare: (square: string) => void;
};

export function useChessDemoState(): UseChessDemoStateReturn {
  const chessRef = useRef(new Chess());
  const hintRef = useRef<ChessHintState>({
    origin: null,
    destinations: []
  });
  const selectedSquareRef = useRef<string | null>(null);
  const nextContextEventIdRef = useRef(1);
  const [latestContextEvent, setLatestContextEvent] = useState<ChessContextEvent | null>(null);
  const [state, setState] = useState<ChessDemoState>(() =>
    buildState(chessRef.current, hintRef.current, selectedSquareRef.current)
  );

  const syncState = () => {
    setState(buildState(chessRef.current, hintRef.current, selectedSquareRef.current));
  };

  const publishContextEvent = (event: ChessContextEventPayload) => {
    setLatestContextEvent({
      ...event,
      id: nextContextEventIdRef.current++
    });
  };

  const clearTransientBoardState = () => {
    hintRef.current = {
      origin: null,
      destinations: []
    };
    selectedSquareRef.current = null;
  };

  const highlightMovesFromSquare = (square: Square) => {
    const chess = chessRef.current;
    const piece = chess.get(square);
    if (!piece || piece.color !== chess.turn()) {
      return null;
    }

    const moves = chess.moves({
      verbose: true,
      square
    });

    hintRef.current = {
      origin: square,
      destinations: moves.map((move) => move.to)
    };
    selectedSquareRef.current = square;
    syncState();

    return moves.length;
  };

  const rejectMove = (message: string, fallbackSquare?: Square | null): ChessMoveResult => {
    const highlightedMoveCount =
      fallbackSquare ? highlightMovesFromSquare(fallbackSquare) : null;

    toast(message, {
      description:
        highlightedMoveCount === null || !fallbackSquare
          ? "Try another move or ask for a hint."
          : buildMoveWarningDescription(fallbackSquare, highlightedMoveCount)
    });

    return {
      ok: false,
      message,
      fen: chessRef.current.fen()
    };
  };

  const previewMove = (args: ChessMoveArgs): ChessMovePreview | null => {
    const preview = new Chess(chessRef.current.fen());
    const hasSan = typeof args.san === "string" && args.san.trim().length > 0;
    const hasCoordinateFields =
      args.from !== undefined || args.to !== undefined || args.promotion !== undefined;

    if (hasSan === hasCoordinateFields) {
      return null;
    }

    try {
      if (hasSan) {
        const move = preview.move(args.san?.trim() ?? null);
        return move
          ? {
              from: move.from,
              to: move.to
            }
          : null;
      }

      const from = normalizeSquare(args.from);
      const to = normalizeSquare(args.to);
      if (!from || !to) {
        return null;
      }

      const promotion = normalizePromotion(args.promotion);
      if (args.promotion !== undefined && promotion === null) {
        return null;
      }

      const move = preview.move({
        from,
        to,
        ...(promotion ? { promotion } : {})
      });

      return move
        ? {
            from: move.from,
            to: move.to
          }
        : null;
    } catch {
      return null;
    }
  };

  const getBoardState = (): ChessBoardStateResult => {
    const chess = chessRef.current;
    const currentState = buildState(chess, hintRef.current, selectedSquareRef.current);
    const focusSquare = currentState.selectedSquare ?? currentState.hint.origin;

    return {
      ok: true,
      fen: currentState.fen,
      turn: currentState.turn,
      status: currentState.status,
      history: currentState.history,
      lastMove: currentState.lastMove,
      hint: currentState.hint,
      selectedSquare: currentState.selectedSquare,
      legalMovesFromFocusSquare: summarizeMovesForSquare(chess, focusSquare)
    };
  };

  const getBestMove = (): ChessEngineRecommendation => getBestMoveForFen(chessRef.current.fen());

  const applyMoveWithSource = (
    args: ChessMoveArgs,
    source: Extract<ChessContextEventPayload, { type: "move" }>["source"]
  ): ChessMoveResult => {
    const chess = chessRef.current;
    const hasSan = typeof args.san === "string" && args.san.trim().length > 0;
    const hasCoordinateFields =
      args.from !== undefined || args.to !== undefined || args.promotion !== undefined;
    const fallbackSquare = hasSan ? null : normalizeSquare(args.from);

    if (hasSan === hasCoordinateFields) {
      return rejectMove('Provide either "san" or "from" and "to".');
    }

    let nextMove: Move | null = null;

    try {
      if (hasSan) {
        nextMove = chess.move(args.san?.trim() ?? null);
      } else {
        const from = normalizeSquare(args.from);
        const to = normalizeSquare(args.to);

        if (!from || !to) {
          return rejectMove('Move coordinates must use algebraic squares like "e2" and "e4".');
        }

        const promotion = normalizePromotion(args.promotion);
        if (args.promotion !== undefined && promotion === null) {
          return rejectMove('Promotion must be one of "q", "r", "b", or "n".');
        }

        nextMove = chess.move({
          from,
          to,
          ...(promotion ? { promotion } : {})
        });
      }
    } catch (error) {
      return rejectMove(
        error instanceof Error && /invalid move|invalid san|illegal/i.test(error.message)
          ? "Illegal move for current position."
          : error instanceof Error
            ? error.message
            : "Illegal move for current position.",
        fallbackSquare
      );
    }

    if (!nextMove) {
      return rejectMove("Illegal move for current position.", fallbackSquare);
    }

    clearTransientBoardState();
    syncState();
    publishContextEvent({
      source,
      type: "move",
      move: toHistoryEntry(nextMove),
      fen: chess.fen(),
      turn: chess.turn(),
      status: deriveStatus(chess),
      historyLength: chess.history().length
    });

    return {
      ok: true,
      san: nextMove.san,
      from: nextMove.from,
      to: nextMove.to,
      fen: chess.fen(),
      turn: chess.turn(),
      isCheck: chess.isCheck(),
      isCheckmate: chess.isCheckmate(),
      isDraw: chess.isDraw(),
      isStalemate: chess.isStalemate()
    };
  };

  const applyMove = (args: ChessMoveArgs): ChessMoveResult => applyMoveWithSource(args, "tool");

  const showHint = (rawSquare: string): ChessHintResult => {
    const square = normalizeSquare(rawSquare);
    const chess = chessRef.current;

    if (!square) {
      return {
        ok: false,
        message: 'Square must use algebraic notation like "e2".',
        fen: chess.fen()
      };
    }

    const piece = chess.get(square);
    if (!piece) {
      return {
        ok: false,
        message: `No piece is on ${square}.`,
        fen: chess.fen()
      };
    }

    if (piece.color !== chess.turn()) {
      return {
        ok: false,
        message: `${square} belongs to the other side.`,
        fen: chess.fen()
      };
    }

    const moves = chess.moves({
      verbose: true,
      square
    });

    hintRef.current = {
      origin: square,
      destinations: moves.map((move) => move.to)
    };
    selectedSquareRef.current = square;
    syncState();

    return {
      ok: true,
      square,
      moves: moves.map((move) => ({
        from: move.from,
        to: move.to,
        san: move.san,
        flags: move.flags
      }))
    };
  };

  const undoMoveWithSource = (
    source: Extract<ChessContextEventPayload, { type: "undo" }>["source"]
  ): ChessUndoResult => {
    const chess = chessRef.current;
    const undone = chess.undo();

    if (!undone) {
      return {
        ok: false,
        message: "Nothing to undo.",
        fen: chess.fen()
      };
    }

    clearTransientBoardState();
    syncState();
    publishContextEvent({
      source,
      type: "undo",
      undone: toHistoryEntry(undone),
      fen: chess.fen(),
      turn: chess.turn(),
      status: deriveStatus(chess),
      historyLength: chess.history().length
    });

    return {
      ok: true,
      undone: toHistoryEntry(undone),
      fen: chess.fen(),
      turn: chess.turn()
    };
  };

  const undoMove = (): ChessUndoResult => undoMoveWithSource("tool");

  const undoMoveFromControl = (): ChessUndoResult => undoMoveWithSource("control");

  const resetBoardWithSource = (
    source: Extract<ChessContextEventPayload, { type: "reset" }>["source"]
  ): ChessResetResult => {
    chessRef.current.reset();
    clearTransientBoardState();
    syncState();
    publishContextEvent({
      source,
      type: "reset",
      fen: chessRef.current.fen(),
      turn: chessRef.current.turn(),
      status: deriveStatus(chessRef.current),
      historyLength: 0
    });

    return {
      ok: true,
      fen: chessRef.current.fen(),
      turn: chessRef.current.turn()
    };
  };

  const resetBoard = (): ChessResetResult => resetBoardWithSource("tool");

  const resetBoardFromControl = (): ChessResetResult => resetBoardWithSource("control");

  const attemptBoardMove = (from: string, to: string, piece?: string | null) => {
    const sourceSquare = normalizeSquare(from);
    const targetSquare = normalizeSquare(to);

    if (!sourceSquare || !targetSquare) {
      return false;
    }

    const promotion = isPawnPromotionMove(piece, targetSquare) ? "q" : undefined;

    const result = applyMoveWithSource(
      {
        from: sourceSquare,
        to: targetSquare,
        ...(promotion ? { promotion } : {})
      },
      "board"
    );

    return result.ok;
  };

  const selectSquare = (rawSquare: string) => {
    const square = normalizeSquare(rawSquare);
    if (!square) {
      return;
    }

    const activeSelection = selectedSquareRef.current;
    if (
      activeSelection &&
      activeSelection !== square &&
      hintRef.current.destinations.includes(square)
    ) {
      void attemptBoardMove(activeSelection, square);
      return;
    }

    if (activeSelection === square) {
      clearTransientBoardState();
      syncState();
      return;
    }

    const piece = chessRef.current.get(square);
    if (piece && piece.color === chessRef.current.turn()) {
      void showHint(square);
      return;
    }

    clearTransientBoardState();
    syncState();
  };

  return {
    state,
    latestContextEvent,
    applyMove,
    getBestMove,
    getBoardState,
    previewMove,
    showHint,
    undoMove,
    undoMoveFromControl,
    resetBoard,
    resetBoardFromControl,
    attemptBoardMove,
    selectSquare
  };
}
